const ApiError = require('./ApiError');
const ROLES = require('../constants/roles');
const Branch = require('../models/Branch');

/**
 * Resolves which branch the current request should be scoped to.
 *
 * - BILLING / SALE / PURCHASE staff: always their own fixed req.user.branchId.
 *   A branchId in the query/body is ignored for them — they can never
 *   switch branches, exactly as before.
 *
 * - BRANCH_ADMIN: can own multiple branches, so the branch must be selected
 *   per-request via ?branchId=... (GET/DELETE) or body.branchId (POST/PUT).
 *   It is validated against Branch.branchAdminId so a Branch Admin can never
 *   read/write another Branch Admin's branch by guessing an id.
 *
 * Returns the branchId (string) to filter/tag records with, or `null` if
 * none applies (matches old behavior for staff with no branch assigned).
 * Throws a 400/404 ApiError for a Branch Admin who didn't pick a valid
 * branch — this used to silently scope to `branchId: null` (i.e. return
 * nothing), which is why Purchase/Billing/Sale/Inventory/Repairs/
 * Notifications previously looked "empty" for a Branch Admin.
 */
const resolveBranchId = async (req) => {
  if (req.user.role === ROLES.BRANCH_ADMIN) {
    const requested = req.query.branchId || req.body?.branchId;
    if (!requested) {
      throw new ApiError(400, 'branchId is required — pass ?branchId=<one of your branches>.');
    }
    const branch = await Branch.findOne({ _id: requested, branchAdminId: req.user._id });
    if (!branch) {
      throw new ApiError(404, 'Branch not found or does not belong to you.');
    }
    return String(branch._id);
  }
  // Staff (BILLING/SALE/PURCHASE): fixed to their own branch, unchanged.
  return req.user.branchId ? String(req.user.branchId) : null;
};

module.exports = { resolveBranchId };
