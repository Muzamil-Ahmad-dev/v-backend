const express = require('express');
const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const { tenantAdminId } = require('../../utils/tenantScope');
const BulkPurchase = require('../../models/BulkPurchase');
const PartyLedger = require('../../models/PartyLedger');

const router = express.Router();

// PATCH /api/Purchase/bulk-purchase-credit-pay/:id  (:id = BulkPurchase id)  { amountToPay }
router.patch('/bulk-purchase-credit-pay/:id', asyncHandler(async (req, res) => {
  const amount = Number(req.body.amountToPay);
  if (!amount || amount <= 0) throw new ApiError(400, 'A valid amountToPay is required.');

  const record = await BulkPurchase.findOne({ _id: req.params.id, adminId: tenantAdminId(req) });
  if (!record) throw new ApiError(404, 'Bulk purchase record not found.');
  if (amount > (record.payableAmountLater || 0)) {
    throw new ApiError(400, 'Amount exceeds the remaining payable balance.');
  }

  record.payableAmountLater -= amount;
  record.totalPaidAmount = (record.totalPaidAmount || 0) + amount;
  if (record.payableAmountLater <= 0) record.purchasePaymentStatus = 'paid';
  await record.save();

  const party = await PartyLedger.findOne({ _id: record.partyLedgerId, adminId: tenantAdminId(req) });
  if (party) {
    party.takingCredit = Math.max(0, (party.takingCredit || 0) - amount);
    party.transactions.push({ takingCredit: -amount, description: `Payment for ${record.companyName} ${record.modelName}` });
    party.status = party.takingCredit > party.givingCredit ? 'Payable' : party.givingCredit > party.takingCredit ? 'Receivable' : 'Settled';
    await party.save();
  }

  res.status(200).json({ success: true, message: 'Amount added successfully.', data: record });
}));

module.exports = router;
