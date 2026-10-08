const express = require('express');
const asyncHandler = require('../../../utils/asyncHandler');
const ApiResponse = require('../../../utils/ApiResponse');
const {
  createSaleInvoice,
  listSaleInvoices,
  getSaleInvoiceById,
  returnSaleInvoice,
} = require('./saleInvoice.service');

const router = express.Router();

// GET /api/sale/invoices[?shopId&saleType&isReturned&dateFrom&dateTo&page&limit]
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const items = await listSaleInvoices(req);
    res.status(200).json(new ApiResponse(200, items, 'Sale invoices fetched.'));
  })
);

// GET /api/sale/invoices/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const item = await getSaleInvoiceById(req);
    res.status(200).json(new ApiResponse(200, item, 'Sale invoice fetched.'));
  })
);

// POST /api/sale/invoices — sells a phone (by IMEI) and/or accessories,
// deducts real stock, records payment/credit, and links to the shop.
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const invoice = await createSaleInvoice(req);
    res.status(201).json(new ApiResponse(201, invoice, 'Sale invoice created successfully.'));
  })
);

// PATCH /api/sale/invoices/:id/return — restocks items, reverses credit/payment
router.patch(
  '/:id/return',
  asyncHandler(async (req, res) => {
    const invoice = await returnSaleInvoice(req);
    res.status(200).json(new ApiResponse(200, invoice, 'Sale invoice returned successfully.'));
  })
);

module.exports = router;
