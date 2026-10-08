const express = require('express');
const asyncHandler = require('../../../utils/asyncHandler');
const ApiResponse = require('../../../utils/ApiResponse');
const {
  purchaseAccessories,
  restockAccessory,
  listAccessories,
  getAccessoryById,
  updateAccessory,
  deleteAccessory,
} = require('./accessory.service');

const router = express.Router();

// GET /api/purchase/accessories[?accessoryName&shopId&page&limit]
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const items = await listAccessories(req);
    res.status(200).json(new ApiResponse(200, items, 'Accessories fetched.'));
  })
);

// GET /api/purchase/accessories/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const item = await getAccessoryById(req);
    res.status(200).json(new ApiResponse(200, item, 'Accessory fetched.'));
  })
);

// POST /api/purchase/accessories — purchase (stock in), handles payment/credit
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const result = await purchaseAccessories(req);
    res.status(201).json(new ApiResponse(201, result, 'Accessories purchased successfully.'));
  })
);

// PATCH /api/purchase/accessories/:id/restock — add stock to an existing accessory
router.patch(
  '/:id/restock',
  asyncHandler(async (req, res) => {
    const item = await restockAccessory(req);
    res.status(200).json(new ApiResponse(200, item, 'Accessory restocked.'));
  })
);

// PUT /api/purchase/accessories/:id — edit name/picture only
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const item = await updateAccessory(req);
    res.status(200).json(new ApiResponse(200, item, 'Accessory updated successfully.'));
  })
);

// DELETE /api/purchase/accessories/:id
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await deleteAccessory(req);
    res.status(200).json(new ApiResponse(200, null, 'Accessory deleted successfully.'));
  })
);

module.exports = router;
