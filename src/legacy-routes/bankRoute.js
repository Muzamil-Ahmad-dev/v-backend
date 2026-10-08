const express = require('express');
const { decoderMiddleware } = require('../services/authServices');
const { createBank, getAllBanksController, addAmountToBank, deductCashFromBank, deleteBank, getBankTransaction, deleteBankTransaction } = require('../controllers/bankController');

const router = express.Router();



//updated
router.post('/create', decoderMiddleware, createBank);

router.get('/getAllBanks', decoderMiddleware, getAllBanksController);

router.post('/addCash', decoderMiddleware, addAmountToBank);

router.post('/removeCash', decoderMiddleware, deductCashFromBank);

router.delete('/delete/:bankId', decoderMiddleware, deleteBank);

router.get('/getBankTransaction/:bankId', decoderMiddleware, getBankTransaction);

router.delete('/deleteTransaction/:id', decoderMiddleware, deleteBankTransaction);

module.exports = router;