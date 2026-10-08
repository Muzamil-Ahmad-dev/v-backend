 const mongoose = require('mongoose');
const repairJobSchema = new mongoose.Schema({
  adminId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  branchId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
  shopId:         { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', default: null },
  customerName:   { type: String, required: true, trim: true },
  customerNumber: { type: String, required: true, trim: true },
  customerType:   { type: String, enum: ['existing', 'new'], default: 'new' },
  // Ref'd into the catalog (Company / PhoneModel) instead of free-text, so a
  // repair job is always tied to a real brand + model — mirrors Okiee's
  // CompanySchema.Company / .Model relationship.
  company:        { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  model:          { type: mongoose.Schema.Types.ObjectId, ref: 'PhoneModel', required: true },
  receivedDate:   { type: Date, default: Date.now },
  deliveryDate:   { type: Date },
  faultIssue:     { type: String, required: true, trim: true },
  isPhoneReceived:{ type: Boolean, default: false },
  isDeadApproval: { type: Boolean, default: false },
  // `id` is the Accessory._id the part was sold from — required so stock can
  // be deducted/restored against the right accessory (repair.service.js
  // dedupes/reconciles parts by this field).
  parts: [{
    id:    { type: mongoose.Schema.Types.ObjectId, ref: 'Accessory', required: true },
    name:  { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
  }],
  estimatedAmount:{ type: Number, required: true, min: 0 },
  profit:         { type: Number, default: 0, min: 0 },
  paymentType:    { type: String, enum: ['full', 'credit'], default: 'full' },
  advance:        { type: Number, default: 0 },
  payLate:        { type: Number, default: 0 },
  status:         { type: String, enum: ['todo', 'in-progress', 'complete', 'handover'], default: 'todo' },
}, { timestamps: true });
repairJobSchema.index({ adminId: 1, status: 1 });
repairJobSchema.pre('save', function (next) {
  if (this.paymentType === 'credit') {
    this.payLate = (this.estimatedAmount||0) - (this.advance||0);
  }
  if (Array.isArray(this.parts) && this.parts.length > 0) {
    const total = this.parts.reduce((s, p) => s + Number(p.price||0), 0);
    this.profit = Math.max(0, (this.estimatedAmount||0) - total);
  } else {
    this.profit = this.estimatedAmount;
  }
  next();
});
module.exports = mongoose.model('RepairJob', repairJobSchema);