const express = require("express");
const router = express.Router();

const { decoderMiddleware } = require("../services/authServices");
const expenseController = require("../controllers/expenseController");

// All routes below require authentication
router.use(decoderMiddleware);

// Expense types
router.post("/types", expenseController.createExpenseType);
router.get("/types", expenseController.getExpenseTypes);

// Expenses
router.post("/", expenseController.createExpense);
router.get("/", expenseController.getUserExpenses);

module.exports = router;
