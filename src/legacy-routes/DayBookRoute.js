const express = require('express');

const router = express.Router();

const { getToDayBook, getCardDetail } = require('../controllers/dayBookController');
const { decoderMiddleware } = require('../services/authServices');

// Route to get today's ledger
router.get('/todayBook', decoderMiddleware, getToDayBook);
// Card detail: profit, expense, analytics for a given card type
router.get('/cardDetail', decoderMiddleware, getCardDetail);

module.exports = router;