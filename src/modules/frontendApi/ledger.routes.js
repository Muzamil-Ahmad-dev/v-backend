const express = require('express');
const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const { tenantAdminId } = require('../../utils/tenantScope');
const Ledger = require('../../models/Ledger');

const router = express.Router();

// GET /api/ledger/all
router.get('/all', asyncHandler(async (req, res) => {
  const records = await Ledger.find({ adminId: tenantAdminId(req) }).sort('-createdAt');
  res.status(200).json({ success: true, records });
}));

// GET /api/ledger/detail/:id
router.get('/detail/:id', asyncHandler(async (req, res) => {
  const ledger = await Ledger.findOne({ _id: req.params.id, adminId: tenantAdminId(req) });
  if (!ledger) throw new ApiError(404, 'Ledger not found.');
  res.status(200).json({ ledger });
}));

module.exports = router;
