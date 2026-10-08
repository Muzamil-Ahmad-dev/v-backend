const mongoose = require('mongoose');
const stockMovementSchema = new mongoose.Schema({
  adminId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  shopId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', default: null },
  itemType:     { type: String, enum: ['phone', 'accessory'], required: true },
  itemId:       { type: mongoose.Schema.Types.ObjectId, required: true },
  itemName:     { type: String, required: true, trim: true },
  movementType: { type: String, enum: ['in', 'out'], required: true },
  quantity:     { type: Number, required: true, default: 1 },
  reason:       { type: String, trim: true, default: '' },
  date:         { type: Date, default: Date.now },
}, { timestamps: true });
stockMovementSchema.index({ adminId: 1, itemType: 1, itemId: 1 });
module.exports = mongoose.model('StockMovement', stockMovementSchema);
