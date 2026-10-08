const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const ROLES = require('../constants/roles');
const STATUS = require('../constants/status');

const userSchema = new mongoose.Schema(
  {
    name:         { type: String, required: true, trim: true },
    businessName: { type: String, trim: true },
    email: {
      type:      String,
      required:  true,
      unique:    true,
      lowercase: true,
      trim:      true,
    },
    phone:    { type: String, trim: true },
    password: { type: String, required: true, select: false },

    role: {
      type:    String,
      enum:    Object.values(ROLES),
      default: ROLES.ADMIN,
    },

    status: {
      type:    String,
      enum:    Object.values(STATUS),
      default: STATUS.PENDING_APPROVAL,
    },

    // ── Subscription / plan info (ADMIN only) ──────────────
    planType:         { type: String, enum: ['YEARLY', 'LIFETIME'], default: null },
    planPrice:        { type: Number, default: null },
    negotiationPrice: { type: Number, default: null },
    negotiationReason:{ type: String, default: null },
    finalPrice:       { type: Number, default: null },

    // ── Referral info (ADMIN only) ─────────────────────────
    salesAgentId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    referralCodeUsed:  { type: String, default: null },
    registrationSource:{ type: String, enum: ['DIRECT', 'REFERRAL'], default: 'DIRECT' },

    // ── Referral code owned by this user (SALES_AGENT only) ─
    referralCode: { type: String, unique: true, sparse: true },

    // ── Email verification ─────────────────────────────────
    emailVerified:          { type: Boolean, default: false },
    verificationToken:      { type: String, select: false },
    verificationTokenExpiry:{ type: Date,   select: false },

    // ── OTP fields for registration email verification ─────
    registrationOtp:        { type: String,  select: false },
    registrationOtpExpiry:  { type: Date,    select: false },
    registrationOtpVerified:{ type: Boolean, default: false },

    // ── Approval / rejection audit trail ──────────────────
    approvedBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt:      { type: Date,   default: null },
    rejectedAt:      { type: Date,   default: null },
    rejectionReason: { type: String, default: null },

    // ── Sales Agent negotiation flow ───────────────────────
    negotiatedPrice: { type: Number, default: null },
    negotiatedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    submittedToSuperAdminAt: { type: Date, default: null },
    approvalStatus: {
      type:    String,
      enum:    ['PENDING', 'NEGOTIATING', 'SUBMITTED', 'PRICE_REJECTED', 'COUNTER_OFFER', 'APPROVED', 'REJECTED'],
      default: 'PENDING',
    },

    // ── Price rejection (re-negotiation) fields ────────────
    // Set by superadmin when rejecting due to price disagreement.
    // Triggers a re-negotiation loop instead of a hard rejection.
    superadminDesiredPrice: { type: Number, default: null },   // Counter-price superadmin wants
    priceRejectionReason:   { type: String, default: null },   // Why the price was rejected
    priceRejectedAt:        { type: Date,   default: null },   // Timestamp of last price rejection
    negotiationRound:       { type: Number, default: 0 },      // How many re-negotiation cycles occurred

    // ── Counter-offer fields ───────────────────────────────
    // Set by superadmin when sending a final counter-offer price directly to admin.
    // Admin must contact their sales agent to proceed with this price.
    counterOfferPrice:      { type: Number, default: null },   // Final approved price from superadmin
    counterOfferMessage:    { type: String, default: null },   // Explanation message from superadmin
    counterOfferSentAt:     { type: Date,   default: null },   // Timestamp counter-offer was sent

    // ── Branch Admin / Shop Owner parent references ────────
    parentAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User',   default: null },
    branchId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },

    // ── NEW: which Branch Admin created this user (only set for
    //         BILLING / SALE / PURCHASE staff). Optional, defaults null. ──
    branchAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // ── Embedded audit log for key actions ────────────────
    auditLog: [
      {
        action:      { type: String },
        performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        performedAt: { type: Date, default: Date.now },
        note:        { type: String, default: '' },
      },
    ],
  },
  { timestamps: true }
);

userSchema.index({ role: 1, status: 1 });
userSchema.index({ parentAdminId: 1 });
userSchema.index({ branchId: 1 });
userSchema.index({ branchAdminId: 1 });

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  return next();
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toSafeObject = function toSafeObject() {
  const obj = this.toObject();
  delete obj.password;
  delete obj.verificationToken;
  delete obj.verificationTokenExpiry;
  delete obj.registrationOtp;
  delete obj.registrationOtpExpiry;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
