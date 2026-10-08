const express = require('express');
const { protect, authorize, requireActiveShopOwner } = require('../../middlewares/auth.middleware');
const ROLES = require('../../constants/roles');
const controller = require('./shopOwner.controller');

const router = express.Router();

// All routes require a valid ShopOwner JWT
router.use(protect, authorize(ROLES.SHOP_OWNER), requireActiveShopOwner);

// GET  /api/shop-owner/dashboard   — branch-specific dashboard
router.get('/dashboard', controller.getDashboard);

// GET  /api/shop-owner/profile
router.get('/profile', controller.getProfile);

// PUT  /api/shop-owner/profile
router.put('/profile', controller.updateProfile);

module.exports = router;
