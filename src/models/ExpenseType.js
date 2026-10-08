const mongoose = require('mongoose');

const expenseTypeSchema = new mongoose.Schema(
  {
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

expenseTypeSchema.index({ adminId: 1, name: 1 });

module.exports = mongoose.model('ExpenseType', expenseTypeSchema);
