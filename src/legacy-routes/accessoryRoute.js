const express = require("express");
const {
  createAccessory,
  getAllAccessories,
  getTotalSoldAccessories,
  getAllTransactions,
  deleteAccessory,
  sellMultipleAccessories,
  handleAddAcessoryStockById,
  getAccessoriesPersonRecord,
  deleteAccessoryById,
  getAccessoriesPersonPurchaseRecord,
  editAccessory,
  reduceAccessoryStock,
  returnAccessoryPurchase,
  returnSoldAccessory,
} = require("../controllers/accessoryController");
const { decoderMiddleware } = require("../services/authServices");
const { getAccessoriesData } = require("../controllers/accessoryController");

const router = express.Router();

router.use(decoderMiddleware); // all routes below require authentication

router.post("/create", createAccessory);
router.get("/", getAllAccessories);
router.get("/total-sold", getTotalSoldAccessories);
router.post("/sell", sellMultipleAccessories);
router.get("/transactions", getAllTransactions);
router.get("/data", getAccessoriesData);
router.delete("/:id", deleteAccessory);
router.post("/:id", handleAddAcessoryStockById);
router.post("/:id/reduce-stock", reduceAccessoryStock);
router.get("/accessoryRecord", getAccessoriesPersonRecord);
router.get("/accessoryRecord/purchase", getAccessoriesPersonPurchaseRecord);
router.post("/accessoryRecord/purchase/return/:id", returnAccessoryPurchase);
router.post("/accessoryRecord/sale/return/:id", returnSoldAccessory);
router.delete("/:id", deleteAccessoryById);
router.put("/:id", editAccessory);

module.exports = router;
