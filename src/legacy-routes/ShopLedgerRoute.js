const express = require('express');
const router = express.Router();
const {
  addEntity,
  addExpense,
  cashPayment,
  receiveCash,
  getAllEntities,
  getAllEntityRecords
} = require('../controllers/ShopLedgerControllers');
const { decoderMiddleware } = require('../services/authServices');

router.post('/add', decoderMiddleware, addEntity);
router.post('/expense/:id', decoderMiddleware, addExpense);
router.post('/cash-payment/:id', decoderMiddleware, cashPayment);
router.post('/cash-receive/:id',decoderMiddleware, receiveCash);
router.get('/all', decoderMiddleware, getAllEntities);
router.get('/records/all', decoderMiddleware,getAllEntityRecords);


module.exports = router;
