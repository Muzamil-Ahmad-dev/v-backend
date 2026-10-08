const mongoose = require('mongoose');
const balanceSheetSchema = new mongoose.Schema({
  adminId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  shopId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', default: null },
  periodLabel: { type: String, trim: true, default: '' }, // e.g. "June 2026"
  assets:      { type: Number, default: 0 },
  liabilities: { type: Number, default: 0 },
  equity:      { type: Number, default: 0 },
  notes:       { type: String, trim: true, default: '' },
}, { timestamps: true });
balanceSheetSchema.index({ adminId: 1, createdAt: -1 });
module.exports = mongoose.model('BalanceSheet', balanceSheetSchema);
