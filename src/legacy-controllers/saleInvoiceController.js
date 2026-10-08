const SaleInvoice = require("../schema/SaleInvoiceSchema");
const {
  PurchasePhone,
  SingleSoldPhone,
  SoldPhone,
  BulkPhonePurchase,
} = require("../schema/purchasePhoneSchema");
const { Imei } = require("../schema/purchasePhoneSchema");
const {
  Accessory,
  AccessoryTransaction,
} = require("../schema/accessorySchema");
const {
  AddBankAccount,
  BankTransaction,
} = require("../schema/BankAccountSchema");
const {
  Person,
  CreditTransaction,
} = require("../schema/PayablesAndReceiveablesSchema");
const {
  PocketCashSchema,
  PocketCashTransactionSchema,
} = require("../schema/PocketCashSchema");
 const {
  generateInvoiceNumberForUser,
  peekNextInvoiceNumberForUser,
} = require("../services/invoiceGenerator");
const Shop = require("../schema/ShopSchema");

const invoiceNumberPattern = /^#?0*(\d+)$/;
const normalizeInvoiceInput = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return [];
  const match = raw.match(invoiceNumberPattern);
  if (!match) return [raw];
  const numeric = Number(match[1]);
  if (!Number.isFinite(numeric) || numeric <= 0) return [raw];
  const canonical = `#${String(numeric).padStart(5, "0")}`;
  const compact = `#${numeric}`;
  const plain = String(numeric);
  const padded = String(numeric).padStart(5, "0");
  return [...new Set([canonical, compact, raw, plain, padded])];
};

// Get next generated invoice number for current user
exports.getNextInvoiceNumber = async (req, res) => {
  try {
    const userId = req.user.id;
    // Read-only preview for UI; does not consume/increment the counter.
    const invoiceNumber = await peekNextInvoiceNumberForUser(userId);
    return res.status(200).json({
      success: true,
      message: "Next invoice number retrieved successfully",
      data: { invoiceNumber },
    });
  } catch (error) {
    console.error("Error getting next invoice number:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Create invoice from sale data
exports.createSaleInvoice = async (invoiceData) => {
  try {
    // Debug log for tracking raw incoming invoice payload
    console.log("🧾 [SaleInvoice] createSaleInvoice called with data:", {
      userId: invoiceData?.userId,
      saleType: invoiceData?.saleType,
      invoiceNumber: invoiceData?.invoiceNumber,
      saleDate: invoiceData?.saleDate,
      customerName: invoiceData?.customerName,
      customerNumber: invoiceData?.customerNumber,
      pricing: invoiceData?.pricing,
      phoneDetails: invoiceData?.phoneDetails,
      accessoriesCount: Array.isArray(invoiceData?.accessories)
        ? invoiceData.accessories.length
        : 0,
      metadata: invoiceData?.metadata,
    });

    // Generate server-side when missing; preserve trusted server-provided values.
    if (!invoiceData.userId) {
      throw new Error("User ID is required for invoice generation");
    }
    const hasProvidedInvoiceNumber = Boolean(
      String(invoiceData.invoiceNumber || "").trim()
    );

    // Ensure pricing values are numbers
    if (invoiceData.pricing) {
      invoiceData.pricing.salePrice =
        Number(invoiceData.pricing.salePrice) || 0;
      invoiceData.pricing.purchasePrice =
        Number(invoiceData.pricing.purchasePrice) || 0;
      invoiceData.pricing.totalInvoice =
        Number(invoiceData.pricing.totalInvoice) || 0;
      invoiceData.pricing.profit = Number(invoiceData.pricing.profit) || 0;

      // If totalInvoice is 0 but salePrice > 0, recalculate
      if (
        invoiceData.pricing.totalInvoice === 0 &&
        invoiceData.pricing.salePrice > 0
      ) {
        const accessoriesTotal = (invoiceData.accessories || []).reduce(
          (sum, acc) => {
            const qty = Number(acc.quantity) || 1;
            const price = Number(acc.price) || Number(acc.perPiecePrice) || 0;
            return sum + qty * price;
          },
          0
        );
        invoiceData.pricing.totalInvoice =
          invoiceData.pricing.salePrice + accessoriesTotal;
        invoiceData.pricing.profit =
          invoiceData.pricing.totalInvoice - invoiceData.pricing.purchasePrice;
      }
    }

    let invoice = null;
    let lastError = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        if (!hasProvidedInvoiceNumber || attempt > 0) {
          invoiceData.invoiceNumber = await generateInvoiceNumberForUser(
            invoiceData.userId
          );
        }
        invoice = new SaleInvoice(invoiceData);
        await invoice.save();
        break;
      } catch (error) {
        lastError = error;
        const duplicateInvoiceNumberError =
          error?.code === 11000 &&
          (error?.keyPattern?.invoiceNumber || error?.keyValue?.invoiceNumber);
        if (!duplicateInvoiceNumberError) {
          throw error;
        }
      }
    }
    if (!invoice) {
      throw lastError || new Error("Failed to create invoice");
    }

    // Success log after invoice is persisted
    console.log("✅ [SaleInvoice] Invoice created successfully:", {
      id: invoice?._id?.toString?.(),
      invoiceNumber: invoice?.invoiceNumber,
      userId: invoice?.userId,
      saleType: invoice?.saleType,
      saleDate: invoice?.saleDate,
      customerName: invoice?.customerName,
      pricing: invoice?.pricing,
      phoneDetails: invoice?.phoneDetails,
      accessoriesCount: Array.isArray(invoice?.accessories)
        ? invoice.accessories.length
        : 0,
    });

    return invoice;
  } catch (error) {
    console.error("Error creating sale invoice:", error);
    throw error;
  }
};

// Create new sale invoice
exports.createInvoice = async (req, res) => {
  try {
    const userId = req.user.id;
    const invoiceData = {
      ...req.body,
      userId,
    };
    // Never trust client-provided invoice numbers on direct create endpoint.
    delete invoiceData.invoiceNumber;

    // Validate required fields
    if (!invoiceData.saleType) {
      return res.status(400).json({
        success: false,
        message: "Sale type is required (single, bulk, or generic)",
      });
    }

    if (!invoiceData.customerName && !invoiceData.customerNumber) {
      return res.status(400).json({
        success: false,
        message: "Customer name or number is required",
      });
    }

    // Generate invoice number if not provided
    if (!invoiceData.invoiceNumber) {
      invoiceData.invoiceNumber = await generateInvoiceNumberForUser(userId);
    }

    // Set sale date if not provided
    if (!invoiceData.saleDate) {
      invoiceData.saleDate = new Date();
    }

    // Ensure pricing object exists and has valid values
    if (!invoiceData.pricing) {
      invoiceData.pricing = {};
    }

    // Ensure pricing values are numbers, not strings or empty
    if (invoiceData.pricing.salePrice !== undefined) {
      invoiceData.pricing.salePrice =
        Number(invoiceData.pricing.salePrice) || 0;
    }
    if (invoiceData.pricing.purchasePrice !== undefined) {
      invoiceData.pricing.purchasePrice =
        Number(invoiceData.pricing.purchasePrice) || 0;
    }
    if (invoiceData.pricing.totalInvoice !== undefined) {
      invoiceData.pricing.totalInvoice =
        Number(invoiceData.pricing.totalInvoice) || 0;
    }
    if (invoiceData.pricing.profit !== undefined) {
      invoiceData.pricing.profit = Number(invoiceData.pricing.profit) || 0;
    }

    // Ensure phoneDetails exists
    if (!invoiceData.phoneDetails) {
      invoiceData.phoneDetails = {};
    }

    // Ensure payment object exists
    if (!invoiceData.payment) {
      invoiceData.payment = {};
    }

    // Ensure accessories is an array
    if (!Array.isArray(invoiceData.accessories)) {
      invoiceData.accessories = [];
    }

    // Ensure metadata exists for generic sales with IMEI prices
    if (
      invoiceData.saleType === "generic" &&
      invoiceData.metadata?.imeiPrices
    ) {
      // Ensure imeiPrices is properly formatted
      if (Array.isArray(invoiceData.metadata.imeiPrices)) {
        invoiceData.metadata.imeiPrices = invoiceData.metadata.imeiPrices
          .map((ip) => ({
            imei: String(ip.imei || "").trim(),
            price: Number(ip.price) || 0,
          }))
          .filter((ip) => ip.imei);
      }
    }

    // Log the data being saved for debugging
    console.log("📝 [CreateInvoice] Saving invoice data:", {
      saleType: invoiceData.saleType,
      invoiceNumber: invoiceData.invoiceNumber,
      customerName: invoiceData.customerName,
      customerNumber: invoiceData.customerNumber,
      pricing: invoiceData.pricing,
      phoneDetails: invoiceData.phoneDetails,
      hasAccessories: invoiceData.accessories?.length || 0,
      metadata: invoiceData.metadata,
      imeiCount: invoiceData.phoneDetails?.imei1
        ? Array.isArray(invoiceData.phoneDetails.imei1)
          ? invoiceData.phoneDetails.imei1.length
          : 1
        : 0,
    });

    const invoice = await createSaleInvoice(invoiceData);

    // Populate the invoice before returning
    const populatedInvoice = await SaleInvoice.findById(invoice._id)
      .populate("payment.bankAccountUsed")
      .populate("entityData._id")
      .populate("accessories.name")
      .populate("metadata.shopid")
      .lean();

    res.status(201).json({
      success: true,
      message: "Invoice created successfully",
      data: populatedInvoice || invoice,
    });
  } catch (error) {
    console.error("Error creating invoice:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Get all invoices for a user (from SaleInvoice, SingleSoldPhone, and SoldPhone collections)
exports.getAllInvoices = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      saleType,
      startDate,
      endDate,
      customerNumber,
      page = 1,
      limit = 50,
      includeSoldPhones = "true", // New parameter to include sold phone records
    } = req.query;

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    let allInvoices = [];
    let totalCount = 0;
    let formattedSaleInvoices = [];
    let formattedSingleSoldPhones = [];
    let formattedSoldPhones = [];

    // 1. Fetch from SaleInvoice collection
    const saleInvoiceFilter = { userId };

    if (saleType && saleType !== "all") {
      saleInvoiceFilter.saleType = saleType;
    }

    if (startDate || endDate) {
      saleInvoiceFilter.saleDate = {};
      if (startDate) saleInvoiceFilter.saleDate.$gte = new Date(startDate);
      if (endDate) saleInvoiceFilter.saleDate.$lte = new Date(endDate);
    }

    if (customerNumber) {
      saleInvoiceFilter.customerNumber = customerNumber;
    }

    const saleInvoices = await SaleInvoice.find(saleInvoiceFilter)
      .populate("payment.bankAccountUsed")
      .populate("entityData._id")
      .populate("references.purchasePhoneId")
      .populate("references.bulkPhonePurchaseId")
      .populate("references.singleSoldPhoneId")
      .populate("references.soldPhoneId")
      .populate("accessories.name")
      .populate("metadata.shopid")
      .sort({ saleDate: -1 })
      .lean();

    // Format SaleInvoice records
    formattedSaleInvoices = saleInvoices.map((invoice) => ({
      _id: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      saleType: invoice.saleType,
      saleDate: invoice.saleDate,
      customerName: invoice.customerName,
      customerNumber: invoice.customerNumber,
      pricing: invoice.pricing,
      payment: invoice.payment,
      accessories: invoice.accessories,
      entityData: invoice.entityData,
      references: invoice.references,
      metadata: invoice.metadata,
        phoneDetails: invoice.phoneDetails,  // ✅ ADD THIS LINE

      isReturned: invoice.isReturned,
      returnedAt: invoice.returnedAt,
      returnReason: invoice.returnReason,
      source: "SaleInvoice", // Mark source
      createdAt: invoice.createdAt,
      updatedAt: invoice.updatedAt,
    }));

    allInvoices = [...formattedSaleInvoices];
    totalCount = saleInvoices.length;

    // 2. If requested, fetch from SingleSoldPhone and SoldPhone collections
    if (includeSoldPhones === "true") {
      formattedSingleSoldPhones = [];
      formattedSoldPhones = [];
      // Build filter for sold phones
      const soldPhoneFilter = { userId };

      if (startDate || endDate) {
        soldPhoneFilter.dateSold = {};
        if (startDate) soldPhoneFilter.dateSold.$gte = new Date(startDate);
        if (endDate) soldPhoneFilter.dateSold.$lte = new Date(endDate);
      }

      if (customerNumber) {
        soldPhoneFilter.customerNumber = customerNumber;
      }

      // Fetch SingleSoldPhone records
      const singleSoldPhones = await SingleSoldPhone.find(soldPhoneFilter)
        .populate("purchasePhoneId")
        .populate("bankAccountUsed")
        .sort({ dateSold: -1 })
        .lean();

      // Fetch SoldPhone records (bulk sales)
      const soldPhones = await SoldPhone.find(soldPhoneFilter)
        .populate({
          path: "bulkPhonePurchaseId",
          populate: {
            path: "ramSimDetails",
          },
        })
        .populate("bankAccountUsed")
        .sort({ dateSold: -1 })
        .lean();

      // Format SingleSoldPhone records to match invoice structure
// Pre-fetch shop data for SingleSoldPhone records
      const singleShopIds = [...new Set(singleSoldPhones.map(p => p.shopid).filter(Boolean).map(String))];
      const singleShops = await Shop.find({ _id: { $in: singleShopIds } }).lean();
      const singleShopMap = Object.fromEntries(singleShops.map(s => [String(s._id), s]));
      singleSoldPhones.forEach(p => { if (p.shopid) p._shopInfo = singleShopMap[String(p.shopid)] || null; });

      // Format SingleSoldPhone records to match invoice structure
      formattedSingleSoldPhones = singleSoldPhones.map((phone) => {       // Get phone details from purchasePhoneId if available
        const purchasePhone = phone.purchasePhoneId;
        return {
          _id: phone._id,
          invoiceNumber: phone.invoiceNumber,
          saleType: "single",
          saleDate: phone.dateSold,
          customerName: phone.customerName,
          customerNumber: phone.customerNumber,
          pricing: {
            salePrice: phone.salePrice,
            totalInvoice: phone.totalInvoice,
            profit: phone.profit,
            purchasePrice: phone.purchasePrice,
          },
          payment: {
            sellingPaymentType: phone.sellingPaymentType,
            bankAccountUsed: phone.bankAccountUsed,
            accountCash: phone.accountCash,
            bankName: phone.bankName,
            pocketCash: phone.pocketCash,
            payableAmountNow: phone.payableAmountNow,
            payableAmountLater: phone.payableAmountLater,
            payableAmountLaterDate: phone.payableAmountLaterDate,
          },
          accessories: phone.accessories || [],
          entityData: {
            name: phone.customerName,
            number: phone.customerNumber,
          },
          references: {
            purchasePhoneId: phone.purchasePhoneId,
            singleSoldPhoneId: phone._id,
          },
         metadata: {
            shopid: phone.shopid,
          },
          shopInfo: phone._shopInfo || null,
          phoneDetails: {
            companyName:
              phone.companyName || purchasePhone?.companyName || null,
            modelName: phone.modelName || purchasePhone?.modelName || null,
            color: phone.color || purchasePhone?.color || null,
            ramMemory: phone.ramMemory || purchasePhone?.ramMemory || null,
            batteryHealth:
              phone.batteryHealth || purchasePhone?.batteryHealth || null,
            specifications:
              phone.specifications || purchasePhone?.specifications || null,
            phoneCondition:
              phone.phoneCondition || purchasePhone?.phoneCondition || null,
            warranty: phone.warranty || purchasePhone?.warranty || null,
            imei1: phone.imei1 || purchasePhone?.imei1 || null,
            imei2: phone.imei2 || purchasePhone?.imei2 || null,
            phonePicture:
              phone.phonePicture || purchasePhone?.phonePicture || null,
            personPicture:
              phone.personPicture || purchasePhone?.personPicture || null,
          },
          source: "SingleSoldPhone", // Mark source
          createdAt: phone.createdAt,
          updatedAt: phone.updatedAt,
        };
      });
      // Format SoldPhone records (bulk) to match invoice structure
      // Pre-fetch shop data for SoldPhone (bulk) records
      const bulkShopIds = [...new Set(soldPhones.map(p => p.shopid).filter(Boolean).map(String))];
      const bulkShops = await Shop.find({ _id: { $in: bulkShopIds } }).lean();
      const bulkShopMap = Object.fromEntries(bulkShops.map(s => [String(s._id), s]));
      soldPhones.forEach(p => { if (p.shopid) p._shopInfo = bulkShopMap[String(p.shopid)] || null; });

      // Format SoldPhone records (bulk) to match invoice structure
      formattedSoldPhones = await Promise.all(
        soldPhones.map(async (phone) => {
          // Get IMEI details if available
          const imei1List = Array.isArray(phone.imei1)
            ? phone.imei1
            : phone.imei1
            ? [phone.imei1]
            : [];
          const imei2List = Array.isArray(phone.imei2)
            ? phone.imei2
            : phone.imei2
            ? [phone.imei2]
            : [];

          let imeiDetails = [];
          if (phone.bulkPhonePurchaseId && imei1List.length > 0) {
            try {
              const imeiRecords = await Imei.find({
                imei1: { $in: imei1List },
                status: { $in: ["Sold", "Available"] },
              })
                .populate({
                  path: "ramSimId",
                  populate: {
                    path: "imeiNumbers",
                  },
                })
                .lean()
                .limit(100); // Limit to prevent performance issues

        imeiDetails = imeiRecords.map((imeiRecord, idx) => ({
                imei1: imeiRecord.imei1,
                imei2: imei2List[idx] || null,
                companyName: imeiRecord.ramSimId?.companyName || null,
                modelName: imeiRecord.ramSimId?.modelName || null,
                ramMemory: imeiRecord.ramSimId?.ramMemory || null,
                simOption: imeiRecord.ramSimId?.simOption || null,
                color: imeiRecord.color || null,
                batteryHealth: imeiRecord.batteryHealth || null,
                specifications: imeiRecord.ramSimId?.specifications || null,
                priceOfOne: imeiRecord.ramSimId?.priceOfOne || null,
              }));
            } catch (err) {
              console.error("Error fetching IMEI details:", err);
            }
          }

          return {
            _id: phone._id,
            invoiceNumber: phone.invoiceNumber,
            saleType: "bulk",
            saleDate: phone.dateSold,
            customerName: phone.customerName,
            customerNumber: phone.customerNumber,
            pricing: {
              salePrice: phone.salePrice,
              totalInvoice: phone.totalInvoice,
              profit: phone.profit,
              purchasePrice: phone.purchasePrice,
            },
            payment: {
              sellingPaymentType: phone.sellingPaymentType,
              bankAccountUsed: phone.bankAccountUsed,
              accountCash: phone.accountCash,
              bankName: phone.bankName,
              pocketCash: phone.pocketCash,
              payableAmountNow: phone.payableAmountNow,
              payableAmountLater: phone.payableAmountLater,
              payableAmountLaterDate: phone.payableAmountLaterDate,
            },
            accessories: phone.accessories || [],
            entityData: {
              name: phone.customerName,
              number: phone.customerNumber,
            },
            references: {
              bulkPhonePurchaseId: phone.bulkPhonePurchaseId,
              soldPhoneId: phone._id,
            },
            metadata: {},
         phoneDetails: {
              companyName:
                phone.companyName ||
                phone.bulkPhonePurchaseId?.ramSimDetails?.[0]?.companyName ||
                phone.bulkPhonePurchaseId?.companyName ||
                null,
              modelName:
                phone.modelName ||
                phone.bulkPhonePurchaseId?.ramSimDetails?.[0]?.modelName ||
                phone.bulkPhonePurchaseId?.modelName ||
                null,
              ramMemory:
                phone.bulkPhonePurchaseId?.ramSimDetails?.[0]?.ramMemory ||
                null,
              simOption:
                phone.bulkPhonePurchaseId?.ramSimDetails?.[0]?.simOption ||
                null,
              phoneCondition:
                phone.phoneCondition ||
                phone.bulkPhonePurchaseId?.phoneCondition ||
                null,
              warranty: phone.warranty || null,
              imei1: phone.imei1,
              imei2: phone.imei2,
              imeiDetails: imeiDetails.length > 0 ? imeiDetails : null,
            },
            source: "SoldPhone", // Mark source
            createdAt: phone.createdAt,
            updatedAt: phone.updatedAt,
          };
        })
      );

      // Combine all records
      allInvoices = [
        ...formattedSaleInvoices,
        ...formattedSingleSoldPhones,
        ...formattedSoldPhones,
      ];

      totalCount = allInvoices.length;
    }

    // Sort combined results by date (most recent first)
    allInvoices.sort(
      (a, b) =>
        new Date(b.saleDate || b.createdAt) -
        new Date(a.saleDate || a.createdAt)
    );

    // Apply pagination to combined results
    const paginatedInvoices = allInvoices.slice(skip, skip + parseInt(limit));

    res.status(200).json({
      success: true,
      message: "Invoices retrieved successfully",
      data: {
        invoices: paginatedInvoices,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / parseInt(limit)),
          totalItems: totalCount,
          itemsPerPage: parseInt(limit),
        },
        sources:
          includeSoldPhones === "true"
            ? {
                saleInvoiceCount: formattedSaleInvoices?.length || 0,
                singleSoldPhoneCount: formattedSingleSoldPhones?.length || 0,
                soldPhoneCount: formattedSoldPhones?.length || 0,
              }
            : null,
      },
    });
  } catch (error) {
    console.error("Error fetching invoices:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Get invoice by ID (searches SaleInvoice, SingleSoldPhone, and SoldPhone collections)
exports.getInvoiceById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // First try SaleInvoice collection
    let invoice = await SaleInvoice.findOne({ _id: id, userId })
      .populate("payment.bankAccountUsed")
      .populate("entityData._id")
      .populate("references.purchasePhoneId")
      .populate({
        path: "references.bulkPhonePurchaseId",
        populate: {
          path: "ramSimDetails",
          populate: {
            path: "imeiNumbers",
          },
        },
      })
      .populate("references.singleSoldPhoneId")
      .populate("references.soldPhoneId")
      .populate("accessories.name")
      .populate("metadata.shopid")
      .lean();

    let source = "SaleInvoice";

    // If not found in SaleInvoice, try SingleSoldPhone
    if (!invoice) {
      const singleSoldPhone = await SingleSoldPhone.findOne({ _id: id, userId })
        .populate("purchasePhoneId")
        .populate("bankAccountUsed")
        .lean();

      if (singleSoldPhone) {
        const purchasePhone = singleSoldPhone.purchasePhoneId;
        // Format SingleSoldPhone to match invoice structure
        invoice = {
          _id: singleSoldPhone._id,
          invoiceNumber: singleSoldPhone.invoiceNumber,
          saleType: "single",
          saleDate: singleSoldPhone.dateSold,
          customerName: singleSoldPhone.customerName,
          customerNumber: singleSoldPhone.customerNumber,
          pricing: {
            salePrice: singleSoldPhone.salePrice,
            totalInvoice: singleSoldPhone.totalInvoice,
            profit: singleSoldPhone.profit,
            purchasePrice: singleSoldPhone.purchasePrice,
          },
          payment: {
            sellingPaymentType: singleSoldPhone.sellingPaymentType,
            bankAccountUsed: singleSoldPhone.bankAccountUsed,
            accountCash: singleSoldPhone.accountCash,
            bankName: singleSoldPhone.bankName,
            pocketCash: singleSoldPhone.pocketCash,
            payableAmountNow: singleSoldPhone.payableAmountNow,
            payableAmountLater: singleSoldPhone.payableAmountLater,
            payableAmountLaterDate: singleSoldPhone.payableAmountLaterDate,
          },
          accessories: singleSoldPhone.accessories || [],
          entityData: {
            name: singleSoldPhone.customerName,
            number: singleSoldPhone.customerNumber,
          },
          references: {
            purchasePhoneId: singleSoldPhone.purchasePhoneId,
            singleSoldPhoneId: singleSoldPhone._id,
          },
          metadata: {
            shopid: singleSoldPhone.shopid,
          },
          phoneDetails: {
            companyName:
              singleSoldPhone.companyName || purchasePhone?.companyName || null,
            modelName:
              singleSoldPhone.modelName || purchasePhone?.modelName || null,
            color: singleSoldPhone.color || purchasePhone?.color || null,
            ramMemory:
              singleSoldPhone.ramMemory || purchasePhone?.ramMemory || null,
            batteryHealth:
              singleSoldPhone.batteryHealth ||
              purchasePhone?.batteryHealth ||
              null,
            specifications:
              singleSoldPhone.specifications ||
              purchasePhone?.specifications ||
              null,
            phoneCondition:
              singleSoldPhone.phoneCondition ||
              purchasePhone?.phoneCondition ||
              null,
            warranty:
              singleSoldPhone.warranty || purchasePhone?.warranty || null,
            imei1: singleSoldPhone.imei1 || purchasePhone?.imei1 || null,
            imei2: singleSoldPhone.imei2 || purchasePhone?.imei2 || null,
            phonePicture:
              singleSoldPhone.phonePicture ||
              purchasePhone?.phonePicture ||
              null,
            personPicture:
              singleSoldPhone.personPicture ||
              purchasePhone?.personPicture ||
              null,
          },
          source: "SingleSoldPhone",
          createdAt: singleSoldPhone.createdAt,
          updatedAt: singleSoldPhone.updatedAt,
        };
        source = "SingleSoldPhone";
      }
    }

    // If still not found, try SoldPhone (bulk)
    if (!invoice) {
      const soldPhone = await SoldPhone.findOne({ _id: id, userId })
        .populate("bulkPhonePurchaseId")
        .populate("bankAccountUsed")
        .lean();

      if (soldPhone) {
        // Get detailed IMEI information for bulk sales
        let imeiDetails = [];
        const imei1List = Array.isArray(soldPhone.imei1)
          ? soldPhone.imei1
          : soldPhone.imei1
          ? [soldPhone.imei1]
          : [];
        const imei2List = Array.isArray(soldPhone.imei2)
          ? soldPhone.imei2
          : soldPhone.imei2
          ? [soldPhone.imei2]
          : [];

        if (soldPhone.bulkPhonePurchaseId && imei1List.length > 0) {
          // Get IMEI records to fetch full details
          const imeiRecords = await Imei.find({
            imei1: { $in: imei1List },
            status: { $in: ["Sold", "Available"] },
          })
            .populate({
              path: "ramSimId",
              populate: {
                path: "imeiNumbers",
              },
            })
            .lean();

          imeiDetails = imeiRecords.map((imeiRecord, idx) => ({
            imei1: imeiRecord.imei1,
            imei2: imei2List[idx] || null,
            ramMemory: imeiRecord.ramSimId?.ramMemory || null,
            color: imeiRecord.ramSimId?.color || null,
            batteryHealth: imeiRecord.ramSimId?.batteryHealth || null,
            specifications: imeiRecord.ramSimId?.specifications || null,
            priceOfOne: imeiRecord.ramSimId?.priceOfOne || null,
          }));
        }

        // Format SoldPhone to match invoice structure
        invoice = {
          _id: soldPhone._id,
          invoiceNumber: soldPhone.invoiceNumber,
          saleType: "bulk",
          saleDate: soldPhone.dateSold,
          customerName: soldPhone.customerName,
          customerNumber: soldPhone.customerNumber,
          pricing: {
            salePrice: soldPhone.salePrice,
            totalInvoice: soldPhone.totalInvoice,
            profit: soldPhone.profit,
            purchasePrice: soldPhone.purchasePrice,
          },
          payment: {
            sellingPaymentType: soldPhone.sellingPaymentType,
            bankAccountUsed: soldPhone.bankAccountUsed,
            accountCash: soldPhone.accountCash,
            bankName: soldPhone.bankName,
            pocketCash: soldPhone.pocketCash,
            payableAmountNow: soldPhone.payableAmountNow,
            payableAmountLater: soldPhone.payableAmountLater,
            payableAmountLaterDate: soldPhone.payableAmountLaterDate,
          },
          accessories: soldPhone.accessories || [],
          entityData: {
            name: soldPhone.customerName,
            number: soldPhone.customerNumber,
          },
          references: {
            bulkPhonePurchaseId: soldPhone.bulkPhonePurchaseId,
            soldPhoneId: soldPhone._id,
          },
          metadata: {},
          phoneDetails: {
            companyName:
              soldPhone.companyName ||
              soldPhone.bulkPhonePurchaseId?.companyName ||
              null,
            modelName:
              soldPhone.modelName ||
              soldPhone.bulkPhonePurchaseId?.modelName ||
              null,
            phoneCondition:
              soldPhone.phoneCondition ||
              soldPhone.bulkPhonePurchaseId?.phoneCondition ||
              null,
            warranty: soldPhone.warranty || null,
            imei1: soldPhone.imei1,
            imei2: soldPhone.imei2,
            imeiDetails: imeiDetails.length > 0 ? imeiDetails : null,
          },
          source: "SoldPhone",
          createdAt: soldPhone.createdAt,
          updatedAt: soldPhone.updatedAt,
        };
        source = "SoldPhone";
      }
    }

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Invoice retrieved successfully",
      data: invoice,
      source: source, // Indicate which collection the data came from
    });
  } catch (error) {
    console.error("Error fetching invoice:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Get invoice by invoice number (searches SaleInvoice, SingleSoldPhone, and SoldPhone collections)
exports.getInvoiceByNumber = async (req, res) => {
  try {
    const { invoiceNumber } = req.params;
    const userId = req.user.id;
    const candidateNumbers = normalizeInvoiceInput(invoiceNumber);

    // First try SaleInvoice collection
    let invoice = await SaleInvoice.findOne({
      invoiceNumber: { $in: candidateNumbers },
      userId,
    })
      .populate("payment.bankAccountUsed")
      .populate("entityData._id")
      .populate("references.purchasePhoneId")
      .populate("references.bulkPhonePurchaseId")
      .populate("references.singleSoldPhoneId")
      .populate("references.soldPhoneId")
      .populate("accessories.name")
      .populate("metadata.shopid")
      .lean();

    let source = "SaleInvoice";

    // If not found in SaleInvoice, try SingleSoldPhone
    if (!invoice) {
      const singleSoldPhone = await SingleSoldPhone.findOne({
        invoiceNumber: { $in: candidateNumbers },
        userId,
      })
        .populate("purchasePhoneId")
        .populate("bankAccountUsed")
        .lean();

      if (singleSoldPhone) {
        // Format SingleSoldPhone to match invoice structure
        invoice = {
          _id: singleSoldPhone._id,
          invoiceNumber: singleSoldPhone.invoiceNumber,
          saleType: "single",
          saleDate: singleSoldPhone.dateSold,
          customerName: singleSoldPhone.customerName,
          customerNumber: singleSoldPhone.customerNumber,
          pricing: {
            salePrice: singleSoldPhone.salePrice,
            totalInvoice: singleSoldPhone.totalInvoice,
            profit: singleSoldPhone.profit,
            purchasePrice: singleSoldPhone.purchasePrice,
          },
          payment: {
            sellingPaymentType: singleSoldPhone.sellingPaymentType,
            bankAccountUsed: singleSoldPhone.bankAccountUsed,
            accountCash: singleSoldPhone.accountCash,
            bankName: singleSoldPhone.bankName,
            pocketCash: singleSoldPhone.pocketCash,
            payableAmountNow: singleSoldPhone.payableAmountNow,
            payableAmountLater: singleSoldPhone.payableAmountLater,
            payableAmountLaterDate: singleSoldPhone.payableAmountLaterDate,
          },
          accessories: singleSoldPhone.accessories,
          entityData: {
            name: singleSoldPhone.customerName,
            number: singleSoldPhone.customerNumber,
          },
          references: {
            purchasePhoneId: singleSoldPhone.purchasePhoneId,
            singleSoldPhoneId: singleSoldPhone._id,
          },
        metadata: {
            shopid: singleSoldPhone.shopid,
          },
          shopInfo: singleSoldPhone.shopid
            ? await Shop.findById(singleSoldPhone.shopid).lean()
            : null,
          phoneDetails: {
            companyName: singleSoldPhone.companyName,
            modelName: singleSoldPhone.modelName,
            color: singleSoldPhone.color,
            ramMemory: singleSoldPhone.ramMemory,
            batteryHealth: singleSoldPhone.batteryHealth,
            specifications: singleSoldPhone.specifications,
            phoneCondition: singleSoldPhone.phoneCondition,
            warranty: singleSoldPhone.warranty,
            imei1: singleSoldPhone.imei1,
            imei2: singleSoldPhone.imei2,
            phonePicture: singleSoldPhone.phonePicture,
            personPicture: singleSoldPhone.personPicture,
          },
          source: "SingleSoldPhone",
          createdAt: singleSoldPhone.createdAt,
          updatedAt: singleSoldPhone.updatedAt,
        };
        source = "SingleSoldPhone";
      }
    }

    // If still not found, try SoldPhone (bulk)
    if (!invoice) {
      const soldPhone = await SoldPhone.findOne({
        invoiceNumber: { $in: candidateNumbers },
        userId,
      })
        .populate("bulkPhonePurchaseId")
        .populate("bankAccountUsed")
        .lean();

      if (soldPhone) {
        // Format SoldPhone to match invoice structure
        invoice = {
          _id: soldPhone._id,
          invoiceNumber: soldPhone.invoiceNumber,
          saleType: "bulk",
          saleDate: soldPhone.dateSold,
          customerName: soldPhone.customerName,
          customerNumber: soldPhone.customerNumber,
          pricing: {
            salePrice: soldPhone.salePrice,
            totalInvoice: soldPhone.totalInvoice,
            profit: soldPhone.profit,
            purchasePrice: soldPhone.purchasePrice,
          },
          payment: {
            sellingPaymentType: soldPhone.sellingPaymentType,
            bankAccountUsed: soldPhone.bankAccountUsed,
            accountCash: soldPhone.accountCash,
            bankName: soldPhone.bankName,
            pocketCash: soldPhone.pocketCash,
            payableAmountNow: soldPhone.payableAmountNow,
            payableAmountLater: soldPhone.payableAmountLater,
            payableAmountLaterDate: soldPhone.payableAmountLaterDate,
          },
          accessories: soldPhone.accessories,
          entityData: {
            name: soldPhone.customerName,
            number: soldPhone.customerNumber,
          },
          references: {
            bulkPhonePurchaseId: soldPhone.bulkPhonePurchaseId,
            soldPhoneId: soldPhone._id,
          },
          metadata: {},
          phoneDetails: {
            companyName: soldPhone.companyName,
            modelName: soldPhone.modelName,
            phoneCondition: soldPhone.phoneCondition,
            warranty: soldPhone.warranty,
            imei1: soldPhone.imei1,
            imei2: soldPhone.imei2,
          },
          source: "SoldPhone",
          createdAt: soldPhone.createdAt,
          updatedAt: soldPhone.updatedAt,
        };
        source = "SoldPhone";
      }
    }

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Invoice retrieved successfully",
      data: invoice,
      source: source, // Indicate which collection the data came from
    });
  } catch (error) {
    console.error("Error fetching invoice:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Delete invoice (comprehensive cleanup)
exports.deleteInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Find the invoice first to get all related data
    const invoice = await SaleInvoice.findOne({ _id: id, userId })
      .populate("payment.bankAccountUsed")
      .populate("entityData._id")
      .populate("references.purchasePhoneId")
      .populate("references.bulkPhonePurchaseId")
      .populate("references.singleSoldPhoneId")
      .populate("references.soldPhoneId")
      .populate("accessories.name");

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found",
      });
    }

    // Check if invoice has been returned - warn or prevent deletion
    if (invoice.isReturned) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete a returned invoice. Please process the return reversal first.",
      });
    }

    // 1. Restore phone stock based on sale type
    if (invoice.saleType === "single" && invoice.references?.singleSoldPhoneId) {
      // Restore purchase phone status
      if (invoice.references.purchasePhoneId) {
        const purchasePhone = await PurchasePhone.findById(
          invoice.references.purchasePhoneId
        );
        if (purchasePhone) {
          purchasePhone.status = "Available";
          purchasePhone.isSold = false;
          purchasePhone.soldDetails = undefined;
          await purchasePhone.save();
        }
      }

      // Delete single sold phone record
      await SingleSoldPhone.findByIdAndDelete(invoice.references.singleSoldPhoneId);
    } else if (invoice.saleType === "bulk" && invoice.references?.soldPhoneId) {
      // Restore IMEIs to Available status
      const soldPhone = await SoldPhone.findById(invoice.references.soldPhoneId);
      if (soldPhone && invoice.references.bulkPhonePurchaseId) {
        const imei1List = Array.isArray(soldPhone.imei1)
          ? soldPhone.imei1
          : soldPhone.imei1
          ? [soldPhone.imei1]
          : [];

        if (imei1List.length > 0) {
          const bulkPurchase = await BulkPhonePurchase.findById(
            invoice.references.bulkPhonePurchaseId
          ).populate("ramSimDetails");

          if (bulkPurchase) {
            const ramSimIds = bulkPurchase.ramSimDetails.map((r) => r._id);
            
            // Restore IMEIs to Available status
            for (const imeiValue of imei1List) {
              const imeiRecord = await Imei.findOne({
                imei1: imeiValue,
                status: "Sold",
              });
              if (imeiRecord) {
                imeiRecord.status = "Available";
                await imeiRecord.save();
              }
            }

            // Update bulk purchase status
            const totalImeis = await Imei.countDocuments({
              ramSimId: { $in: ramSimIds },
            });
            const availableImeis = await Imei.countDocuments({
              ramSimId: { $in: ramSimIds },
              status: "Available",
            });

            if (availableImeis === totalImeis) {
              bulkPurchase.status = "Available";
            } else if (availableImeis > 0) {
              bulkPurchase.status = "Partially Sold";
            }
            await bulkPurchase.save();
          }
        }
      }

      // Delete sold phone record
      await SoldPhone.findByIdAndDelete(invoice.references.soldPhoneId);
    }

    // 2. Restore accessory stock
    if (invoice.accessories && invoice.accessories.length > 0) {
      for (const accItem of invoice.accessories) {
        const accessoryId = accItem.name?._id || accItem.name;
        const quantity = Number(accItem.quantity) || 0;

        if (accessoryId && quantity > 0) {
          const accessory = await Accessory.findById(accessoryId);
          if (accessory) {
            accessory.stock += quantity;
            accessory.totalPrice +=
              Number(accessory.perPiecePrice) * quantity;

            // Subtract profit from accessory
            const itemProfit =
              (Number(accItem.price || accessory.perPiecePrice) -
                Number(accessory.perPiecePrice)) *
              quantity;
            accessory.profit = Math.max(0, accessory.profit - itemProfit);

            await accessory.save();
          }
        }
      }
    }

    // 3. Reverse payment transactions
    const payment = invoice.payment || {};

    // Reverse bank payment
    if (payment.bankAccountUsed && payment.accountCash) {
      const bank = await AddBankAccount.findById(payment.bankAccountUsed);
      if (bank) {
        bank.accountCash -= Number(payment.accountCash || 0);
        await bank.save();

        await BankTransaction.create({
          bankId: bank._id,
          userId,
          reasonOfAmountDeduction: `Invoice deletion: ${invoice.invoiceNumber} - Reversal of sale payment`,
          amount: Number(payment.accountCash || 0),
          accountCash: bank.accountCash,
          accountType: bank.accountType,
        });
      }
    }

    // Reverse pocket cash payment
    if (payment.pocketCash) {
      const pocket = await PocketCashSchema.findOne({ userId });
      if (pocket) {
        pocket.accountCash -= Number(payment.pocketCash || 0);
        await pocket.save();

        await PocketCashTransactionSchema.create({
          userId,
          pocketCashId: pocket._id,
          amountDeducted: Number(payment.pocketCash || 0),
          accountCash: pocket.accountCash,
          remainingAmount: pocket.accountCash,
          reasonOfAmountDeduction: `Invoice deletion: ${invoice.invoiceNumber} - Reversal of sale payment`,
        });
      }
    }

    // 4. Reverse credit transactions if applicable
    if (
      payment.sellingPaymentType === "Credit" &&
      payment.payableAmountLater &&
      invoice.customerNumber
    ) {
      let person = null;
      if (invoice.entityData?._id) {
        person = await Person.findById(invoice.entityData._id);
      } else if (invoice.customerNumber) {
        person = await Person.findOne({
          number: invoice.customerNumber,
          userId: userId,
        });
      }

      if (person) {
        const creditAmount = Number(payment.payableAmountLater || 0);

        // Reduce givingCredit (customer owes us less)
        if (person.givingCredit > 0) {
          person.givingCredit = Math.max(0, person.givingCredit - creditAmount);
        }

        // Update status
        if (person.givingCredit === 0 && person.takingCredit === 0) {
          person.status = "Settled";
        } else if (person.givingCredit === 0) {
          person.status = "Payable";
        }

        await person.save();

        await CreditTransaction.create({
          userId,
          personId: person._id,
          givingCredit: -creditAmount,
          balanceAmount: person.givingCredit,
          description: `Invoice deletion: ${invoice.invoiceNumber} - Credit reversal: ${creditAmount}`,
        });
      }
    }

    // 5. Delete the invoice
    await SaleInvoice.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "Invoice deleted successfully with all related records cleaned up",
      data: {
        deletedInvoiceId: id,
        invoiceNumber: invoice.invoiceNumber,
        restoredItems: {
          phones: invoice.saleType === "single" || invoice.saleType === "bulk",
          accessories: invoice.accessories?.length || 0,
        },
        reversedTransactions: {
          bank: !!payment.bankAccountUsed,
          pocketCash: !!payment.pocketCash,
          credit: payment.sellingPaymentType === "Credit",
        },
      },
    });
  } catch (error) {
    console.error("Error deleting invoice:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Return/Refund invoice (supports partial returns)
exports.returnInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const {
      returnReason, // Optional return reason
      returnImeis, // Optional array of IMEIs to return (for bulk phones)
      returnAmount, // Optional partial return amount
      returnAccessories, // Optional array of {name: accessoryId, quantity: number}
      returnStatus, // Optional: "semi-return" or "full-return" (defaults to "full-return" if all items returned)
    } = req.body;

    // Find the invoice - try SaleInvoice first
    let invoice = await SaleInvoice.findOne({ _id: id, userId })
      .populate("payment.bankAccountUsed")
      .populate("entityData._id")
      .populate("references.singleSoldPhoneId")
      .populate("references.soldPhoneId")
      .populate("references.purchasePhoneId")
      .populate("references.bulkPhonePurchaseId")
      .populate("accessories.name");

    let source = "SaleInvoice";
    let singleSoldPhone = null;
    let soldPhone = null;

    // If not found in SaleInvoice, try SingleSoldPhone
    if (!invoice) {
      singleSoldPhone = await SingleSoldPhone.findOne({ _id: id, userId })
        .populate("purchasePhoneId")
        .populate("bankAccountUsed")
        .lean();

      if (singleSoldPhone) {
        source = "SingleSoldPhone";
        // Format to match invoice structure for processing
        invoice = {
          _id: singleSoldPhone._id,
          invoiceNumber: singleSoldPhone.invoiceNumber,
          saleType: "single",
          saleDate: singleSoldPhone.dateSold,
          customerName: singleSoldPhone.customerName,
          customerNumber: singleSoldPhone.customerNumber,
          pricing: {
            salePrice: singleSoldPhone.salePrice,
            totalInvoice: singleSoldPhone.totalInvoice,
            profit: singleSoldPhone.profit,
            purchasePrice: singleSoldPhone.purchasePrice,
          },
          payment: {
            sellingPaymentType: singleSoldPhone.sellingPaymentType,
            bankAccountUsed: singleSoldPhone.bankAccountUsed,
            accountCash: singleSoldPhone.accountCash,
            bankName: singleSoldPhone.bankName,
            pocketCash: singleSoldPhone.pocketCash,
            payableAmountNow: singleSoldPhone.payableAmountNow,
            payableAmountLater: singleSoldPhone.payableAmountLater,
            payableAmountLaterDate: singleSoldPhone.payableAmountLaterDate,
          },
          accessories: singleSoldPhone.accessories || [],
          entityData: {
            name: singleSoldPhone.customerName,
            number: singleSoldPhone.customerNumber,
          },
          references: {
            purchasePhoneId: singleSoldPhone.purchasePhoneId,
            singleSoldPhoneId: singleSoldPhone._id,
          },
          phoneDetails: {
            imei1: singleSoldPhone.imei1,
            imei2: singleSoldPhone.imei2,
          },
        };
      }
    }

    // If still not found, try SoldPhone (bulk)
    if (!invoice && !singleSoldPhone) {
      soldPhone = await SoldPhone.findOne({ _id: id, userId })
        .populate("bulkPhonePurchaseId")
        .populate("bankAccountUsed")
        .lean();

      if (soldPhone) {
        source = "SoldPhone";
        // Format to match invoice structure for processing
        invoice = {
          _id: soldPhone._id,
          invoiceNumber: soldPhone.invoiceNumber,
          saleType: "bulk",
          saleDate: soldPhone.dateSold,
          customerName: soldPhone.customerName,
          customerNumber: soldPhone.customerNumber,
          pricing: {
            salePrice: soldPhone.salePrice,
            totalInvoice: soldPhone.totalInvoice,
            profit: soldPhone.profit,
            purchasePrice: soldPhone.purchasePrice,
          },
          payment: {
            sellingPaymentType: soldPhone.sellingPaymentType,
            bankAccountUsed: soldPhone.bankAccountUsed,
            accountCash: soldPhone.accountCash,
            bankName: soldPhone.bankName,
            pocketCash: soldPhone.pocketCash,
            payableAmountNow: soldPhone.payableAmountNow,
            payableAmountLater: soldPhone.payableAmountLater,
            payableAmountLaterDate: soldPhone.payableAmountLaterDate,
          },
          accessories: soldPhone.accessories || [],
          entityData: {
            name: soldPhone.customerName,
            number: soldPhone.customerNumber,
          },
          references: {
            bulkPhonePurchaseId: soldPhone.bulkPhonePurchaseId,
            soldPhoneId: soldPhone._id,
          },
          phoneDetails: {
            imei1: soldPhone.imei1,
            imei2: soldPhone.imei2,
          },
        };
      }
    }

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found",
      });
    }

    // Check if invoice is already fully returned
    if (
      source === "SaleInvoice" &&
      invoice.isReturned &&
      invoice.returnStatus === "full-return"
    ) {
      return res.status(400).json({
        success: false,
        message: "Invoice has already been fully returned",
      });
    }

    const totalRefundAmount = invoice.pricing?.totalInvoice || 0;
    const originalImeis = invoice.phoneDetails?.imei1
      ? Array.isArray(invoice.phoneDetails.imei1)
        ? invoice.phoneDetails.imei1
        : [invoice.phoneDetails.imei1]
      : [];

    // Determine if this is a partial or full return
    const isBulkSale = invoice.saleType === "bulk";
    const imeisToReturn =
      returnImeis && Array.isArray(returnImeis) && returnImeis.length > 0
        ? returnImeis
        : isBulkSale
        ? []
        : originalImeis; // For bulk, require IMEIs. For single, return all if not specified

    // Check how many IMEIs belong to current invoice vs other invoices
    const imeisFromCurrentInvoice = imeisToReturn.filter((imei) =>
      originalImeis.includes(String(imei))
    );
    const imeisFromOtherInvoices = imeisToReturn.filter(
      (imei) => !originalImeis.includes(String(imei))
    );

    // Determine partial return based on current invoice's IMEIs
    const isPartialReturn = isBulkSale
      ? imeisFromCurrentInvoice.length > 0 &&
        imeisFromCurrentInvoice.length < originalImeis.length
      : false;

    const accessoriesToReturn =
      returnAccessories && Array.isArray(returnAccessories)
        ? returnAccessories
        : isPartialReturn
        ? []
        : invoice.accessories; // Only return specific accessories if partial, else all

    // Calculate return amount (if not provided, calculate proportionally for partial returns)
    // Note: Refund is based on IMEIs from CURRENT invoice only
    // IMEIs from other invoices update those records but don't affect this invoice's refund
    let calculatedReturnAmount = 0;
    const imeisForRefundCalculation =
      imeisFromCurrentInvoice.length > 0
        ? imeisFromCurrentInvoice
        : imeisToReturn;

    if (returnAmount && returnAmount > 0) {
      calculatedReturnAmount = Math.min(returnAmount, totalRefundAmount);
    } else if (
      !isPartialReturn &&
      imeisFromCurrentInvoice.length === originalImeis.length
    ) {
      calculatedReturnAmount = totalRefundAmount; // Full return of current invoice
    } else if (
      isBulkSale &&
      isPartialReturn &&
      imeisForRefundCalculation.length > 0
    ) {
      // Calculate proportional refund based on IMEIs returned from CURRENT invoice
      const imeiPricePerUnit =
        originalImeis.length > 0 ? totalRefundAmount / originalImeis.length : 0;
      calculatedReturnAmount =
        imeiPricePerUnit * imeisForRefundCalculation.length;
    }

    // Determine final return status
    let finalReturnStatus =
      returnStatus || (isPartialReturn ? "semi-return" : "full-return");

    // 1. Restore phone stock based on sale type and return type
    if (
      invoice.saleType === "single" &&
      invoice.references?.singleSoldPhoneId
    ) {
      // For single phone returns, always return the whole phone
      const singleSoldPhoneDoc =
        singleSoldPhone ||
        (await SingleSoldPhone.findById(invoice.references.singleSoldPhoneId));

      if (singleSoldPhoneDoc) {
        // Restore purchase phone status
        if (
          singleSoldPhoneDoc.purchasePhoneId ||
          invoice.references?.purchasePhoneId
        ) {
          const purchasePhoneId =
            singleSoldPhoneDoc.purchasePhoneId ||
            invoice.references.purchasePhoneId;
          const purchasePhone = await PurchasePhone.findById(purchasePhoneId);
          if (purchasePhone) {
            purchasePhone.status = "Available";
            purchasePhone.isSold = false;
            purchasePhone.soldDetails = undefined;
            await purchasePhone.save();
          }
        }

        // Delete single sold phone if full return, or mark as partial return
        if (finalReturnStatus === "full-return") {
          await SingleSoldPhone.findByIdAndDelete(singleSoldPhoneDoc._id);
        }
      }
    } else if (invoice.saleType === "bulk" && invoice.references?.soldPhoneId) {
      // For bulk phone returns, handle partial returns with IMEI selection
      // Now supports selecting IMEIs from ANY related record (same bulk purchase)
      const soldPhoneDoc =
        soldPhone || (await SoldPhone.findById(invoice.references.soldPhoneId));

      if (soldPhoneDoc) {
        // Process all selected IMEIs (from current invoice + other invoices)
        const imeisToProcess = isPartialReturn ? imeisToReturn : originalImeis;

        // Get bulk purchase to validate IMEIs from any related record
        const bulkPurchaseId =
          invoice.references?.bulkPhonePurchaseId ||
          soldPhoneDoc.bulkPhonePurchaseId;

        if (bulkPurchaseId) {
          const bulkPurchase = await BulkPhonePurchase.findById(
            bulkPurchaseId
          ).populate("ramSimDetails");

          if (bulkPurchase && imeisToProcess.length > 0) {
            // Validate IMEIs belong to this bulk purchase (from any related sale)
            const ramSimIds = bulkPurchase.ramSimDetails.map((r) => r._id);
            const validImeis = await Imei.find({
              ramSimId: { $in: ramSimIds },
              imei1: { $in: imeisToProcess },
              status: "Sold",
            });

            if (validImeis.length === 0 && imeisToProcess.length > 0) {
              return res.status(400).json({
                success: false,
                message:
                  "None of the provided IMEIs are valid for return from this bulk purchase",
              });
            }

            const validImeiNumbers = validImeis.map((i) => i.imei1);

            // Find ALL SoldPhone records that contain these IMEIs (could be multiple sales)
            const affectedSoldPhones = await SoldPhone.find({
              bulkPhonePurchaseId: bulkPurchaseId,
              userId: userId,
              $or: [
                { imei1: { $in: validImeiNumbers } },
                { imei1: { $in: imeisToProcess } }, // Also check direct match
              ],
            });

            // Group IMEIs by which SoldPhone record they belong to
            const imeiToSoldPhoneMap = new Map();
            for (const soldPhoneRecord of affectedSoldPhones) {
              const soldImeis = Array.isArray(soldPhoneRecord.imei1)
                ? soldPhoneRecord.imei1
                : [soldPhoneRecord.imei1];

              for (const imei of imeisToProcess) {
                if (
                  soldImeis.includes(imei) ||
                  soldImeis.includes(String(imei))
                ) {
                  if (!imeiToSoldPhoneMap.has(soldPhoneRecord._id.toString())) {
                    imeiToSoldPhoneMap.set(soldPhoneRecord._id.toString(), []);
                  }
                  imeiToSoldPhoneMap
                    .get(soldPhoneRecord._id.toString())
                    .push(imei);
                }
              }
            }

            // Restore selected IMEIs to Available status
            for (const imeiValue of validImeiNumbers) {
              const imeiRecord = await Imei.findOne({
                imei1: imeiValue,
                status: "Sold",
              });

              if (imeiRecord) {
                imeiRecord.status = "Available";
                await imeiRecord.save();
              }
            }

            // Update bulk purchase status
            const totalImeis = await Imei.countDocuments({
              ramSimId: { $in: ramSimIds },
            });

            const availableImeis = await Imei.countDocuments({
              ramSimId: { $in: ramSimIds },
              status: "Available",
            });

            if (availableImeis === totalImeis) {
              bulkPurchase.status = "Available";
            } else if (availableImeis > 0) {
              bulkPurchase.status = "Partially Sold";
            }
            await bulkPurchase.save();

            // Update all affected SoldPhone records
            if (isPartialReturn && finalReturnStatus === "semi-return") {
              // Process each affected SoldPhone record
              for (const [
                soldPhoneId,
                imeisInThisSale,
              ] of imeiToSoldPhoneMap.entries()) {
                const affectedSoldPhone = await SoldPhone.findById(soldPhoneId);
                if (!affectedSoldPhone) continue;

                const originalImeisInSale = Array.isArray(
                  affectedSoldPhone.imei1
                )
                  ? affectedSoldPhone.imei1
                  : [affectedSoldPhone.imei1];

                // Remove returned IMEIs from this sale
                const updatedImei1 = originalImeisInSale.filter(
                  (imei) => !imeisInThisSale.includes(String(imei))
                );

                const updatedImei2 = Array.isArray(affectedSoldPhone.imei2)
                  ? affectedSoldPhone.imei2.filter((imei, index) => {
                      const correspondingImei1 = originalImeisInSale[index];
                      return !imeisInThisSale.includes(
                        String(correspondingImei1)
                      );
                    })
                  : [];

                // Calculate remaining price proportionally
                const remainingImeisCount = updatedImei1.length;
                const originalImeisCount = originalImeisInSale.length;

                if (remainingImeisCount === 0) {
                  // All IMEIs returned from this sale, delete the record
                  await SoldPhone.findByIdAndDelete(soldPhoneId);
                } else if (remainingImeisCount < originalImeisCount) {
                  // Partial return, update the record
                  const pricePerImei =
                    affectedSoldPhone.salePrice / originalImeisCount;
                  const updatedSalePrice = pricePerImei * remainingImeisCount;
                  const updatedTotalInvoice =
                    updatedSalePrice +
                    (affectedSoldPhone.totalInvoice -
                      affectedSoldPhone.salePrice);

                  await SoldPhone.findByIdAndUpdate(soldPhoneId, {
                    imei1: updatedImei1,
                    imei2: updatedImei2,
                    salePrice: updatedSalePrice,
                    totalInvoice: updatedTotalInvoice,
                    profit:
                      updatedSalePrice -
                      (affectedSoldPhone.purchasePrice * remainingImeisCount) /
                        originalImeisCount,
                  });
                }
              }
            } else if (finalReturnStatus === "full-return") {
              // Delete all affected sold phone records for full return
              // Check if all IMEIs from each sale are being returned
              for (const [
                soldPhoneId,
                imeisInThisSale,
              ] of imeiToSoldPhoneMap.entries()) {
                const affectedSoldPhone = await SoldPhone.findById(soldPhoneId);
                if (!affectedSoldPhone) continue;

                const originalImeisInSale = Array.isArray(
                  affectedSoldPhone.imei1
                )
                  ? affectedSoldPhone.imei1
                  : [affectedSoldPhone.imei1];

                // If all IMEIs from this sale are being returned, delete the record
                const allReturned =
                  imeisInThisSale.length === originalImeisInSale.length &&
                  imeisInThisSale.every((imei) =>
                    originalImeisInSale.some(
                      (orig) => String(orig) === String(imei)
                    )
                  );

                if (allReturned) {
                  await SoldPhone.findByIdAndDelete(soldPhoneId);
                } else {
                  // Partial return even in full-return mode for this specific sale
                  const updatedImei1 = originalImeisInSale.filter(
                    (imei) => !imeisInThisSale.includes(String(imei))
                  );
                  const updatedImei2 = Array.isArray(affectedSoldPhone.imei2)
                    ? affectedSoldPhone.imei2.filter((imei, index) => {
                        const correspondingImei1 = originalImeisInSale[index];
                        return !imeisInThisSale.includes(
                          String(correspondingImei1)
                        );
                      })
                    : [];

                  const remainingImeisCount = updatedImei1.length;
                  const originalImeisCount = originalImeisInSale.length;
                  const pricePerImei =
                    affectedSoldPhone.salePrice / originalImeisCount;
                  const updatedSalePrice = pricePerImei * remainingImeisCount;
                  const updatedTotalInvoice =
                    updatedSalePrice +
                    (affectedSoldPhone.totalInvoice -
                      affectedSoldPhone.salePrice);

                  await SoldPhone.findByIdAndUpdate(soldPhoneId, {
                    imei1: updatedImei1,
                    imei2: updatedImei2,
                    salePrice: updatedSalePrice,
                    totalInvoice: updatedTotalInvoice,
                    profit:
                      updatedSalePrice -
                      (affectedSoldPhone.purchasePrice * remainingImeisCount) /
                        originalImeisCount,
                  });
                }
              }
            }
          }
        }
      }
    }

    // 2. Restore accessory stock (handle partial returns)
    const accessoriesToProcess =
      isPartialReturn && accessoriesToReturn.length > 0
        ? accessoriesToReturn
        : invoice.accessories || [];

    if (accessoriesToProcess.length > 0) {
      for (const accItem of accessoriesToProcess) {
        const accessoryId = accItem.name?._id || accItem.name;
        const returnQuantity = Number(accItem.quantity) || 0;

        if (accessoryId && returnQuantity > 0) {
          const accessory = await Accessory.findById(accessoryId);
          if (accessory) {
            // Find original accessory item from invoice to get original price
            const originalAccItem = invoice.accessories?.find(
              (acc) =>
                (acc.name?._id || acc.name)?.toString() ===
                accessoryId.toString()
            );

            const originalPrice =
              originalAccItem?.price || accessory.perPiecePrice;

            accessory.stock += returnQuantity;
            accessory.totalPrice +=
              Number(accessory.perPiecePrice) * returnQuantity;

            // Calculate and subtract profit
            const itemProfit =
              (Number(originalPrice) - Number(accessory.perPiecePrice)) *
              returnQuantity;
            accessory.profit = Math.max(0, accessory.profit - itemProfit);

            await accessory.save();
          }
        }
      }
    }

    // 3. Calculate actual refund amount (proportional for partial returns)
    // Note: Refund is calculated based on IMEIs from CURRENT invoice only
    // If returnAmount is provided by user, use it (respect user input)
    let actualRefundAmount =
      returnAmount && returnAmount > 0
        ? Math.min(returnAmount, totalRefundAmount)
        : calculatedReturnAmount;

    // For partial returns, calculate proportionally ONLY if amount not provided by user
    if (!returnAmount || returnAmount <= 0) {
      if (isPartialReturn && actualRefundAmount === 0) {
        if (
          isBulkSale &&
          imeisFromCurrentInvoice.length > 0 &&
          originalImeis.length > 0
        ) {
          // Calculate proportional refund based on IMEIs returned from CURRENT invoice
          const pricePerImei = totalRefundAmount / originalImeis.length;
          actualRefundAmount = pricePerImei * imeisFromCurrentInvoice.length;
        } else if (accessoriesToProcess.length > 0) {
          // Calculate refund based on accessories returned
          const accessoriesTotalPrice =
            invoice.accessories?.reduce((sum, acc) => {
              const returnAcc = accessoriesToProcess.find(
                (ra) =>
                  (ra.name?._id || ra.name)?.toString() ===
                  (acc.name?._id || acc.name)?.toString()
              );
              return (
                sum +
                (returnAcc
                  ? Number(returnAcc.price || 0) *
                    Number(returnAcc.quantity || 0)
                  : 0)
              );
            }, 0) || 0;
          actualRefundAmount = accessoriesTotalPrice;
        }
      }
    }

    actualRefundAmount = Math.min(actualRefundAmount, totalRefundAmount);
    const refundRatio =
      totalRefundAmount > 0 ? actualRefundAmount / totalRefundAmount : 0;

    // 4. Refund payments (proportional for partial returns)
    const payment = invoice.payment || {};
    const refundAmount = actualRefundAmount;

    // Refund bank payment (proportional)
    if (payment.bankAccountUsed && payment.accountCash) {
      const bank = await AddBankAccount.findById(payment.bankAccountUsed);
      if (bank) {
        const refundAmountBank = Number(
          (payment.accountCash || 0) * refundRatio
        );
        bank.accountCash -= refundAmountBank; // Deduct from bank (refund to customer)
        await bank.save();

        await BankTransaction.create({
          bankId: bank._id,
          userId,
          reasonOfAmountDeduction: `Invoice ${finalReturnStatus}: ${
            invoice.invoiceNumber
          } - ${returnReason || "Customer return"}${
            isPartialReturn
              ? ` (Partial: ${actualRefundAmount}/${totalRefundAmount})`
              : ""
          }`,
          amount: refundAmountBank,
          accountCash: bank.accountCash,
          accountType: bank.accountType,
        });
      }
    }

    // Refund pocket cash (proportional)
    if (payment.pocketCash) {
      const pocket = await PocketCashSchema.findOne({ userId });
      if (pocket) {
        const originalPocketCash = Number(payment.pocketCash || 0);
        const refundAmountPocket = originalPocketCash * refundRatio;
        pocket.accountCash -= refundAmountPocket; // Deduct from pocket (refund to customer)
        await pocket.save();

        await PocketCashTransactionSchema.create({
          userId,
          pocketCashId: pocket._id,
          amountDeducted: refundAmountPocket,
          accountCash: pocket.accountCash,
          remainingAmount: pocket.accountCash,
          reasonOfAmountDeduction: `Invoice ${finalReturnStatus}: ${
            invoice.invoiceNumber
          } - ${returnReason || "Customer return"}${
            isPartialReturn
              ? ` (Partial: ${actualRefundAmount}/${totalRefundAmount})`
              : ""
          }`,
        });
      }
    }

    // 5. Adjust credit transactions if applicable (proportional for partial returns)
    if (
      payment.sellingPaymentType === "Credit" &&
      payment.payableAmountLater &&
      invoice.customerNumber
    ) {
      // Find person by ID if available, otherwise by customer number
      let person = null;
      if (invoice.entityData?._id) {
        person = await Person.findById(invoice.entityData._id);
      } else if (invoice.customerNumber) {
        person = await Person.findOne({
          number: invoice.customerNumber,
          userId: userId,
        });
      }

      if (person) {
        const originalCreditAmount = Number(payment.payableAmountLater || 0);
        const creditAmount = originalCreditAmount * refundRatio; // Proportional credit adjustment

        // Adjust credit - reduce givingCredit (customer owes us less)
        if (person.givingCredit > 0) {
          person.givingCredit = Math.max(0, person.givingCredit - creditAmount);
        }

        // Update status
        if (person.givingCredit === 0 && person.takingCredit === 0) {
          person.status = "Settled";
        } else if (person.givingCredit === 0) {
          person.status = "Payable";
        }

        await person.save();

        await CreditTransaction.create({
          userId,
          personId: person._id,
          givingCredit: -creditAmount,
          balanceAmount: person.givingCredit,
          description: `Invoice ${finalReturnStatus}: ${
            invoice.invoiceNumber
          } - Credit adjustment: ${creditAmount} (${originalCreditAmount} * ${(
            refundRatio * 100
          ).toFixed(2)}%) - ${returnReason || "Customer return"}`,
        });
      }
    }

    // 6. Update invoice record (only for SaleInvoice source)
    if (source === "SaleInvoice") {
      const invoiceDoc = await SaleInvoice.findById(id);

      if (invoiceDoc) {
        // Update return status and history
        // Only track IMEIs from current invoice in return history
        const returnHistoryEntry = {
          returnedAt: new Date(),
          returnReason: returnReason || "Customer return",
          returnStatus: finalReturnStatus,
          returnAmount: actualRefundAmount,
          returnedImeis: imeisFromCurrentInvoice, // Only current invoice IMEIs
          returnedImeisFromOtherInvoices:
            imeisFromOtherInvoices.length > 0
              ? imeisFromOtherInvoices
              : undefined, // Track other invoice IMEIs separately
          returnedAccessories: accessoriesToProcess.map((acc) => ({
            name: acc.name?._id || acc.name,
            quantity: acc.quantity,
          })),
        };

        // Update invoice fields
        invoiceDoc.isReturned =
          finalReturnStatus === "full-return"
            ? true
            : invoiceDoc.isReturned || false;
        invoiceDoc.returnStatus = finalReturnStatus;
        invoiceDoc.returnedAt =
          finalReturnStatus === "full-return"
            ? new Date()
            : invoiceDoc.returnedAt || new Date();
        invoiceDoc.returnReason = returnReason || "Customer return";

        // Remove returned IMEIs from invoice's phoneDetails.imei1 array
        if (
          invoiceDoc.phoneDetails &&
          invoiceDoc.phoneDetails.imei1 &&
          imeisFromCurrentInvoice.length > 0
        ) {
          const currentImei1 = Array.isArray(invoiceDoc.phoneDetails.imei1)
            ? invoiceDoc.phoneDetails.imei1
            : [invoiceDoc.phoneDetails.imei1];

          // Remove returned IMEIs
          invoiceDoc.phoneDetails.imei1 = currentImei1.filter(
            (imei) => !imeisFromCurrentInvoice.includes(String(imei))
          );

          // Also update imei2 if it exists
          if (invoiceDoc.phoneDetails.imei2) {
            const currentImei2 = Array.isArray(invoiceDoc.phoneDetails.imei2)
              ? invoiceDoc.phoneDetails.imei2
              : [invoiceDoc.phoneDetails.imei2];

            invoiceDoc.phoneDetails.imei2 = currentImei2.filter(
              (imei2, index) => {
                const correspondingImei1 = currentImei1[index];
                return !imeisFromCurrentInvoice.includes(
                  String(correspondingImei1)
                );
              }
            );
          }
        }

        // Remove returned accessories from invoice's accessories array and update pricing
        if (accessoriesToProcess.length > 0 && invoiceDoc.accessories) {
          const accessoriesToRemove = accessoriesToProcess.map((acc) => ({
            id: acc.name?._id || acc.name,
            quantity: acc.quantity,
          }));

          invoiceDoc.accessories = invoiceDoc.accessories
            .map((acc) => {
              const toRemove = accessoriesToRemove.find(
                (r) =>
                  (acc.name?._id || acc.name)?.toString() === r.id?.toString()
              );

              if (toRemove) {
                const remainingQuantity =
                  (acc.quantity || 0) - toRemove.quantity;
                if (remainingQuantity <= 0) {
                  return null; // Remove this accessory completely
                } else {
                  // Update quantity and recalculate total price for this accessory
                  acc.quantity = remainingQuantity;
                  acc.totalPrice = (acc.price || 0) * remainingQuantity;
                  return acc;
                }
              }
              return acc;
            })
            .filter(Boolean); // Remove null entries
        }

        // Update pricing based on returned items
        if (
          finalReturnStatus === "semi-return" &&
          (imeisFromCurrentInvoice.length > 0 ||
            accessoriesToProcess.length > 0)
        ) {
          // Recalculate salePrice based on remaining IMEIs (if any IMEIs returned)
          if (imeisFromCurrentInvoice.length > 0) {
            const remainingImeisCount =
              originalImeis.length - imeisFromCurrentInvoice.length;
            if (remainingImeisCount > 0 && originalImeis.length > 0) {
              const pricePerImei =
                (invoiceDoc.pricing?.salePrice || 0) / originalImeis.length;
              invoiceDoc.pricing.salePrice = pricePerImei * remainingImeisCount;

              // Calculate returned accessories value
              const returnedAccessoriesValue = accessoriesToProcess.reduce(
                (sum, acc) => {
                  const originalAcc = invoice.accessories?.find(
                    (a) =>
                      (a.name?._id || a.name)?.toString() ===
                      (acc.name?._id || acc.name)?.toString()
                  );
                  return (
                    sum +
                    (originalAcc?.price || acc.price || 0) * (acc.quantity || 0)
                  );
                },
                0
              );

              // Calculate returned IMEIs value
              const returnedImeisValue =
                pricePerImei * imeisFromCurrentInvoice.length;

              // Update total invoice (reduce by returned items value)
              const totalReturnedValue =
                returnedImeisValue + returnedAccessoriesValue;
              invoiceDoc.pricing.totalInvoice = Math.max(
                0,
                (invoiceDoc.pricing?.totalInvoice || 0) - totalReturnedValue
              );

              // Update profit (reduce by profit on returned items)
              const purchasePricePerImei =
                (invoiceDoc.pricing?.purchasePrice || 0) / originalImeis.length;
              const profitPerImei = pricePerImei - purchasePricePerImei;
              const returnedProfit =
                profitPerImei * imeisFromCurrentInvoice.length;

              // Calculate accessories profit reduction proportionally
              // Since we don't have cost per unit in invoice, calculate based on profit ratio
              const totalAccessoriesValue = (invoice.accessories || []).reduce(
                (sum, acc) => {
                  return sum + (acc.price || 0) * (acc.quantity || 0);
                },
                0
              );

              let returnedAccessoriesProfit = 0;
              if (totalAccessoriesValue > 0 && returnedAccessoriesValue > 0) {
                // Estimate profit reduction: assume accessories profit is proportional to their value
                // This is an approximation since we don't have exact cost data in invoice
                const accessoriesProfitRatio = invoiceDoc.pricing?.profit
                  ? returnedAccessoriesValue /
                    ((invoiceDoc.pricing?.salePrice || 0) +
                      totalAccessoriesValue)
                  : 0;
                returnedAccessoriesProfit =
                  (invoiceDoc.pricing?.profit || 0) * accessoriesProfitRatio;
              }

              // Update profit (reduce by profit on returned IMEIs and accessories)
              invoiceDoc.pricing.profit = Math.max(
                0,
                (invoiceDoc.pricing?.profit || 0) -
                  returnedProfit -
                  returnedAccessoriesProfit
              );
            }
          }

          // If only accessories returned (no IMEIs), update pricing accordingly
          if (
            imeisFromCurrentInvoice.length === 0 &&
            accessoriesToProcess.length > 0
          ) {
            // Calculate returned accessories value
            const returnedAccessoriesValue = accessoriesToProcess.reduce(
              (sum, acc) => {
                const originalAcc = invoice.accessories?.find(
                  (a) =>
                    (a.name?._id || a.name)?.toString() ===
                    (acc.name?._id || acc.name)?.toString()
                );
                return (
                  sum +
                  (originalAcc?.price || acc.price || 0) * (acc.quantity || 0)
                );
              },
              0
            );

            // Update total invoice (reduce by returned accessories value)
            invoiceDoc.pricing.totalInvoice = Math.max(
              0,
              (invoiceDoc.pricing?.totalInvoice || 0) - returnedAccessoriesValue
            );

            // Update profit proportionally for accessories
            const totalAccessoriesValue = (invoice.accessories || []).reduce(
              (sum, acc) => {
                return sum + (acc.price || 0) * (acc.quantity || 0);
              },
              0
            );

            let returnedAccessoriesProfit = 0;
            if (totalAccessoriesValue > 0 && returnedAccessoriesValue > 0) {
              const accessoriesProfitRatio =
                returnedAccessoriesValue / totalAccessoriesValue;
              // Estimate profit: assume accessories profit is proportional to accessories value
              const estimatedAccessoriesProfit =
                (invoiceDoc.pricing?.profit || 0) *
                (totalAccessoriesValue /
                  ((invoiceDoc.pricing?.salePrice || 0) +
                    totalAccessoriesValue || 1));
              returnedAccessoriesProfit =
                estimatedAccessoriesProfit * accessoriesProfitRatio;
            }

            invoiceDoc.pricing.profit = Math.max(
              0,
              (invoiceDoc.pricing?.profit || 0) - returnedAccessoriesProfit
            );
          }
        } else if (finalReturnStatus === "full-return") {
          // Clear IMEIs and accessories for full return
          if (invoiceDoc.phoneDetails) {
            invoiceDoc.phoneDetails.imei1 = [];
            invoiceDoc.phoneDetails.imei2 = [];
          }
          invoiceDoc.accessories = [];
          // Reset pricing to 0 or keep structure but set to 0
          invoiceDoc.pricing.salePrice = 0;
          invoiceDoc.pricing.totalInvoice = 0;
          invoiceDoc.pricing.profit = 0;
        }

        // Track returned IMEIs and accessories (only from current invoice)
        if (finalReturnStatus === "semi-return") {
          invoiceDoc.returnedImeis = [
            ...(invoiceDoc.returnedImeis || []),
            ...imeisFromCurrentInvoice, // Only track current invoice IMEIs
          ];
          invoiceDoc.returnedAccessories = [
            ...(invoiceDoc.returnedAccessories || []),
            ...accessoriesToProcess.map((acc) => ({
              name: acc.name?._id || acc.name,
              quantity: acc.quantity,
            })),
          ];
          invoiceDoc.returnAmount =
            (invoiceDoc.returnAmount || 0) + actualRefundAmount;
        } else {
          invoiceDoc.returnedImeis = originalImeis;
          invoiceDoc.returnedAccessories = invoice.accessories || [];
          invoiceDoc.returnAmount = totalRefundAmount;
        }

        // Add to return history
        invoiceDoc.returnHistory = [
          ...(invoiceDoc.returnHistory || []),
          returnHistoryEntry,
        ];

        await invoiceDoc.save();
      }
    }

    res.status(200).json({
      success: true,
      message: `Invoice ${
        finalReturnStatus === "semi-return" ? "partially" : ""
      } returned successfully${
        imeisFromOtherInvoices.length > 0
          ? " (with IMEIs from related records)"
          : ""
      }`,
      data: {
        invoice:
          source === "SaleInvoice"
            ? await SaleInvoice.findById(id).populate("accessories.name")
            : invoice,
        returnStatus: finalReturnStatus,
        refundAmount: actualRefundAmount,
        totalInvoiceAmount: totalRefundAmount,
        returnedAt: new Date(),
        returnedImeis:
          imeisFromCurrentInvoice.length > 0
            ? imeisFromCurrentInvoice
            : undefined,
        returnedImeisFromOtherInvoices:
          imeisFromOtherInvoices.length > 0
            ? imeisFromOtherInvoices
            : undefined,
        returnedAccessories:
          accessoriesToProcess.length > 0 ? accessoriesToProcess : undefined,
        isPartialReturn: isPartialReturn,
        source: source,
        note:
          imeisFromOtherInvoices.length > 0
            ? `Refund calculated based on ${imeisFromCurrentInvoice.length} IMEI(s) from current invoice. ${imeisFromOtherInvoices.length} IMEI(s) from related records were also processed.`
            : undefined,
      },
    });
  } catch (error) {
    console.error("Error returning invoice:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Get detailed phone information by invoice number
exports.getPhoneDetailsByInvoiceNumber = async (req, res) => {
  try {
    const { invoiceNumber } = req.params;
    const userId = req.user.id;
    const candidateNumbers = normalizeInvoiceInput(invoiceNumber);

    // Find the invoice by invoice number
    let invoice = await SaleInvoice.findOne({
      invoiceNumber: { $in: candidateNumbers },
      userId,
    })
      .populate("payment.bankAccountUsed")
      .populate("entityData._id")
      .populate("references.purchasePhoneId")
      .populate("references.bulkPhonePurchaseId")
      .populate("references.singleSoldPhoneId")
      .populate("references.soldPhoneId")
      .populate("accessories.name")
      .populate("metadata.shopid");

    // Match dashboard "find invoice" with getInvoiceByNumber: also resolve by
    // SingleSoldPhone / SoldPhone when no SaleInvoice row exists.
    if (!invoice) {
      const singleSoldPhone = await SingleSoldPhone.findOne({
        invoiceNumber: { $in: candidateNumbers },
        userId,
      })
        .populate("purchasePhoneId")
        .populate("bankAccountUsed");

      if (singleSoldPhone) {
        invoice = {
          _id: singleSoldPhone._id,
          invoiceNumber: singleSoldPhone.invoiceNumber,
          saleType: "single",
          saleDate: singleSoldPhone.saleDate || singleSoldPhone.dateSold,
          customerName: singleSoldPhone.customerName,
          customerNumber: singleSoldPhone.customerNumber,
          cnicFrontPic: singleSoldPhone.cnicFrontPic,
          cnicBackPic: singleSoldPhone.cnicBackPic,
          pricing: {
            salePrice: singleSoldPhone.salePrice,
            totalInvoice: singleSoldPhone.totalInvoice,
            profit: singleSoldPhone.profit,
            purchasePrice: singleSoldPhone.purchasePrice,
          },
          payment: {
            sellingPaymentType: singleSoldPhone.sellingPaymentType,
            bankAccountUsed: singleSoldPhone.bankAccountUsed,
            accountCash: singleSoldPhone.accountCash,
            bankName: singleSoldPhone.bankName,
            pocketCash: singleSoldPhone.pocketCash,
            payableAmountNow: singleSoldPhone.payableAmountNow,
            payableAmountLater: singleSoldPhone.payableAmountLater,
            payableAmountLaterDate: singleSoldPhone.payableAmountLaterDate,
          },
          accessories: singleSoldPhone.accessories,
          entityData: {
            name: singleSoldPhone.customerName,
            number: singleSoldPhone.customerNumber,
          },
          references: {
            purchasePhoneId: singleSoldPhone.purchasePhoneId,
            singleSoldPhoneId: singleSoldPhone,
          },
          metadata: {
            shopid: singleSoldPhone.shopid,
          },
        };
      }
    }

    if (!invoice) {
      const soldPhone = await SoldPhone.findOne({
        invoiceNumber: { $in: candidateNumbers },
        userId,
      })
        .populate("bulkPhonePurchaseId")
        .populate("bankAccountUsed");

      if (soldPhone) {
        invoice = {
          _id: soldPhone._id,
          invoiceNumber: soldPhone.invoiceNumber,
          saleType: "bulk",
          saleDate: soldPhone.dateSold || soldPhone.saleDate,
          customerName: soldPhone.customerName,
          customerNumber: soldPhone.customerNumber,
          cnicFrontPic: soldPhone.cnicFrontPic,
          cnicBackPic: soldPhone.cnicBackPic,
          pricing: {
            salePrice: soldPhone.salePrice,
            totalInvoice: soldPhone.totalInvoice,
            profit: soldPhone.profit,
            purchasePrice: soldPhone.purchasePrice,
          },
          payment: {
            sellingPaymentType: soldPhone.sellingPaymentType,
            bankAccountUsed: soldPhone.bankAccountUsed,
            accountCash: soldPhone.accountCash,
            bankName: soldPhone.bankName,
            pocketCash: soldPhone.pocketCash,
            payableAmountNow: soldPhone.payableAmountNow,
            payableAmountLater: soldPhone.payableAmountLater,
            payableAmountLaterDate: soldPhone.payableAmountLaterDate,
          },
          accessories: soldPhone.accessories,
          entityData: {
            name: soldPhone.customerName,
            number: soldPhone.customerNumber,
          },
          references: {
            bulkPhonePurchaseId: soldPhone.bulkPhonePurchaseId,
            soldPhoneId: soldPhone,
          },
          metadata: {},
        };
      }
    }

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found",
      });
    }

    let phoneDetails = null;

    // Handle different sale types
    if (
      invoice.saleType === "single" &&
      invoice.references?.singleSoldPhoneId
    ) {
      // Single phone sale
      const singleSoldPhone = invoice.references.singleSoldPhoneId;
      const purchasePhone = invoice.references.purchasePhoneId;

      phoneDetails = {
        saleType: "single",
        phoneInfo: {
          companyName:
            singleSoldPhone.companyName || purchasePhone?.companyName,
          modelName: singleSoldPhone.modelName || purchasePhone?.modelName,
          color: singleSoldPhone.color || purchasePhone?.color,
          ramMemory: singleSoldPhone.ramMemory || purchasePhone?.ramMemory,
          batteryHealth:
            singleSoldPhone.batteryHealth || purchasePhone?.batteryHealth,
          specifications:
            singleSoldPhone.specifications || purchasePhone?.specifications,
          phoneCondition:
            singleSoldPhone.phoneCondition || purchasePhone?.phoneCondition,
          warranty: singleSoldPhone.warranty || purchasePhone?.warranty,
          imei1: singleSoldPhone.imei1 || purchasePhone?.imei1,
          imei2: singleSoldPhone.imei2 || purchasePhone?.imei2,
          phonePicture:
            singleSoldPhone.phonePicture || purchasePhone?.phonePicture,
          personPicture:
            singleSoldPhone.personPicture || purchasePhone?.personPicture,
        },
        saleInfo: {
          saleDate: singleSoldPhone.dateSold || invoice.saleDate,
          salePrice: singleSoldPhone.salePrice,
          totalInvoice: singleSoldPhone.totalInvoice,
          profit: singleSoldPhone.profit,
          customerName: singleSoldPhone.customerName || invoice.customerName,
          customerNumber:
            singleSoldPhone.customerNumber || invoice.customerNumber,
          cnicFrontPic: singleSoldPhone.cnicFrontPic,
          cnicBackPic: singleSoldPhone.cnicBackPic,
        },
        purchaseInfo: purchasePhone
          ? {
              purchaseDate: purchasePhone.date,
              purchasePrice: purchasePhone.price?.purchasePrice,
              finalPrice: purchasePhone.price?.finalPrice,
              demandPrice: purchasePhone.price?.demandPrice,
              fatherName: purchasePhone.fatherName,
              cnic: purchasePhone.cnic,
              mobileNumber: purchasePhone.mobileNumber,
              isApprovedFromEgadgets: purchasePhone.isApprovedFromEgadgets,
              eGadgetStatusPicture: purchasePhone.eGadgetStatusPicture,
            }
          : null,
        payment: invoice.payment,
        accessories: invoice.accessories,
        entityData: invoice.entityData,
        references: invoice.references,
      };
    } else if (invoice.saleType === "bulk" && invoice.references?.soldPhoneId) {
      // Bulk phone sale
      const soldPhone = invoice.references.soldPhoneId;
      const bulkPurchase = invoice.references.bulkPhonePurchaseId;

      // Get IMEI details
      let imeiDetails = [];
      if (soldPhone.imei1 && Array.isArray(soldPhone.imei1)) {
        // Multiple IMEIs in this bulk sale
        for (const imei of soldPhone.imei1) {
          // Find the corresponding IMEI record to get full details
          const imeiRecord = await Imei.findOne({
            imei1: imei,
            status: { $in: ["Sold", "Available"] },
          }).populate({
            path: "ramSimId",
            populate: {
              path: "imeiNumbers",
            },
          });

          if (imeiRecord && imeiRecord.ramSimId) {
            imeiDetails.push({
              imei1: imei,
              imei2: soldPhone.imei2?.[soldPhone.imei1.indexOf(imei)] || null,
              ramSimId: imeiRecord.ramSimId._id,
              ramMemory: imeiRecord.ramSimId.ramMemory,
              color: imeiRecord.ramSimId.color,
              batteryHealth: imeiRecord.ramSimId.batteryHealth,
              specifications: imeiRecord.ramSimId.specifications,
              priceOfOne: imeiRecord.ramSimId.priceOfOne,
            });
          }
        }
      }

      phoneDetails = {
        saleType: "bulk",
        phoneInfo: {
          companyName: bulkPurchase?.companyName || soldPhone.companyName,
          modelName: bulkPurchase?.modelName || soldPhone.modelName,
          phoneCondition:
            soldPhone.phoneCondition || bulkPurchase?.phoneCondition,
          warranty: soldPhone.warranty,
          imeiDetails: imeiDetails,
          phonePicture: bulkPurchase?.phonePicture,
          personPicture: bulkPurchase?.personPicture,
        },
        saleInfo: {
          saleDate: soldPhone.dateSold || invoice.saleDate,
          salePrice: soldPhone.salePrice,
          totalInvoice: soldPhone.totalInvoice,
          profit: soldPhone.profit,
          customerName: soldPhone.customerName || invoice.customerName,
          customerNumber: soldPhone.customerNumber || invoice.customerNumber,
          cnicFrontPic: soldPhone.cnicFrontPic,
          cnicBackPic: soldPhone.cnicBackPic,
          quantity: soldPhone.imei1?.length || 1,
        },
        purchaseInfo: bulkPurchase
          ? {
              purchaseDate: bulkPurchase.date,
              totalPurchasePrice: bulkPurchase.prices?.buyingPrice,
              totalQuantity:
                bulkPurchase.ramSimDetails?.reduce(
                  (sum, ramSim) => sum + (ramSim.imeiNumbers?.length || 0),
                  0
                ) || 0,
              ramSimDetails: bulkPurchase.ramSimDetails,
              fatherName: bulkPurchase.fatherName,
              cnic: bulkPurchase.cnic,
              mobileNumber: bulkPurchase.mobileNumber,
              isApprovedFromEgadgets: bulkPurchase.isApprovedFromEgadgets,
              eGadgetStatusPicture: bulkPurchase.eGadgetStatusPicture,
            }
          : null,
        payment: invoice.payment,
        accessories: invoice.accessories,
        entityData: invoice.entityData,
        references: invoice.references,
      };
    } else if (invoice.saleType === "generic") {
      // Generic sale - use invoice data directly
      phoneDetails = {
        saleType: "generic",
        phoneInfo: invoice.phoneDetails || {},
        saleInfo: {
          saleDate: invoice.saleDate,
          customerName: invoice.customerName,
          customerNumber: invoice.customerNumber,
          cnicFrontPic: invoice.cnicFrontPic,
          cnicBackPic: invoice.cnicBackPic,
        },
        purchaseInfo: null, // No purchase info for generic sales
        payment: invoice.payment,
        accessories: invoice.accessories,
        entityData: invoice.entityData,
        references: invoice.references,
        pricing: invoice.pricing,
      };
    }

    // Build invoice object with all fields dashboard expects (for find-by-number)
    const invoicePayload = {
      id: invoice._id,
      _id: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      saleType: invoice.saleType,
      saleDate: invoice.saleDate,
      isReturned: invoice.isReturned,
      returnedAt: invoice.returnedAt,
      returnReason: invoice.returnReason,
      customerName: invoice.customerName || (phoneDetails?.saleInfo?.customerName),
      customerNumber: invoice.customerNumber || (phoneDetails?.saleInfo?.customerNumber),
      totalInvoice: invoice.pricing?.totalInvoice ?? phoneDetails?.saleInfo?.totalInvoice ?? phoneDetails?.pricing?.totalInvoice,
      finalPrice: invoice.pricing?.finalPrice ?? invoice.pricing?.totalInvoice,
      pricing: invoice.pricing,
      phoneDetails: invoice.phoneDetails,
    };

    res.status(200).json({
      success: true,
      message: "Phone details retrieved successfully",
      data: {
        invoice: invoicePayload,
        phoneDetails: phoneDetails,
      },
    });
  } catch (error) {
    console.error("Error fetching phone details by invoice:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Get invoice statistics
exports.getInvoiceStatistics = async (req, res) => {
  try {
    const userId = req.user.id;
    const { startDate, endDate } = req.query;

    const filter = { userId };
    if (startDate || endDate) {
      filter.saleDate = {};
      if (startDate) filter.saleDate.$gte = new Date(startDate);
      if (endDate) filter.saleDate.$lte = new Date(endDate);
    }

    const invoices = await SaleInvoice.find(filter).lean();

    const statistics = {
      totalInvoices: invoices.length,
      totalRevenue: invoices.reduce(
        (sum, inv) => sum + (inv.pricing?.totalInvoice || 0),
        0
      ),
      totalProfit: invoices.reduce(
        (sum, inv) => sum + (inv.pricing?.profit || 0),
        0
      ),
      totalCost: invoices.reduce(
        (sum, inv) => sum + (inv.pricing?.purchasePrice || 0),
        0
      ),
      bySaleType: {
        single: invoices.filter((inv) => inv.saleType === "single").length,
        bulk: invoices.filter((inv) => inv.saleType === "bulk").length,
        generic: invoices.filter((inv) => inv.saleType === "generic").length,
      },
      byPaymentType: {},
    };

    // Calculate payment type statistics
    invoices.forEach((inv) => {
      const paymentType = inv.payment?.sellingPaymentType || "Unknown";
      statistics.byPaymentType[paymentType] =
        (statistics.byPaymentType[paymentType] || 0) + 1;
    });

    res.status(200).json({
      success: true,
      message: "Statistics retrieved successfully",
      data: statistics,
    });
  } catch (error) {
    console.error("Error fetching statistics:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Get monthly sales sheet - all sales (single phone, bulk, accessory, generic) for a month as rows
exports.getMonthlySalesSheet = async (req, res) => {
  try {
    const userId = req.user.id;
    const { year, month } = req.query;

    const now = new Date();
    const y = year ? parseInt(year, 10) : now.getFullYear();
    const m = month ? parseInt(month, 10) : now.getMonth() + 1;

    const startDate = new Date(y, m - 1, 1);
    const endDate = new Date(y, m, 0, 23, 59, 59, 999);

    const filter = {
      userId,
      saleDate: { $gte: startDate, $lte: endDate },
    };

    const invoices = await SaleInvoice.find(filter)
      .populate("accessories.name")
      .sort({ saleDate: 1 })
      .lean();

    const rows = [];
    let totalRevenue = 0;
    const byCategory = { "Single Phone": 0, "Bulk Phones": 0, Generic: 0, Accessory: 0 };

    const safeNum = (v) => (typeof v === "number" && !Number.isNaN(v) ? v : 0);

    for (const inv of invoices) {
      const dateStr = inv.saleDate
        ? new Date(inv.saleDate).toISOString().split("T")[0]
        : "";
      const invNum = inv.invoiceNumber || "";

      const accessoryTotal = (inv.accessories || []).reduce(
        (sum, a) => sum + safeNum(a.totalPrice),
        0
      );
      const mainTotal = safeNum(inv.pricing?.totalInvoice) - accessoryTotal;

      const categoryLabel =
        inv.saleType === "single"
          ? "Single Phone"
          : inv.saleType === "bulk"
          ? "Bulk Phones"
          : "Generic";

      const description =
        inv.phoneDetails?.modelName ||
        inv.phoneDetails?.companyName ||
        (inv.saleType === "bulk" ? "Bulk sale" : "Sale");

      rows.push({
        date: dateStr,
        invoiceNumber: invNum,
        category: categoryLabel,
        description: description || "—",
        quantity: 1,
        unitPrice: mainTotal,
        total: mainTotal,
      });
      if (mainTotal > 0) {
        byCategory[categoryLabel] = (byCategory[categoryLabel] || 0) + 1;
      }
      totalRevenue += mainTotal;

      (inv.accessories || []).forEach((acc) => {
        const name = acc.name?.name || acc.name?.title || "Accessory";
        const qty = safeNum(acc.quantity) || 1;
        const accTotal = safeNum(acc.totalPrice);
        const unitPrice = qty ? accTotal / qty : accTotal;
        rows.push({
          date: dateStr,
          invoiceNumber: invNum,
          category: "Accessory",
          description: name,
          quantity: qty,
          unitPrice: Math.round(unitPrice * 100) / 100,
          total: accTotal,
        });
        byCategory.Accessory = (byCategory.Accessory || 0) + 1;
        totalRevenue += accTotal;
      });
    }

    res.status(200).json({
      success: true,
      message: "Monthly sales sheet retrieved successfully",
      data: {
        rows,
        summary: {
          totalRevenue,
          totalInvoices: invoices.length,
          byCategory,
          month: m,
          year: y,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching monthly sales sheet:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};
