const mongoose = require('mongoose');
const saleInvoiceSchema = new mongoose.Schema({
  adminId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  branchId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
  shopId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', default: null },
  invoiceNumber: { type: String, required: true, trim: true },
  saleType:      { type: String, enum: ['single', 'bulk', 'generic'], default: 'single' },
  saleDate:      { type: Date, default: Date.now },
  customerName:  { type: String, trim: true },
  customerNumber:{ type: String, trim: true },
  phoneDetails: {
    imei1: { type: mongoose.Schema.Types.Mixed },
    imei2: { type: mongoose.Schema.Types.Mixed },
    companyName: String, modelName: String, color: String, ramMemory: String, warranty: String,
  },
  accessories: [{
    accessoryId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Accessory' },
    accessoryName: String,
    quantity:      { type: Number, default: 1 },
    price:         { type: Number, default: 0 },
    totalPrice:    { type: Number, default: 0 },
  }],
  pricing: {
    salePrice: Number, purchasePrice: Number, totalInvoice: Number, profit: { type: Number, default: 0 },
  },
  payment: {
    sellingPaymentType:    { type: String, enum: ['Full Payment', 'Credit', 'Bank', 'Exchange', 'Cash'], default: 'Cash' },
    payableAmountNow:      Number,
    payableAmountLater:    Number,
    payableAmountLaterDate:Date,
  },
  isReturned:   { type: Boolean, default: false },
  returnAmount: { type: Number, default: 0 },
}, { timestamps: true });
saleInvoiceSchema.index({ adminId: 1, saleDate: -1 });
module.exports = mongoose.model('SaleInvoice', saleInvoiceSchema);
