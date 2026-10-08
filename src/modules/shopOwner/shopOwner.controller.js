const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const shopOwnerService = require('./shopOwner.service');

const getDashboard = asyncHandler(async (req, res) => {
  const data = await shopOwnerService.getDashboard(req.user._id);
  res.status(200).json(new ApiResponse(200, data, 'Dashboard data fetched.'));
});

const getProfile = asyncHandler(async (req, res) => {
  const profile = await shopOwnerService.getProfile(req.user._id);
  res.status(200).json(new ApiResponse(200, profile, 'Profile fetched.'));
});

const updateProfile = asyncHandler(async (req, res) => {
  const profile = await shopOwnerService.updateProfile(req.user._id, req.body);
  res.status(200).json(new ApiResponse(200, profile, 'Profile updated.'));
});

module.exports = { getDashboard, getProfile, updateProfile };
