  const Branch = require('../../models/Branch');
const ShopOwner = require('../../models/ShopOwner');
const User = require('../../models/User');
const ApiError = require('../../utils/ApiError');
const ROLES = require('../../constants/roles');
const { logAudit } = require('../../utils/auditHelper');

/**
 * Branch Admin — manages operations for branches under their parent Admin account.
 * Branch Admins are User records with role=BRANCH_ADMIN and parentAdminId set.
 * They cannot access Super Admin settings.
 */

// Every branch owned by this Branch Admin — works for both the legacy
// single-branch-tied flow (branchAdmin.branchId set) and the newer
// independent flow (branchAdmin.branchId is null, branches instead carry
// branchAdminId pointing back to this Branch Admin).
const getOwnedBranchIds = async (branchAdmin) => {
  const owned = await Branch.find({ branchAdminId: branchAdmin._id }).select('_id');
  const ids = owned.map((b) => b._id);
  if (branchAdmin.branchId) ids.push(branchAdmin.branchId);
  return ids;
};

const getDashboard = async (branchAdminId) => {
  const branchAdmin = await User.findById(branchAdminId).populate('branchId', 'name address phone');
  if (!branchAdmin) throw new ApiError(404, 'Branch admin not found.');

  const branches = await Branch.find({ branchAdminId: branchAdmin._id }).sort({ createdAt: -1 });
  const branchIds = await getOwnedBranchIds(branchAdmin);

  if (branchIds.length === 0) {
    return { branchAdmin: branchAdmin.toSafeObject(), branch: null, branches: [], shopOwners: [] };
  }

  const shopOwners = await ShopOwner.find({ branchId: { $in: branchIds } }).select('-password');

  return {
    branchAdmin: branchAdmin.toSafeObject(),
    // Kept for backward compatibility with the old single-branch UI.
    branch: branchAdmin.branchId || branches[0] || null,
    // NEW: every branch this Branch Admin owns, for a branch switcher.
    branches,
    shopOwners,
  };
};

const listBranchShopOwners = async (requester, { page = 1, limit = 20, branchId } = {}) => {
  let ownedBranchIds;
  let parentAdminId;

  if (requester.role === ROLES.BRANCH_ADMIN) {
    const branchAdmin = await User.findById(requester._id);
    if (!branchAdmin) throw new ApiError(404, 'Branch admin not found.');

    ownedBranchIds = await getOwnedBranchIds(branchAdmin);
    parentAdminId = branchAdmin.parentAdminId;
  } else {
    // BILLING/SALE/PURCHASE staff: always fixed to their own single branch,
    // same convention as resolveBranchId() in branchContext.js.
    ownedBranchIds = requester.branchId ? [requester.branchId] : [];
    parentAdminId = requester.parentAdminId;
  }

  if (ownedBranchIds.length === 0) {
    return { shopOwners: [], pagination: { total: 0, page: Number(page), pages: 0 } };
  }

  // Optionally narrow to one specific branch (must be one this account owns/is fixed to).
  let branchFilter = { $in: ownedBranchIds };
  if (branchId) {
    const owns = ownedBranchIds.some((id) => String(id) === String(branchId));
    if (!owns) throw new ApiError(404, 'Branch not found or does not belong to you.');
    branchFilter = branchId;
  }

  const filter = { adminId: parentAdminId, branchId: branchFilter };
  const skip = (Number(page) - 1) * Number(limit);

  const [shopOwners, total] = await Promise.all([
    ShopOwner.find(filter).select('-password').sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
    ShopOwner.countDocuments(filter),
  ]);

  return { shopOwners, pagination: { total, page: Number(page), pages: Math.ceil(total / limit) } };
};

module.exports = { getDashboard, listBranchShopOwners };
