/**
 * Resolves the tenant (admin) id for the current request.
 *
 * Staff logins (Billing/Sale/Purchase/Branch Admin) have req.user.parentAdminId
 * set to the real tenant Admin's id.
 * The actual Admin account has parentAdminId === null, so it falls back to
 * the Admin's own _id, which IS the tenant id in that case.
 *
 * Always use this instead of reading req.user.parentAdminId directly, or an
 * Admin's own purchases/dispatches/payments will be scoped to adminId: null
 * and silently fail to match records like Bank/PocketCash/PartyLedger that
 * were created under the Admin's real _id.
 */
const tenantAdminId = (req) => req.user.parentAdminId || req.user._id;

module.exports = { tenantAdminId };
