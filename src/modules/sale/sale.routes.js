  const express = require('express');
const { protect, authorize } = require('../../middlewares/auth.middleware');
const ROLES = require('../../constants/roles');
const SaleInvoice = require('../../models/SaleInvoice');
const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const { resolveBranchId } = require('../../utils/branchContext');
const saleInvoiceRoutes = require('./saleInvoice/saleInvoice.routes');

const router = express.Router();

// UPDATED: every branch staff role (BILLING/SALE/PURCHASE) now gets full
// access here, same as BRANCH_ADMIN — a Branch Admin's staff share the
// Branch Admin's full module access, scoped to their own branch via
// resolveBranchId()/tenantAdminId().
router.use(protect, authorize(ROLES.SALE, ROLES.PURCHASE, ROLES.BILLING, ROLES.BRANCH_ADMIN));

// GET /api/sale/dashboard
router.get(
  '/dashboard',
  asyncHandler(async (req, res) => {
    const branchId = await resolveBranchId(req);
    const filter = { adminId: req.user.parentAdminId, branchId };
    const [totalSales, recentSales] = await Promise.all([
      SaleInvoice.countDocuments(filter),
      SaleInvoice.find(filter).sort({ createdAt: -1 }).limit(10),
    ]);
    res.status(200).json(
      new ApiResponse(200, {
        profile: req.user.toSafeObject(),
        branchId,
        totalSales,
        recentSales,
      }, 'Sale dashboard fetched.')
    );
  })
);

// /api/sale/invoices — real sale-invoice workflow: sells a phone (single or
// bulk stock, by IMEI) and/or accessories, deducts inventory, records
// payment/customer credit, links to the shop, and supports returns.
// Locked to this user's branch via resolveBranchId() inside the service.
router.use('/invoices', saleInvoiceRoutes);

module.exports = router;
