const asyncHandler = require('../../../utils/asyncHandler');
const ApiResponse = require('../../../utils/ApiResponse');
const branchService = require('./branch.service');

// Admin oversight only — read-only. Branch creation/editing/deletion is
// exclusively done by a BRANCH_ADMIN via /api/branch-admin/branches.

const listBranches = asyncHandler(async (req, res) => {
  const branches = await branchService.listBranches(req.user._id);
  res.status(200).json(new ApiResponse(200, branches, 'Branches fetched.'));
});

const getBranch = asyncHandler(async (req, res) => {
  const branch = await branchService.getBranch(req.user._id, req.params.id);
  res.status(200).json(new ApiResponse(200, branch, 'Branch fetched.'));
});

const listBranchAdmins = asyncHandler(async (req, res) => {
  const admins = await branchService.listBranchAdmins(req.user._id, req.query.branchId);
  res.status(200).json(new ApiResponse(200, admins, 'Branch admins fetched.'));
});

module.exports = { listBranches, getBranch, listBranchAdmins };
