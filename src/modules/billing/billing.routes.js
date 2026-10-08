  const express = require('express');
const { protect, authorize } = require('../../middlewares/auth.middleware');
const ROLES = require('../../constants/roles');
const Invoice = require('../../models/Invoice');
const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const { createBranchScopedCRUDRouter } = require('../../utils/branchScopedCrudFactory');
const wallet = require('./wallet.controller');
const { resolveBranchId } = require('../../utils/branchContext');

// Finance sub-modules (moved here from admin so the BILLING role can use them too)
const ledgerRoutes          = require('./finance/ledger/ledger.routes');
const bankRoutes            = require('./finance/bank/bank.routes');
const expenseRoutes         = require('./finance/expense/expense.routes');
const partyLedgerRoutes     = require('./finance/partyLedger/partyLedger.routes');
const committeeLedgerRoutes = require('./finance/committeeLedger/committeeLedger.routes');
const shopLedgerRoutes      = require('./finance/shopLedger/shopLedger.routes');
const pocketCashRoutes      = require('./finance/pocketCash/pocketCash.routes');
const payablesRoutes        = require('./finance/payablesReceivables/payablesReceivables.routes');
const dayBookRoutes         = require('./finance/dayBook/dayBook.routes');
const balanceSheetRoutes    = require('./finance/balanceSheet/balanceSheet.routes');

const router = express.Router();

// UPDATED: every branch staff role (BILLING/SALE/PURCHASE) now gets full
// access here, same as BRANCH_ADMIN — a Branch Admin's staff share the
// Branch Admin's full module access, scoped to their own branch via
// resolveBranchId()/tenantAdminId().
router.use(protect, authorize(ROLES.BILLING, ROLES.SALE, ROLES.PURCHASE, ROLES.BRANCH_ADMIN));

// GET /api/billing/dashboard
router.get(
  '/dashboard',
  asyncHandler(async (req, res) => {
    const branchId = await resolveBranchId(req);
    const filter = { adminId: req.user.parentAdminId, branchId };
    const [totalInvoices, recentInvoices] = await Promise.all([
      Invoice.countDocuments(filter),
      Invoice.find(filter).sort({ createdAt: -1 }).limit(10),
    ]);
    res.status(200).json(
      new ApiResponse(200, {
        profile: req.user.toSafeObject(),
        branchId,
        totalInvoices,
        recentInvoices,
      }, 'Billing dashboard fetched.')
    );
  })
);

// POST/GET/PUT/DELETE /api/billing/invoices[/:id] — locked to this user's branch
router.use('/invoices', createBranchScopedCRUDRouter(Invoice, 'Invoice'));

/* =========================
   FINANCE
   Moved here from the admin module so BILLING staff can also manage these.
========================= */
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

/* =========================
   MY WALLET
   Daily cash ledger: opening cash, Payables / Receivables, and Expenses.
   All scoped to the billing staff's own branch.
========================= */
router.get('/wallet/today', wallet.getTodaysWallet);
router.put('/wallet/opening-cash', wallet.updateOpeningCash);
router.post('/wallet/receivable', wallet.addReceivable);   // money received (Receivables)
router.post('/wallet/payable', wallet.addPayable);         // money paid out (Payables)
router.post('/wallet/expense', wallet.addExpense);         // shop expenses
router.get('/wallet/recalculate/:id', wallet.recalculateClosingCash);
router.post('/wallet/end-day', wallet.endDay);
router.get('/wallet/history', wallet.getWalletHistory);
router.get('/wallet/:id', wallet.getWalletById);

module.exports = router;
