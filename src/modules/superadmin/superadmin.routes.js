const express = require('express');
const { protect, authorize } = require('../../middlewares/auth.middleware');
const ROLES = require('../../constants/roles');
const controller = require('./superadmin.controller');

const router = express.Router();

router.use(protect, authorize(ROLES.SUPER_ADMIN));

// ── Registration approval workflow ─────────────────────────
// GET    /api/superadmin/registrations?status=
// GET    /api/superadmin/registrations/:id
// PATCH  /api/superadmin/registrations/:id/approve
// PATCH  /api/superadmin/registrations/:id/reject        ← hard / permanent rejection
// PATCH  /api/superadmin/registrations/:id/reject-price  ← price issue; sends back to sales agent
// PATCH  /api/superadmin/registrations/:id/counter-offer ← send final counter-offer price to admin
router.get('/registrations',              controller.listRegistrations);
router.get('/registrations/:id',          controller.getRegistration);
router.patch('/registrations/:id/approve',       controller.approveRegistration);
router.patch('/registrations/:id/reject',        controller.rejectRegistration);
router.patch('/registrations/:id/reject-price',  controller.rejectPrice);
router.patch('/registrations/:id/counter-offer', controller.sendCounterOffer);

// ── Negotiation activity dashboard ─────────────────────────
// GET /api/superadmin/negotiation-activity?salesAgentId=&status=
// Returns full price history, round count, and audit trail for all referred registrations.
router.get('/negotiation-activity', controller.getNegotiationActivity);

// ── Admin login status message (preview) ───────────────────
// GET /api/superadmin/admin-status-message/:adminId
// Returns the structured banner message an admin sees on their login screen.
router.get('/admin-status-message/:adminId', controller.getAdminStatusMessage);

// ── User management ────────────────────────────────────────
router.get('/users',               controller.listUsers);
router.patch('/users/:id/status',  controller.toggleAdminStatus);

// ── Sales agent management ─────────────────────────────────
router.post('/sales-agents',  controller.createSalesAgent);
router.get('/sales-agents',   controller.listSalesAgents);

// ── Commission management ──────────────────────────────────
router.get('/commissions',                     controller.listCommissions);
router.get('/commissions/by-admin/:adminId',   controller.getCommissionByAdmin);
router.patch('/commissions/:id',               controller.setCommission);

// ── Branch overview (read-only) ────────────────────────────
router.get('/branches', controller.listAllBranches);

// ── Analytics ──────────────────────────────────────────────
router.get('/analytics', controller.getAnalytics);

// ── Audit Logs ─────────────────────────────────────────────
// GET /api/superadmin/audit-logs?entityId=&entityType=&action=&page=&limit=
router.get('/audit-logs', controller.getAuditLogs);

module.exports = router;
