const asyncHandler = require('../../../utils/asyncHandler');
const ApiResponse = require('../../../utils/ApiResponse');
const service = require('./staff.service');

const createStaff = asyncHandler(async (req, res) => {
  const staff = await service.createStaff(req.user, req.body);
  res.status(201).json(new ApiResponse(201, staff, 'Staff member created successfully.'));
});

const listStaff = asyncHandler(async (req, res) => {
  const data = await service.listStaff(req.user._id, req.query);
  res.status(200).json(new ApiResponse(200, data, 'Staff fetched.'));
});

const getStaff = asyncHandler(async (req, res) => {
  const staff = await service.getStaff(req.user._id, req.params.id);
  res.status(200).json(new ApiResponse(200, staff, 'Staff member fetched.'));
});

const updateStaff = asyncHandler(async (req, res) => {
  const staff = await service.updateStaff(req.user._id, req.params.id, req.body);
  res.status(200).json(new ApiResponse(200, staff, 'Staff member updated.'));
});

const toggleStaffStatus = asyncHandler(async (req, res) => {
  const { action } = req.body;
  const staff = await service.toggleStaffStatus(req.user._id, req.params.id, action);
  res.status(200).json(new ApiResponse(200, staff, `Staff member ${action}d successfully.`));
});

const deleteStaff = asyncHandler(async (req, res) => {
  await service.deleteStaff(req.user._id, req.params.id);
  res.status(200).json(new ApiResponse(200, {}, 'Staff member deleted.'));
});

module.exports = { createStaff, listStaff, getStaff, updateStaff, toggleStaffStatus, deleteStaff };
