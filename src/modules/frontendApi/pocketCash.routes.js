const express = require('express');
const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const { tenantAdminId } = require('../../utils/tenantScope');
const PocketCash = require('../../models/PocketCash');

const router = express.Router();

// Every admin has exactly one PocketCash "wallet" document. Create it lazily.
const getOrCreateWallet = async (adminId) => {
  let wallet = await PocketCash.findOne({ adminId });
  if (!wallet) wallet = await PocketCash.create({ adminId, accountCash: 0 });
  return wallet;
};

// GET /api/pocketCash/total
router.get('/total', asyncHandler(async (req, res) => {
  const wallet = await getOrCreateWallet(tenantAdminId(req));
  res.status(200).json({ success: true, total: wallet.accountCash, id: wallet._id });
}));

// POST /api/pocketCash/add  { amount, sourceOfAmountAddition }
router.post('/add', asyncHandler(async (req, res) => {
  const amount = Number(req.body.amount);
  if (!amount || amount <= 0) throw new ApiError(400, 'A valid amount is required.');

  const wallet = await getOrCreateWallet(tenantAdminId(req));
  wallet.accountCash = (wallet.accountCash || 0) + amount;
  wallet.transactions.push({
    amountAdded: amount,
    remainingAmount: wallet.accountCash,
    accountCash: wallet.accountCash,
    sourceOfAmountAddition: req.body.sourceOfAmountAddition || '',
  });
  await wallet.save();

  res.status(200).json({ success: true, message: 'Cash added successfully.', total: wallet.accountCash });
}));

// POST /api/pocketCash/deduct  { amount, reasonOfAmountDeduction }
router.post('/deduct', asyncHandler(async (req, res) => {
  const amount = Number(req.body.amount);
  if (!amount || amount <= 0) throw new ApiError(400, 'A valid amount is required.');

  const wallet = await getOrCreateWallet(tenantAdminId(req));
  if (amount > (wallet.accountCash || 0)) throw new ApiError(400, 'Insufficient pocket cash balance.');

  wallet.accountCash = (wallet.accountCash || 0) - amount;
  wallet.transactions.push({
    amountDeducted: amount,
    remainingAmount: wallet.accountCash,
    accountCash: wallet.accountCash,
    reasonOfAmountDeduction: req.body.reasonOfAmountDeduction || '',
  });
  await wallet.save();

  res.status(200).json({ success: true, message: 'Cash removed successfully.', total: wallet.accountCash });
}));

// GET /api/pocketCash/get/:id  (:id = pocket cash wallet id)
router.get('/get/:id', asyncHandler(async (req, res) => {
  const wallet = await PocketCash.findOne({ _id: req.params.id, adminId: tenantAdminId(req) });
  if (!wallet) throw new ApiError(404, 'Pocket cash wallet not found.');
  res.status(200).json(wallet.transactions);
}));

// DELETE /api/pocketCash/delete/:id  (:id = transaction sub-document id)
router.delete('/delete/:id', asyncHandler(async (req, res) => {
  const wallet = await PocketCash.findOne({ adminId: tenantAdminId(req), 'transactions._id': req.params.id });
  if (!wallet) throw new ApiError(404, 'Transaction not found.');

  const txn = wallet.transactions.id(req.params.id);
  wallet.accountCash = (wallet.accountCash || 0) - (txn.amountAdded || 0) + (txn.amountDeducted || 0);

  txn.deleteOne();
  await wallet.save();

  res.status(200).json({ success: true, message: 'Transaction deleted successfully.' });
}));

module.exports = router;
