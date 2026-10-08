const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const authRoutes        = require('./modules/auth/auth.routes');
const superadminRoutes  = require('./modules/superadmin/superadmin.routes');
const salesAgentRoutes  = require('./modules/salesAgent/salesAgent.routes');
const adminRoutes       = require('./modules/admin/admin.routes');
const shopOwnerRoutes   = require('./modules/shopOwner/shopOwner.routes');
const branchAdminRoutes = require('./modules/branchAdmin/branchAdmin.routes');

// NEW: Branch-level staff roles
const billingRoutes     = require('./modules/billing/billing.routes');
const saleRoutes        = require('./modules/sale/sale.routes');
const purchaseStaffRoutes = require('./modules/purchase/purchase.routes');

// NEW: Ledger-suite routes matching the AddLedger / Wallet / PayablesAndReceivables / etc. frontend 1:1
const { protect } = require('./middlewares/auth.middleware');
const banksRoutes         = require('./modules/frontendApi/banks.routes');
const pocketCashRoutesFE  = require('./modules/frontendApi/pocketCash.routes');
const expenseRoutesFE     = require('./modules/frontendApi/expense.routes');
const committeeRoutesFE   = require('./modules/frontendApi/committee.routes');
const partyLedgerRoutesFE = require('./modules/frontendApi/partyLedger.routes');
const purchaseCreditPay   = require('./modules/frontendApi/purchaseCreditPay.routes');
const personRoutesFE      = require('./modules/frontendApi/person.routes');
const ledgerRoutesFE      = require('./modules/frontendApi/ledger.routes');
const shopRoutesFE        = require('./modules/frontendApi/shop.routes');
const uploadRoutes        = require('./modules/upload/upload.routes'); // NEW: generic Cloudinary image upload

const { errorHandler, notFound } = require('./middlewares/error.middleware');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

// ── API Routes ────────────────────────────────────────────
app.use('/api/auth',          authRoutes);
app.use('/api/superadmin',    superadminRoutes);
app.use('/api/sales-agent',   salesAgentRoutes);
app.use('/api/admin',         adminRoutes);
app.use('/api/shop-owner',    shopOwnerRoutes);    // NEW: Shop Owner dashboard
app.use('/api/branch-admin',  branchAdminRoutes);  // NEW: Branch Admin dashboard

// NEW: Branch-level staff dashboards (created by a Branch Admin)
app.use('/api/billing',       billingRoutes);
app.use('/api/sale',          saleRoutes);
app.use('/api/purchase',      purchaseStaffRoutes);

// NEW: Flat top-level ledger-suite API — matches the ledger frontend components exactly
// (AddLedger, Wallet, BankTransactions, PocketCashTransactions, CommetyLedger, LedgerRecords,
//  LedgerDetail, PartyLedger, PartyLedgerDetail, PayablesAndReceivables[Records]).
// All scoped per-admin via req.user._id, same convention as the rest of the app.
app.use('/api/banks',      protect, banksRoutes);
app.use('/api/pocketCash', protect, pocketCashRoutesFE);
app.use('/api/expense',    protect, expenseRoutesFE);
app.use('/api/committee',  protect, committeeRoutesFE);
app.use('/api/partyLedger',protect, partyLedgerRoutesFE);
// NOTE: shares the '/api/purchase' prefix with purchaseStaffRoutes above.
// No collision today — purchaseStaffRoutes only owns /dashboard, /phones,
// /bulk, /stock, /accessories, while this router only owns
// /bulk-purchase-credit-pay/:id. If a new sub-path is ever added to either
// router, check the other one first to avoid a silent route shadow.
app.use('/api/purchase',   protect, purchaseCreditPay); // adds PATCH /bulk-purchase-credit-pay/:id (case-insensitive: also matches /api/Purchase/...)
app.use('/api/person',     protect, personRoutesFE);
app.use('/api/ledger',     protect, ledgerRoutesFE);
app.use('/api/shop',       protect, shopRoutesFE);
app.use('/api/upload',     uploadRoutes); // NEW: POST /api/upload/image, POST /api/upload/delete (protect applied inside)

app.use(notFound);
app.use(errorHandler);

module.exports = app;
