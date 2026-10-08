const mongoose = require('mongoose');

const personTransactionSchema = new mongoose.Schema({
  takingCredit:  { type: Number, default: 0 },
  givingCredit:  { type: Number, default: 0 },
  description:   { type: String, default: '' },
  balanceAmount: { type: Number, default: 0 },
  date:          { type: Date, default: Date.now },
  // Optional payment-source tracking (matches PayablesAndReceivables payment flow)
  bankAccountUsed: { type: mongoose.Schema.Types.ObjectId, ref: 'BankAccount', default: null },
  accountCash:     { type: Number, default: 0 },
  pocketCash:      { type: Number, default: 0 },
  // Optional invoice linkage (matches "View Full Details" invoice card)
  invoiceExist:   { type: Boolean, default: false },
  invoiceNumber:  { type: String, default: '' },
  invoiceId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', default: null },
}, { timestamps: true });

const personSchema = new mongoose.Schema({
  adminId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  shopId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', default: null },
  name:         { type: String, required: true, trim: true },
  number:       { type: String, trim: true },
  reference:    { type: String, trim: true, default: '' },
  favourite:    { type: Boolean, default: false },
  takingCredit: { type: Number, default: 0 },
  givingCredit: { type: Number, default: 0 },
  status:       { type: String, enum: ['Payable', 'Receivable', 'Settled'], default: 'Settled' },
  transactions: [personTransactionSchema],
}, { timestamps: true });
module.exports = mongoose.model('Person', personSchema);
