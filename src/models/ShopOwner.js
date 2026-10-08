const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

/**
 * ShopOwner — a user created by an Admin.
 * Stored separately from the main User model to keep okiee-backend clean.
 */
const shopOwnerSchema = new mongoose.Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      default: null,
    },
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    businessName: {
      type: String,
      trim: true,
      default: '',
    },
    address: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      enum: ['PENDING', 'ACTIVE', 'DEACTIVATED'],
      default: 'ACTIVE',
    },
    // Subscription
    planType: {
      type: String,
      enum: ['YEARLY', 'LIFETIME', null],
      default: null,
    },
    subscriptionStartDate: { type: Date, default: null },
    subscriptionEndDate: { type: Date, default: null },
  },
  { timestamps: true }
);

shopOwnerSchema.index({ adminId: 1, status: 1 });

shopOwnerSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  return next();
});

shopOwnerSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

shopOwnerSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model('ShopOwner', shopOwnerSchema);
