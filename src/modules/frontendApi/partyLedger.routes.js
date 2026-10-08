const express = require('express');
const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const { tenantAdminId } = require('../../utils/tenantScope');
const PartyLedger = require('../../models/PartyLedger');
const BulkPurchase = require('../../models/BulkPurchase');

const router = express.Router();

// POST /api/partyLedger/create  { partyName }
router.post('/create', asyncHandler(async (req, res) => {
  const { partyName } = req.body;
  if (!partyName) throw new ApiError(400, 'partyName is required.');
  const party = await PartyLedger.create({ adminId: tenantAdminId(req), partyName });
  res.status(201).json({ success: true, message: 'Party created successfully.', data: party });
}));

// GET /api/partyLedger/getAllPartiesRecords
// Returns every bulk purchase (credit purchase from a party), grouped client-side by partyName.
router.get('/getAllPartiesRecords', asyncHandler(async (req, res) => {
  const records = await BulkPurchase.find({ adminId: tenantAdminId(req) })
    .populate('partyLedgerId', 'partyName')
    .sort('-createdAt');

  const data = records.map((r) => ({
    _id: r._id,
    partyName: r.partyLedgerId?.partyName || 'Unknown',
    partyLedgerId: r.partyLedgerId?._id,
    companyName: r.companyName,
    modelName: r.modelName,
    buyingPrice: r.buyingPrice,
    totalPurchasedMobiles: r.totalPurchasedMobiles,
    purchasePaymentType: r.purchasePaymentType,
    purchasePaymentStatus: r.purchasePaymentStatus,
    payableAmountLater: r.payableAmountLater,
    totalPaidAmount: r.totalPaidAmount,
    createdDate: r.date || r.createdAt,
  }));

  res.status(200).json({ success: true, data });
}));

// GET /api/partyLedger/bulkPurchase/:id
router.get('/bulkPurchase/:id', asyncHandler(async (req, res) => {
  const record = await BulkPurchase.findOne({ _id: req.params.id, adminId: tenantAdminId(req) })
    .populate('partyLedgerId', 'partyName');
  if (!record) throw new ApiError(404, 'Bulk purchase record not found.');
  res.status(200).json({ success: true, data: record });
}));

module.exports = router;
