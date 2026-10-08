const mongoose = require('mongoose');

const pocketCashTransactionSchema = new mongoose.Schema({
  amountAdded:             { type: Number, default: 0 },
  amountDeducted:          { type: Number, default: 0 },
  remainingAmount:         { type: Number, default: 0 }, // balance after this transaction
  accountCash:             { type: Number, default: 0 }, // fallback/alias balance field used by some views
  sourceOfAmountAddition:  { type: String, default: '' },
  reasonOfAmountDeduction: { type: String, default: '' },
  // legacy fields kept for backward compatibility
  source: { type: String, default: '' },
  reason: { type: String, default: '' },
  date:   { type: Date, default: Date.now },
}, { timestamps: true });

const pocketCashSchema = new mongoose.Schema({
  adminId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  shopId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', default: null },
  accountCash: { type: Number, required: true, default: 0 },
  transactions: [pocketCashTransactionSchema],
}, { timestamps: true });
module.exports = mongoose.model('PocketCash', pocketCashSchema);
