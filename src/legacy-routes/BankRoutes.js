const express = require('express');
const { decoderMiddleware } = require('../services/authServices');
const { createBank, getAllBanksController, addAmountToBank, deductCashFromBank } = require('../controllers/bankController');

const router = express.Router();

router.post('/create', decoderMiddleware,createBank);

router.get('/getAllBanks', decoderMiddleware,getAllBanksController);

router.post('/addCash', decoderMiddleware,addAmountToBank);

router.post('/removeCash', decoderMiddleware,deductCashFromBank);

module.exports = router;