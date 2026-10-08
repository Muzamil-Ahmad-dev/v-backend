const express = require("express");
const { check } = require("express-validator");
const InvoiceController = require("../controllers/InvoiceController");
const router = express.Router();

router.post("/invoices", InvoiceController.createInvoice);
router.delete("/invoices/:id", InvoiceController.deleteInvoice);
router.get("/invoices/:id", InvoiceController.getInvoice);
router.get("/invoices/getAll/:id", InvoiceController.getAllInvoices);
router.post("/bulk-invoices", InvoiceController.createBulkInvoice);

module.exports = router;
