const mongoose = require('mongoose');

const bankTransactionSchema = new mongoose.Schema({
  accountCash:             { type: Number, default: 0 }, // amount of this transaction
  sourceOfAmountAddition:  { type: String, default: '' }, // present => credit/addition
  reasonOfAmountDeduction: { type: String, default: '' }, // present => debit/deduction
  // legacy fields kept for backward compatibility with older records/consumers
  cashIn:       { type: Number, default: 0 },
  cashOut:      { type: Number, default: 0 },
  source:       { type: String, default: '' },
  reason:       { type: String, default: '' },
  balanceAfter: { type: Number, default: 0 },
  date:         { type: Date, default: Date.now },
}, { timestamps: true });

const bankAccountSchema = new mongoose.Schema({
  adminId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  shopId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', default: null },
  bankName:      { type: String, required: true, trim: true },
  accountType:   { type: String, required: true, trim: true },
  accountNumber: { type: String, trim: true },
  accountCash:   { type: Number, default: 0 }, // current balance
  cashIn:        { type: Number, default: 0 }, // running total of all cash added
  cashOut:       { type: Number, default: 0 }, // running total of all cash removed
  transactions:  [bankTransactionSchema],
}, { timestamps: true });
module.exports = mongoose.model('BankAccount', bankAccountSchema);
