const express = require('express');
const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const { tenantAdminId } = require('../../utils/tenantScope');
const CommitteeLedger = require('../../models/CommitteeLedger');

const router = express.Router();

// POST /api/committee/createCommittee
router.post('/createCommittee', asyncHandler(async (req, res) => {
  const { committeeName, totalAmount, numberOfMembers, myComitteeNameNumber, headName } = req.body;
  if (!committeeName || !totalAmount || !numberOfMembers || !headName) {
    throw new ApiError(400, 'committeeName, totalAmount, numberOfMembers and headName are required.');
  }

  const monthlyRecords = Array.from({ length: Number(numberOfMembers) }, (_, i) => ({
    monthNumber: i + 1,
    status: 'pending',
    amountPaid: 0,
  }));

  const committee = await CommitteeLedger.create({
    adminId: tenantAdminId(req),
    committeeName,
    totalAmount: Number(totalAmount),
    numberOfMembers: Number(numberOfMembers),
    myComitteeNameNumber: Number(myComitteeNameNumber) || 0,
    headName,
    monthlyRecords,
  });

  res.status(201).json({ success: true, message: 'Committee created successfully.', committee });
}));

// GET /api/committee/getComitteesRecords
router.get('/getComitteesRecords', asyncHandler(async (req, res) => {
  const committees = await CommitteeLedger.find({ adminId: tenantAdminId(req) }).sort('-createdAt');
  res.status(200).json({ success: true, committees });
}));

// PATCH /api/committee/updateComittee/:committeeId/:recordId
router.patch('/updateComittee/:committeeId/:recordId', asyncHandler(async (req, res) => {
  const { committeeId, recordId } = req.params;
  const committee = await CommitteeLedger.findOne({ _id: committeeId, adminId: tenantAdminId(req) });
  if (!committee) throw new ApiError(404, 'Committee not found.');

  const record = committee.monthlyRecords.id(recordId);
  if (!record) throw new ApiError(404, 'Committee month record not found.');
  if (record.status === 'Paid') throw new ApiError(400, 'This month is already marked as paid.');

  const perMonthAmount = committee.numberOfMembers
    ? committee.totalAmount / committee.numberOfMembers
    : committee.totalAmount;

  record.status = 'Paid';
  record.amountPaid = perMonthAmount;

  const paidCount = committee.monthlyRecords.filter((r) => r.status === 'Paid').length;
  committee.status =
    paidCount === committee.monthlyRecords.length
      ? 'Paid'
      : paidCount > 0
        ? 'Partially Paid'
        : 'Not Paid';

  await committee.save();
  res.status(200).json({ success: true, message: 'Month marked as paid.', committee });
}));

module.exports = router;
