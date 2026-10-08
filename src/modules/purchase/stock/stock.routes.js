const express = require('express');
const asyncHandler = require('../../../utils/asyncHandler');
const ApiResponse = require('../../../utils/ApiResponse');
const { getAvailableStock, getStockByImei, getStockSummary } = require('./stock.service');

const router = express.Router();

// GET /api/purchase/stock/summary
// NOTE: declared before '/imei/:imei' and '/' so 'summary' isn't swallowed as a param.
router.get(
  '/summary',
  asyncHandler(async (req, res) => {
    const summary = await getStockSummary(req);
    res.status(200).json(new ApiResponse(200, summary, 'Stock summary fetched.'));
  })
);

// GET /api/purchase/stock/imei/:imei
router.get(
  '/imei/:imei',
  asyncHandler(async (req, res) => {
    const result = await getStockByImei(req);
    res.status(200).json(new ApiResponse(200, result, 'Stock lookup complete.'));
  })
);

// GET /api/purchase/stock[?companyName&modelName]
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const stock = await getAvailableStock(req);
    res.status(200).json(new ApiResponse(200, stock, 'Available stock fetched.'));
  })
);

module.exports = router;
