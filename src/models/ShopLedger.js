const mongoose = require('mongoose');
const shopLedgerSchema = new mongoose.Schema({
  adminId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  shopId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', default: null },
  name:        { type: String, required: true, trim: true },
  reference:   { type: String, required: true, trim: true },
  expense:     { type: Number, default: 0 },
  receiveCash: { type: Number, default: 0 },
  cashPaid:    { type: Number, default: 0 },
  status:      { type: String, enum: ['Payable', 'Receivable', 'Settled'], default: 'Settled' },
  transactions: [{
    expense:     { type: Number, default: 0 },
    receiveCash: { type: Number, default: 0 },
    cashPaid:    { type: Number, default: 0 },
    date:        { type: Date, default: Date.now },
  }],
}, { timestamps: true });
module.exports = mongoose.model('ShopLedger', shopLedgerSchema);
