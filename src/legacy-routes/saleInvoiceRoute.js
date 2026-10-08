const express = require("express");
const router = express.Router();
const saleInvoiceController = require("../controllers/saleInvoiceController");
const { decoderMiddleware } = require("../services/authServices");

// Apply authentication middleware to all routes
router.use(decoderMiddleware);

// Create new sale invoice
router.post("/", saleInvoiceController.createInvoice);

// Get all invoices
router.get("/", saleInvoiceController.getAllInvoices);

// Get next generated invoice number for slip/page
router.get("/next-invoice-number", saleInvoiceController.getNextInvoiceNumber);

// Get invoice statistics
router.get("/statistics", saleInvoiceController.getInvoiceStatistics);

// Get monthly sales sheet (must be before /:id)
router.get("/monthly-sales-sheet", saleInvoiceController.getMonthlySalesSheet);

// Get invoice by invoice number (must be before /:id so "number" is not treated as id)
router.get("/number/:invoiceNumber", saleInvoiceController.getInvoiceByNumber);

// Get detailed phone information by invoice number (must be before /:id so "phone-details" is not treated as id)
router.get(
  "/phone-details/:invoiceNumber",
  saleInvoiceController.getPhoneDetailsByInvoiceNumber
);

// Get invoice by ID
router.get("/:id", saleInvoiceController.getInvoiceById);

// Return/Refund invoice
router.post("/:id/return", saleInvoiceController.returnInvoice);

// Delete invoice
router.delete("/:id", saleInvoiceController.deleteInvoice);

module.exports = router;
