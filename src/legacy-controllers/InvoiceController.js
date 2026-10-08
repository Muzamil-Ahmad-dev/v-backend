const { validationResult } = require("express-validator");
const InvoiceSchema = require("../schema/InvoiceItemSchema");
const AddPhoneSchema = require("../schema/AddMobilePhoneSchema");
const { BulkPhonePurchase, PurchasePhone } = require("../schema/purchasePhoneSchema");
const { default: mongoose, Error } = require("mongoose");
const InvoiceItemSchema = require("../schema/InvoiceItemSchema");

exports.createInvoice = async (req, res) => {
    const { shopId, invoiceNumber, invoiceDate, items, totalAmount } = req.body;

    try {
        // Validate request body
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const deletedItems = [];

        try {
            // Delete phones from AddPhoneSchema corresponding to the items
            for (const item of items) {
                if (item.mobileId) {
                    const deletedItem = await AddPhoneSchema.findByIdAndDelete(item.mobileId);
                    if (!deletedItem) {
                        // Rollback previously deleted items
                        for (const rollbackItem of deletedItems) {
                            await AddPhoneSchema.create(rollbackItem);
                        }
                        return res.status(400).json({
                            message: "Failed to delete mobile item, please try again."
                        });
                    }
                    deletedItems.push(deletedItem); // Store successfully deleted items for rollback if needed
                }
            }

            // Create a new invoice instance
            const invoice = new InvoiceSchema({
                shopId,
                invoiceNumber,
                invoiceDate,
                items,
                totalAmount,
            });

            // Save the invoice to the database
            const savedInvoice = await invoice.save();

            return res.status(201).json({
                message: "Invoice created successfully!",
                invoice: savedInvoice,
            });
        } catch (error) {
            // Rollback previously deleted items if invoice creation fails
            for (const rollbackItem of deletedItems) {
                await AddPhoneSchema.create(rollbackItem);
            }
            throw error;
        }
    } catch (error) {
        console.error("Error creating invoice:", error);
        return res.status(500).json({
            message: "Internal server error, please try again",
            error: error.message,
        });
    }
};
exports.createBulkInvoice = async (req, res) => {
    try {
      const { shopId, bulkPurchaseId, selectedImeis } = req.body;
  
      // Fetch bulk purchase details
      const bulkPurchase = await BulkPhonePurchase.findById(bulkPurchaseId);
      if (!bulkPurchase) {
        return res.status(404).json({ message: "Bulk purchase not found" });
      }
  
      // Ensure bulkPurchase.phones is an array
      if (!Array.isArray(bulkPurchase.phones) || bulkPurchase.phones.length === 0) {
        return res.status(400).json({ message: "No phones found in bulk purchase." });
      }
  
      console.log("Bulk Purchase Phones: ", bulkPurchase.phones);
      console.log("Selected IMEIs: ", selectedImeis);
  
      // Filter phones based on selected IMEIs (if provided)
      let phones = bulkPurchase.phones;
      if (selectedImeis && selectedImeis.length > 0) {
        phones = phones.filter(phone => selectedImeis.includes(phone.imei));
      }
  
      console.log("Filtered Phones: ", phones);
  
      // Prevent empty invoice creation
      if (phones.length === 0) {
        return res.status(400).json({ message: "No matching IMEIs found in bulk purchase." });
      }
  
      // Calculate total amount
      const totalAmount = phones.reduce((sum, phone) => sum + phone.price, 0);
      
      // Generate unique invoice number
      const invoiceNumber = `INV-${Date.now()}`;
  
      // Create invoice
      const invoice = new InvoiceItemSchema({
        shopId,
        bulkPurchaseId,
        invoiceNumber,
        totalAmount,
        items: phones.map(phone => ({
          imei: phone.imei,
          model: phone.model,
          price: phone.price
        }))
      });
  
      await invoice.save();
  
      console.log("Invoice Created Successfully:", invoice);
      
      res.status(201).json({ message: "Invoice created successfully", invoice });
  
    } catch (error) {
      console.error("Failed to generate invoice:", error);
      res.status(500).json({ message: "Failed to generate invoice", error });
    }
  };
  

exports.deleteInvoice = async (req, res) => {
    const { id } = req.params;

    try {
        // Find and delete the invoice
        const deletedInvoice = await InvoiceSchema.findByIdAndDelete(id);

        if (!deletedInvoice) {
            return res.status(404).json({ message: "Invoice not found" });
        }

        return res.status(200).json({
            message: "Invoice deleted successfully!",
            invoice: deletedInvoice,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            message: "Internal server error, please try again",
            error: error.message,
        });
    }
};

// Get a Single Invoice by ID
exports.getInvoice = async (req, res) => {
    const { id } = req.params;

    try {
        // Find the invoice by ID
        const invoice = await InvoiceSchema.findById(id).populate('items');

        if (!invoice) {
            return res.status(404).json({ message: "Invoice not found" });
        }

        return res.status(200).json({
            message: "Invoice retrieved successfully!",
            invoice: invoice,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            message: "Internal server error, please try again",
            error: error.message,
        });
    }
};

const convertedInvoices = (invoice) => {
    if (invoice?.items?.length > 1) return invoice;
    
    if (invoice?.items?.length === 1) {
        return {
            _id: invoice._id,
            invoiceDate: invoice?.invoiceDate,
            invoiceNumber: invoice?.invoiceNumber,
            shopId: invoice?.shopId,
            amount: invoice?.totalAmount,
            purchaseAmount: invoice?.purchaseAmount,
            imei1: invoice?.items[0]?.imei,
            imei2: invoice?.items[0]?.imei2,
            invoiceNumber: invoice?.items[0]?.invoiceNumber,
            mobileCompany: invoice?.items[0]?.mobileCompany,
            mobileId: invoice?.items[0]?.mobileId,
            mobileName: invoice?.items[0]?.mobileName,
            quantity: invoice?.items[0]?.quantity,
            warranty: invoice?.items[0]?.warranty,
        };
    }

    return invoice; 
};

// Get All Invoices
exports.getAllInvoices = async (req, res) => {
    const { id } = req.params;

    try {
        const invoices = await InvoiceSchema.find({ shopId: id }).lean(); // Use lean() to get plain objects

        // Apply conversion to all invoices
        const transformedInvoices = invoices.map(convertedInvoices);

        return res.status(200).json({
            message: "Invoices retrieved successfully!",
            invoices: transformedInvoices,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            message: "Internal server error, please try again",
            error: error.message,
        });
    }
};


exports.archiveAndCreateNewLedger = async () => {
    try {
      // Archive current day's ledger (you may implement specific archiving logic here)
      const todayLedger = await Ledger.findOne({ date: new Date().toLocaleDateString() });
      
      // Archive the ledger (you can push it to a separate archive collection or modify its status)
      // Example: add a status or date for archival purposes
      if (todayLedger) {
        todayLedger.archived = true;
        await todayLedger.save();
      }
  
      // Create a new ledger for the next day
      const newLedger = new Ledger({
        openingCash: 0,  // Set opening cash for the new day
        closingCash: 0,  // Closing cash will be calculated at the end of the day
        date: new Date(), // Set the current date as the ledger date
      });
  
      await newLedger.save();
      console.log('New ledger created successfully.');
    } catch (error) {
      console.error('Error archiving and creating new ledger:', error);
    }
  };