const mongoose = require('mongoose');

/**
 * Standalone AuditLog model — tracks every meaningful action across the system.
 * Entity types: 'User', 'Branch', 'ShopOwner'
 * Actions: 'REGISTRATION', 'OTP_SENT', 'OTP_VERIFIED', 'NEGOTIATION_UPDATED',
 *          'SUBMITTED_TO_SUPERADMIN', 'APPROVED', 'REJECTED', 'ACCOUNT_ACTIVATED',
 *          'BRANCH_CREATED', 'SHOP_OWNER_CREATED', 'STATUS_CHANGED', etc.
 */
const auditLogSchema = new mongoose.Schema(
  {
    entityType: { type: String, enum: ['User', 'Branch', 'ShopOwner'], required: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
    action: { type: String, required: true },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    performedByRole: { type: String, default: null },
    note: { type: String, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

auditLogSchema.index({ entityId: 1, entityType: 1 });
auditLogSchema.index({ performedBy: 1 });
auditLogSchema.index({ action: 1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
