const Branch = require('../../../models/Branch');
const User = require('../../../models/User');
const ApiError = require('../../../utils/ApiError');
const ROLES = require('../../../constants/roles');

// Admin oversight only — read-only. Branches are created and managed
// exclusively by a BRANCH_ADMIN (see branchAdmin/branches/branches.service.js).
// This file intentionally has no createBranch/updateBranch/deleteBranch/
// createBranchAdmin — that ability was removed from the Admin side so there
// is exactly one place a branch can come from.

const listBranches = async (adminId) =>
  Branch.find({ adminId }).populate('branchAdminId', 'name email').sort({ createdAt: -1 });

const getBranch = async (adminId, id) => {
  const branch = await Branch.findOne({ _id: id, adminId }).populate('branchAdminId', 'name email');
  if (!branch) throw new ApiError(404, 'Branch not found.');
  return branch;
};

const listBranchAdmins = async (adminId, branchId) => {
  const filter = { parentAdminId: adminId, role: ROLES.BRANCH_ADMIN };
  if (branchId) filter.branchId = branchId;
  return User.find(filter).populate('branchId', 'name address').sort({ createdAt: -1 });
};

module.exports = { listBranches, getBranch, listBranchAdmins };
