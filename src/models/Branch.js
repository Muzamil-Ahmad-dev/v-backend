const mongoose = require('mongoose');

const branchSchema = new mongoose.Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // NEW: which Branch Admin created/owns this branch (null for branches
    // created directly by the Admin via the existing flow — fully optional).
    branchAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Branch name is required'],
      trim: true,
      minlength: [2, 'Branch name must be at least 2 characters'],
      maxlength: [100, 'Branch name cannot exceed 100 characters'],
    },
    address: {
      type: String,
      trim: true,
      default: '',
    },
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    managerName: {
      type: String,
      trim: true,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

branchSchema.index({ adminId: 1, name: 1 });

module.exports = mongoose.model('Branch', branchSchema);
