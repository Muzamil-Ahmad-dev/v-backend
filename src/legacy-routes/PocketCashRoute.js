const express = require("express");
const {
  getTotalPocketCash,
  addCash,
  deductCash,
  getPocketCashTransactions,
  deletePocketCashTransaction,
} = require("../controllers/pocketCashController");
const { decoderMiddleware } = require("../services/authServices");
const router = express.Router();

router.get("/total", decoderMiddleware, getTotalPocketCash);
router.post("/add", decoderMiddleware, addCash);
router.post("/deduct", decoderMiddleware, deductCash);
router.get("/get/:id", decoderMiddleware, getPocketCashTransactions);
router.delete("/delete/:id", decoderMiddleware, deletePocketCashTransaction);

module.exports = router;
