const express = require('express');
const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const { tenantAdminId } = require('../../utils/tenantScope');
const Expense = require('../../models/Expense');
const ExpenseType = require('../../models/ExpenseType');
const BankAccount = require('../../models/BankAccount');
const PocketCash = require('../../models/PocketCash');

const router = express.Router();

/* ---- Expense Types ---- */

// POST /api/expense/types  { name, description }
router.post('/types', asyncHandler(async (req, res) => {
  const { name, description } = req.body;
  if (!name) throw new ApiError(400, 'Expense type name is required.');
  const type = await ExpenseType.create({ adminId: tenantAdminId(req), name, description });
  res.status(201).json({ success: true, message: 'Expense type created successfully.', data: type });
}));

// GET /api/expense/types
router.get('/types', asyncHandler(async (req, res) => {
  const types = await ExpenseType.find({ adminId: tenantAdminId(req) }).sort('name');
  res.status(200).json({ success: true, data: types });
}));

/* ---- Expenses ---- */

// POST /api/expense  { expenseTypeId, price, note, date, bankAccountUsed, accountCash, pocketCash }
router.post('/', asyncHandler(async (req, res) => {
  const { expenseTypeId, price, note, date, bankAccountUsed, accountCash, pocketCash } = req.body;
  if (!expenseTypeId || price === undefined || price === null) {
    throw new ApiError(400, 'expenseTypeId and price are required.');
  }

  const type = await ExpenseType.findOne({ _id: expenseTypeId, adminId: tenantAdminId(req) });
  if (!type) throw new ApiError(404, 'Expense type not found.');

  const priceNum = Number(price);
  const bankAmount = Number(accountCash) || 0;
  const pocketAmount = Number(pocketCash) || 0;

  if (bankAmount + pocketAmount > priceNum) {
    throw new ApiError(400, 'Total payment amount cannot exceed the expense price.');
  }

  let bank = null;
  if (bankAccountUsed && bankAmount > 0) {
    bank = await BankAccount.findOne({ _id: bankAccountUsed, adminId: tenantAdminId(req) });
    if (!bank) throw new ApiError(404, 'Bank account not found.');
    if (bankAmount > (bank.accountCash || 0)) throw new ApiError(400, 'Insufficient bank balance.');
  }

  let pocket = null;
  if (pocketAmount > 0) {
    pocket = await PocketCash.findOne({ adminId: tenantAdminId(req) });
    if (!pocket) pocket = await PocketCash.create({ adminId: tenantAdminId(req), accountCash: 0 });
    if (pocketAmount > (pocket.accountCash || 0)) throw new ApiError(400, 'Insufficient pocket cash balance.');
  }

  const expense = await Expense.create({
    adminId: tenantAdminId(req),
    expenseTypeId: type._id,
    expenseType: type.name,
    price: priceNum,
    note,
    date: date || Date.now(),
    bankAccountUsed: bank ? bank._id : null,
    accountCash: bankAmount,
    pocketCash: pocketAmount,
  });

  if (bank) {
    bank.accountCash -= bankAmount;
    bank.cashOut = (bank.cashOut || 0) + bankAmount;
    bank.transactions.push({
      accountCash: bankAmount,
      reasonOfAmountDeduction: `Expense: ${type.name}`,
      cashOut: bankAmount,
      balanceAfter: bank.accountCash,
    });
    await bank.save();
  }
  if (pocket) {
    pocket.accountCash -= pocketAmount;
    pocket.transactions.push({
      amountDeducted: pocketAmount,
      remainingAmount: pocket.accountCash,
      accountCash: pocket.accountCash,
      reasonOfAmountDeduction: `Expense: ${type.name}`,
    });
    await pocket.save();
  }

  res.status(201).json({ success: true, message: 'Expense added successfully.', data: expense });
}));

// GET /api/expense  ?startDate&endDate
router.get('/', asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;
  const filter = { adminId: tenantAdminId(req) };
  if (startDate || endDate) {
    filter.date = {};
    if (startDate) filter.date.$gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filter.date.$lte = end;
    }
  }

  const expenses = await Expense.find(filter).populate('expenseTypeId', 'name description').sort('-date');
  const totalAmount = expenses.reduce((sum, e) => sum + (e.price || 0), 0);

  const data = expenses.map((e) => ({
    ...e.toObject(),
    expenseType: e.expenseTypeId
      ? { _id: e.expenseTypeId._id, name: e.expenseTypeId.name, description: e.expenseTypeId.description }
      : { name: e.expenseType, description: '' },
  }));

  res.status(200).json({ success: true, count: data.length, totalAmount, data });
}));

module.exports = router;
