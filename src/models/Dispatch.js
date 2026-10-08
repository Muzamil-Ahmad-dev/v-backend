const mongoose = require('mongoose');
const dispatchSchema = new mongoose.Schema({
  adminId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  branchId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
  shopId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', default: null },
  receiverName: { type: String, required: true, trim: true },
  items: [{
    itemType: { type: String, enum: ['phone', 'accessory'], required: true },
    itemId:   { type: mongoose.Schema.Types.ObjectId, required: true },
    itemName: { type: String },
    quantity: { type: Number, default: 1 },
  }],
  dispatchDate: { type: Date, default: Date.now },
  status:       { type: String, enum: ['Dispatched', 'Returned', 'Sold'], default: 'Dispatched' },
}, { timestamps: true });
dispatchSchema.index({ adminId: 1, status: 1 });
module.exports = mongoose.model('Dispatch', dispatchSchema);
