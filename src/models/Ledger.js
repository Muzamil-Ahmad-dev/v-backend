const mongoose = require('mongoose');
const ledgerSchema = new mongoose.Schema({
  adminId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  shopId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', default: null },
  // NEW: lets the BILLING staff "My Wallet" feature scope ledgers per-branch,
  // same pattern as Invoice/branchScopedCrudFactory. Stays null for ledgers
  // created via the admin finance module, so existing behavior is unchanged.
  branchId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
  createdBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  date:         { type: String, required: true },
  openingCash:  { type: Number, required: true, default: 0 },
  cashReceived: { type: Number, required: true, default: 0 },
  cashPaid:     { type: Number, required: true, default: 0 },
  expense:      { type: Number, required: true, default: 0 },
  closingCash:  { type: Number, required: true, default: 0 },
  archived:     { type: Boolean, default: false },
  cashReceivedDetails: [{ amount: Number, source: String, date: Date }],
  cashPaidDetails:     [{ amount: Number, recipient: String, date: Date }],
  expenseDetails:      [{ amount: Number, purpose: String, date: Date }],
}, { timestamps: true });
ledgerSchema.index({ adminId: 1, branchId: 1, date: 1 }, { unique: true });
ledgerSchema.pre('save', function (next) {
  this.closingCash = (this.openingCash||0)+(this.cashReceived||0)-(this.cashPaid||0)-(this.expense||0);
  next();
});
module.exports = mongoose.model('Ledger', ledgerSchema);
