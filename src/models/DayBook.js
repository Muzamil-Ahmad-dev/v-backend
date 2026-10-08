const mongoose = require('mongoose');
const dayBookSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  shopId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', default: null },
  date:    { type: Date, default: Date.now },
  description: { type: String, trim: true, default: '' },
  cashIn:  { type: Number, default: 0 },
  cashOut: { type: Number, default: 0 },
  balance: { type: Number, default: 0 },
  category:{ type: String, trim: true, default: '' },
}, { timestamps: true });
dayBookSchema.index({ adminId: 1, date: -1 });
module.exports = mongoose.model('DayBook', dayBookSchema);
