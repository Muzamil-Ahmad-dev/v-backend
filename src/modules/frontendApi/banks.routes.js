const express = require('express');
const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const { tenantAdminId } = require('../../utils/tenantScope');
const BankAccount = require('../../models/BankAccount');

const router = express.Router();

// POST /api/banks/create
router.post('/create', asyncHandler(async (req, res) => {
  const { bankName, accountType, accountNumber } = req.body;
  if (!bankName || !accountType) throw new ApiError(400, 'bankName and accountType are required.');
  const bank = await BankAccount.create({
    adminId: tenantAdminId(req),
    bankName,
    accountType,
    accountNumber,
  });
  res.status(201).json({ success: true, message: 'Bank created successfully.', bank });
}));

// GET /api/banks/getAllBanks
router.get('/getAllBanks', asyncHandler(async (req, res) => {
  const banks = await BankAccount.find({ adminId: tenantAdminId(req) }).sort('-createdAt');
  res.status(200).json({ success: true, banks });
}));

// POST /api/banks/addCash  { bankId, sourceOfAmountAddition, accountCash }
router.post('/addCash', asyncHandler(async (req, res) => {
  const { bankId, sourceOfAmountAddition, accountCash } = req.body;
  const amount = Number(accountCash);
  if (!bankId || !amount || amount <= 0) throw new ApiError(400, 'bankId and a valid accountCash amount are required.');

  const bank = await BankAccount.findOne({ _id: bankId, adminId: tenantAdminId(req) });
  if (!bank) throw new ApiError(404, 'Bank not found.');

  bank.accountCash = (bank.accountCash || 0) + amount;
  bank.cashIn = (bank.cashIn || 0) + amount;
  bank.transactions.push({
    accountCash: amount,
    sourceOfAmountAddition: sourceOfAmountAddition || '',
    cashIn: amount,
    balanceAfter: bank.accountCash,
  });
  await bank.save();

  res.status(200).json({ success: true, message: 'Cash added successfully.', bank });
}));

// POST /api/banks/removeCash  { bankId, sourceOfAmountDeduction, accountCash }
router.post('/removeCash', asyncHandler(async (req, res) => {
  const { bankId, sourceOfAmountDeduction, accountCash } = req.body;
  const amount = Number(accountCash);
  if (!bankId || !amount || amount <= 0) throw new ApiError(400, 'bankId and a valid accountCash amount are required.');

  const bank = await BankAccount.findOne({ _id: bankId, adminId: tenantAdminId(req) });
  if (!bank) throw new ApiError(404, 'Bank not found.');
  if (amount > (bank.accountCash || 0)) throw new ApiError(400, 'Insufficient bank balance.');

  bank.accountCash = (bank.accountCash || 0) - amount;
  bank.cashOut = (bank.cashOut || 0) + amount;
  bank.transactions.push({
    accountCash: amount,
    reasonOfAmountDeduction: sourceOfAmountDeduction || '',
    cashOut: amount,
    balanceAfter: bank.accountCash,
  });
  await bank.save();

  res.status(200).json({ success: true, message: 'Cash removed successfully.', bank });
}));

// DELETE /api/banks/delete/:id
router.delete('/delete/:id', asyncHandler(async (req, res) => {
  const bank = await BankAccount.findOneAndDelete({ _id: req.params.id, adminId: tenantAdminId(req) });
  if (!bank) throw new ApiError(404, 'Bank not found.');
  res.status(200).json({ success: true, message: 'Bank deleted successfully.' });
}));

// GET /api/banks/getBankTransaction/:id  (:id = bank id)
router.get('/getBankTransaction/:id', asyncHandler(async (req, res) => {
  const bank = await BankAccount.findOne({ _id: req.params.id, adminId: tenantAdminId(req) });
  if (!bank) throw new ApiError(404, 'Bank not found.');
  res.status(200).json({ success: true, transactions: bank.transactions });
}));

// DELETE /api/banks/deleteTransaction/:id  (:id = transaction sub-document id)
router.delete('/deleteTransaction/:id', asyncHandler(async (req, res) => {
  const bank = await BankAccount.findOne({ adminId: tenantAdminId(req), 'transactions._id': req.params.id });
  if (!bank) throw new ApiError(404, 'Transaction not found.');

  const txn = bank.transactions.id(req.params.id);
  const addedAmount = txn.accountCash && txn.sourceOfAmountAddition ? txn.accountCash : (txn.cashIn || 0);
  const removedAmount = txn.accountCash && txn.reasonOfAmountDeduction ? txn.accountCash : (txn.cashOut || 0);

  // Reverse the transaction's effect on the running balance/totals
  bank.accountCash = (bank.accountCash || 0) - addedAmount + removedAmount;
  bank.cashIn = Math.max(0, (bank.cashIn || 0) - addedAmount);
  bank.cashOut = Math.max(0, (bank.cashOut || 0) - removedAmount);

  txn.deleteOne();
  await bank.save();

  res.status(200).json({ success: true, message: 'Transaction deleted successfully.' });
}));

module.exports = router;
