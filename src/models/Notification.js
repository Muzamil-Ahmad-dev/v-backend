const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  adminId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  branchId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
  shopId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', default: null },
  title:         { type: String, required: true, trim: true },
  message:       { type: String, required: true, trim: true },
  type:          { type: String, enum: ['info', 'success', 'warning', 'error'], default: 'info' },
  isRead:        { type: Boolean, default: false },
  recipientRole: { type: String, enum: ['admin', 'superadmin', 'sales_agent'], default: 'admin' },

  // Extra structured data for frontend to render rich banners
  // e.g. { rejectionReason, superadminDesiredPrice, negotiationRound }
  metadata: { type: mongoose.Schema.Types.Mixed, default: null },

  // Links the notification to a specific registration/user so frontend can deep-link
  relatedUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

notificationSchema.index({ adminId: 1, isRead: 1 });
notificationSchema.index({ adminId: 1, recipientRole: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
