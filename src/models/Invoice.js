const mongoose = require('mongoose');
const invoiceSchema = new mongoose.Schema({
  adminId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  branchId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
  shopId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', default: null },
  invoiceNumber: { type: String, required: true, trim: true },
  invoiceDate:   { type: Date, default: Date.now },
  items: [{
    itemType: { type: String, enum: ['phone', 'accessory'], default: 'phone' },
    itemId:   { type: mongoose.Schema.Types.ObjectId },
    itemName: { type: String, required: true },
    imei:     { type: String },
    price:    { type: Number, required: true },
    quantity: { type: Number, default: 1 },
  }],
  totalAmount: { type: Number, required: true, min: 0 },
}, { timestamps: true });
invoiceSchema.index({ adminId: 1, invoiceNumber: 1 });
module.exports = mongoose.model('Invoice', invoiceSchema);
