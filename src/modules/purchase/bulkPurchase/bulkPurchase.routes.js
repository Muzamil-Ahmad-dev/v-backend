const express = require('express');
const asyncHandler = require('../../../utils/asyncHandler');
const ApiResponse = require('../../../utils/ApiResponse');
const {
  createBulkPurchase,
  listBulkPurchase,
  getBulkPurchaseById,
  updateBulkPurchase,
  deleteBulkPurchase,
  dispatchBulkImeis,
  returnBulkDispatch,
} = require('./bulkPurchase.service');

const router = express.Router();

// GET /api/purchase/bulk[?status&companyName&modelName&page&limit]
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const items = await listBulkPurchase(req);
    res.status(200).json(new ApiResponse(200, items, 'Bulk purchases fetched.'));
  })
);

// PATCH /api/purchase/bulk/dispatch/:dispatchId/return
// NOTE: declared before '/:id' so 'dispatch' isn't swallowed as an :id param.
router.patch(
  '/dispatch/:dispatchId/return',
  asyncHandler(async (req, res) => {
    const dispatch = await returnBulkDispatch(req);
    res.status(200).json(new ApiResponse(200, dispatch, 'Dispatch returned to stock.'));
  })
);

// GET /api/purchase/bulk/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const item = await getBulkPurchaseById(req);
    res.status(200).json(new ApiResponse(200, item, 'Bulk purchase fetched.'));
  })
);

// POST /api/purchase/bulk
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const item = await createBulkPurchase(req);
    res.status(201).json(new ApiResponse(201, item, 'Bulk purchase added.'));
  })
);

// PUT /api/purchase/bulk/:id
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const item = await updateBulkPurchase(req);
    res.status(200).json(new ApiResponse(200, item, 'Bulk purchase updated.'));
  })
);

// DELETE /api/purchase/bulk/:id
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await deleteBulkPurchase(req);
    res.status(200).json(new ApiResponse(200, null, 'Bulk purchase deleted.'));
  })
);

// PATCH /api/purchase/bulk/:id/dispatch  { imeis: [...], receiverName }
router.patch(
  '/:id/dispatch',
  asyncHandler(async (req, res) => {
    const result = await dispatchBulkImeis(req);
    res.status(200).json(new ApiResponse(200, result, 'Phones dispatched.'));
  })
);

module.exports = router;
