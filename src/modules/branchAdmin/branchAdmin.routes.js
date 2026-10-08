 const express = require('express');
const { protect, authorize } = require('../../middlewares/auth.middleware');
const ROLES = require('../../constants/roles');
const controller = require('./branchAdmin.controller');

// NEW sub-routers
const branchesRoutes = require('./branches/branches.routes');
const staffRoutes     = require('./staff/staff.routes');
const branchesController = require('./branches/branches.controller');

// Full operational modules, reused as-is from the PURCHASE / SALE / BILLING
// staff modules. Each of those routers already scopes every record to
// req.user.parentAdminId + req.user.branchId, which a Branch Admin has set
// exactly the same way branch staff do — so a Branch Admin gets full control
// of their own branch's purchases/stock, sales, invoices, finance and wallet,
// without seeing any other branch's data.
// NOTE: each of these routers applies its own protect+authorize() (which now
// also allows BRANCH_ADMIN), so mounting them here is safe even though this
// router already authorizes BRANCH_ADMIN above.
const purchaseRoutes = require('../purchase/purchase.routes');
const saleRoutes      = require('../sale/sale.routes');
const billingRoutes   = require('../billing/billing.routes');

// The remaining pieces of the original (older) Okiee-Backend catalog system —
// Phone/Accessory catalog, Dispatch, Repair Jobs, Notifications — previously
// only existed at the tenant-wide Admin level (models/*.js). Each now has an
// optional branchId (additive, non-breaking) so Branch Admin can manage their
// own branch's copy of each, the same way /api/admin/inventory/*, /repairs
// and /notifications work for the Admin.
const inventoryRoutes    = require('./inventory/inventory.routes');
const repairsRoutes      = require('../repair/repair.routes');
const notificationsRoutes = require('./notifications/notifications.routes');

// NEW: Company/brand + Phone Model catalog, shared with the Admin's own
// /api/admin/catalog/* — same tenant-wide reference data (companyRoutes /
// modelRoutes use tenantAdminId(), which resolves to the parent Admin's id
// for a Branch Admin), so a Branch Admin sees and can manage the exact same
// catalog their parent Admin does.
const companyRoutes = require('../admin/catalog/company.routes');
const modelRoutes    = require('../admin/catalog/model.routes');

// NEW: Generic image upload (Cloudinary) — used for shop logos, IMEI photos, etc.
const uploadRoutes = require('../upload/upload.routes');

// NEW: Full Shop CRUD + logo management (same tenant-wide records as
// /api/admin's own shops, shared via tenantAdminId()).
const shopRoutes = require('../frontendApi/shop.routes');

const router = express.Router();

// UPDATED: Billing/Sale/Purchase staff a Branch Admin creates now share the
// exact same operational access as the Branch Admin — purchase, sale,
// billing, inventory, repairs, notifications, catalog, upload, shop —
// scoped to their own branch (resolveBranchId() already fixes staff to
// their single branchId, see branchContext.js). Only branch management and
// staff management below stay BRANCH_ADMIN-only via an extra authorize().
const STAFF_ROLES = [ROLES.BILLING, ROLES.SALE, ROLES.PURCHASE];
router.use(protect, authorize(ROLES.BRANCH_ADMIN, ...STAFF_ROLES));

// GET /api/branch-admin/dashboard — BRANCH_ADMIN only (aggregates across all
// branches this Branch Admin owns; not meaningful for a single-branch staff account).
router.get('/dashboard', authorize(ROLES.BRANCH_ADMIN), controller.getDashboard);

// GET /api/branch-admin/shop-owners — open to staff too (the Shops page's
// "select owner" dropdown needs this); listBranchShopOwners() below now
// scopes correctly for both a multi-branch BRANCH_ADMIN and a single-branch
// staff account.
router.get('/shop-owners', controller.listBranchShopOwners);

// NEW: read-only "my branch" for BILLING/SALE/PURCHASE staff (and also works
// for a Branch Admin, though they'll normally use the list/detail routes
// below since they can own more than one branch). Staff need this for their
// own branch's name/address/phone (e.g. invoice headers) but must never
// list/create/edit/delete branches — that stays BRANCH_ADMIN-only below.
// GET /api/branch-admin/branches/me
router.get('/branches/me', branchesController.getMyBranch);

// NEW: Branch Admin's own branches — BRANCH_ADMIN only (staff must never create/edit branches).
// POST/GET/PUT/DELETE /api/branch-admin/branches[/:id]
router.use('/branches', authorize(ROLES.BRANCH_ADMIN), branchesRoutes);

// NEW: Branch Admin's Billing/Sale/Purchase staff — BRANCH_ADMIN only (staff must never manage other staff).
// POST/GET/PUT/PATCH/DELETE /api/branch-admin/staff[/:id]
router.use('/staff', authorize(ROLES.BRANCH_ADMIN), staffRoutes);

// ── Full software modules, scoped to the Branch Admin's own branch ────────
// Purchase & Stock: /api/branch-admin/purchase/dashboard, /phones, /bulk, /stock
router.use('/purchase', purchaseRoutes);

// Sale: /api/branch-admin/sale/dashboard, /invoices
router.use('/sale', saleRoutes);

// Billing, Finance & Wallet:
// /api/branch-admin/billing/dashboard, /invoices,
// /finance/ledger, /finance/bank, /finance/expenses, /finance/party-ledger,
// /finance/committee-ledger, /finance/shop-ledger, /finance/pocket-cash,
// /finance/payables-receivables, /finance/daybook, /finance/balance-sheet,
// /wallet/today, /wallet/opening-cash, /wallet/receivable, /wallet/payable,
// /wallet/expense, /wallet/end-day, /wallet/history, /wallet/:id
router.use('/billing', billingRoutes);

// Inventory catalog: /api/branch-admin/inventory/phones, /accessories, /dispatch
router.use('/inventory', inventoryRoutes);

// Repair jobs: /api/branch-admin/repairs[/:id]
router.use('/repairs', repairsRoutes);

// Notifications: /api/branch-admin/notifications[/:id]
router.use('/notifications', notificationsRoutes);

// Catalog: /api/branch-admin/catalog/companies, /api/branch-admin/catalog/models
router.use('/catalog/companies', companyRoutes);
router.use('/catalog/models',    modelRoutes);

// Image upload: /api/branch-admin/upload/image, /api/branch-admin/upload/delete
router.use('/upload', uploadRoutes);

// Shops: /api/branch-admin/shop[/:id], /api/branch-admin/shop/:id/logo
router.use('/shop', shopRoutes);

module.exports = router;
