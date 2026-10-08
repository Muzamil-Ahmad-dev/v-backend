const mongoose = require('mongoose');
const expenseSchema = new mongoose.Schema({
  adminId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  shopId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', default: null },
  expenseTypeId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExpenseType', default: null },
  expenseType:   { type: String, trim: true, default: '' }, // denormalized name, kept for backward compatibility
  price:         { type: Number, required: true, min: 0 },
  note:          { type: String, trim: true, default: '' },
  date:          { type: Date, default: Date.now },
  // Optional payment-source tracking (matches AddLedger.jsx payment method feature)
  bankAccountUsed: { type: mongoose.Schema.Types.ObjectId, ref: 'BankAccount', default: null },
  accountCash:      { type: Number, default: 0 }, // amount paid from the selected bank account
  pocketCash:       { type: Number, default: 0 }, // amount paid from pocket cash
}, { timestamps: true });
expenseSchema.index({ adminId: 1, date: -1 });
module.exports = mongoose.model('Expense', expenseSchema);
