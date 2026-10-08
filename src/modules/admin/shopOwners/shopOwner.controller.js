const asyncHandler = require('../../../utils/asyncHandler');
const ApiResponse = require('../../../utils/ApiResponse');
const service = require('./shopOwner.service');

const createShopOwner = asyncHandler(async (req, res) => {
  const owner = await service.createShopOwner(req.user._id, req.body);
  res.status(201).json(new ApiResponse(201, owner, 'Shop owner created successfully.'));
});

const listShopOwners = asyncHandler(async (req, res) => {
  const { status, branchId, page, limit } = req.query;
  const data = await service.listShopOwners(req.user._id, { status, branchId, page, limit });
  res.status(200).json(new ApiResponse(200, data, 'Shop owners fetched.'));
});

const getShopOwner = asyncHandler(async (req, res) => {
  const owner = await service.getShopOwner(req.user._id, req.params.id);
  res.status(200).json(new ApiResponse(200, owner, 'Shop owner fetched.'));
});

const updateShopOwner = asyncHandler(async (req, res) => {
  const owner = await service.updateShopOwner(req.user._id, req.params.id, req.body);
  res.status(200).json(new ApiResponse(200, owner, 'Shop owner updated.'));
});

const toggleShopOwnerStatus = asyncHandler(async (req, res) => {
  const { action } = req.body;
  const owner = await service.toggleShopOwnerStatus(req.user._id, req.params.id, action);
  res.status(200).json(new ApiResponse(200, owner, `Shop owner ${action}d successfully.`));
});

const deleteShopOwner = asyncHandler(async (req, res) => {
  await service.deleteShopOwner(req.user._id, req.params.id);
  res.status(200).json(new ApiResponse(200, {}, 'Shop owner deleted.'));
});

const getDashboardStats = asyncHandler(async (req, res) => {
  const stats = await service.getDashboardStats(req.user._id);
  res.status(200).json(new ApiResponse(200, stats, 'Dashboard stats fetched.'));
});

module.exports = {
  createShopOwner,
  listShopOwners,
  getShopOwner,
  updateShopOwner,
  toggleShopOwnerStatus,
  deleteShopOwner,
  getDashboardStats,
};
