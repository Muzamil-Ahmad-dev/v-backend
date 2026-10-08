   const express = require("express");
  const router = express.Router();
  const multer = require("multer");
  const { uploadImeiImage, deleteImeiImage } = require("../controllers/cloudinaryController");
  const path = require("path");
  const {
    addPurchasePhone,
    getAllPurchasePhone,
    getPurchasePhoneByFilter,
    getPurchasePhoneById,
    deletePurchasePhone,
    addBulkPhones,
    getBulkPhone,
    getAllPurchasePhones,
    sellPhonesFromBulk,
    getAllSales,
    getAllBulkSales,
    getBulkPhoneById,
    getBulkPhoneSaleById,
    getSoldBulkPhoneDetailById,
    sellSinglePhone,
    getAllSingleSoldPhones,
    deleteBulkPhone,
    getSingleSoldPhoneById,
    getBulkSoldPhoneById,
    getDeviceByImei,
    updateSinglePurchasePhone,
    payBulkPurchaseCreditAmount,
    updateBulkPhonePurchase,
    dispatchSinglePurchase,
    dispatchBulkPurchase,
    getSingleDispatches,
    getBulkDispatches,
    dispatchSingleReturn,
    returnBulkDispatch,
    getCustomerSalesRecordDetailsByNumber,
    soldAnyPhone,
    updateSoldPhone,
    deleteSoldPhone,
    getDetailByImeiNumber,
    returnSingleSoldToPurchase,
    returnBulkSoldToPurchase,
    migrateStatusField,
    getAllImeis,
    returnPurchasePhone,
  } = require("../controllers/purchasePhoneController");
  const { decoderMiddleware } = require("../services/authServices");

  // Multer setup for file uploads (specific for adding purchase phones)
  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, "uploads/");
    },
    filename: function (req, file, cb) {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(
        null,
        file.fieldname +
          "-" +
          uniqueSuffix +
          "." +
          file.originalname.split(".").pop()
      );
    },
  });
  // Configure multer for memory storage (instead of disk)
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB
    },
    fileFilter: function (req, file, cb) {
      if (file.mimetype.startsWith("image/")) {
        cb(null, true);
      } else {
        cb(new Error("Only image files allowed"), false);
      }
    },
  });

  const uploadImg = multer({
    storage: storage,
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB limit
    },
    fileFilter: function (req, file, cb) {
      // Accept only image files
      if (file.mimetype.startsWith("image/")) {
        cb(null, true);
      } else {
        cb(new Error("Only image files are allowed!"), false);
      }
    },
  });

  // Route to serve uploaded images
  router.get("/uploads/:filename", (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, "../uploads", filename);
    res.sendFile(filePath, (err) => {
      if (err) {
        res.status(404).json({ message: "File not found" });
      }
    });
  });

  // Route to add a new purchase phone slip (with file upload support)
  router.post(
    "/purchase-phone",
    upload.fields([
      { name: "cnicFrontPic", maxCount: 1 },
      { name: "cnicBackPic", maxCount: 1 },
    ]),
    (req, res, next) => {
      console.log("After Multer:", req.files);
      next();
    },
    decoderMiddleware,
    addPurchasePhone
  ); //used to purchasesingle phone

  router.post(
    "/bulk-phone-purchase",
    upload.fields([
      { name: "cnicFrontPic", maxCount: 1 },
      { name: "cnicBackPic", maxCount: 1 },
    ]),
    (req, res, next) => {
      console.log("After Multer (Bulk):", req.files);
      next();
    },
    decoderMiddleware,
    addBulkPhones //used
  );
  router.put(
    "/bulk-phone-update/:id",
    updateBulkPhonePurchase //used to edit bulk
  );
  router.get(
    "/bulk-phone-purchase",
    decoderMiddleware,
    getBulkPhone //used to get all bulk only
  );
  router.post(
    "/sell-single-phone",
    decoderMiddleware,
    sellSinglePhone //used to sell single phone only
  );
  router.get(
    "/sold-single-phones",
    decoderMiddleware,
    getAllSingleSoldPhones //used to sell single phone only
  );

  // Route to get all purchase phone slips
  router.get("/purchase-phone", decoderMiddleware, getAllPurchasePhone); // used to get single phones only

  // get all bulk and single phones
  router.get("/all-purchase-phone", decoderMiddleware, getAllPurchasePhones); //used

  // Route to get purchase phone slips with filtering
  router.get("/purchase-phone/filter", getPurchasePhoneByFilter);

  router.post("/sell-phone", decoderMiddleware, sellPhonesFromBulk);

  router.get("/all-sales", decoderMiddleware, getAllSales);

  router.get("/bulk-phone/sale/:id", getSoldBulkPhoneDetailById);

  // Route to get a specific purchase phone slip by ID
  router.get("/purchase-phone/:id", getPurchasePhoneById);
  //Route to get getBulkPhoneById
  router.get("/bulk-phone-purchase/:id", getBulkPhoneById);
  // get single sold phone
  router.get("/single-sold-phone/:id", decoderMiddleware, getSingleSoldPhoneById);
  // get bulk sold phone
  router.get("/bulk-sold-phone/:id", decoderMiddleware, getBulkSoldPhoneById);
  // Route to edit a purchase phone slip by ID
  // Route alias for frontend compatibility
  router.post(
    "/single-purchase-phone",
    upload.fields([
      { name: "cnicFrontPic", maxCount: 1 },
      { name: "cnicBackPic", maxCount: 1 },
    ]),
    (req, res, next) => {
      console.log("After Multer (Single Purchase):", req.files);
      next();
    },
    decoderMiddleware,
    addPurchasePhone
  );

  router.put("/single-purchase-phone/:id", updateSinglePurchasePhone);

  // Route to delete a purchase phone slip by ID
  // Supports optional query parameter: ?imei=123456789 or ?imei=123,456,789 (comma-separated for multiple)
  // If imei is provided, deletes only those specific IMEI(s) based on imei1
  // If imei is not provided, deletes the entire bulk purchase
  router.delete("/purchase-bulk/delete/:id", decoderMiddleware, deleteBulkPhone);
  router.delete(
    "/purchase-phone/delete/:id",
    decoderMiddleware,
    deletePurchasePhone
  );
  router.get("/purchase-device/detail", decoderMiddleware, getDeviceByImei);
  router.patch(
    "/bulk-purchase-credit-pay/:id",
    decoderMiddleware,
    payBulkPurchaseCreditAmount
  );
  router.patch(
    "/bulk-purchase-dispatch/:id",
    decoderMiddleware,
    dispatchBulkPurchase
  );
  router.patch(
    "/single-purchase-dispatch/:id",
    decoderMiddleware,
    dispatchSinglePurchase
  );
  router.get("/single-dispatch", decoderMiddleware, getSingleDispatches);
  router.patch(
    "/single-dispatch-return/:id",
    decoderMiddleware,
    dispatchSingleReturn
  );
  router.get("/bulk-dispatch", decoderMiddleware, getBulkDispatches);
  router.patch(
    "/bulk-dispatch-return/:id",
    decoderMiddleware,
    returnBulkDispatch
  );
  router.post(
    "/customer-sold-record/:customerNumber",
    decoderMiddleware,
    getCustomerSalesRecordDetailsByNumber
  );
  router.post("/general-mobile-sale", decoderMiddleware, soldAnyPhone);
  router.put("/update-sold-phone/:id", decoderMiddleware, updateSoldPhone);
  router.delete("/delete-sold-phone/:id", decoderMiddleware, deleteSoldPhone);
  router.get("/getDetailByImei/:imei", decoderMiddleware, getDetailByImeiNumber);
  router.post(
    "/return-single-sold-phone/:id",
    decoderMiddleware,
    returnSingleSoldToPurchase
  );

  router.post(
    "/return-bulk-sold-to-purchase",
    decoderMiddleware,
    returnBulkSoldToPurchase
  );

  // Migration endpoint to add status field to existing documents
  router.post("/migrate-status-field", migrateStatusField);

  // Route to get all IMEI1 data for both single and bulk phones
  router.get("/all-imeis", decoderMiddleware, getAllImeis);

  // Route to return purchase phone (single or bulk) to supplier
  router.post("/return-purchase-phone/:id", decoderMiddleware, returnPurchasePhone);
  // Add these routes
  router.post("/upload-imei-image", 
    upload.single("imeiImage"), 
    uploadImeiImage
  );

  router.post("/delete-imei-image", 
    deleteImeiImage
  );
  module.exports = router;