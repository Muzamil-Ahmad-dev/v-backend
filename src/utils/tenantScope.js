/**
 * Resolves the tenant (admin) id that owns financial records for the
 * current request — Bank Accounts, Pocket Cash, Ledger, Party Ledger,
 * Committee Ledger, Expenses, Persons, etc.
 *
 * Staff logins (Billing/Sale/Purchase/Branch Admin) have req.user.parentAdminId
 * set to the real tenant Admin's id — that's the id whose records they should
 * see and modify.
 *
 * The actual Admin account has parentAdminId === null (nothing is "parent"
 * to an Admin), so it falls back to the Admin's own _id, which correctly IS
 * the tenant id in that case.
 *
 * Always use this instead of reading req.user._id directly when scoping a
 * query/record by adminId — using req.user._id directly scopes staff
 * requests to the staff member's own user id instead of the tenant's,
 * causing "not found" / empty-list bugs for every staff role (e.g.
 * "Pocket cash account not found" when a PURCHASE-role staff member buys
 * a phone, because their Pocket Cash wallet lookup missed the tenant's
 * real wallet).
 *
 * Do NOT use this for looking up the logged-in user's own account (e.g.
 * password verification) — use req.user._id directly for that.
 */
const tenantAdminId = (req) => req.user.parentAdminId || req.user._id;

module.exports = { tenantAdminId };
