const express = require('express');
const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const { tenantAdminId } = require('../../utils/tenantScope');
const Person = require('../../models/Person');
const User = require('../../models/User');
const BankAccount = require('../../models/BankAccount');
const PocketCash = require('../../models/PocketCash');

const router = express.Router();

const recomputeStatus = (person) => {
  person.status =
    person.takingCredit > person.givingCredit
      ? 'Payable'
      : person.givingCredit > person.takingCredit
        ? 'Receivable'
        : 'Settled';
};

// Applies bank/pocket-cash movement for a credit transaction, if payment fields were supplied.
// direction: 'in' -> cash comes INTO the shop (taking credit / receiving payment)
//            'out' -> cash goes OUT of the shop (giving credit / making payment)
const applyPayment = async (adminId, { bankAccountUsed, accountCash, pocketCash }, direction, note) => {
  const bankAmount = Number(accountCash) || 0;
  const pocketAmount = Number(pocketCash) || 0;

  if (bankAccountUsed && bankAmount > 0) {
    const bank = await BankAccount.findOne({ _id: bankAccountUsed, adminId });
    if (!bank) throw new ApiError(404, 'Bank account not found.');
    if (direction === 'out' && bankAmount > (bank.accountCash || 0)) {
      throw new ApiError(400, 'Insufficient bank balance.');
    }
    bank.accountCash += direction === 'in' ? bankAmount : -bankAmount;
    if (direction === 'in') {
      bank.cashIn = (bank.cashIn || 0) + bankAmount;
      bank.transactions.push({ accountCash: bankAmount, sourceOfAmountAddition: note, cashIn: bankAmount, balanceAfter: bank.accountCash });
    } else {
      bank.cashOut = (bank.cashOut || 0) + bankAmount;
      bank.transactions.push({ accountCash: bankAmount, reasonOfAmountDeduction: note, cashOut: bankAmount, balanceAfter: bank.accountCash });
    }
    await bank.save();
  }

  if (pocketAmount > 0) {
    let pocket = await PocketCash.findOne({ adminId });
    if (!pocket) pocket = await PocketCash.create({ adminId, accountCash: 0 });
    if (direction === 'out' && pocketAmount > (pocket.accountCash || 0)) {
      throw new ApiError(400, 'Insufficient pocket cash balance.');
    }
    pocket.accountCash += direction === 'in' ? pocketAmount : -pocketAmount;
    if (direction === 'in') {
      pocket.transactions.push({ amountAdded: pocketAmount, remainingAmount: pocket.accountCash, accountCash: pocket.accountCash, sourceOfAmountAddition: note });
    } else {
      pocket.transactions.push({ amountDeducted: pocketAmount, remainingAmount: pocket.accountCash, accountCash: pocket.accountCash, reasonOfAmountDeduction: note });
    }
    await pocket.save();
  }
};

// POST /api/person/verify-password  { password }
router.post('/verify-password', asyncHandler(async (req, res) => {
  const { password } = req.body;
  if (!password) throw new ApiError(400, 'Password is required.');
  const user = await User.findById(req.user._id).select('+password');
  const valid = user ? await user.comparePassword(password) : false;
  res.status(200).json({ success: valid, valid });
}));

// GET /api/person/all
router.get('/all', asyncHandler(async (req, res) => {
  const persons = await Person.find({ adminId: tenantAdminId(req) }).sort('-createdAt');
  res.status(200).json(persons);
}));

// POST /api/person/create  { name, number, reference }
router.post('/create', asyncHandler(async (req, res) => {
  const { name, number, reference } = req.body;
  if (!name || !number || !reference) throw new ApiError(400, 'name, number and reference are required.');
  const person = await Person.create({ adminId: tenantAdminId(req), name, number, reference });
  res.status(201).json({ success: true, message: 'Person created successfully.', person });
}));

// PUT /api/person/update/:id  { name, number, reference }
router.put('/update/:id', asyncHandler(async (req, res) => {
  const { name, number, reference } = req.body;
  const person = await Person.findOneAndUpdate(
    { _id: req.params.id, adminId: tenantAdminId(req) },
    { name, number, reference },
    { new: true, runValidators: true }
  );
  if (!person) throw new ApiError(404, 'Person not found.');
  res.status(200).json({ success: true, message: 'Person updated successfully.', person });
}));

// PATCH /api/person/:id  -> toggle favourite
router.patch('/:id', asyncHandler(async (req, res) => {
  const person = await Person.findOne({ _id: req.params.id, adminId: tenantAdminId(req) });
  if (!person) throw new ApiError(404, 'Person not found.');
  person.favourite = !person.favourite;
  await person.save();
  res.status(200).json({ success: true, message: 'Favourite status updated.', person });
}));

// DELETE /api/person/:id
router.delete('/:id', asyncHandler(async (req, res) => {
  const person = await Person.findOneAndDelete({ _id: req.params.id, adminId: tenantAdminId(req) });
  if (!person) throw new ApiError(404, 'Person not found.');
  res.status(200).json({ success: true, message: 'Person deleted successfully.' });
}));

// GET /api/person/:id  -> { person, transactions }
router.get('/:id', asyncHandler(async (req, res) => {
  const person = await Person.findOne({ _id: req.params.id, adminId: tenantAdminId(req) });
  if (!person) throw new ApiError(404, 'Person not found.');
  const transactions = [...person.transactions].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  res.status(200).json({ person, transactions });
}));

// POST /api/person/give-credit  { personId, amount, description, bankAccountUsed?, accountCash?, pocketCash? }
// Giving credit == the shop pays money out to the person (cash leaves the shop).
router.post('/give-credit', asyncHandler(async (req, res) => {
  const { personId, amount, description, bankAccountUsed, accountCash, pocketCash } = req.body;
  const amt = Number(amount);
  if (!personId || !amt) throw new ApiError(400, 'personId and amount are required.');

  const person = await Person.findOne({ _id: personId, adminId: tenantAdminId(req) });
  if (!person) throw new ApiError(404, 'Person not found.');

  await applyPayment(tenantAdminId(req), { bankAccountUsed, accountCash, pocketCash }, 'out', `Given credit to ${person.name}`);

  person.givingCredit += amt;
  const balanceAmount = person.givingCredit - person.takingCredit;
  person.transactions.push({
    givingCredit: amt,
    description: description || '',
    balanceAmount,
    bankAccountUsed: bankAccountUsed || null,
    accountCash: Number(accountCash) || 0,
    pocketCash: Number(pocketCash) || 0,
  });
  recomputeStatus(person);
  await person.save();

  res.status(200).json({ success: true, message: 'Credit given successfully.', person });
}));

// POST /api/person/take-credit  { personId, amount, description, bankAccountUsed?, accountCash?, pocketCash? }
// Taking credit == the shop receives money from the person (cash comes into the shop).
router.post('/take-credit', asyncHandler(async (req, res) => {
  const { personId, amount, description, bankAccountUsed, accountCash, pocketCash } = req.body;
  const amt = Number(amount);
  if (!personId || !amt) throw new ApiError(400, 'personId and amount are required.');

  const person = await Person.findOne({ _id: personId, adminId: tenantAdminId(req) });
  if (!person) throw new ApiError(404, 'Person not found.');

  await applyPayment(tenantAdminId(req), { bankAccountUsed, accountCash, pocketCash }, 'in', `Taken credit from ${person.name}`);

  person.takingCredit += amt;
  const balanceAmount = person.takingCredit - person.givingCredit;
  person.transactions.push({
    takingCredit: amt,
    description: description || '',
    balanceAmount,
    bankAccountUsed: bankAccountUsed || null,
    accountCash: Number(accountCash) || 0,
    pocketCash: Number(pocketCash) || 0,
  });
  recomputeStatus(person);
  await person.save();

  res.status(200).json({ success: true, message: 'Credit taken successfully.', person });
}));

// PUT /api/person/update-transaction/:id
router.put('/update-transaction/:id', asyncHandler(async (req, res) => {
  const { givingCredit, takingCredit, description, balanceAmount, createdAt } = req.body;
  const person = await Person.findOne({ adminId: tenantAdminId(req), 'transactions._id': req.params.id });
  if (!person) throw new ApiError(404, 'Transaction not found.');

  const txn = person.transactions.id(req.params.id);
  txn.givingCredit = Number(givingCredit) || 0;
  txn.takingCredit = Number(takingCredit) || 0;
  txn.description = description ?? txn.description;
  txn.balanceAmount = Number(balanceAmount) || 0;
  if (createdAt) txn.date = new Date(createdAt);

  // Recompute person-level totals from all transactions
  person.givingCredit = person.transactions.reduce((sum, t) => sum + (t.givingCredit || 0), 0);
  person.takingCredit = person.transactions.reduce((sum, t) => sum + (t.takingCredit || 0), 0);
  recomputeStatus(person);

  await person.save();
  res.status(200).json({ success: true, message: 'Transaction updated successfully.', transaction: txn });
}));

// DELETE /api/person/delete-transaction/:id
router.delete('/delete-transaction/:id', asyncHandler(async (req, res) => {
  const person = await Person.findOne({ adminId: tenantAdminId(req), 'transactions._id': req.params.id });
  if (!person) throw new ApiError(404, 'Transaction not found.');

  person.transactions.id(req.params.id).deleteOne();
  person.givingCredit = person.transactions.reduce((sum, t) => sum + (t.givingCredit || 0), 0);
  person.takingCredit = person.transactions.reduce((sum, t) => sum + (t.takingCredit || 0), 0);
  recomputeStatus(person);

  await person.save();
  res.status(200).json({ success: true, message: 'Transaction deleted successfully.' });
}));

// GET /api/person/credit-transaction-details/:id  -> invoice-style detail view
router.get('/credit-transaction-details/:id', asyncHandler(async (req, res) => {
  const person = await Person.findOne({ adminId: tenantAdminId(req), 'transactions._id': req.params.id });
  if (!person) throw new ApiError(404, 'Transaction not found.');

  const txn = person.transactions.id(req.params.id);
  const transactionType = txn.takingCredit ? 'taking' : 'giving';

  res.status(200).json({
    success: true,
    data: {
      transactionType,
      amounts: { netAmount: txn.takingCredit || txn.givingCredit || 0 },
      balanceAmount: txn.balanceAmount,
      createdAt: txn.createdAt || txn.date,
      description: txn.description,
      personDetails: {
        name: person.name,
        number: person.number,
        reference: person.reference,
        status: person.status,
      },
      invoiceInfo: {
        invoiceExist: !!txn.invoiceExist,
        invoiceNumber: txn.invoiceNumber || '',
        invoiceDetails: null,
      },
    },
  });
}));

module.exports = router;
