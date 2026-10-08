const express = require('express');
const ledgerRouter = express.Router();
const ledgerController = require('../controllers/ledgerController');
const { decoderMiddleware } = require('../services/authServices');

// Routes to update ledger fields
ledgerRouter.put('/update-opening-cash',decoderMiddleware, ledgerController.updateOpeningCash);
ledgerRouter.post('/update-cash-received',decoderMiddleware, ledgerController.updateCashReceived);
ledgerRouter.post('/update-cash-paid',decoderMiddleware, ledgerController.updateCashPaid);
ledgerRouter.post('/update-expense',decoderMiddleware, ledgerController.updateExpense);
ledgerRouter.get('/update-remaining/:ledgerId',decoderMiddleware, ledgerController.updateRemainingCash);
ledgerRouter.get('/update-ledger/:ledgerId',decoderMiddleware, ledgerController.updateLedgerRecord);
ledgerRouter.post('/end-day',decoderMiddleware, ledgerController.endDay);
ledgerRouter.get('/all',decoderMiddleware, ledgerController.getAllRecords);
//get ledger by id
ledgerRouter.get('/detail/:id', ledgerController.getLedgerById);

// Route to fetch today's ledger
ledgerRouter.get('/today',decoderMiddleware, ledgerController.getTodaysLedger);


//archieve and create new
// ledgerRouter.get('/createNew',decoderMiddleware, ledgerController.archiveAndCreateNewLedger);


module.exports = ledgerRouter;
