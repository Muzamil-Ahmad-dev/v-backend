const express = require('express');
const authController = require('./auth.controller');
const { protect } = require('../../middlewares/auth.middleware');

const router = express.Router();

// ── Registration (3-step OTP flow) ──────────────────────
// Step 1: POST /api/auth/register/send-otp       { email }
// Step 2: POST /api/auth/register/verify-otp     { email, otp }
// Step 3: POST /api/auth/register                { name, email, phone, password, ... }
router.post('/register/send-otp', authController.sendRegistrationOtp);
router.post('/register/verify-otp', authController.verifyRegistrationOtp);
router.post('/register', authController.register);

// ── Auth ────────────────────────────────────────────────
router.post('/login', authController.login);
router.get('/verify-email/:token', authController.verifyEmail);
router.get('/me', protect, authController.getMe);

// ── Helpers ─────────────────────────────────────────────
router.get('/validate-referral/:code', authController.validateReferralCode);

module.exports = router;
