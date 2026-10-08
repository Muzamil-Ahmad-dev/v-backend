const express = require('express');
const asyncHandler = require('../../../utils/asyncHandler');
const ApiResponse = require('../../../utils/ApiResponse');
const {
  createSinglePurchase,
  listSinglePurchase,
  getSinglePurchaseById,
  updateSinglePurchase,
  deleteSinglePurchase,
  dispatchSinglePurchase,
  returnSingleDispatch,
} = require('./singlePurchase.service');

const router = express.Router();

// GET /api/purchase/phones[?status&companyName&modelName&imei&dateFrom&dateTo&page&limit]
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const items = await listSinglePurchase(req);
    res.status(200).json(new ApiResponse(200, items, 'Purchase phones fetched.'));
  })
);

// GET /api/purchase/phones/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const item = await getSinglePurchaseById(req);
    res.status(200).json(new ApiResponse(200, item, 'Purchase phone fetched.'));
  })
);

// POST /api/purchase/phones
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const item = await createSinglePurchase(req);
    res.status(201).json(new ApiResponse(201, item, 'Purchase phone added.'));
  })
);

// PUT /api/purchase/phones/:id
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const item = await updateSinglePurchase(req);
    res.status(200).json(new ApiResponse(200, item, 'Purchase phone updated.'));
  })
);

// DELETE /api/purchase/phones/:id
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    await deleteSinglePurchase(req);
    res.status(200).json(new ApiResponse(200, null, 'Purchase phone deleted.'));
  })
);

// PATCH /api/purchase/phones/:id/dispatch  { receiverName }
router.patch(
  '/:id/dispatch',
  asyncHandler(async (req, res) => {
    const result = await dispatchSinglePurchase(req);
    res.status(200).json(new ApiResponse(200, result, 'Phone dispatched.'));
  })
);

// PATCH /api/purchase/phones/:id/return-dispatch
router.patch(
  '/:id/return-dispatch',
  asyncHandler(async (req, res) => {
    const item = await returnSingleDispatch(req);
    res.status(200).json(new ApiResponse(200, item, 'Phone returned to stock.'));
  })
);

module.exports = router;
