const mongoose = require('mongoose');

const shopSchema = new mongoose.Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    shopOwnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ShopOwner',
      required: true,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      default: null,
    },
    name: {
      type: String,
      required: [true, 'Shop name is required'],
      trim: true,
    },
    description: { type: String, trim: true, default: '' },
    category: { type: String, trim: true, default: '' },
    address: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    status: {
      type: String,
      enum: ['PENDING', 'ACTIVE', 'DEACTIVATED'],
      default: 'ACTIVE',
    },

    // ── Ported from Okiee-Backend's ShopSchema ──────────────────────
    logo: { type: String, default: '' }, // Cloudinary URL, set via /shop/:id/logo
    logoPublicId: { type: String, default: '' }, // needed to delete the old logo from Cloudinary on replace
    addresses: { type: [String], default: [] }, // extra branch/pickup addresses shown on invoices
    contacts: {
      type: [
        {
          name: { type: String, required: true, trim: true },
          contactNumber: { type: String, required: true, trim: true },
        },
      ],
      default: [],
    },
    termsCondition: { type: [String], default: [] }, // printed on invoices/receipts
  },
  { timestamps: true }
);

shopSchema.index({ adminId: 1, status: 1 });
shopSchema.index({ shopOwnerId: 1 });

module.exports = mongoose.model('Shop', shopSchema);
