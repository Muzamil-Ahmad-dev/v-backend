const AuditLog = require('../models/AuditLog');

/**
 * Log a structured audit event.
 * @param {object} opts
 * @param {string} opts.entityType - 'User' | 'Branch' | 'ShopOwner'
 * @param {ObjectId|string} opts.entityId
 * @param {string} opts.action - e.g. 'NEGOTIATION_UPDATED'
 * @param {ObjectId|string|null} opts.performedBy - userId who triggered the action
 * @param {string} [opts.performedByRole]
 * @param {string} [opts.note]
 * @param {object} [opts.metadata] - any extra data (prices, old/new status, etc.)
 */
const logAudit = async ({ entityType, entityId, action, performedBy = null, performedByRole = null, note = '', metadata = {} }) => {
  try {
    await AuditLog.create({ entityType, entityId, action, performedBy, performedByRole, note, metadata });
  } catch (err) {
    // Never let audit failures break the main flow
    const logger = require('./logger');
    logger.warn(`AuditLog write failed: ${err.message}`);
  }
};

module.exports = { logAudit };
