 const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const branchAdminService = require('./branchAdmin.service');

const getDashboard = asyncHandler(async (req, res) => {
  const data = await branchAdminService.getDashboard(req.user._id);
  res.status(200).json(new ApiResponse(200, data, 'Branch admin dashboard fetched.'));
});

const listBranchShopOwners = asyncHandler(async (req, res) => {
  const data = await branchAdminService.listBranchShopOwners(req.user, req.query);
  res.status(200).json(new ApiResponse(200, data, 'Branch shop owners fetched.'));
});

module.exports = { getDashboard, listBranchShopOwners };
