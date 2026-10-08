const express = require("express");

const { decoderMiddleware } = require("../services/authServices");
const { calculateBalanceSheet } = require("../controllers/balanceSheetController");

const router = express.Router();

router.use(decoderMiddleware); // all routes below require authentication

router.get("/", calculateBalanceSheet);


module.exports = router;
