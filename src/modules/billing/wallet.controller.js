 const Ledger = require('../../models/Ledger');
const ApiError = require('../../utils/ApiError');
const ApiResponse = require('../../utils/ApiResponse');
const asyncHandler = require('../../utils/asyncHandler');
const { resolveBranchId } = require('../../utils/branchContext');

/* =========================
   "MY WALLET" — BILLING module
   A per-branch daily cash ledger:
     - openingCash            : carried over from previous day's closingCash
     - cashReceived (Receivables) : money coming in
     - cashPaid     (Payables)    : money going out to others
     - expense                : shop expenses
     - closingCash             : auto-calculated (opening + received - paid - expense)

   Every record is scoped to { adminId: req.user.parentAdminId, branchId }
   — the same convention used by createBranchScopedCRUDRouter elsewhere in
   the billing module — so one branch's billing staff can never see or
   touch another branch's wallet.

   NOTE: branchId now comes from resolveBranchId(req) instead of reading
   req.user.branchId directly — BILLING staff still get their own fixed
   branch as before, but a BRANCH_ADMIN (who can own multiple branches)
   must select one via ?branchId=... / body.branchId, and it's validated
   to make sure that branch actually belongs to them.
========================= */

const todayStr = () => new Date().toISOString().split('T')[0];
const nextDayStr = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
};

// Resolves + validates the branch for this request, or throws.
const requireBranch = async (req) => {
  const branchId = await resolveBranchId(req);
  if (!branchId) {
    throw new ApiError(403, 'Your account has no branch assigned. Contact your Branch Admin.');
  }
  return branchId;
};

const scope = (req, branchId) => ({
  adminId: req.user.parentAdminId,
  branchId,
});

const emptyLedger = (req, branchId, date) => ({
  ...scope(req, branchId),
  createdBy: req.user._id,
  date,
  openingCash: 0,
  cashReceived: 0,
  cashPaid: 0,
  expense: 0,
  closingCash: 0,
  cashReceivedDetails: [],
  cashPaidDetails: [],
  expenseDetails: [],
});

/* =========================
   GET TODAY'S WALLET (auto-creates if missing)
========================= */
exports.getTodaysWallet = asyncHandler(async (req, res) => {
  const branchId = await requireBranch(req);
  const date = todayStr();

  let wallet = await Ledger.findOne({ ...scope(req, branchId), date });
  if (!wallet) {
    wallet = await Ledger.create(emptyLedger(req, branchId, date));
  }

  res.status(200).json(new ApiResponse(200, wallet, "Today's wallet fetched successfully."));
});

/* =========================
   UPDATE OPENING CASH
========================= */
exports.updateOpeningCash = asyncHandler(async (req, res) => {
  const branchId = await requireBranch(req);
  const { amount } = req.body;

  if (amount === undefined || amount < 0) {
    throw new ApiError(400, 'A valid, non-negative opening cash amount is required.');
  }

  const date = todayStr();
  let wallet = await Ledger.findOne({ ...scope(req, branchId), date });

  if (!wallet) {
    wallet = await Ledger.create({ ...emptyLedger(req, branchId, date), openingCash: amount });
    return res.status(201).json(new ApiResponse(201, wallet, 'Wallet created with opening cash.'));
  }

  wallet.openingCash = amount;
  await wallet.save();
  res.status(200).json(new ApiResponse(200, wallet, 'Opening cash updated successfully.'));
});

/* =========================
   ADD RECEIVABLE (cash received)
========================= */
exports.addReceivable = asyncHandler(async (req, res) => {
  const branchId = await requireBranch(req);
  const { amount, source } = req.body;

  if (!amount || amount <= 0) {
    throw new ApiError(400, 'A valid amount is required.');
  }

  const date = todayStr();
  let wallet = await Ledger.findOne({ ...scope(req, branchId), date });
  if (!wallet) wallet = new Ledger(emptyLedger(req, branchId, date));

  wallet.cashReceived += amount;
  wallet.cashReceivedDetails.push({ amount, source, date: new Date() });
  await wallet.save();

  res.status(200).json(new ApiResponse(200, wallet, 'Receivable recorded successfully.'));
});

/* =========================
   ADD PAYABLE (cash paid)
========================= */
exports.addPayable = asyncHandler(async (req, res) => {
  const branchId = await requireBranch(req);
  const { amount, recipient } = req.body;

  if (!amount || amount <= 0) {
    throw new ApiError(400, 'A valid amount is required.');
  }

  const date = todayStr();
  let wallet = await Ledger.findOne({ ...scope(req, branchId), date });
  if (!wallet) wallet = new Ledger(emptyLedger(req, branchId, date));

  wallet.cashPaid += amount;
  wallet.cashPaidDetails.push({ amount, recipient, date: new Date() });
  await wallet.save();

  res.status(200).json(new ApiResponse(200, wallet, 'Payable recorded successfully.'));
});

/* =========================
   ADD EXPENSE
========================= */
exports.addExpense = asyncHandler(async (req, res) => {
  const branchId = await requireBranch(req);
  const { amount, purpose } = req.body;

  if (!amount || amount <= 0) {
    throw new ApiError(400, 'A valid amount is required.');
  }

  const date = todayStr();
  let wallet = await Ledger.findOne({ ...scope(req, branchId), date });
  if (!wallet) wallet = new Ledger(emptyLedger(req, branchId, date));

  wallet.expense += amount;
  wallet.expenseDetails.push({ amount, purpose, date: new Date() });
  await wallet.save();

  res.status(200).json(new ApiResponse(200, wallet, 'Expense recorded successfully.'));
});

/* =========================
   RECALCULATE / GET CLOSING CASH
========================= */
exports.recalculateClosingCash = asyncHandler(async (req, res) => {
  const branchId = await requireBranch(req);
  const { id } = req.params;

  const wallet = await Ledger.findOne({ _id: id, ...scope(req, branchId) });
  if (!wallet) throw new ApiError(404, 'Wallet record not found.');

  const totalReceived = wallet.cashReceivedDetails.reduce((sum, i) => sum + i.amount, 0);
  const totalPaid = wallet.cashPaidDetails.reduce((sum, i) => sum + i.amount, 0);
  const totalExpense = wallet.expenseDetails.reduce((sum, i) => sum + i.amount, 0);

  wallet.cashReceived = totalReceived;
  wallet.cashPaid = totalPaid;
  wallet.expense = totalExpense;
  // closingCash is recalculated automatically in the pre('save') hook
  await wallet.save();

  res.status(200).json(new ApiResponse(200, wallet, 'Closing cash recalculated successfully.'));
});

/* =========================
   END DAY — archive today, create tomorrow
========================= */
exports.endDay = asyncHandler(async (req, res) => {
  const branchId = await requireBranch(req);
  const date = todayStr();
  const nextDate = nextDayStr();

  let todayWallet = await Ledger.findOne({ ...scope(req, branchId), date });
  if (!todayWallet) {
    todayWallet = await Ledger.create({ ...emptyLedger(req, branchId, date), archived: true });
    return res.status(404).json(
      new ApiResponse(404, todayWallet, 'No wallet found for today. A new empty wallet was created and archived.')
    );
  }

  todayWallet.archived = true;
  await todayWallet.save();

  const existingNext = await Ledger.findOne({ ...scope(req, branchId), date: nextDate });
  if (existingNext) {
    return res.status(200).json(new ApiResponse(200, existingNext, `Wallet for ${nextDate} already exists.`));
  }

  const newWallet = await Ledger.create({
    ...emptyLedger(req, branchId, nextDate),
    openingCash: todayWallet.closingCash,
  });

  res.status(201).json(new ApiResponse(201, newWallet, `Day ended. New wallet created for ${nextDate}.`));
});

/* =========================
   HISTORY — all wallet records for this branch
========================= */
exports.getWalletHistory = asyncHandler(async (req, res) => {
  const branchId = await requireBranch(req);
  const { page, limit } = req.query;

  let q = Ledger.find(scope(req, branchId)).sort({ date: -1 });
  if (page && limit) {
    const skip = (Number(page) - 1) * Number(limit);
    q = q.skip(skip).limit(Number(limit));
  }

  const records = await q;
  res.status(200).json(new ApiResponse(200, records, 'Wallet history fetched successfully.'));
});

/* =========================
   GET WALLET RECORD BY ID
========================= */
exports.getWalletById = asyncHandler(async (req, res) => {
  const branchId = await requireBranch(req);
  const wallet = await Ledger.findOne({ _id: req.params.id, ...scope(req, branchId) });
  if (!wallet) throw new ApiError(404, 'Wallet record not found.');

  res.status(200).json(new ApiResponse(200, wallet, 'Wallet record fetched successfully.'));
});
