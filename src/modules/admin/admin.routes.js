const express = require('express');
const { protect, authorize, requireActiveAdmin } = require('../../middlewares/auth.middleware');
const ROLES = require('../../constants/roles');
const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');

// Sub-module routers
const branchRoutes          = require('./branches/branch.routes');
const branchAdminsRoutes    = require('./branchAdmins/branchAdmin.routes'); // NEW
const shopOwnerRoutes       = require('./shopOwners/shopOwner.routes');
const phoneRoutes           = require('./inventory/phones/phone.routes');
const accessoryRoutes       = require('./inventory/accessories/accessory.routes');
const purchaseRoutes        = require('./inventory/purchase/purchase.routes');
const stockRoutes           = require('./inventory/stock/stock.routes');
const dispatchRoutes        = require('./inventory/dispatch/dispatch.routes');
const invoiceRoutes         = require('./sales/invoice/invoice.routes');
const saleInvoiceRoutes     = require('./sales/saleInvoice/saleInvoice.routes');
// Finance routes now live under the billing module (shared with the BILLING role)
const ledgerRoutes          = require('../billing/finance/ledger/ledger.routes');
const bankRoutes            = require('../billing/finance/bank/bank.routes');
const expenseRoutes         = require('../billing/finance/expense/expense.routes');
const partyLedgerRoutes     = require('../billing/finance/partyLedger/partyLedger.routes');
const committeeLedgerRoutes = require('../billing/finance/committeeLedger/committeeLedger.routes');
const shopLedgerRoutes      = require('../billing/finance/shopLedger/shopLedger.routes');
const pocketCashRoutes      = require('../billing/finance/pocketCash/pocketCash.routes');
const payablesRoutes        = require('../billing/finance/payablesReceivables/payablesReceivables.routes');
const dayBookRoutes         = require('../billing/finance/dayBook/dayBook.routes');
const balanceSheetRoutes    = require('../billing/finance/balanceSheet/balanceSheet.routes');
const repairRoutes          = require('../repair/repair.routes');
const notificationRoutes    = require('./notification/notification.routes');
const companyRoutes         = require('./catalog/company.routes'); // NEW: Company/brand catalog
const modelRoutes           = require('./catalog/model.routes');   // NEW: Phone model catalog

const router = express.Router();

// Guard: all admin routes require a valid JWT, ADMIN role, and active account
router.use(protect, authorize(ROLES.ADMIN), requireActiveAdmin);

// Profile
router.get(
  '/profile',
  asyncHandler(async (req, res) => {
    res.status(200).json(new ApiResponse(200, req.user.toSafeObject(), 'Profile fetched.'));
  })
);

// Branches — READ-ONLY oversight. Admin can view every branch across the
// business, but creation/editing/deletion is exclusively done by a
// BRANCH_ADMIN via /api/branch-admin/branches.
// GET    /api/admin/branches
// GET    /api/admin/branches/:id
// GET    /api/admin/branches/admins
router.use('/branches', branchRoutes);

// Branch Admins — the ONLY thing an Admin creates directly on this side of
// the hierarchy. Each Branch Admin then creates their own branches and
// their own Billing/Sale/Purchase staff (see /api/branch-admin/*). (NEW)
// POST   /api/admin/branch-admins
// GET    /api/admin/branch-admins
// PATCH  /api/admin/branch-admins/:id/status
router.use('/branch-admins', branchAdminsRoutes);

// Shop Owners
// GET    /api/admin/shop-owners/dashboard
// POST   /api/admin/shop-owners
// GET    /api/admin/shop-owners            ?status=&branchId=&page=&limit=
// GET    /api/admin/shop-owners/:id
// PUT    /api/admin/shop-owners/:id
// PATCH  /api/admin/shop-owners/:id/status   body: { action: 'activate'|'deactivate' }
// DELETE /api/admin/shop-owners/:id
router.use('/shop-owners', shopOwnerRoutes);

// Catalog (NEW): Company/brand + Phone Model reference data, shared across
// all branches — used to populate dropdowns when adding purchase/inventory
// items instead of typing free-text brand/model every time.
// POST/GET/PUT/DELETE /api/admin/catalog/companies[/:id]
// POST/GET/PUT/DELETE /api/admin/catalog/models[/:id]      (?companyId= to filter)
router.use('/catalog/companies', companyRoutes);
router.use('/catalog/models',    modelRoutes);

// Inventory
router.use('/inventory/phones',      phoneRoutes);
router.use('/inventory/accessories', accessoryRoutes);
router.use('/inventory/purchases',   purchaseRoutes);
router.use('/inventory/stock',       stockRoutes);
router.use('/inventory/dispatch',    dispatchRoutes);

// Sales
router.use('/sales/invoices',      invoiceRoutes);
router.use('/sales/sale-invoices', saleInvoiceRoutes);

// Finance
router.use('/finance/ledger',               ledgerRoutes);
router.use('/finance/bank',                 bankRoutes);
router.use('/finance/expenses',             expenseRoutes);
router.use('/finance/party-ledger',         partyLedgerRoutes);
router.use('/finance/committee-ledger',     committeeLedgerRoutes);
router.use('/finance/shop-ledger',          shopLedgerRoutes);
router.use('/finance/pocket-cash',          pocketCashRoutes);
router.use('/finance/payables-receivables', payablesRoutes);
router.use('/finance/daybook',              dayBookRoutes);
router.use('/finance/balance-sheet',        balanceSheetRoutes);

// Repair
router.use('/repairs', repairRoutes);

// Notifications
router.use('/notifications', notificationRoutes);

// ── Registration status message (login banner) ─────────────
// GET /api/admin/status-message
// Returns a structured banner the frontend shows on login for pending/rejected/price-rejected accounts.
// Note: requireActiveAdmin middleware is bypassed for this route so pending admins can still call it.
router.get(
  '/status-message',
  asyncHandler(async (req, res) => {
    const salesAgentService = require('../salesAgent/salesAgent.service');
    const message = await salesAgentService.getMyStatusMessage(req.user._id);
    res.status(200).json(new ApiResponse(200, message, 'Status message fetched.'));
  })
);

module.exports = router;
