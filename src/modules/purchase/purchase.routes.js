 const express = require('express');
const { protect, authorize } = require('../../middlewares/auth.middleware');
const ROLES = require('../../constants/roles');
const Purchase = require('../../models/Purchase');
const BulkPurchase = require('../../models/BulkPurchase');
const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const { tenantAdminId } = require('./shared/tenantAdminId');
const { resolveBranchId } = require('../../utils/branchContext');

const singlePurchaseRoutes = require('./singlePurchase/singlePurchase.routes');
const bulkPurchaseRoutes = require('./bulkPurchase/bulkPurchase.routes');
const stockRoutes = require('./stock/stock.routes');
const accessoryRoutes = require('./accessory/accessory.routes');

const router = express.Router();

// UPDATED: every branch staff role (BILLING/SALE/PURCHASE) now gets full
// access here, same as BRANCH_ADMIN — a Branch Admin's staff share the
// Branch Admin's full module access, scoped to their own branch via
// resolveBranchId()/tenantAdminId().
router.use(protect, authorize(ROLES.PURCHASE, ROLES.SALE, ROLES.BILLING, ROLES.BRANCH_ADMIN));

// GET /api/purchase/dashboard
router.get(
  '/dashboard',
  asyncHandler(async (req, res) => {
    const branchId = await resolveBranchId(req);
    const filter = { adminId: tenantAdminId(req), branchId };
    const [totalPurchases, recentPurchases, totalBulkPurchases, availableStockCount] = await Promise.all([
      Purchase.countDocuments(filter),
      Purchase.find(filter).sort({ createdAt: -1 }).limit(10),
      BulkPurchase.countDocuments(filter),
      Purchase.countDocuments({ ...filter, status: 'Available' }),
    ]);
    res.status(200).json(
      new ApiResponse(200, {
        profile: req.user.toSafeObject(),
        branchId,
        totalPurchases,
        totalBulkPurchases,
        availableStockCount,
        recentPurchases,
      }, 'Purchase dashboard fetched.')
    );
  })
);

// ── Purchase & Stock module ──────────────────────────────────────────
// Everything below is locked to the PURCHASE role and scoped to the
// staff member's own branch (adminId = parent Admin, branchId = own branch).
//
// /phones — single-phone purchases (add, edit, delete, dispatch, return)
// /bulk   — bulk phone purchases with RAM/SIM/IMEI stock tracking
// /stock  — combined read-only stock view across /phones + /bulk
router.use('/phones', singlePurchaseRoutes);
router.use('/bulk', bulkPurchaseRoutes);
router.use('/stock', stockRoutes);
router.use('/accessories', accessoryRoutes);

module.exports = router;
