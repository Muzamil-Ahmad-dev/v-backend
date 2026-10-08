const mongoose = require('mongoose');
const purchaseSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
  shopId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', default: null },
  name: { type: String, required: true, trim: true },
  companyName:    { type: String, required: true, trim: true },
  modelName:      { type: String, required: true, trim: true },
  imei1:          { type: String, required: true, trim: true },
  imei2:          { type: String, trim: true },
  ramMemory:      { type: String, trim: true },
  color:          { type: String, trim: true },
  phoneCondition: { type: String, enum: ['New', 'Used'], default: 'New' },
  warranty:       { type: String, default: '12 month' },
  purchasePrice:  { type: Number, required: true },
  demandPrice:    { type: Number },
  finalPrice:     { type: Number },
  date:   { type: Date, default: Date.now },
  status: { type: String, enum: ['Available', 'Sold', 'Dispatched'], default: 'Available' },
}, { timestamps: true });
purchaseSchema.index({ adminId: 1, status: 1 });
module.exports = mongoose.model('Purchase', purchaseSchema);
