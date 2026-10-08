const asyncHandler = require('../../../utils/asyncHandler');
const ApiResponse = require('../../../utils/ApiResponse');
const service = require('./branches.service');

const createBranch = asyncHandler(async (req, res) => {
  const branch = await service.createBranch(req.user, req.body);
  res.status(201).json(new ApiResponse(201, branch, 'Branch created.'));
});

const listBranches = asyncHandler(async (req, res) => {
  const branches = await service.listBranches(req.user._id);
  res.status(200).json(new ApiResponse(200, branches, 'Branches fetched.'));
});

const getBranch = asyncHandler(async (req, res) => {
  const branch = await service.getBranch(req.user._id, req.params.id);
  res.status(200).json(new ApiResponse(200, branch, 'Branch fetched.'));
});

const updateBranch = asyncHandler(async (req, res) => {
  const branch = await service.updateBranch(req.user._id, req.params.id, req.body);
  res.status(200).json(new ApiResponse(200, branch, 'Branch updated.'));
});

const deleteBranch = asyncHandler(async (req, res) => {
  await service.deleteBranch(req.user._id, req.params.id);
  res.status(200).json(new ApiResponse(200, null, 'Branch deleted.'));
});

// GET /api/branch-admin/branches/me — read-only, available to BILLING/SALE/PURCHASE
// staff too (not just BRANCH_ADMIN), since staff need their own branch's
// name/address/phone (e.g. for invoice headers) but must never list, create,
// edit or delete branches.
const getMyBranch = asyncHandler(async (req, res) => {
  const branch = await service.getMyBranch(req.user);
  res.status(200).json(new ApiResponse(200, branch, 'Your branch fetched.'));
});

module.exports = { createBranch, listBranches, getBranch, updateBranch, deleteBranch, getMyBranch };
