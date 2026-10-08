 // routes/creditRoutes.js
const express = require("express");
const router = express.Router();
const creditController = require("../controllers/payablesAndReceiveablesController");
const { decoderMiddleware } = require("../services/authServices");

// ─── POST ────────────────────────────────────────────────────────────────────
router.post("/create",         decoderMiddleware, creditController.createPerson);
router.post("/give-credit",    decoderMiddleware, creditController.giveCredit);
router.post("/take-credit",    decoderMiddleware, creditController.takeCredit);
router.post("/verify-password",decoderMiddleware, creditController.getVerificationByPassword);

// ─── GET (static/prefixed — MUST be before /:id) ─────────────────────────────
router.get("/all",             decoderMiddleware, creditController.getAllPersons);
router.get("/nameAndId",       decoderMiddleware, creditController.getAllPersonsNameAndId);
router.get("/summary",         decoderMiddleware, creditController.getDashboardSummary);
router.get("/credit-transactions", decoderMiddleware, creditController.getAllCreditTransactions);
router.get("/credit-transaction/:id", decoderMiddleware, creditController.getCreditTransactionDetails);
router.get(
  "/detail-of-purchase-sale-by-person/:personId?",
  decoderMiddleware,
  creditController.getDetailOfPurchaseSaleByPerson
);

// ─── GET (dynamic — after all static routes) ─────────────────────────────────
router.get("/:id",             decoderMiddleware, creditController.getPersonDetail);

// ─── PUT ─────────────────────────────────────────────────────────────────────
router.put("/update/:id",          decoderMiddleware, creditController.updatePerson);
router.put("/update-transaction/:id", decoderMiddleware, creditController.editTransaction);

// ─── PATCH ───────────────────────────────────────────────────────────────────
router.patch("/:id",           decoderMiddleware, creditController.toggleFavouritePerson);

// ─── DELETE ──────────────────────────────────────────────────────────────────
router.delete("/delete-transaction/:id", decoderMiddleware, creditController.deleteTransaction);
router.delete("/:id",          decoderMiddleware, creditController.deletePerson);

module.exports = router;