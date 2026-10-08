const asyncHandler = require('../../../utils/asyncHandler');
const ApiResponse = require('../../../utils/ApiResponse');
const service = require('./branchAdmin.service');

const createBranchAdmin = asyncHandler(async (req, res) => {
  const branchAdmin = await service.createBranchAdmin(req.user._id, req.body);
  res.status(201).json(new ApiResponse(201, branchAdmin, 'Branch admin created successfully.'));
});

const listBranchAdmins = asyncHandler(async (req, res) => {
  const branchAdmins = await service.listBranchAdmins(req.user._id);
  res.status(200).json(new ApiResponse(200, branchAdmins, 'Branch admins fetched.'));
});

const toggleBranchAdminStatus = asyncHandler(async (req, res) => {
  const { action } = req.body;
  const branchAdmin = await service.toggleBranchAdminStatus(req.user._id, req.params.id, action);
  res.status(200).json(new ApiResponse(200, branchAdmin, `Branch admin ${action}d successfully.`));
});

module.exports = { createBranchAdmin, listBranchAdmins, toggleBranchAdminStatus };
