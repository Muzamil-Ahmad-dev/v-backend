const express = require('express');
const { protect, authorize } = require('../../middlewares/auth.middleware');
const ROLES = require('../../constants/roles');
const controller = require('./salesAgent.controller');

const router = express.Router();

router.use(protect, authorize(ROLES.SALES_AGENT));

// ── Dashboard / stats ──────────────────────────────────────
router.get('/referrals/stats', controller.getReferralStats);

// ── Referral list ──────────────────────────────────────────
router.get('/referrals', controller.getReferrals);

// ── Negotiation workflow ───────────────────────────────────
// PATCH /api/sales-agent/referrals/:id/negotiate
//   Set or update negotiated price.
//   Works for: PENDING_NEGOTIATION (first time) and PRICE_REJECTED (re-negotiation).
router.patch('/referrals/:id/negotiate', controller.updateNegotiatedPrice);

// POST /api/sales-agent/referrals/:id/submit
//   Submit to Super Admin.
//   Works for first-time submissions and re-submissions after PRICE_REJECTED.
router.post('/referrals/:id/submit', controller.submitToSuperAdmin);

// ── Commissions ────────────────────────────────────────────
router.get('/commissions', controller.getCommissions);

module.exports = router;
