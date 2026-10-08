const mongoose = require('mongoose');

const phoneSchema = new mongoose.Schema(
  {
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
    shopId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', default: null },
    images:  { type: [String], default: [] },
    companyName:    { type: String, required: true, trim: true },
    modelName:      { type: String, required: true, trim: true },
    specs:          { type: String, default: '' },
    imei:           { type: String, required: true, trim: true },
    imei2:          { type: String, trim: true },
    color:          { type: String, trim: true },
    ramMemory:      { type: String, trim: true },
    phoneCondition: { type: String, enum: ['New', 'Used'], default: 'New' },
    warranty:       { type: String, default: '12 month' },
    purchasePrice:  { type: Number, required: true },
    demandPrice:    { type: Number },
    finalPrice:     { type: Number },
    status:         { type: String, enum: ['Available', 'Sold', 'Dispatched'], default: 'Available' },
  },
  { timestamps: true }
);

phoneSchema.index({ adminId: 1, imei: 1 });
phoneSchema.index({ adminId: 1, status: 1 });

module.exports = mongoose.model('Phone', phoneSchema);
