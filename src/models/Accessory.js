const mongoose = require('mongoose');
const accessorySchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
  shopId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', default: null },
  accessoryName: { type: String, required: true, trim: true },
  quantity:      { type: Number, required: true, default: 0 },
  perPiecePrice: { type: Number, required: true, default: 0 },
  totalPrice:    { type: Number, default: 0 },
  stock:         { type: Number, required: true, default: 0 },
  profit:        { type: Number, default: 0 },
  picture:       { type: String },
}, { timestamps: true });
accessorySchema.index({ adminId: 1, accessoryName: 1 });
module.exports = mongoose.model('Accessory', accessorySchema);
