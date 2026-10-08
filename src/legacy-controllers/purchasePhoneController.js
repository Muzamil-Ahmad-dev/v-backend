 const multer = require("multer");
const {
  Imei,
  RamSim,
  BulkPhonePurchase,
  PurchasePhone,
  SoldPhone,
  SingleSoldPhone,
  Dispatch,
} = require("../schema/purchasePhoneSchema");
const { default: mongoose } = require("mongoose");
const { generateInvoiceNumberForUser } = require("../services/invoiceGenerator");
const { createSaleInvoice } = require("./saleInvoiceController");

/** Sale Mobile sends `#12345` (hash + five digits). Used instead of incremental generator when valid. */
function normalizeClientSaleInvoiceNumber(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const m = s.match(/^#(\d{5})$/);
  return m ? `#${m[1]}` : null;
}

// Migration function to add status field to existing documents
const migrateExistingDocuments = async () => {
  try {
    // Update PurchasePhone documents without status field
    await PurchasePhone.updateMany(
      { status: { $exists: false } },
      { $set: { status: "Available" } }
    );

    // Update Imei documents without status field
    await Imei.updateMany(
      { status: { $exists: false } },
      { $set: { status: "Available" } }
    );

    console.log(
      "Migration completed: Added status field to existing documents"
    );
  } catch (error) {
    console.error("Migration error:", error);
  }
};

// Helper function to update bulk purchase status based on IMEI availability
const updateBulkPurchaseStatus = async (bulkPurchaseId) => {
  try {
    const bulkPurchase = await BulkPhonePurchase.findById(
      bulkPurchaseId
    ).populate({
      path: "ramSimDetails",
      populate: { path: "imeiNumbers" },
    });

    if (!bulkPurchase) return;

    let totalImeis = 0;
    let soldImeis = 0;

    for (const ramSim of bulkPurchase.ramSimDetails) {
      for (const imei of ramSim.imeiNumbers) {
        totalImeis++;
        if (imei.status === "Sold") {
          soldImeis++;
        }
      }
    }

    if (totalImeis === 0) {
      bulkPurchase.status = "Available";
    } else if (soldImeis === 0) {
      bulkPurchase.status = "Available";
    } else if (soldImeis === totalImeis) {
      bulkPurchase.status = "Sold";
    } else {
      bulkPurchase.status = "Partially Sold";
    }

    await bulkPurchase.save();
  } catch (error) {
    console.error("Error updating bulk purchase status:", error);
  }
};

// Helper function to create invoice from sale data
const createInvoiceFromSale = async (userId, saleData) => {
  try {
    // High-level log whenever invoice creation flow is triggered from any sale path
    console.log("🧾 [Sale] createInvoiceFromSale called:", {
      userId,
      saleType: saleData?.saleType,
      invoiceNumber: saleData?.invoiceNumber,
      saleDate: saleData?.saleDate,
      customerNumber: saleData?.customerNumber,
      references: {
        purchasePhoneId: saleData?.purchasePhoneId,
        bulkPhonePurchaseId: saleData?.bulkPhonePurchaseId,
        singleSoldPhoneId: saleData?.singleSoldPhoneId,
        soldPhoneId: saleData?.soldPhoneId,
      },
    });

    const accessoryRows = Array.isArray(saleData.accessories)
      ? saleData.accessories
      : [];
    const accessoryIds = accessoryRows
      .map((acc) => acc?.name || acc?.accessoryId || acc?._id)
      .filter((id) => mongoose.Types.ObjectId.isValid(String(id)));

    let accessoryNameById = {};
    if (accessoryIds.length > 0) {
      const accessoryDocs = await Accessory.find({
        _id: { $in: accessoryIds },
        userId,
      })
        .select("accessoryName name title")
        .lean();

      accessoryNameById = accessoryDocs.reduce((acc, item) => {
        const id = String(item._id);
        acc[id] = item.accessoryName || item.name || item.title || "Accessory";
        return acc;
      }, {});
    }

    const invoiceData = {
      userId,
      saleType: saleData.saleType || "generic",
      // Reuse existing sale invoice number when provided by calling flow.
      // Generate only when caller didn't provide one.
      invoiceNumber:
        saleData.invoiceNumber || (await generateInvoiceNumberForUser(userId)),
      saleDate: saleData.saleDate || new Date(),
      customerName: saleData.customerName,
      customerNumber: saleData.customerNumber,
      cnicFrontPic: saleData.cnicFrontPic,
      cnicBackPic: saleData.cnicBackPic,
      phoneDetails: {
        imei1: saleData.imei1,
        imei2: saleData.imei2,
        companyName: saleData.companyName,
        modelName: saleData.modelName,
        color: saleData.color,
        ramMemory: saleData.ramMemory,
        batteryHealth: saleData.batteryHealth,
        simOption: saleData.simOption,
        specifications: saleData.specifications,
        phoneCondition: saleData.phoneCondition,
        warranty: saleData.warranty,
      },
      pricing: {
        salePrice: Number(saleData.salePrice) || 0,
        purchasePrice: Number(saleData.purchasePrice) || 0,
        totalInvoice: (() => {
          // If totalInvoice is provided, use it; otherwise calculate from salePrice + accessories
          if (
            saleData.totalInvoice !== undefined &&
            saleData.totalInvoice !== null
          ) {
            return Number(saleData.totalInvoice) || 0;
          }
          // Calculate totalInvoice from salePrice + accessories
          const salePrice = Number(saleData.salePrice) || 0;
          const accessoriesTotal = (saleData.accessories || []).reduce(
            (sum, acc) => {
              const qty = Number(acc.quantity) || Number(acc.quantity) || 1;
              const price = Number(acc.price) || Number(acc.perPiecePrice) || 0;
              return sum + qty * price;
            },
            0
          );
          return salePrice + accessoriesTotal;
        })(),
        profit: (() => {
          // Recalculate profit if totalInvoice was recalculated
          const salePrice = Number(saleData.salePrice) || 0;
          const purchasePrice = Number(saleData.purchasePrice) || 0;
          const accessoriesTotal = (saleData.accessories || []).reduce(
            (sum, acc) => {
              const qty = Number(acc.quantity) || 1;
              const price = Number(acc.price) || Number(acc.perPiecePrice) || 0;
              return sum + qty * price;
            },
            0
          );
          const totalInvoice = salePrice + accessoriesTotal;
          return totalInvoice - purchasePrice;
        })(),
        demandPrice: saleData.demandPrice
          ? Number(saleData.demandPrice)
          : undefined,
        finalPrice: saleData.finalPrice
          ? Number(saleData.finalPrice)
          : undefined,
      },
      payment: {
        sellingPaymentType: saleData.sellingPaymentType,
        // Normalize potential empty-string IDs to undefined so Mongoose doesn't try to cast ""
        bankAccountUsed: saleData.bankAccountUsed || undefined,
        accountCash: Number(saleData.accountCash) || 0,
        bankName: saleData.bankName || undefined,
        pocketCash: Number(saleData.pocketCash) || 0,
        payableAmountNow:
          saleData.payableAmountNow !== undefined &&
          saleData.payableAmountNow !== null
            ? Number(saleData.payableAmountNow) || 0
            : undefined,
        payableAmountLater:
          saleData.payableAmountLater !== undefined &&
          saleData.payableAmountLater !== null
            ? Number(saleData.payableAmountLater) || 0
            : undefined,
        payableAmountLaterDate: saleData.payableAmountLaterDate
          ? new Date(saleData.payableAmountLaterDate)
          : undefined,
        exchangePhoneDetail: saleData.exchangePhoneDetail || undefined,
      },
      accessories: (() => {
        // Ensure accessories are properly formatted
        const accs = accessoryRows;
        return accs.map((acc) => ({
          name: acc.name || acc.accessoryId || acc._id,
          accessoryName:
            acc.accessoryName ||
            acc.title ||
            accessoryNameById[String(acc.name || acc.accessoryId || acc._id)] ||
            "Accessory",
          accessoryNameNewField:
            acc.accessoryNameNewField ||
            acc.accessoryName ||
            acc.title ||
            accessoryNameById[String(acc.name || acc.accessoryId || acc._id)] ||
            "",
          quantity: Number(acc.quantity) || 1,
          price: Number(acc.price) || Number(acc.perPiecePrice) || 0,
          totalPrice:
            (Number(acc.quantity) || 1) *
            (Number(acc.price) || Number(acc.perPiecePrice) || 0),
        }));
      })(),
      entityData: saleData.entityData || {},
      references: {
        purchasePhoneId: saleData.purchasePhoneId,
        bulkPhonePurchaseId: saleData.bulkPhonePurchaseId,
        singleSoldPhoneId: saleData.singleSoldPhoneId,
        soldPhoneId: saleData.soldPhoneId,
      },
      metadata: {
        shopid: saleData.shopid || undefined,
        notes: saleData.notes || undefined,
        imeiPrices: (() => {
          // Ensure imeiPrices is properly formatted
          const ip = saleData.imeiPrices || [];
          if (Array.isArray(ip) && ip.length > 0) {
            return ip
              .map((item) => ({
                imei: String(item.imei || "").trim(),
                price: Number(item.price) || 0,
              }))
              .filter((item) => item.imei);
          }
          return [];
        })(),
      },
    };

    // Remove undefined values
    Object.keys(invoiceData).forEach((key) => {
      if (invoiceData[key] === undefined) {
        delete invoiceData[key];
      }
    });

    if (invoiceData.phoneDetails) {
      Object.keys(invoiceData.phoneDetails).forEach((key) => {
        if (invoiceData.phoneDetails[key] === undefined) {
          delete invoiceData.phoneDetails[key];
        }
      });
    }

    if (invoiceData.pricing) {
      Object.keys(invoiceData.pricing).forEach((key) => {
        if (invoiceData.pricing[key] === undefined) {
          delete invoiceData.pricing[key];
        }
      });
    }

    if (invoiceData.payment) {
      Object.keys(invoiceData.payment).forEach((key) => {
        if (invoiceData.payment[key] === undefined) {
          delete invoiceData.payment[key];
        }
      });
    }

    // Log the final cleaned invoice payload that will be persisted
    console.log("🧾 [Sale] createInvoiceFromSale - final invoiceData:", {
      userId: invoiceData.userId,
      saleType: invoiceData.saleType,
      invoiceNumber: invoiceData.invoiceNumber,
      saleDate: invoiceData.saleDate,
      customerNumber: invoiceData.customerNumber,
      totalInvoice: invoiceData.pricing?.totalInvoice,
      hasAccessories: Array.isArray(invoiceData.accessories)
        ? invoiceData.accessories.length
        : 0,
      references: invoiceData.references,
    });

    const createdInvoice = await createSaleInvoice(invoiceData);

    console.log("✅ [Sale] createInvoiceFromSale - invoice persisted:", {
      id: createdInvoice?._id?.toString?.(),
      invoiceNumber: createdInvoice?.invoiceNumber,
      saleType: createdInvoice?.saleType,
      userId: createdInvoice?.userId,
    });

    return createdInvoice;
  } catch (error) {
    console.error("❌ [Sale] Error creating invoice from sale:", {
      error,
      userId,
      saleType: saleData?.saleType,
      invoiceNumber: saleData?.invoiceNumber,
    });
    // Don't throw error - invoice creation failure shouldn't break the sale
    return null;
  }
};

// Migration endpoint to add status field to existing documents
exports.migrateStatusField = async (req, res) => {
  try {
    await migrateExistingDocuments();
    res.status(200).json({
      message:
        "Migration completed successfully. All existing documents now have status field.",
    });
  } catch (error) {
    console.error("Migration error:", error);
    res.status(500).json({
      message: "Migration failed",
      error: error.message,
    });
  }
};

const PartyLedger = require("../schema/PartyLedgerSchema");
const {
  AddBankAccount,
  BankTransaction,
} = require("../schema/BankAccountSchema");
const {
  PocketCashSchema,
  PocketCashTransactionSchema,
} = require("../schema/PocketCashSchema");
const {
  AccessoryTransaction,
  Accessory,
} = require("../schema/accessorySchema");
const {
  Person,
  CreditTransaction,
} = require("../schema/PayablesAndReceiveablesSchema");

exports.addPurchasePhone = async (req, res) => {
  const {
    name,
    fatherName,
    companyName,
    modelName,
    date,
    cnic,
    accessories,
    phoneCondition,
    specifications,
    ramMemory,
    batteryHealth,
    color,
    imei1,
    imei2,
    mobileNumber,
    isApprovedFromEgadgets,
    paymentType,
    payableAmountLater,
    payableAmountNow,
    paymentDate,
    purchasePrice,
    finalPrice,
    demandPrice,
    warranty,
    shopid,
    bankAccountUsed,
    pocketCash,
    accountCash,
    // New optional params to mirror bulk purchase API
    entityData,
    purchasePaymentType,
    creditPaymentData = {},
    imeiImage, // ✅ ADD: Image URL from Cloudinary
  } = req.body;

  // Handle uploaded files
  let cnicFrontPic = null;
  let cnicBackPic = null;

  if (req.files) {
    if (req.files.cnicFrontPic && req.files.cnicFrontPic[0]) {
      cnicFrontPic = req.files.cnicFrontPic[0].path;
    }
    if (req.files.cnicBackPic && req.files.cnicBackPic[0]) {
      cnicBackPic = req.files.cnicBackPic[0].path;
    }
  }

  try {
    console.log("This is name", name);
    // Create a new entry

    // Normalize possibly stringified JSON inputs
    let parsedCreditPaymentData = creditPaymentData;
    if (typeof parsedCreditPaymentData === "string") {
      try {
        parsedCreditPaymentData = JSON.parse(parsedCreditPaymentData);
      } catch (e) {
        parsedCreditPaymentData = {};
      }
    }

    let parsedEntityData = entityData;
    if (typeof parsedEntityData === "string") {
      try {
        parsedEntityData = JSON.parse(parsedEntityData);
      } catch (e) {
        parsedEntityData = {};
      }
    }

    let parsedAccessories = accessories;
    if (typeof parsedAccessories === "string") {
      try {
        parsedAccessories = JSON.parse(parsedAccessories);
      } catch (e) {
        // keep as-is if parsing fails
      }
    }

    // Coerce some primitives
    const normalizedPurchasePrice = Number(purchasePrice ?? 0);
    const normalizedIsApproved =
      typeof isApprovedFromEgadgets === "string"
        ? isApprovedFromEgadgets === "true"
        : Boolean(isApprovedFromEgadgets);

    const purchasePhone = new PurchasePhone({
      userId: req.user.id,
      shopid,
      warranty,
      name,
      fatherName: fatherName === "undefined" ? undefined : fatherName,
      companyName,
      modelName,
      date,
      cnic,
      cnicFrontPic,
      cnicBackPic,
      batteryHealth,
      accessories: parsedAccessories,
      phoneCondition,
      specifications,
      ramMemory,
      color,
      imei1,
      imei2,
      mobileNumber,
      imeiImage, // ✅ ADD: Save image URL
      price: {
        purchasePrice: normalizedPurchasePrice,
        finalPrice,
        demandPrice,
      },
      isApprovedFromEgadgets: normalizedIsApproved,
    });
    if (bankAccountUsed) {
      const bank = await AddBankAccount.findById(bankAccountUsed);
      if (!bank) return res.status(404).json({ message: "Bank not found" });

      // Deduct purchasePrice from accountCash
      bank.accountCash -= accountCash;
      await bank.save();

      // Log the transaction
      await BankTransaction.create({
        bankId: bank._id,
        userId: req.user.id,
        reasonOfAmountDeduction: `Purchase of mobile of company name: ${companyName} and model name: ${modelName}`,
        accountCash: accountCash,
        accountType: bank.accountType,
      });
    }
    if (pocketCash) {
      const pocketTransaction = await PocketCashSchema.findOne({
        userId: req.user.id,
      });
      if (!pocketTransaction) {
        return res
          .status(404)
          .json({ message: "Pocket cash account not found." });
      }

      if (pocketCash > pocketTransaction.accountCash) {
        return res.status(400).json({ message: "Insufficient pocket cash" });
      }

      pocketTransaction.accountCash -= pocketCash;
      await pocketTransaction.save();

      await PocketCashTransactionSchema.create({
        userId: req.user.id,
        pocketCashId: pocketTransaction._id, // if you want to associate it
        amountDeducted: pocketCash,
        accountCash: pocketTransaction.accountCash, // ✅ add this line
        remainingAmount: pocketTransaction.accountCash,
        reasonOfAmountDeduction: `Purchase of ${phoneCondition} mobile of specs ${companyName} | ${modelName} from ${name} on ${purchasePrice}`,
        // sourceOfAmountAddition: "Payment for purchase",
      });
    }
    console.log("req", req.body);

    // Prefer new params if provided, fallback to legacy ones
    const resolvedPaymentType = purchasePaymentType || paymentType; // "full-payment" | "credit" | legacy "credit"
    const resolvedEntityName = parsedEntityData?.name || name;
    const resolvedEntityNumber =
      parsedEntityData?.number || Number(mobileNumber);

    // Build a concise summary similar to bulk flow
    const phoneSummary = `${companyName} ${modelName}${
      batteryHealth ? ` | Battery: ${batteryHealth}` : ""
    }${color ? ` | Color: ${color}` : ""}${
      ramMemory ? ` | RAM: ${ramMemory}` : ""
    }`.trim();

    // Validate credit amounts if credit flow triggered
    if (resolvedPaymentType === "credit") {
      const payableNow = Number(
        parsedCreditPaymentData?.payableAmountNow ?? payableAmountNow ?? 0
      );
      const payableLater = Number(
        parsedCreditPaymentData?.payableAmountLater ?? payableAmountLater ?? 0
      );
      const totalBuying = normalizedPurchasePrice;
      if (payableNow + payableLater !== totalBuying) {
        return res.status(400).json({
          message:
            "Invalid data: payable amounts (now + later) must equal purchase price",
        });
      }
    }

    // Find existing person strictly by number for this user
    let person = await Person.findOne({
      number: Number(resolvedEntityNumber),
      userId: req.user.id,
    });
    console.log("Person found:", person);
    const takingCredit = person ? Number(person.takingCredit || 0) : 0;
    console.log("payment type", resolvedPaymentType);

    const payableLaterResolved = Number(
      parsedCreditPaymentData?.payableAmountLater ?? payableAmountLater ?? 0
    );
    if (resolvedPaymentType === "credit") {
      console.log("====================================");
      console.log("Payment Type:", resolvedPaymentType);
      console.log(
        "Payable Amount Later:",
        parsedCreditPaymentData?.payableAmountLater ?? payableAmountLater
      );
      console.log(
        "Payable Amount Now:",
        parsedCreditPaymentData?.payableAmountNow ?? payableAmountNow
      );
      console.log(
        "Payment Date:",
        parsedCreditPaymentData?.dateOfPayment ?? paymentDate
      );
      console.log("====================================");
      // Use Person and CreditTransaction for receivables

      // Find or create the person (customer) by name and number

      if (!person) {
        person = await Person.create({
          userId: req.user.id,
          name: resolvedEntityName,
          number: Number(resolvedEntityNumber),
          reference: `Single Purchase: ${phoneSummary}`,
          takingCredit: payableLaterResolved,
          status: "Payable",
        });
      } else {
        person.takingCredit =
          Number(person.takingCredit || 0) + payableLaterResolved;
        person.status = "Payable";
        person.reference = `Single Purchase: ${phoneSummary}`;
        await person.save();
      }

      await CreditTransaction.create({
        userId: req.user.id,
        personId: person._id,
        balanceAmount: Number(takingCredit) + payableLaterResolved,
        takingCredit: payableLaterResolved,
        description: `Credit purchase of ${phoneSummary} by ${resolvedEntityName} - Amount: ${payableLaterResolved}`,
      });

      // Log the credit transaction
    }
    if (resolvedPaymentType === "full-payment") {
      // if (!person) {
      //   person = await Person.create({
      //     userId: req.user.id,
      //     name: resolvedEntityName,
      //     number: resolvedEntityNumber,
      //     reference: `Single Purchase: ${phoneSummary}`,
      //     takingCredit: 0,
      //     status: "Settled",
      //   });
      //   await CreditTransaction.create({
      //     userId: req.user.id,
      //     personId: person._id,
      //       balanceAmount:  0,
      //     takingCredit: 0,
      //     description: `Full payment purchase of ${phoneSummary} by ${resolvedEntityName} `,
      //   });
      // }
      // else {
      if (person) {
        await CreditTransaction.create({
          userId: req.user.id,
          personId: person._id,
          balanceAmount: Number(person.takingCredit),
          takingCredit: 0,
          description: `Full payment purchase of ${phoneSummary} by ${resolvedEntityName} `,
        });
      } else {
        console.log("no required entityData for full payment purchase");
      }
      // }
    }

    // Save to database
    const savedPhone = await purchasePhone.save();
    res.status(201).json({
      success: true,
      message: "Purchase phone slip created successfully!",
      data: {
        ...savedPhone.toObject(),
        cnicFrontPic: savedPhone.cnicFrontPic || null,
        cnicBackPic: savedPhone.cnicBackPic || null,
      },
    });
  } catch (error) {
    console.error("Error creating purchase phone slip:", error);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

// exports.sellSinglePhone = async (req, res) => {
//   try {
//     const { purchasePhoneId, customerName, cnicFrontPic, cnicBackPic, finalPrice, warranty,sellingPaymentType,accesssoryAmount,accesssoryName } = req.body;

//     console.log("Received Data:", req.body);

//     // Fetch the purchased phone details
//     const purchasedPhone = await PurchasePhone.findById(purchasePhoneId);
//     if (!purchasedPhone) {
//       return res.status(404).json({ message: "Purchased phone not found" });
//     }

//     console.log("Purchased Phone Data:", purchasedPhone);

//     // Ensure the phone is not already sold
//     if (purchasedPhone.isSold) {
//       return res.status(400).json({ message: "This phone is already sold" });
//     }

//     // Set warranty based on condition
//     const updatedWarranty = purchasedPhone.phoneCondition === "Used" ? warranty : "12 months";

//     // Ensure user ID exists
//     if (!req.user?.id) {
//       return res.status(401).json({ message: "Unauthorized: User ID missing" });
//     }

//     // Create a new sold phone entry
//     const soldPhone = new SingleSoldPhone({
//       purchasePhoneId,
//       userId: req.user.id,
//       shopid: purchasedPhone.shopid,
//       customerName,
//       cnicFrontPic,
//       cnicBackPic,
//       mobileNumber: purchasedPhone.mobileNumber,
//       name: purchasedPhone.name,
//       fatherName: purchasedPhone.fatherName,
//       companyName: purchasedPhone.companyName,
//       modelName: purchasedPhone.modelName,
//       purchaseDate: purchasedPhone.date,
//       saleDate: new Date(),
//       phoneCondition: purchasedPhone.phoneCondition,
//       warranty: updatedWarranty,
//       specifications: purchasedPhone.specifications,
//       ramMemory: purchasedPhone.ramMemory,
//       color: purchasedPhone.color,
//       imei1: purchasedPhone.imei1,
//       imei2: purchasedPhone.imei2,
//       phonePicture: purchasedPhone.phonePicture,
//       personPicture: purchasedPhone.personPicture,
//       accessories: purchasedPhone.accessories,
//       purchasePrice: purchasedPhone.price.purchasePrice,
//       finalPrice: finalPrice || purchasedPhone.price.finalPrice,
//       demandPrice: purchasedPhone.price.demandPrice,
//       isApprovedFromEgadgets: purchasedPhone.isApprovedFromEgadgets,
//       eGadgetStatusPicture: purchasedPhone.eGadgetStatusPicture,
//       sellingPaymentType,
//       accesssoryAmount,
//       accesssoryName,
//       invoiceNumber: "INV-" + new Date().getTime(),
//     });

//     // Validate the object before saving
//     const validationError = soldPhone.validateSync();
//     if (validationError) {
//       console.error("Validation Error:", validationError);
//       return res.status(400).json({ message: "Validation failed", error: validationError });
//     }

//     // Save the sold phone
//     await soldPhone.save();

//     // Mark purchased phone as sold and remove it
//     purchasedPhone.isSold = true;
//     purchasedPhone.soldDetails = soldPhone._id;
//     await PurchasePhone.findByIdAndDelete(purchasePhoneId); // Fixes deletion issue

//     res.status(201).json({ message: "Phone sold successfully", soldPhone });
//   } catch (error) {
//     console.error("Error selling phone:", error);
//     res.status(500).json({ message: "Internal server error", error });
//   }
// };
exports.sellSinglePhone = async (req, res) => {
  try {
    const {
      purchasePhoneId,
      customerName,
      customerNumber,
      saleDate,
      cnicFrontPic,
      cnicBackPic,
      finalPrice,
      warranty,
      salePrice,
      totalInvoice,
      sellingPaymentType,
      accessories,
      // accesssoryAmount,
      // accesssoryName,
      bankAccountUsed,
      pocketCash,
      accountCash,
      bankName,
      payableAmountNow,
      payableAmountLater,
      payableAmountLaterDate,
      exchangePhoneDetail,
    } = req.body;

    console.log("📱 [Sale][Single] sellSinglePhone called:", {
      userId: req.user?.id,
      purchasePhoneId,
      customerName,
      customerNumber,
      saleDate,
      salePrice,
      totalInvoice,
      sellingPaymentType,
      bankAccountUsed,
      pocketCash,
      accountCash,
    });

    console.log("Received Data:", req.body);
    // Fetch the purchased phone details
    const purchasedPhone = await PurchasePhone.findById(purchasePhoneId);
    if (!purchasedPhone) {
      return res.status(404).json({ message: "Purchased phone not found" });
    }

    console.log("Purchased Phone Data:", purchasedPhone);
    console.log("PurchasedPhone:", purchasedPhone);
    console.log("Company Name:", purchasedPhone.companyName);
    // Ensure the phone is not already sold
    if (purchasedPhone.isSold) {
      return res.status(400).json({ message: "This phone is already sold" });
    }
    if (bankAccountUsed) {
      const bank = await AddBankAccount.findById(bankAccountUsed);
      if (!bank) return res.status(404).json({ message: "Bank not found" });

      // Deduct purchasePrice from accountCash
      bank.accountCash += Number(accountCash);
      await bank.save();

      // Log the transaction
      await BankTransaction.create({
        bankId: bank._id,
        userId: req.user.id,
        sourceOfAmountAddition: `sale of mobile payment company name: ${purchasedPhone.companyName} and model name: ${purchasedPhone.modelName}`,
        accountCash: accountCash,
        accountType: bank.accountType,
      });
    }
    if (pocketCash) {
      const pocketTransaction = await PocketCashSchema.findOne({
        userId: req.user.id,
      });
      if (!pocketTransaction) {
        return res
          .status(404)
          .json({ message: "Pocket cash account not found." });
      }

      if (pocketCash > pocketTransaction.accountCash) {
        return res.status(400).json({ message: "Insufficient pocket cash" });
      }

      pocketTransaction.accountCash += Number(pocketCash);
      await pocketTransaction.save();

      await PocketCashTransactionSchema.create({
        userId: req.user.id,
        pocketCashId: pocketTransaction._id, // if you want to associate it
        amountDeducted: pocketCash,
        accountCash: pocketTransaction.accountCash, // ✅ add this line
        remainingAmount: pocketTransaction.accountCash,
        reasonOfAmountDeduction: `sale of mobile payment from company: ${purchasedPhone.companyName}, model: ${purchasedPhone.modelName}`,
        sourceOfAmountAddition: "Payment for mobile sale",
      });
    }

    // Set warranty based on condition
    const updatedWarranty =
      purchasedPhone.phoneCondition === "Used" ? warranty : "12 months";

    // Ensure user ID exists
    if (!req.user?.id) {
      return res.status(401).json({ message: "Unauthorized: User ID missing" });
    }

    // **Validate conditional fields based on sellingPaymentType**
    if (sellingPaymentType === "Bank" && !bankName) {
      return res
        .status(400)
        .json({ message: "Bank Name is required for Bank payment type." });
    }
    if (
      sellingPaymentType === "Credit" &&
      (!payableAmountNow || !payableAmountLater || !payableAmountLaterDate)
    ) {
      return res.status(400).json({
        message: "All credit payment fields (Now, Later, Date) are required.",
      });
    }
    if (sellingPaymentType === "Exchange" && !exchangePhoneDetail) {
      return res.status(400).json({
        message:
          "Exchange phone details are required for Exchange payment type.",
      });
    }
    console.log("accessories", accessories);
    const enrichedAccessories = [];
    if (accessories && accessories.length > 0) {
      for (const accessoryItem of accessories) {
        const accessory = await Accessory.findOne({
          _id: accessoryItem.name,
          userId: req.user.id,
        });

        if (!accessory) {
          return res.status(404).json({ message: "Accessory not found" });
        }

        if (Number(accessory.stock) < Number(accessoryItem.quantity)) {
          return res.status(400).json({ message: "Insufficient Inventory" });
        }

        const totalPrice =
          Number(accessoryItem.quantity) * Number(accessoryItem.price);

         const accessoryProfit =
          (Number(accessoryItem.price) - Number(accessory.perPiecePrice)) *
          Number(accessoryItem.quantity);

        await AccessoryTransaction.create({
          userId: req.user.id,
          accessoryId: accessoryItem.name,
          quantity: Number(accessoryItem.quantity),
          type: "sale",
          perPiecePrice: Number(accessoryItem.price),
          totalPrice,
          profit: accessoryProfit,
        });

        accessory.stock -= Number(accessoryItem.quantity);
        accessory.totalPrice -=
          Number(accessory.perPiecePrice) * Number(accessoryItem.quantity);
        accessory.profit += accessoryProfit;
        await accessory.save();

        const displayName =
          accessory.accessoryName ||
          accessoryItem.accessoryNameNewField ||
          accessoryItem.accessoryName ||
          "";
        enrichedAccessories.push({
          name: accessoryItem.name,
          accessoryName: displayName,
          accessoryNameNewField: displayName,
          quantity: Number(accessoryItem.quantity),
          price: Number(accessoryItem.price),
        });
      }
    }

    // Create a new sold phone entry
    const generatedInvoiceNumber = await generateInvoiceNumberForUser(
      req.user.id
    );
    const soldPhone = new SingleSoldPhone({
      purchasePhoneId,
      userId: req.user.id,
      shopid: purchasedPhone.shopid,
      customerName,
      customerNumber,
      saleDate,
      profit: Number(salePrice) - Number(purchasedPhone.price.purchasePrice),
      accessories: enrichedAccessories.length ? enrichedAccessories : accessories,
      cnicFrontPic,
      salePrice: salePrice,
      totalInvoice: totalInvoice,
      cnicBackPic,
      mobileNumber: purchasedPhone.mobileNumber,
      name: purchasedPhone.name,
      fatherName: purchasedPhone.fatherName,
      companyName: purchasedPhone.companyName,
      modelName: purchasedPhone.modelName,
      purchaseDate: purchasedPhone.date,
      phoneCondition: purchasedPhone.phoneCondition,
      warranty: updatedWarranty,
      specifications: purchasedPhone.specifications,
      ramMemory: purchasedPhone.ramMemory,
      color: purchasedPhone.color,
      imei1: purchasedPhone.imei1,
      imei2: purchasedPhone.imei2,
      phonePicture: purchasedPhone.phonePicture,
      personPicture: purchasedPhone.personPicture,
      // accessories: purchasedPhone.accessories,
      purchasePrice: purchasedPhone.price.purchasePrice,
      finalPrice: finalPrice || purchasedPhone.price.finalPrice,
      demandPrice: purchasedPhone.price.demandPrice,
      isApprovedFromEgadgets: purchasedPhone.isApprovedFromEgadgets,
      eGadgetStatusPicture: purchasedPhone.eGadgetStatusPicture,
      sellingPaymentType,
      // accesssoryAmount,
      // accesssoryName,
      bankName: sellingPaymentType === "Bank" ? bankName : undefined,
      payableAmountNow:
        sellingPaymentType === "Credit" ? payableAmountNow : undefined,
      payableAmountLater:
        sellingPaymentType === "Credit" ? payableAmountLater : undefined,
      payableAmountLaterDate:
        sellingPaymentType === "Credit" ? payableAmountLaterDate : undefined,
      exchangePhoneDetail:
        sellingPaymentType === "Exchange" ? exchangePhoneDetail : undefined,
      invoiceNumber: generatedInvoiceNumber,
    });
    // Handle payables/receivables if sellingPaymentType is "Credit"
    if (sellingPaymentType === "Credit") {
      // Use Person and CreditTransaction for receivables

      // Find or create the person (customer) by name and number
      let person = await Person.findOne({
        name: customerName,
        number: customerNumber,
        userId: req.user.id,
      });
      const currentGiveCreditAmount = person ? person.givingCredit : 0;

      if (!person) {
        person = await Person.create({
          userId: req.user.id,
          name: customerName,
          number: customerNumber,
          reference: "Phone Sale",
          givingCredit: Number(payableAmountLater),
          status: "Receivable",
        });
      } else {
        person.givingCredit =
          Number(person.givingCredit || 0) + Number(payableAmountLater);
        person.status = "Receivable";
        await person.save();
      }

      // Log the credit transaction
      await CreditTransaction.create({
        userId: req.user.id,
        personId: person._id,
        balanceAmount: currentGiveCreditAmount + Number(payableAmountLater),
        givingCredit: Number(payableAmountLater),
        description: `Credit sale of phone: ${purchasedPhone.companyName} ${purchasedPhone.modelName}`,
      });
    }
    // Validate the object before saving
    const validationError = soldPhone.validateSync();
    if (validationError) {
      console.error("Validation Error:", validationError);
      return res
        .status(400)
        .json({ message: "Validation failed", error: validationError });
    }

    // Save the sold phone
    await soldPhone.save();

    // Mark purchased phone as sold instead of deleting
    purchasedPhone.isSold = true;
    purchasedPhone.soldDetails = soldPhone._id;
    purchasedPhone.status = "Sold";
    await purchasedPhone.save();
    // Deduct IMEI from stock — mark the Imei document as Sold too
if (purchasedPhone.imei1) {
  await Imei.findOneAndUpdate(
    { imei1: purchasedPhone.imei1 },
    { status: "Sold" }
  );
}

    // Create invoice
    try {
      await createInvoiceFromSale(req.user.id, {
        saleType: "single",
        invoiceNumber: soldPhone.invoiceNumber,
        saleDate: saleDate || new Date(),
        customerName,
        customerNumber,
        cnicFrontPic,
        cnicBackPic,
        imei1: purchasedPhone.imei1,
        imei2: purchasedPhone.imei2,
        companyName: purchasedPhone.companyName,
        modelName: purchasedPhone.modelName,
        color: purchasedPhone.color,
        ramMemory: purchasedPhone.ramMemory,
        batteryHealth: purchasedPhone.batteryHealth,
        specifications: purchasedPhone.specifications,
        phoneCondition: purchasedPhone.phoneCondition,
        warranty: updatedWarranty,
        salePrice: Number(salePrice),
        purchasePrice: Number(purchasedPhone.price.purchasePrice),
        totalInvoice: Number(totalInvoice),
        profit: Number(salePrice) - Number(purchasedPhone.price.purchasePrice),
        demandPrice: purchasedPhone.price.demandPrice,
        finalPrice: finalPrice || purchasedPhone.price.finalPrice,
        sellingPaymentType,
        bankAccountUsed,
        accountCash,
        bankName: sellingPaymentType === "Bank" ? bankName : undefined,
        pocketCash,
        payableAmountNow:
          sellingPaymentType === "Credit" ? payableAmountNow : undefined,
        payableAmountLater:
          sellingPaymentType === "Credit" ? payableAmountLater : undefined,
        payableAmountLaterDate:
          sellingPaymentType === "Credit" ? payableAmountLaterDate : undefined,
        exchangePhoneDetail:
          sellingPaymentType === "Exchange" ? exchangePhoneDetail : undefined,
        accessories:
          enrichedAccessories.length > 0 ? enrichedAccessories : accessories || [],
        entityData: person
          ? {
              _id: person._id,
              name: customerName,
              number: customerNumber,
            }
          : {},
        purchasePhoneId: purchasedPhone._id,
        singleSoldPhoneId: soldPhone._id,
        shopid: purchasedPhone.shopid,
      });
    } catch (invoiceError) {
      console.error("Error creating invoice:", invoiceError);
      // Continue even if invoice creation fails
    }

    console.log("✅ [Sale][Single] Phone sold successfully:", {
      userId: req.user?.id,
      soldPhoneId: soldPhone._id?.toString?.(),
      purchasePhoneId: purchasedPhone._id?.toString?.(),
      invoiceNumber: soldPhone.invoiceNumber,
      salePrice,
      totalInvoice,
      sellingPaymentType,
    });

    res.status(201).json({ message: "Phone sold successfully", soldPhone });
  } catch (error) {
    console.error("Error selling phone:", error);
    res.status(500).json({ message: "Internal server error", error });
  }
};

exports.getAllSingleSoldPhones = async (req, res) => {
  try {
    const soldPhones = await SingleSoldPhone.find({ userId: req.user.id })
      .populate("userId", "name email") // Populate user details (optional)
      .populate({
        path: "purchasePhoneId",
        model: "PurchasePhone", // Explicitly specify the model
        select: "companyName modelName imei1 imei2 profit", // Select required fields
      }); // If needed, get original phone details

    if (!soldPhones || soldPhones.length === 0) {
      return res.status(404).json({ message: "No sold phones found" });
    }

    res.status(200).json({ success: true, soldPhones });
  } catch (error) {
    console.error("Error fetching sold phones:", error);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

////////get sold phone by id////////////
exports.getSingleSoldPhoneById = async (req, res) => {
  const { id } = req.params;

  try {
    const soldPhoneDetail = await SingleSoldPhone.findById(id);
    if (!soldPhoneDetail) {
      return res.status(404).json({ message: "Sold phone not found" });
    }
    if (!req.user.id || !req.user) {
      return res.status(404).json({ message: "Authenticate please" });
    }
    res.status(200).json({ success: true, soldPhoneDetail });
  } catch (error) {
    console.error("Error getting sold phone detail:", error);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

// get bulk sold phone by id
exports.getBulkSoldPhoneById = async (req, res) => {
  const { id } = req.params;
  try {
    const soldPhoneDetail = await SoldPhone.findById(id)
      .populate({
        path: "bulkPhonePurchaseId",
        populate: [
          {
            path: "ramSimDetails",
            populate: [
              {
                path: "imeiNumbers",
                model: "Imei",
              },
            ],
          },
          {
            path: "personId",
            model: "Person",
          },
          {
            path: "bankAccountUsed",
            model: "AddBankAccount",
          },
          {
            path: "pocketCash",
            model: "PocketCashTransaction",
          },
        ],
      })
      .populate("userId", "name email username role")
      .populate("bankAccountUsed")
      .populate("pocketCash");

    if (!soldPhoneDetail) {
      return res.status(404).json({ message: "Sold phone not found" });
    }
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: "Authenticate please" });
    }

    res.status(200).json({ success: true, soldPhoneDetail });
  } catch (error) {
    console.error("Error getting detail:", error);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

// Get all purchase phone slips or filtered results
exports.getPurchasePhoneByFilter = async (req, res) => {
  try {
    // Extract query parameters for filtering
    const {
      name,
      cnic,
      modelName,
      phoneCondition,
      specifications,
      isApprovedFromEgadgets,
      dateFrom,
      dateTo,
    } = req.query;

    // Build the filter object dynamically
    const filters = {};

    if (name) filters.name = new RegExp(name, "i"); // Case-insensitive search
    if (cnic) filters.cnic = cnic;
    if (modelName) filters.modelName = new RegExp(modelName, "i"); // Case-insensitive search
    if (phoneCondition) filters.phoneCondition = phoneCondition;
    if (specifications) filters.specifications = specifications;
    if (isApprovedFromEgadgets)
      filters.isApprovedFromEgadgets = isApprovedFromEgadgets === "true"; // Convert to boolean
    if (dateFrom || dateTo) {
      filters.date = {};
      if (dateFrom) filters.date.$gte = new Date(dateFrom); // Greater than or equal to
      if (dateTo) filters.date.$lte = new Date(dateTo); // Less than or equal to
    }

    // Query the database with filters
    const purchasePhones = await PurchasePhone.find(filters);

    // Respond with the results
    res.status(200).json({
      message: "Purchase phone slips retrieved successfully!",
      data: purchasePhones,
    });
  } catch (error) {
    console.error("Error fetching purchase phone slips:", error);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

exports.getAllPurchasePhone = async (req, res) => {
  try {
    // Fetch all purchase phone slips for the logged-in user
    const purchasePhones = await PurchasePhone.find({
      userId: req.user.id,
      $or: [
        { status: "Available" },
        { status: { $exists: false } }, // Include documents without status field (legacy data)
      ],
    }).populate("soldDetails");

    // Format the response to match the required structure
    const formattedPhones = purchasePhones.map((phone) => ({
      name: phone.name,
      _id: phone._id,
      images: phone.images || [],
      cnic: phone.cnic,
      modelName: phone.modelName,
      dispatch: phone.dispatch,
      batteryHealth: phone.batteryHealth || "",
      ramMemory: phone.ramMemory,
      mobileNumber: phone.mobileNumber,
      date: phone.date,
      price: {
        purchasePrice: phone.price.purchasePrice,
        finalPrice: phone.price.finalPrice,
        demandPrice: phone.price.demandPrice,
      },
      // accessories: [
      //   phone.accessories?.box ? "box" : null,
      //   phone.accessories?.charger ? "charger" : null,
      //   phone.accessories?.handFree ? "handFree" : null,
      // ].filter(Boolean),
      accessories: {
        box: phone.accessories.box,
        charger: phone.accessories.charger,
        handfree: phone.accessories.handFree,
      },
      // Ensure images field exists
      companyName: phone.companyName,
      specifications: phone.specifications,
      modelSpecifications: phone.modelName, // Assuming modelName is equivalent
      specs: `${phone.ramMemory} GB, ${phone.specifications}`, // Adjust as per actual field names
      phoneCondition: phone.phoneCondition,
      imei1: phone.imei1,
      imei2: phone.imei2 || "",
      demandPrice: phone.price?.demandPrice || 0,
      purchasePrice: phone.price?.purchasePrice || 0,
      finalPrice: phone.price?.finalPrice || 0,
      shopId: phone.shopid, // Ensure correct mapping
      color: phone.color,
      isSold: phone.isSold,
      warranty: phone.warranty,
      __v: phone.__v,
    }));

    res.status(200).json({
      message: "Phones retrieved successfully!",
      phones: formattedPhones,
    });
  } catch (error) {
    console.error("Error fetching all purchase phone slips:", error);
    res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};
exports.getAllPurchasePhones = async (req, res) => {
  try {
    // Fetch all single purchase phones
    const purchasePhones = await PurchasePhone.find({
      userId: req.user.id,
      $or: [
        { status: "Available" },
        { status: { $exists: false } }, // Include documents without status field (legacy data)
      ],
    }).populate("soldDetails");
    // Fetch all bulk purchased phones with RAM and IMEI details
    const bulkPhones = await BulkPhonePurchase.find({
      userId: req.user.id,
      status: { $in: ["Available", "Partially Sold"] },
    })
      .populate({
        path: "ramSimDetails",
        populate: {
          path: "imeiNumbers",
          match: { status: { $ne: "Sold" } }, // $ne = not eq
        },
      })
      .populate({
        path: "personId",
        model: "Person",
      });

    // Calculate total quantity of mobiles from bulk phones
    const bulkPhonesWithQuantity = bulkPhones.map((bulkPhone) => {
      const totalQuantity = bulkPhone.ramSimDetails.reduce((sum, ramSim) => {
        return sum + (ramSim.imeiNumbers ? ramSim.imeiNumbers.length : 0);
      }, 0);
      return { ...bulkPhone._doc, totalQuantity };
    });

    // Respond with structured data
    res.status(200).json({
      message: "All purchase phone slips retrieved successfully!",
      data: {
        singlePhones: purchasePhones,
        bulkPhones: bulkPhonesWithQuantity,
      },
    });
  } catch (error) {
    console.error("Error fetching all purchase phone slips:", error);
    res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Get a specific purchase phone slip by ID
exports.getPurchasePhoneById = async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch the document by ID
    const purchasePhone = await PurchasePhone.findById(id);

    if (!purchasePhone) {
      return res.status(404).json({ message: "Purchase phone slip not found" });
    }

    res.status(200).json({
      message: "Purchase phone slip retrieved successfully!",
      data: purchasePhone,
    });
  } catch (error) {
    console.error("Error fetching purchase phone slip by ID:", error);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

// Edit Purchase Phone Slip
// exports.updateSinglePurchasePhone = async (req, res) => {
//   console.log("Received data:", req.body)
//     try{
//       const {id} =  req.params;
//       const updateData = req.body;

//       const existingPhone = await PurchasePhone.findById(id);
//       if(!existingPhone) return res.status(404).json({message: "Phone not found"})
//         const updatedPhone = await PurchasePhone.findByIdAndUpdate(id, { $set: updateData }, { new: true, runValidators: true });
//         if (!updatedPhone) {
//           return res.status(404).json({ message: "Purchase phone slip not found" });
//         }
//       res.status(200).json({message: "Purchase Phone updated successfully", data: updatedPhone})
//     }catch(error){
//       console.error("Error updating purchase phone:", error);
//       res.status(500).json({ message: "Internal server error" });
//     }
// };
exports.updateSinglePurchasePhone = async (req, res) => {
  console.log("Received data:", req.body);
  try {
    const { id } = req.params;
    const { purchasePrice, finalPrice, demandPrice, ...restData } = req.body;

    // Convert string prices to numbers
    const price = {
      purchasePrice: Number(purchasePrice),
      finalPrice: finalPrice ? Number(finalPrice) : undefined,
      demandPrice: demandPrice ? Number(demandPrice) : undefined,
    };

    // Prepare update object with nested price
    const updateData = {
      ...restData,
      price,
    };

    const existingPhone = await PurchasePhone.findById(id);
    if (!existingPhone) {
      return res.status(404).json({ message: "Phone not found" });
    }

    const updatedPhone = await PurchasePhone.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!updatedPhone) {
      return res.status(404).json({ message: "Purchase phone slip not found" });
    }

    res.status(200).json({
      message: "Purchase Phone updated successfully",
      data: updatedPhone,
    });
  } catch (error) {
    console.error("Error updating purchase phone:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Delete Purchase Phone Slip
exports.deletePurchasePhone = async (req, res) => {
  try {
    const userId = req.user.id; // Extract from token (assuming middleware is used)
    const { id } = req.params;

    // Find the phone slip
    const deletedPhone = await PurchasePhone.findById(id);

    if (!deletedPhone) {
      return res.status(404).json({ message: "Purchase phone slip not found" });
    }

    // Check if the user is authorized (e.g., only the user who added it or an admin)
    if (deletedPhone.userId.toString() !== userId) {
      return res
        .status(403)
        .json({ message: "Unauthorized to delete this purchase phone slip" });
    }

    // Delete the document
    await PurchasePhone.findByIdAndDelete(id);

    res.status(200).json({
      message: "Purchase phone slip deleted successfully!",
      data: deletedPhone,
    });
  } catch (error) {
    console.error("Error deleting purchase phone slip:", error);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

// exports.addBulkPhones = async (req, res) => {
//   try {
//     console.log("Incoming Request Body:", req.body); // Debugging

//     const { partyName, date, companyName, modelName, ramSimDetails, prices,purchasePaymentStatus,purchasePaymentType,creditPaymentData={} } = req.body;
//   if(purchasePaymentType === "credit"){
//     if(Number(creditPaymentData.payableAmountNow) + Number(creditPaymentData.payableAmountLater) !== Number(prices.buyingPrice)){
//       return res.status(400).json({ message: "Invalid data: payable amount should be equal to buying price" });
//     }
//   }
//     if (!ramSimDetails || !Array.isArray(ramSimDetails)) {
//       return res.status(400).json({
//         message: "Invalid data: ramSimDetails must be an array and cannot be empty",
//       });
//     }

//     const party = await PartyLedger.findOne({ partyName }).select("_id").exec(); // Only fetch _id
//     if (!party) return { success: false, message: "Party not found" };

//     const bulkPhonePurchase = new BulkPhonePurchase({
//       partyLedgerId: party,
//       userId: req.user.id,
//       partyName,
//       date,
//       companyName,
//       modelName,
//       prices,
//       ramSimDetails: [],
//       purchasePaymentType,
//       purchasePaymentStatus,
//       ...(purchasePaymentType === "credit" && { creditPaymentData }),
//     });
//     const totalAmountPaid =
//     (Number(bulkPhonePurchase.creditPaymentData?.totalPaidAmount) || 0) +
//     (Number(bulkPhonePurchase.creditPaymentData?.payableAmountNow) || 0);

//   bulkPhonePurchase.creditPaymentData.totalPaidAmount = totalAmountPaid;
//     const savedBulkPhonePurchase = await bulkPhonePurchase.save();

//     if (ramSimDetails.length > 0 && typeof ramSimDetails[0] === "string") {
//       savedBulkPhonePurchase.ramSimDetails = ramSimDetails;
//     } else {
//       const ramSimData = await Promise.all(
//         ramSimDetails.map(async (ramSim) => {
//           const newRamSim = new RamSim({
//             ramMemory: ramSim.ramMemory,
//             simOption: ramSim.simOption,
//             priceOfOne: ramSim.priceOfOne,
//             bulkPhonePurchaseId: savedBulkPhonePurchase._id,
//           });

//           const savedRamSim = await newRamSim.save();

//           const imeiNumbers = await Promise.all(
//             (ramSim.imeiNumbers || []).map(async (imei) => {
//               const newImei = new Imei({
//                 imei1: imei.imei1,
//                 imei2: imei.imei2,
//                 ramSimId: savedRamSim._id,
//               });
//               return await newImei.save();
//             })
//           );

//           savedRamSim.imeiNumbers = imeiNumbers;
//           await savedRamSim.save();

//           return savedRamSim;
//         })
//       );

//       savedBulkPhonePurchase.ramSimDetails = ramSimData;
//     }

//     await savedBulkPhonePurchase.save();

//     res.status(201).json({
//       message: "Bulk Phone Purchase created successfully",
//       data: savedBulkPhonePurchase,
//     });
//   } catch (error) {
//     console.error("Error:", error); // Log error details
//     res.status(500).json({ message: "Error creating Bulk Phone Purchase", error: error.message });
//   }
// };

exports.addBulkPhones = async (req, res) => {
  try {
    console.log("Incoming Request Body:", req.body);

    const {
      // partyName,
      date,
      companyName,
      modelName,
      ramSimDetails,
      bankAccountUsed,
      amountFromPocket,
      amountFromBank,
      prices,
      purchasePaymentStatus,
      purchasePaymentType,
      creditPaymentData = {},
      entityData = {},
      imeiImageUrls = {}, // ✅ ADD: Receive image URLs from frontend
    } = req.body;
    const normalizedPrices = {
      buyingPrice: prices?.buyingPrice,
      dealerPrice: prices?.dealerPrice || undefined,
      lp: prices?.lp || undefined,
      lifting: prices?.lifting || undefined,
      promo: prices?.promo || undefined,
      activation: prices?.activation || undefined,
    };

    // Handle uploaded files for bulk purchase
    let cnicFrontPic = null;
    let cnicBackPic = null;

    if (req.files) {
      if (req.files.cnicFrontPic && req.files.cnicFrontPic[0]) {
        cnicFrontPic = req.files.cnicFrontPic[0].path;
      }
      if (req.files.cnicBackPic && req.files.cnicBackPic[0]) {
        cnicBackPic = req.files.cnicBackPic[0].path;
      }
    }
    let person;
    console.log("Received Data:", req.body);

    // Calculate total IMEI count for better descriptions
    const totalImeiCount =
      ramSimDetails?.reduce((total, ramSim) => {
        return total + (ramSim.imeiNumbers?.length || 0);
      }, 0) || 0;

    // Get companyName and modelName from ramSimDetails if not present at top level
    const firstRamSim = ramSimDetails?.[0];
    const effectiveCompanyName =
      companyName || firstRamSim?.companyName || "Unknown Company";
    const effectiveModelName =
      modelName || firstRamSim?.modelName || "Unknown Model";

    // Create a comprehensive phone summary for descriptions
    const phoneSummary = `${effectiveCompanyName} ${effectiveModelName} (${totalImeiCount} IMEIs)`;

    person = await Person.findOne({
      ...(!entityData.number && { _id: entityData._id }),
      // name: personData,
      ...(entityData.number && { number: entityData.number }),
      userId: req.user.id,
    });
    // const takingCredit = person.takingCredit;
    if (purchasePaymentType === "credit") {
      console.log("entityData", person);
      if (!person) {
        person = await Person.create({
          userId: req.user.id,
          name: entityData.name,
          number: entityData.number,
          reference: `Bulk Purchase: ${phoneSummary}`,
          takingCredit: Number(creditPaymentData.payableAmountLater),
          status: "Payable",
        });
        await CreditTransaction.create({
          userId: req.user.id,
          personId: person._id,
          balanceAmount: Number(creditPaymentData.payableAmountLater),
          takingCredit: Number(creditPaymentData.payableAmountLater),
          description: `Credit purchase of given amount is ${creditPaymentData.payableAmountLater} of ${phoneSummary} by ${entityData.name} - Amount: ${creditPaymentData.payableAmountLater}`,
        });
      } else {
        const currentTakingCredit =
          Number(person.takingCredit || 0) +
          Number(creditPaymentData.payableAmountLater);
        const currentGivingCredit = Number(person.givingCredit || 0);
        const currentAmount = Math.abs(
          Number(currentTakingCredit - currentGivingCredit)
        );

        const previousBalance = Number(person.takingCredit || 0);
        person.takingCredit =
          Number(person.takingCredit || 0) +
          Number(creditPaymentData.payableAmountLater);
        person.status = "Payable";

        Number(creditPaymentData.payableAmountLater);
        person.reference = `Bulk Purchase: ${phoneSummary}`;
        await person.save();
        await CreditTransaction.create({
          userId: req.user.id,
          personId: person._id,
          balanceAmount: Math.abs(currentAmount),
          takingCredit: Number(creditPaymentData.payableAmountLater),
          description: `Credit purchase of given amount is ${creditPaymentData.payableAmountLater} of ${phoneSummary} by ${entityData.name} - Amount: ${creditPaymentData.payableAmountLater}`,
        });
      }
      // Log the credit transaction
    }
    if (purchasePaymentType === "full-payment") {
      if (!person) {
        const newPerson = await Person.create({
          userId: req.user.id,
          name: entityData.name,
          number: entityData.number,
          reference: `Bulk Purchase: ${phoneSummary}`,
          takingCredit: 0,
          status: "Settled",
        });
        await CreditTransaction.create({
          userId: req.user.id,
          personId: newPerson._id,
          takingCredit: 0,
          balanceAmount: 0,
          description: `Full payment of ${phoneSummary} by ${
            entityData.name || newPerson.name
          } - Per piece: ${normalizedPrices.buyingPrice}, Total: ${normalizedPrices.buyingPrice}`,
        });
      } else {
        await CreditTransaction.create({
          userId: req.user.id,
          personId: person._id,
          takingCredit: 0,
          balanceAmount: Number(person.takingCredit),
          description: `Full payment of ${phoneSummary} by ${
            entityData.name || person.name
          } - Per piece: ${normalizedPrices.buyingPrice}, Total: ${normalizedPrices.buyingPrice}`,
        });
      }
    }

    // if (purchasePaymentType === "credit") {
    //   const total =
    //     Number(creditPaymentData.payableAmountNow) +
    //     Number(creditPaymentData.payableAmountLater);
    //   if (total !== Number(prices.buyingPrice)) {
    //     return res.status(400).json({
    //       message: "Invalid data: payable amount should equal buying price",
    //     });
    //   }
    // }

    if (!ramSimDetails || !Array.isArray(ramSimDetails)) {
      return res
        .status(400)
        .json({ message: "Invalid data: ramSimDetails must be an array" });
    }

    // const party = await PartyLedger.findOne({ partyName }).select("_id").exec();
    // if (!party)
    //   return res
    //     .status(404)
    //     .json({ success: false, message: "Party not found" });

    const bulkPhonePurchase = new BulkPhonePurchase({
      // partyLedgerId: party._id,
      userId: req.user.id,
      // partyName,
      date,
      companyName,
      ...(entityData._id || person?._id
        ? { personId: entityData._id || person._id }
        : {}),
      modelName,
      prices: normalizedPrices,
      purchasePaymentType,
      purchasePaymentStatus,
      ...(purchasePaymentType === "credit" && { creditPaymentData }),
      cnicFrontPic,
      cnicBackPic,
    });
    if (bankAccountUsed) {
      const bank = await AddBankAccount.findById(bankAccountUsed);
      if (!bank) return res.status(404).json({ message: "Bank not found" });

      // Deduct purchasePrice from accountCash
      bank.accountCash -= Number(amountFromBank);
      await bank.save();

      // Log the transaction
      await BankTransaction.create({
        bankId: bank._id,
        userId: req.user.id,
        reasonOfAmountDeduction: `Purchase of ${phoneSummary}`,
        accountCash: Number(amountFromBank),
        accountType: bank.accountType,
      });
    }
    if (amountFromPocket) {
      const pocketTransaction = await PocketCashSchema.findOne({
        userId: req.user.id,
      });
      if (!pocketTransaction) {
        return res
          .status(404)
          .json({ message: "Pocket cash account not found." });
      }

      if (amountFromPocket > pocketTransaction.accountCash) {
        return res.status(400).json({ message: "Insufficient pocket cash" });
      }

      pocketTransaction.accountCash -= Number(amountFromPocket);
      await pocketTransaction.save();

      await PocketCashTransactionSchema.create({
        userId: req.user.id,
        pocketCashId: pocketTransaction._id, // if you want to associate it
        amountDeducted: amountFromPocket,
        accountCash: pocketTransaction.accountCash, // ✅ add this line
        remainingAmount: pocketTransaction.accountCash,
        reasonOfAmountDeduction: `Purchase of ${phoneSummary}`,
        sourceOfAmountAddition: `Payment for purchase of ${phoneSummary}`,
      });
    }
    if (purchasePaymentType === "credit") {
      const totalPaid =
        (Number(creditPaymentData.totalPaidAmount) || 0) +
        Number(creditPaymentData.payableAmountNow || 0);
      bulkPhonePurchase.creditPaymentData.totalPaidAmount = totalPaid;
    }

    const savedBulkPhonePurchase = await bulkPhonePurchase.save();

    const ramSimData = await Promise.all(
      ramSimDetails.map(async (ramSim, ramSimIdx) => {
        const newRamSim = new RamSim({
          companyName: ramSim.companyName,
          modelName: ramSim.modelName,
          batteryHealth: ramSim.batteryHealth,
          ramMemory: ramSim.ramMemory,
          simOption: ramSim.simOption,
          specifications: ramSim.specifications,
          priceOfOne: ramSim.priceOfOne,
          bulkPhonePurchaseId: savedBulkPhonePurchase._id,
        });

        const savedRamSim = await newRamSim.save();
        console.log("[v0] Creating IMEIs for ramSim index:", ramSimIdx);
        console.log("[v0] imeiImageUrls received:", imeiImageUrls);
        
        const imeiNumbers = await Promise.all(
          (ramSim.imeiNumbers || []).map(async (imei) => {
            // ✅ GET: Image URL for this device index
            const imageUrl = imeiImageUrls[ramSimIdx] || null;
            
            const newImei = new Imei({
              imei1: imei.imei1,
              imei2: imei.imei2,
              color: imei.color,
              batteryHealth: imei.batteryHealth,
              imeiImage: imageUrl, // ✅ ADD: Save image URL from imeiImageUrls
              ramSimId: savedRamSim._id,
            });
            
            console.log("[v0] Created IMEI with image URL:", {
              imei1: imei.imei1,
              imageUrl: imageUrl
            });
            
            return await newImei.save();
          })
        );

        savedRamSim.imeiNumbers = imeiNumbers;
        await savedRamSim.save();
        return savedRamSim;
      })
    );

    savedBulkPhonePurchase.ramSimDetails = ramSimData;
    await savedBulkPhonePurchase.save();

    res.status(201).json({
      message: "Bulk Phone Purchase created successfully",
      data: savedBulkPhonePurchase,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      message: "Error creating Bulk Phone Purchase",
      error: error.message,
    });
  }
};

//updateBulkPhone
exports.updateBulkPhonePurchase = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      partyName,
      date,
      purchasePaymentType,
      purchasePaymentStatus,
      creditPaymentData,
      prices,
      ramSimDetails, // full objects
    } = req.body;
    const normalizedPrices = {
      buyingPrice: prices?.buyingPrice,
      dealerPrice: prices?.dealerPrice || undefined,
      lp: prices?.lp || undefined,
      lifting: prices?.lifting || undefined,
      promo: prices?.promo || undefined,
      activation: prices?.activation || undefined,
    };

    // 1. Update BulkPhonePurchase basic info
    const updatedBulkPurchase = await BulkPhonePurchase.findByIdAndUpdate(
      id,
      {
        partyName,
        date,
        purchasePaymentType,
        purchasePaymentStatus,
        creditPaymentData,
        prices: normalizedPrices,
      },
      { new: true, runValidators: true }
    );

    // 2. Handle ramSimDetails update
    const ramSimIds = [];

    for (const ramSim of ramSimDetails) {
      let ramSimDoc;

      if (ramSim._id) {
        ramSimDoc = await RamSim.findByIdAndUpdate(
          ramSim._id,
          {
            companyName: ramSim.companyName,
            modelName: ramSim.modelName,
            batteryHealth: ramSim.batteryHealth,
            ramMemory: ramSim.ramMemory,
            simOption: ramSim.simOption,
            specifications: ramSim.specifications,
            priceOfOne: ramSim.priceOfOne,
          },
          { new: true, runValidators: true }
        );
      } else {
        ramSimDoc = new RamSim({
          companyName: ramSim.companyName,
          modelName: ramSim.modelName,
          batteryHealth: ramSim.batteryHealth,
          ramMemory: ramSim.ramMemory,
          simOption: ramSim.simOption,
          specifications: ramSim.specifications,
          priceOfOne: ramSim.priceOfOne,
          bulkPhonePurchaseId: id,
        });
        await ramSimDoc.save();
      }

      // 3. Handle Imei creation/update
      const imeiIds = [];

      for (const imei of ramSim.imeiNumbers) {
        const imeiDoc = new Imei({
          imei1: imei.imei1,
          imei2: imei.imei2,
          ramSimId: ramSimDoc._id,
        });
        await imeiDoc.save();
        imeiIds.push(imeiDoc._id);
      }

      ramSimDoc.imeiNumbers = imeiIds;
      await ramSimDoc.save();

      ramSimIds.push(ramSimDoc._id);
    }

    updatedBulkPurchase.ramSimDetails = ramSimIds;
    await updatedBulkPurchase.save();

    res.status(200).json({
      message: "BulkPhonePurchase updated successfully",
      data: updatedBulkPurchase,
    });
  } catch (error) {
    console.error("Error updating BulkPhonePurchase:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Get all Bulk Phone Purchases
// router.get("/bulk-phone-purchase",
exports.getBulkPhone = async (req, res) => {
  try {
    const bulkPhonePurchases = await BulkPhonePurchase.find({
      userId: req.user.id,
    })
      .populate({
        path: "ramSimDetails",
        model: "RamSim",
        populate: {
          path: "imeiNumbers",
          model: "Imei",
        },
      })
      .populate("personId", "name number givingCredit takingCredit") // Populate person details
      .populate("bankAccountUsed", "bankName accountNumber") // Populate bank account details
      .populate("pocketCash", "amount description") // Populate pocket cash details
      .sort({ date: -1 }) // Sort by date, most recent first
      .lean();

    const updatedPurchases = bulkPhonePurchases.map((purchase) => {
      const creditAmount = Number(
        purchase?.creditPaymentData?.payableAmountLater || 0
      );
      const buyingPrice = Number(purchase?.prices?.buyingPrice || 0);

      const actualBuyingPrice = Math.round(
        creditAmount > 0 ? buyingPrice + creditAmount : buyingPrice
      );

      // Calculate comprehensive phone details
      let totalPhones = 0;
      let dispatchedPhones = 0;
      let availablePhones = 0;
      let soldPhones = 0;

      if (purchase.ramSimDetails && purchase.ramSimDetails.length > 0) {
        purchase.ramSimDetails.forEach((ramSim) => {
          if (ramSim.imeiNumbers && ramSim.imeiNumbers.length > 0) {
            totalPhones += ramSim.imeiNumbers.length;
            ramSim.imeiNumbers.forEach((imei) => {
              if (imei.isDispatched) {
                dispatchedPhones++;
              } else {
                availablePhones++;
              }
            });
          }
        });
      }

      // Calculate financial summary
      const totalBuyingPrice = Number(purchase?.prices?.buyingPrice || 0);
      const totalDealerPrice = Number(purchase?.prices?.dealerPrice || 0);
      const totalLifting = Number(purchase?.prices?.lifting || 0);
      const totalPromo = Number(purchase?.prices?.promo || 0);
      const totalActivation = Number(purchase?.prices?.activation || 0);

      return {
        ...purchase,
        dispatch: purchase.dispatch ?? false,
        actualBuyingPrice,
        // Phone statistics
        phoneStatistics: {
          totalPhones,
          dispatchedPhones,
          availablePhones,
          soldPhones,
        },
        // Financial summary
        financialSummary: {
          totalBuyingPrice,
          totalDealerPrice,
          totalLifting,
          totalPromo,
          totalActivation,
          creditAmount,
          actualBuyingPrice,
        },
        // Enhanced phone details
        phoneDetails:
          purchase.ramSimDetails?.map((ramSim) => ({
            companyName: ramSim.companyName,
            modelName: ramSim.modelName,
            ramMemory: ramSim.ramMemory,
            simOption: ramSim.simOption,
            specifications: ramSim.specifications || "",
            priceOfOne: ramSim.priceOfOne,
            batteryHealth: ramSim.batteryHealth,
            imeiCount: ramSim.imeiNumbers?.length || 0,
            imeiDetails:
              ramSim.imeiNumbers?.map((imei) => ({
                imei1: imei.imei1,
                imei2: imei.imei2,
                batteryHealth: imei.batteryHealth,
                color: imei.color,
                isDispatched: imei.isDispatched,
              })) || [],
          })) || [],
      };
    });

    res.status(200).json(updatedPurchases); // ✅ Don't wrap in `{}` — it’s already an array
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      message: "Error fetching Bulk Phone Purchases",
      error: error.message,
    });
  }
};

// Get Bulk Phone Purchase by ID
// router.get("/bulk-phone-purchase/:id",
exports.getBulkPhoneById = async (req, res) => {
  try {
    const { id } = req.params;
    const bulkPhonePurchase = await BulkPhonePurchase.findById(id).populate({
      path: "ramSimDetails",
      populate: { path: "imeiNumbers" },
    });
    if (!bulkPhonePurchase) {
      return res.status(404).json({ message: "Bulk Phone Purchase not found" });
    }
    res.status(200).json(bulkPhonePurchase);
  } catch (error) {
    res.status(500).json({
      message: "Error fetching Bulk Phone Purchase",
      error: error.message,
    });
  }
};

// Edit Bulk Phone Purchase by ID
// router.put("/bulk-phone-purchase/:id",
exports.updateBulkPhone = async (req, res) => {
  try {
    const { id } = req.params;
    const { partyName, date, companyName, modelName, prices } = req.body;

    const updatedBulkPhonePurchase = await BulkPhonePurchase.findByIdAndUpdate(
      id,
      { partyName, date, companyName, modelName, prices },
      { new: true }
    );

    if (!updatedBulkPhonePurchase) {
      return res.status(404).json({ message: "Bulk Phone Purchase not found" });
    }

    res.status(200).json({
      message: "Bulk Phone Purchase updated successfully",
      data: updatedBulkPhonePurchase,
    });
  } catch (error) {
    res.status(500).json({
      message: "Error updating Bulk Phone Purchase",
      error: error.message,
    });
  }
};

// Delete Bulk Phone Purchase by ID
// router.delete("/bulk-phone-purchase/:id",
exports.deleteBulkPhone = async (req, res) => {
  try {
    const { id } = req.params;
    const { imei } = req.query; // Get IMEI from query parameters
    const userId = req.user?.id; // Ensure userId exists

    // Find the BulkPhonePurchase document
    const bulkPhonePurchase = await BulkPhonePurchase.findById(id);
    if (!bulkPhonePurchase) {
      return res.status(404).json({ message: "Bulk Phone Purchase not found" });
    }

    // Check if the user is authorized to delete
    if (!bulkPhonePurchase.userId.equals(userId)) {
      return res
        .status(403)
        .json({ message: "Unauthorized to delete this bulk phone purchase" });
    }

    // If IMEI is provided, delete only that/those specific IMEI(s)
    if (imei) {
      // Find all RamSims associated with this bulk purchase
      const ramSimIds = bulkPhonePurchase.ramSimDetails;
      if (ramSimIds.length === 0) {
        return res
          .status(404)
          .json({ message: "No RamSim records found for this bulk purchase" });
      }

      // Support comma-separated IMEIs or single IMEI
      const imeiList = Array.isArray(imei)
        ? imei
        : imei
            .split(",")
            .map((i) => i.trim())
            .filter(Boolean);

      // Find all IMEIs that match the provided IMEI(s) based on imei1 only
      const imeiRecords = await Imei.find({
        imei1: { $in: imeiList },
        ramSimId: { $in: ramSimIds },
      });

      if (imeiRecords.length === 0) {
        return res
          .status(404)
          .json({ message: "No matching IMEIs found in this bulk purchase" });
      }

      // Group IMEI records by ramSimId to update each RamSim efficiently
      const ramSimUpdateMap = new Map();

      for (const imeiRecord of imeiRecords) {
        const ramSimId = imeiRecord.ramSimId.toString();
        if (!ramSimUpdateMap.has(ramSimId)) {
          ramSimUpdateMap.set(ramSimId, []);
        }
        ramSimUpdateMap.get(ramSimId).push(imeiRecord._id);
      }

      // Update each RamSim's imeiNumbers array
      for (const [ramSimId, imeiIdsToRemove] of ramSimUpdateMap.entries()) {
        const ramSim = await RamSim.findById(ramSimId);
        if (ramSim) {
          ramSim.imeiNumbers = ramSim.imeiNumbers.filter(
            (imeiId) => !imeiIdsToRemove.some((id) => id.equals(imeiId))
          );
          await ramSim.save();
        }
      }

      // Delete all matching IMEI records
      const imeiIdsToDelete = imeiRecords.map((record) => record._id);
      await Imei.deleteMany({ _id: { $in: imeiIdsToDelete } });

      const deletedCount = imeiRecords.length;
      return res.status(200).json({
        message: `${deletedCount} IMEI(s) deleted successfully from bulk purchase`,
        deletedCount,
      });
    }

    // If no IMEI provided, delete the entire bulk purchase (existing behavior)
    // Delete related RamSim and Imei records
    const ramSimIds = bulkPhonePurchase.ramSimDetails; // Array of RamSim IDs
    if (ramSimIds.length > 0) {
      await Imei.deleteMany({ ramSimId: { $in: ramSimIds } }); // Delete IMEIs linked to RamSims
      await RamSim.deleteMany({ _id: { $in: ramSimIds } }); // Delete RamSim records
    }

    // Delete the bulkPhonePurchase document
    await BulkPhonePurchase.findByIdAndDelete(id);

    res
      .status(200)
      .json({ message: "Bulk Phone Purchase deleted successfully" });
  } catch (error) {
    console.error("Error deleting Bulk Phone Purchase:", error);
    res.status(500).json({
      message: "Error deleting Bulk Phone Purchase",
      error: error.message,
    });
  }
};

// exports.sellPhonesFromBulk = async (req, res) => {
//   try {
//     const {
//       bankAccountUsed,
//       pocketCash,
//       accountCash,
//       bulkPhonePurchaseId,
//       imeiNumbers,
//       salePrice,
//       totalInvoice,
//       warranty,
//       customerName,
//       cnicBackPic,
//       dateSold,
//       customerNumber,
//       cnicFrontPic,
//       accessories,
//       sellingPaymentType,
//       bankName,
//       payableAmountNow,
//       payableAmountLater,
//       payableAmountLaterDate,
//       exchangePhoneDetail,
//     } = req.body;
//     console.log(bankAccountUsed, pocketCash, accountCash);

//     if (!salePrice || !warranty) {
//       return res
//         .status(400)
//         .json({ message: "Sale price and warranty are required" });
//     }

//     // Find the bulk phone purchase
//     const bulkPhonePurchase = await BulkPhonePurchase.findById(
//       bulkPhonePurchaseId
//     ).populate({
//       path: "ramSimDetails",
//       populate: {
//         path: "imeiNumbers",
//       },
//     });

//     if (!bulkPhonePurchase) {
//       return res.status(404).json({ message: "Bulk phone purchase not found" });
//     }

//     const soldPhones = [];

//     for (const imei of imeiNumbers) {
//       const ramSim = bulkPhonePurchase.ramSimDetails.find((ramSim) =>
//         ramSim.imeiNumbers.some(
//           (imeiRecord) => imeiRecord.imei1 === imei || imeiRecord.imei2 === imei
//         )
//       );

//       if (!ramSim) {
//         return res.status(404).json({
//           message: `Phone with IMEI ${imei} not found in this bulk purchase`,
//         });
//       }

//       const imeiRecord = ramSim.imeiNumbers.find(
//         (imeiRecord) => imeiRecord.imei1 === imei || imeiRecord.imei2 === imei
//       );
//       if (sellingPaymentType === "Bank" && !bankName) {
//         return res
//           .status(400)
//           .json({ message: "Bank Name is required for Bank payment type." });
//       }
//       if (
//         sellingPaymentType === "Credit" &&
//         (!payableAmountNow || !payableAmountLater || !payableAmountLaterDate)
//       ) {
//         return res.status(400).json({
//           message: "All credit payment fields (Now, Later, Date) are required.",
//         });
//       }
//       if (sellingPaymentType === "Exchange" && !exchangePhoneDetail) {
//         return res.status(400).json({
//           message:
//             "Exchange phone details are required for Exchange payment type.",
//         });
//       }

//       console.log("THis is bulk phone purchase id", bulkPhonePurchaseId);
//       // Create a new SoldPhone record
//       const soldPhone = new SoldPhone({
//         bulkPhonePurchaseId,
//         imei1: imeiRecord.imei1,
//         imei2: imeiRecord.imei2 || null,
//         salePrice,
//         totalInvoice,
//         accessories,
//         customerName,
//         profit:
//           Number(salePrice) - Number(bulkPhonePurchase.prices.buyingPrice),
//         customerNumber,
//         purchasePrice: bulkPhonePurchase.prices.buyingPrice,
//         dateSold,
//         cnicBackPic,
//         cnicFrontPic,
//         sellingPaymentType,
//         warranty,
//         userId: req.user.id,
//         invoiceNumber: invoiceGenerator(),
//         bankName: sellingPaymentType === "Bank" ? bankName : undefined,
//         payableAmountNow:
//           sellingPaymentType === "Credit" ? payableAmountNow : undefined,
//         payableAmountLater:
//           sellingPaymentType === "Credit" ? payableAmountLater : undefined,
//         payableAmountLaterDate:
//           sellingPaymentType === "Credit" ? payableAmountLaterDate : undefined,
//         exchangePhoneDetail:
//           sellingPaymentType === "Exchange" ? exchangePhoneDetail : undefined,
//       });

//       await soldPhone.save();
//       soldPhones.push(soldPhone);

//       // Remove IMEI from `Imei` collection
//       await Imei.findByIdAndDelete(imeiRecord._id);

//       // Update `ramSimDetails`
//       ramSim.imeiNumbers = ramSim.imeiNumbers.filter(
//         (record) => record._id.toString() !== imeiRecord._id.toString()
//       );
//       await ramSim.save();
//     }
//     console.log(
//       "check for bank and pocket cash",
//       bankAccountUsed,
//       pocketCash,
//       accountCash
//     );

//     if (bankAccountUsed) {
//       const bank = await AddBankAccount.findById(bankAccountUsed);
//       if (!bank) return res.status(404).json({ message: "Bank not found" });

//       // Deduct purchasePrice from accountCash
//       bank.accountCash += Number(accountCash);
//       await bank.save();

//       // Log the transaction
//       await BankTransaction.create({
//         bankId: bank._id,
//         userId: req.user.id,
//         sourceOfAmountAddition: `sale of bulk mobile ${imeiNumbers.length} number to customer: ${customerName}`,
//         accountCash: accountCash,
//         accountType: bank.accountType,
//       });
//     }
//     if (pocketCash) {
//       const pocketTransaction = await PocketCashSchema.findOne({
//         userId: req.user.id,
//       });
//       if (!pocketTransaction) {
//         return res
//           .status(404)
//           .json({ message: "Pocket cash account not found." });
//       }

//       if (pocketCash > pocketTransaction.accountCash) {
//         return res.status(400).json({ message: "Insufficient pocket cash" });
//       }

//       pocketTransaction.accountCash += Number(pocketCash);
//       await pocketTransaction.save();

//       await PocketCashTransactionSchema.create({
//         userId: req.user.id,
//         pocketCashId: pocketTransaction._id, // if you want to associate it
//         amountDeducted: pocketCash,
//         accountCash: pocketTransaction.accountCash, // ✅ add this line
//         remainingAmount: pocketTransaction.accountCash,
//         sourceOfAmountAddition: `Sale of bulk mobile ${imeiNumbers.length} number to customer: ${customerName}`,
//       });
//     }
//     if (accessories && accessories.length > 0) {
//       for (const accessoryItem of accessories) {
//         const accessory = await Accessory.findOne({
//           _id: accessoryItem.name,
//           userId: req.user.id,
//         });

//         if (!accessory) {
//           return res.status(404).json({ message: "Accessory not found" });
//         }

//         if (Number(accessory.stock) < Number(accessoryItem.quantity)) {
//           return res.status(400).json({ message: "Insufficient Inventory" });
//         }

//         const totalPrice =
//           Number(accessoryItem.quantity) * Number(accessoryItem.price);

//         await AccessoryTransaction.create({
//           userId: req.user.id,
//           accessoryId: accessoryItem.name,
//           quantity: Number(accessoryItem.quantity),
//           perPiecePrice: Number(accessoryItem.price),
//           totalPrice,
//         });

//         accessory.stock -= Number(accessoryItem.quantity);
//         accessory.totalPrice -=
//           Number(accessory.perPiecePrice) * Number(quantity);
//         accessory.profit +=
//           (Number(accessoryItem.price) - Number(accessory.perPiecePrice)) *
//           Number(accessoryItem.quantity);
//         await accessory.save();
//       }
//     }
//     // Reload the bulk purchase to ensure updates are reflected
//     const updatedBulkPhonePurchase = await BulkPhonePurchase.findById(
//       bulkPhonePurchaseId
//     ).populate("ramSimDetails");

//     // If no phones are left, delete the bulk purchase safely
//     if (
//       !updatedBulkPhonePurchase ||
//       updatedBulkPhonePurchase.ramSimDetails.every(
//         (ramSim) => ramSim.imeiNumbers.length === 0
//       )
//     ) {
//       await BulkPhonePurchase.findByIdAndDelete(bulkPhonePurchaseId);
//       return res.status(200).json({
//         message: "All phones sold. Bulk purchase deleted.",
//         soldPhones,
//       });
//     }

//     res.status(200).json({
//       message: "Phones sold successfully",
//       soldPhones,
//       statusUpdated: "Partial sale completed",
//     });
//   } catch (error) {
//     console.error("Error selling phones:", error);
//     res
//       .status(500)
//       .json({ message: "Error selling phones", error: error.message });
//   }
// };
 // UPDATED sellPhonesFromBulk function with:
// 1. Multiple IMEI support (from different RamSim groups)
// 2. Stock decrease - removes sold IMEIs from RamSim.imeiNumbers array
// 3. Proper cleanup when all IMEIs are sold

// Replace your existing sellPhonesFromBulk function (lines 2507-3180) with this:

exports.sellPhonesFromBulk = async (req, res) => {
  try {
    const {
      entityData,
      bankAccountUsed,
      pocketCash,
      accountCash,
      imeisWithPrices,
      bulkPhonePurchaseId,
      imeiNumbers,
      salePrice,
      totalInvoice,
      warranty,
      customerName,
      cnicBackPic,
      dateSold,
      customerNumber,
      cnicFrontPic,
      accessories,
      sellingPaymentType,
      bankName,
      payableAmountNow,
      payableAmountLater,
      payableAmountLaterDate,
      exchangePhoneDetail,
    } = req.body;

    console.log("📱 [Sale][Bulk] sellPhonesFromBulk called:", {
      userId: req.user?.id,
      bulkPhonePurchaseId,
      imeiCount: Array.isArray(imeiNumbers) ? imeiNumbers.length : 0,
      salePrice,
      totalInvoice,
      sellingPaymentType,
      bankAccountUsed,
      pocketCash,
      accountCash,
      customerName,
      customerNumber,
    });

    if (!bulkPhonePurchaseId) {
      return res.status(400).json({
        message: "Bulk Phone Purchase ID is required.",
      });
    }

    const bulkPhonePurchaseData = await BulkPhonePurchase.findById(
      bulkPhonePurchaseId
    );
    console.log("extracted data", bulkPhonePurchaseData);

    if (
      sellingPaymentType === "Credit" &&
      !payableAmountNow &&
      !payableAmountLater &&
      !payableAmountLaterDate
    ) {
      return res.status(400).json({
        message: "fill all credit data fields",
      });
    }

    if (entityData && !entityData._id && !entityData.number) {
      return res.status(400).json({
        message: "Either Entity ID or Number must be provided.",
      });
    }

    // Validation
    if (!salePrice || !warranty) {
      return res
        .status(400)
        .json({ message: "Sale price and warranty are required" });
    }

    if (!dateSold) {
      return res.status(400).json({
        message: "Date Sold is required.",
      });
    }

    // ============================================
    // UPDATED: Support multiple IMEI formats
    // ============================================
    // Normalize imeiNumbers - support both array and comma-separated string
    let normalizedImeiNumbers = [];
    if (Array.isArray(imeiNumbers)) {
      // Flatten in case of nested arrays and handle comma-separated values within array items
      for (const item of imeiNumbers) {
        if (typeof item === 'string' && item.includes(',')) {
          // Split comma-separated IMEIs
          const splitImeis = item.split(',').map(i => i.trim()).filter(Boolean);
          normalizedImeiNumbers.push(...splitImeis);
        } else if (typeof item === 'string') {
          normalizedImeiNumbers.push(item.trim());
        } else {
          normalizedImeiNumbers.push(item);
        }
      }
    } else if (typeof imeiNumbers === 'string') {
      // Handle comma-separated string input
      normalizedImeiNumbers = imeiNumbers.split(',').map(i => i.trim()).filter(Boolean);
    }

    // Remove duplicates
    normalizedImeiNumbers = [...new Set(normalizedImeiNumbers)];

    if (normalizedImeiNumbers.length === 0) {
      return res
        .status(400)
        .json({ message: "At least one IMEI must be provided" });
    }

    console.log("📱 [Sale][Bulk] Normalized IMEIs:", normalizedImeiNumbers);

    if (
      accessories &&
      accessories.length === 1 &&
      accessories[0].quantity === 0 &&
      !accessories[0].name &&
      !accessories[0].price
    ) {
      return res.status(400).json({
        message: "Accessory name and price must be provided if quantity is 0.",
      });
    }

    // Find the bulk phone purchase with all necessary data
    const bulkPhonePurchase = await BulkPhonePurchase.findById(
      bulkPhonePurchaseId
    ).populate({
      path: "ramSimDetails",
      populate: {
        path: "imeiNumbers",
      },
    });

    if (!bulkPhonePurchase) {
      return res.status(404).json({ message: "Bulk phone purchase not found" });
    }

    // Ensure we have the purchase data
    if (!bulkPhonePurchase.prices || !bulkPhonePurchase.prices.buyingPrice) {
      return res.status(400).json({
        message: "Bulk phone purchase is missing price information",
      });
    }

    // Validate payment type specific fields
    if (sellingPaymentType === "Bank" && !bankName) {
      return res
        .status(400)
        .json({ message: "Bank Name is required for Bank payment type." });
    }
    if (
      sellingPaymentType === "Credit" &&
      (!payableAmountNow || !payableAmountLater || !payableAmountLaterDate)
    ) {
      return res.status(400).json({
        message: "All credit payment fields (Now, Later, Date) are required.",
      });
    }
    if (sellingPaymentType === "Exchange" && !exchangePhoneDetail) {
      return res.status(400).json({
        message:
          "Exchange phone details are required for Exchange payment type.",
      });
    }

    console.log("check for entityData", entityData);

    const bulkPurchase = await BulkPhonePurchase.findById(
      bulkPhonePurchaseId
    ).populate({
      path: "ramSimDetails",
      populate: { path: "imeiNumbers" },
    });

    if (!bulkPurchase) throw new Error("Bulk purchase not found");

    // ============================================
    // UPDATED: Find phones across ALL RamSim groups
    // ============================================
    const phonesToBeSold = [];
    const imeiRecords = [];
    const imei1List = [];
    const imei2List = [];
    const ramSimsToUpdate = new Map(); // Track which RamSims need IMEI removal

    // Search for each IMEI across all RamSim groups
    for (const imei of normalizedImeiNumbers) {
      let found = false;

      for (const ramSim of bulkPurchase.ramSimDetails) {
        const imeiRecord = ramSim.imeiNumbers.find(
          (imeiDoc) =>
            (imeiDoc.imei1 === imei || imeiDoc.imei2 === imei) &&
            imeiDoc.status !== "Sold" // Don't allow selling already sold IMEIs
        );

        if (imeiRecord) {
          found = true;

          // Add to phones to be sold
          phonesToBeSold.push({
            color: imeiRecord.color || "not mentioned",
            batteryHealth: imeiRecord.batteryHealth || "not mentioned",
            modelName: ramSim.modelName,
            companyName: ramSim.companyName,
            ramMemory: ramSim.ramMemory,
            priceOfOne: ramSim.priceOfOne,
            ramSimId: ramSim._id,
            imeiRecordId: imeiRecord._id,
          });

          imeiRecords.push(imeiRecord);
          if (imeiRecord.imei1) imei1List.push(imeiRecord.imei1);
          if (imeiRecord.imei2) imei2List.push(imeiRecord.imei2);

          // Track RamSim for IMEI removal
          if (!ramSimsToUpdate.has(ramSim._id.toString())) {
            ramSimsToUpdate.set(ramSim._id.toString(), {
              ramSimId: ramSim._id,
              imeiIdsToRemove: [],
            });
          }
          ramSimsToUpdate.get(ramSim._id.toString()).imeiIdsToRemove.push(imeiRecord._id);

          break; // Found this IMEI, move to next
        }
      }

      if (!found) {
        // Check if it's already sold
        const alreadySoldImei = bulkPurchase.ramSimDetails.some((ramSim) =>
          ramSim.imeiNumbers.some(
            (imeiDoc) =>
              (imeiDoc.imei1 === imei || imeiDoc.imei2 === imei) &&
              imeiDoc.status === "Sold"
          )
        );

        if (alreadySoldImei) {
          return res.status(400).json({
            message: `IMEI ${imei} has already been sold`,
          });
        }

        return res.status(404).json({
          message: `Phone with IMEI ${imei} not found in this bulk purchase`,
        });
      }
    }

    console.log("📱 [Sale][Bulk] Found phones to sell:", phonesToBeSold.length);
    console.log("📱 [Sale][Bulk] RamSims to update:", ramSimsToUpdate.size);

    // Handle Person/Credit logic
    let person = null;
    if (entityData && (entityData._id || entityData.number)) {
      person = await Person.findOne({
        ...(!entityData.number && entityData._id && { _id: entityData._id }),
        ...(entityData.number && { number: entityData.number }),
        userId: req.user.id,
      });
    }
    const currentGiveCreditAmount = person ? person.givingCredit : 0;
    console.log("person found:", person);

    if (sellingPaymentType === "Credit") {
      if (!person) {
        person = await Person.create({
          userId: req.user.id,
          name: entityData.name,
          number: entityData.number,
          reference: "bulk category Sale",
          givingCredit: Number(payableAmountLater),
          status: "Receivable",
        });
      } else {
        person.givingCredit += Number(payableAmountLater);
        person.status = "Receivable";
        await person.save();
      }

      await CreditTransaction.create({
        userId: req.user.id,
        personId: person._id,
        givingCredit: Number(payableAmountLater),
        balanceAmount: currentGiveCreditAmount + Number(payableAmountLater),
        description: `Credit Sale: ${normalizedImeiNumbers.length} phones sold to ${
          entityData.name || person.name
        } || Credit: ${payableAmountLater} || Model: ${phonesToBeSold
          .map((phone) => phone.modelName)
          .join(", ")} || Company: ${phonesToBeSold
          .map((phone) => phone.companyName)
          .join(", ")} || Battery Health: ${phonesToBeSold
          .map((phone) => phone.batteryHealth)
          .join(", ")} || Color: ${phonesToBeSold
          .map((phone) => phone.color)
          .join(", ")}`,
      });
    }

    // Do NOT create a new entity if sellingPaymentType is "Full Payment"
    if (sellingPaymentType === "Full Payment") {
      if (person) {
        await CreditTransaction.create({
          userId: req.user.id,
          personId: person._id,
          balanceAmount: Number(person.givingCredit),
          givingCredit: 0,
          description: `Complete Payment of bulk category Sale: ${
            normalizedImeiNumbers.length
          } phones sold to ${
            entityData?.name || person.name
          } || Model: ${phonesToBeSold
            .map((phone) => phone.modelName)
            .join(", ")} || Company: ${phonesToBeSold
            .map((phone) => phone.companyName)
            .join(", ")} || Battery Health: ${phonesToBeSold
            .map((phone) => phone.batteryHealth)
            .join(", ")} || Color: ${phonesToBeSold
            .map((phone) => phone.color)
            .join(", ")}`,
        });
      } else {
        console.log(
          "No existing entity found for full payment sale, not creating new entity."
        );
      }
    }

    // Calculate total buying price for the sold IMEIs
    let totalBuyingPrice = 0;
    let profitDetails = [];
    let totalSellingPrice = 0;

    console.log("req.body", req.body);

    if (
      imeisWithPrices &&
      typeof imeisWithPrices === "object" &&
      Object.keys(imeisWithPrices).length > 0
    ) {
      // If imeisWithPrices is provided as an object, use it to calculate total buying price
      for (const [imeiKey, sellingPrice] of Object.entries(imeisWithPrices)) {
        const parsedImeis = String(imeiKey)
          .split("/")
          .map((s) => s.trim())
          .filter(Boolean);

        const imeiRecord = imeiRecords.find(
          (rec) =>
            parsedImeis.includes(rec.imei1) ||
            (rec.imei2 && parsedImeis.includes(rec.imei2))
        );

        let buyingPrice = 0;
        if (imeiRecord) {
          const ramSim = bulkPhonePurchase.ramSimDetails.find((rs) =>
            rs.imeiNumbers.some(
              (ir) => ir._id.toString() === imeiRecord._id.toString()
            )
          );
          if (ramSim && ramSim.priceOfOne) {
            buyingPrice = Number(ramSim.priceOfOne);
          } else if (
            bulkPhonePurchase.prices &&
            bulkPhonePurchase.prices.buyingPrice
          ) {
            buyingPrice =
              Number(bulkPhonePurchase.prices.buyingPrice) /
              (bulkPhonePurchase.ramSimDetails.reduce(
                (sum, rs) => sum + (rs.imeiNumbers ? rs.imeiNumbers.length : 0),
                0
              ) || 1);
          }
        }
        totalBuyingPrice += buyingPrice;
        totalSellingPrice += Number(sellingPrice);
        profitDetails.push({
          imei:
            parsedImeis.length > 0
              ? parsedImeis.join(" / ")
              : String(imeiKey).trim(),
          sellingPrice: Number(sellingPrice),
          buyingPrice,
          profit: Number(sellingPrice) - buyingPrice,
        });
      }
    } else {
      // If imeisWithPrices is not provided, calculate based on salePrice
      totalSellingPrice = Number(salePrice);
      const totalImeis = normalizedImeiNumbers.length;
      totalBuyingPrice =
        (Number(bulkPhonePurchase.prices.buyingPrice) /
          bulkPhonePurchase.ramSimDetails.reduce(
            (sum, rs) => sum + (rs.imeiNumbers ? rs.imeiNumbers.length : 0),
            0
          )) *
        totalImeis;

      profitDetails = normalizedImeiNumbers.map((imei) => ({
        imei,
        sellingPrice: Number(salePrice) / totalImeis,
        buyingPrice: totalBuyingPrice / totalImeis,
        profit: Number(salePrice) / totalImeis - totalBuyingPrice / totalImeis,
      }));
    }

    console.log("Total Buying Price:", totalBuyingPrice);
    console.log("Total Selling Price:", totalSellingPrice);
    console.log("Profit Details:", profitDetails);

    const totalProfit = profitDetails.reduce(
      (acc, detail) => acc + detail.profit,
      0
    );
    console.log("Total Profit:", totalProfit);
    console.log(req.body);
    console.log("Bulk Phone Purchase Data:", bulkPhonePurchaseData);

    // Handle accessories enrichment
    const enrichedBulkAccessories = [];
    if (accessories && accessories.length > 0) {
      for (const accessoryItem of accessories) {
        const accessory = await Accessory.findOne({
          _id: accessoryItem.name,
          userId: req.user.id,
        });
        if (!accessory) {
          return res.status(404).json({ message: "Accessory not found" });
        }
        const bulkAccDisplay =
          accessory.accessoryName ||
          accessoryItem.accessoryNameNewField ||
          accessoryItem.accessoryName ||
          "";
        enrichedBulkAccessories.push({
          name: accessoryItem.name,
          accessoryName: bulkAccDisplay,
          accessoryNameNewField: bulkAccDisplay,
          quantity: Number(accessoryItem.quantity),
          price: Number(accessoryItem.price),
        });
      }
    }

    // Create a single SoldPhone record for all IMEIs
    const generatedInvoiceNumber = await generateInvoiceNumberForUser(
      req.user.id
    );
    const soldPhone = new SoldPhone({
      bulkPhonePurchaseId: bulkPhonePurchaseData._id,
      imei1: imei1List,
      imei2: imei2List.length > 0 ? imei2List : null,
      salePrice,
      totalInvoice,
      accessories:
        enrichedBulkAccessories.length > 0
          ? enrichedBulkAccessories
          : accessories,
      customerName,
      profit: totalProfit,
      customerNumber,
      purchasePrice: Number(bulkPhonePurchase.prices.buyingPrice),
      dateSold,
      cnicBackPic,
      cnicFrontPic,
      sellingPaymentType,
      warranty,
      userId: req.user.id,
      invoiceNumber: generatedInvoiceNumber,
      bankName: sellingPaymentType === "Bank" ? bankName : undefined,
      payableAmountNow:
        sellingPaymentType === "Credit" ? payableAmountNow : undefined,
      payableAmountLater:
        sellingPaymentType === "Credit" ? payableAmountLater : undefined,
      payableAmountLaterDate:
        sellingPaymentType === "Credit" ? payableAmountLaterDate : undefined,
      exchangePhoneDetail:
        sellingPaymentType === "Exchange" ? exchangePhoneDetail : undefined,
      bankAccountUsed: bankAccountUsed || undefined,
    });

    await soldPhone.save();

    // ============================================
    // Mark IMEIs as Sold — keep reference in RamSim.imeiNumbers so
    // updateBulkPurchaseStatus can count sold vs total correctly.
    // DO NOT $pull from RamSim — that destroys the count.
    // ============================================
    console.log("📱 [Sale][Bulk] Marking IMEIs as Sold...");

   // In sellPhonesFromBulk, replace the mark-as-sold loop (around line 3005–3013):

// Mark by _id (existing)
for (const imeiRecord of imeiRecords) {
  await Imei.findByIdAndUpdate(imeiRecord._id, { status: "Sold" });
  console.log(`📱 [Sale][Bulk] Marked IMEI ${imeiRecord.imei1} as Sold`);
}

// ALSO mark by imei1 value as a fallback (add this):
if (imei1List.length > 0) {
  await Imei.updateMany(
    { imei1: { $in: imei1List } },
    { $set: { status: "Sold" } }
  );
}

await updateBulkPurchaseStatus(bulkPhonePurchase._id);

    // Create invoice
    try {
      const firstImeiRecord = imeiRecords[0];
      const firstRamSim = bulkPhonePurchase.ramSimDetails.find((rs) =>
        rs.imeiNumbers.some(
          (ir) => ir._id.toString() === firstImeiRecord._id.toString()
        )
      );

      await createInvoiceFromSale(req.user.id, {
        saleType: "bulk",
        invoiceNumber: soldPhone.invoiceNumber,
        saleDate: dateSold || new Date(),
        customerName,
        customerNumber,
        cnicFrontPic,
        cnicBackPic,
        imei1: imei1List,
        imei2: imei2List.length > 0 ? imei2List : undefined,
        companyName: firstRamSim?.companyName || bulkPhonePurchase.companyName,
        modelName: firstRamSim?.modelName || bulkPhonePurchase.modelName,
        color: firstImeiRecord.color,
        ramMemory: firstRamSim?.ramMemory,
        batteryHealth: firstImeiRecord.batteryHealth,
        simOption: firstRamSim?.simOption,
        warranty,
        salePrice: Number(salePrice),
        purchasePrice: Number(bulkPhonePurchase.prices.buyingPrice),
        totalInvoice: Number(totalInvoice),
        profit: totalProfit,
        sellingPaymentType,
        bankAccountUsed,
        accountCash,
        bankName: sellingPaymentType === "Bank" ? bankName : undefined,
        pocketCash,
        payableAmountNow:
          sellingPaymentType === "Credit" ? payableAmountNow : undefined,
        payableAmountLater:
          sellingPaymentType === "Credit" ? payableAmountLater : undefined,
        payableAmountLaterDate:
          sellingPaymentType === "Credit" ? payableAmountLaterDate : undefined,
        exchangePhoneDetail:
          sellingPaymentType === "Exchange" ? exchangePhoneDetail : undefined,
        accessories:
          enrichedBulkAccessories.length > 0
            ? enrichedBulkAccessories
            : accessories || [],
        entityData: person
          ? {
              _id: person._id,
              name: entityData?.name || customerName,
              number: entityData?.number || customerNumber,
            }
          : {},
         bulkPhonePurchaseId: bulkPhonePurchase._id,
        soldPhoneId: soldPhone._id,
        shopid: bulkPhonePurchase.shopid || undefined,
        imeiPrices: imeisWithPrices
          ? Object.entries(imeisWithPrices).map(([imei, price]) => ({
              imei,
              price: Number(price),
            }))
          : [],
      });
    } catch (invoiceError) {
      console.error("Error creating invoice:", invoiceError);
      // Continue even if invoice creation fails
    }

    // Refresh the bulkPhonePurchase data after modifications
    await bulkPhonePurchase.save();

    // Handle bank transaction if applicable
    if (bankAccountUsed) {
      const bank = await AddBankAccount.findById(bankAccountUsed);
      if (!bank) return res.status(404).json({ message: "Bank not found" });

      bank.accountCash += Number(accountCash);
      await bank.save();

      await BankTransaction.create({
        bankId: bank._id,
        userId: req.user.id,
        sourceOfAmountAddition: `Sale of ${normalizedImeiNumbers.length} phones to ${customerName}`,
        accountCash: accountCash,
        accountType: bank.accountType,
      });
    }

    console.log("check for userId", req.user.id);

    // Handle pocket cash transaction if applicable
    if (pocketCash) {
      const pocketTransaction = await PocketCashSchema.findOne({
        userId: req.user.id,
      });
      if (!pocketTransaction) {
        return res
          .status(404)
          .json({ message: "Pocket cash account not found." });
      }

      pocketTransaction.accountCash += Number(pocketCash);
      await pocketTransaction.save();

      await PocketCashTransactionSchema.create({
        userId: req.user.id,
        pocketCashId: pocketTransaction._id,
        amountDeducted: pocketCash,
        accountCash: pocketTransaction.accountCash,
        remainingAmount: pocketTransaction.accountCash,
        sourceOfAmountAddition: `Sale of ${normalizedImeiNumbers.length} phones to ${customerName}`,
      });
    }

    // Handle accessories if applicable
    if (accessories && accessories.length > 0) {
      for (const accessoryItem of accessories) {
        const accessory = await Accessory.findOne({
          _id: accessoryItem.name,
          userId: req.user.id,
        });

        if (!accessory) {
          return res.status(404).json({ message: "Accessory not found" });
        }

        const totalPrice =
          Number(accessoryItem.quantity) * Number(accessoryItem.price);

        await AccessoryTransaction.create({
          userId: req.user.id,
          type: "sale",
          accessoryId: accessoryItem.name,
          quantity: Number(accessoryItem.quantity),
          perPiecePrice: Number(accessoryItem.price),
          totalPrice,
        });

        accessory.stock -= Number(accessoryItem.quantity);
        accessory.totalPrice -= totalPrice;
        accessory.profit +=
          (Number(accessoryItem.price) - Number(accessory.perPiecePrice)) *
          Number(accessoryItem.quantity);
        await accessory.save();
      }
    }

    // ============================================
    // Check if bulk purchase should be deleted (all IMEIs sold)
    // Uses Imei.status to count — NOT array length (array kept intact)
    // ============================================
    const updatedBulkPhonePurchase = await BulkPhonePurchase.findById(
      bulkPhonePurchaseId
    ).populate("ramSimDetails");

    // Final verification
    const finalSoldPhone = await SoldPhone.findById(soldPhone._id);
    console.log("Final SoldPhone verification:", {
      id: finalSoldPhone._id,
      purchasePrice: finalSoldPhone.purchasePrice,
      bulkPhonePurchaseId: finalSoldPhone.bulkPhonePurchaseId,
      profit: finalSoldPhone.profit,
    });

    // Re-fetch with full IMEI population to check status-based availability
    const refreshedBulkPurchase = await BulkPhonePurchase.findById(
      bulkPhonePurchaseId
    ).populate({
      path: "ramSimDetails",
      populate: { path: "imeiNumbers" },
    });

    // Count IMEIs that are still Available (not Sold)
    const totalAvailableImeis = (refreshedBulkPurchase?.ramSimDetails || [])
      .reduce((sum, rs) => {
        return sum + (rs.imeiNumbers || []).filter(
          (i) => i.status !== "Sold"
        ).length;
      }, 0);

    // All phones sold when no Available IMEIs remain
    const allRamSimsEmpty = !refreshedBulkPurchase || totalAvailableImeis === 0;

    if (allRamSimsEmpty) {
      // Build purchase details to return before deleting
      const bulkPurchaseDetails = {
        _id: updatedBulkPhonePurchase._id,
        prices: updatedBulkPhonePurchase.prices,
        date: updatedBulkPhonePurchase.date,
        purchasePaymentStatus: updatedBulkPhonePurchase.purchasePaymentStatus,
        purchasePaymentType: updatedBulkPhonePurchase.purchasePaymentType,
        personId: updatedBulkPhonePurchase.personId,
        models: (updatedBulkPhonePurchase.ramSimDetails || []).map((rs) => ({
          companyName: rs.companyName,
          modelName: rs.modelName,
          ramMemory: rs.ramMemory,
          priceOfOne: rs.priceOfOne,
        })),
      };

      await BulkPhonePurchase.findByIdAndDelete(bulkPhonePurchaseId);

      console.log("✅ [Sale][Bulk] All phones sold, bulk purchase deleted:", {
        userId: req.user?.id,
        soldPhoneId: finalSoldPhone._id?.toString?.(),
        bulkPhonePurchaseId,
        imeiCount: normalizedImeiNumbers.length,
        totalInvoice,
        salePrice,
        sellingPaymentType,
        stockUpdated: true,
        imeisRemoved: normalizedImeiNumbers.length,
      });

      return res.status(200).json({
        message: "All phones sold. Bulk purchase deleted.",
        soldPhone: finalSoldPhone,
        bulkPurchaseDetails,
        stockUpdated: true,
        imeisRemoved: normalizedImeiNumbers.length,
      });
    }

    console.log("✅ [Sale][Bulk] Phones sold successfully (partial bulk):", {
      userId: req.user?.id,
      soldPhoneId: finalSoldPhone._id?.toString?.(),
      bulkPhonePurchaseId,
      imeiCount: normalizedImeiNumbers.length,
      totalInvoice,
      salePrice,
      sellingPaymentType,
      stockUpdated: true,
      imeisRemoved: normalizedImeiNumbers.length,
    });

    res.status(200).json({
      message: "Phones sold successfully",
      soldPhone: finalSoldPhone,
      bulkPurchaseDetails: {
        _id: refreshedBulkPurchase._id,
        prices: refreshedBulkPurchase.prices,
        date: refreshedBulkPurchase.date,
        purchasePaymentStatus: refreshedBulkPurchase.purchasePaymentStatus,
        purchasePaymentType: refreshedBulkPurchase.purchasePaymentType,
        personId: refreshedBulkPurchase.personId,
        models: (refreshedBulkPurchase.ramSimDetails || []).map((rs) => ({
          companyName: rs.companyName,
          modelName: rs.modelName,
          ramMemory: rs.ramMemory,
          priceOfOne: rs.priceOfOne,
          remainingStock: (rs.imeiNumbers || []).filter(
            (i) => i.status !== "Sold"
          ).length, // Available IMEIs only
        })),
      },
      statusUpdated: "Partial sale completed",
      stockUpdated: true,
      imeisRemoved: normalizedImeiNumbers.length,
    });
  } catch (error) {
    console.error("Error selling phones:", error);
    res
      .status(500)
      .json({ message: "Error selling phones", error: error.message });
  }
};

// Get all sales (both single and bulk)
// exports.getAllSales = async (req, res) => {
//   try {
//     const allSales = await SoldPhone.find({ userId: req.user.id })
//       .populate({
//         path: 'bulkPhonePurchaseId',
//         // Populate all necessary fields from bulk purchase
//         select: 'companyName modelName partyName date prices ramSimDetails partyLedgerId purchasePaymentStatus purchasePaymentType creditPaymentData',
//         // Also populate the ramSimDetails if needed
//         populate: {
//           path: 'ramSimDetails',
//           select: 'ramMemory simOption priceOfOne imeiNumbers',
//           populate: {
//             path: 'imeiNumbers',
//             select: 'imei1 imei2 batteryHealth color'
//           }
//         }
//       })

//       .sort({ dateSold: -1 }); // Sort by most recent sales first

//     const responseData = allSales.map((sale) => {
//       const saleObj = sale.toObject();

//       if (sale.bulkPhonePurchaseId) {
//         // Calculate purchase price from bulk data
//         const purchasePrice = sale.bulkPhonePurchaseId.ramSimDetails?.find(ramSim =>
//           ramSim.imeiNumbers.some(imei =>
//             imei.imei1 === sale.imei1 || imei.imei2 === sale.imei1
//           )
//         )?.priceOfOne;

//         return {
//           ...saleObj,
//           type: "Bulk Phone",
//           buyingPrice: sale.bulkPhonePurchaseId.prices?.buyingPrice || null,
//           salePrice: sale.salePrice,
//           sellingPaymentType: sale.sellingPaymentType,
//           warranty: sale.warranty,
//           dateSold: sale.dateSold
//         };
//       } else if (sale.purchasePhoneId) {
//         return {
//           ...saleObj,
//           type: "Single Phone",
//           purchaseDetails: sale.purchasePhoneId
//         };
//       }
//       return saleObj;
//     });

//     res.status(200).json({
//       message: "Sales retrieved successfully!",
//       data: responseData,
//     });
//   } catch (error) {
//     console.error("Error fetching sales:", error);
//     res.status(500).json({
//       message: "Internal server error",
//       error: error.message,
//     });
//   }
// };
// exports.getAllSales = async (req, res) => {
//   try {
//     const bulkSales = await SoldPhone.find({
//       userId: req.user.id,
//     })
//       .populate({
//         path: "bulkPhonePurchaseId",
//         populate: {
//           path: "ramSimDetails",
//           populate: {
//             path: "imeiNumbers",
//             model: "Imei",
//           },
//         },
//       })
//       .populate("bankAccountUsed")
//       .populate("pocketCash")
//       .sort({ dateSold: -1 });

//     const responseData = bulkSales.map((sale) => ({
//       type: "Bulk Phone",
//       id: sale._id,
//       // Sale details
//       salePrice: sale.salePrice,
//       totalInvoice: sale.totalInvoice,
//       sellingPaymentType: sale.sellingPaymentType,
//       profit: sale.profit || 0,
//       warranty: sale.warranty,
//       dateSold: sale.dateSold,
//       customerName: sale.customerName,
//       customerNumber: sale.customerNumber,
//       invoiceNumber: sale.invoiceNumber,
//       dispatch: sale.dispatch,
//       // Payment details
//       bankAccountUsed: sale.bankAccountUsed,
//       pocketCash: sale.pocketCash,
//       // Bulk purchase details
//       bulkPurchase: {
//         id: sale.bulkPhonePurchaseId?._id,
//         date: sale.bulkPhonePurchaseId?.date,
//         purchasePaymentStatus: sale.bulkPhonePurchaseId?.purchasePaymentStatus,
//         purchasePaymentType: sale.bulkPhonePurchaseId?.purchasePaymentType,
//         prices: sale.bulkPhonePurchaseId?.prices,
//         creditPaymentData: sale.bulkPhonePurchaseId?.creditPaymentData,
//         status: sale.bulkPhonePurchaseId?.status,
//         ramSimDetails: sale.bulkPhonePurchaseId?.ramSimDetails?.map(
//           (ramSim) => ({
//             id: ramSim._id,
//             companyName: ramSim.companyName,
//             modelName: ramSim.modelName,
//             ramMemory: ramSim.ramMemory,
//             simOption: ramSim.simOption,
//             priceOfOne: ramSim.priceOfOne,
//             imeiNumbers: ramSim.imeiNumbers?.map((imei) => ({
//               id: imei._id,
//               imei1: imei.imei1,
//               imei2: imei.imei2,
//               color: imei.color,
//               batteryHealth: imei.batteryHealth,
//               isDispatched: imei.isDispatched,
//             })),
//           })
//         ),
//         dispatch: sale.bulkPhonePurchaseId?.dispatch,
//       },
//       // Accessories
//       accessories: sale.accessories,
//       // IMEI details
//       imei1: sale.imei1,
//       imei2: sale.imei2,
//       createdAt: sale.createdAt,
//       updatedAt: sale.updatedAt,
//     }));

//     res.status(200).json({
//       message: "Bulk phone sales retrieved successfully!",
//       data: responseData,
//       count: responseData.length,
//     });
//   } catch (error) {
//     console.error("Error fetching bulk sales:", error);
//     res.status(500).json({
//       message: "Internal server error",
//       error: error.message,
//     });
//   }
// };
exports.getAllSales = async (req, res) => {
  try {
    const bulkSales = await SoldPhone.find({
      userId: req.user.id,
    })
      .populate({
        path: "bulkPhonePurchaseId",
        populate: {
          path: "ramSimDetails",
          populate: {
            path: "imeiNumbers",
            model: "Imei",
          },
        },
      })
      .populate("bankAccountUsed")
      .populate("pocketCash")
      .sort({ dateSold: -1 });

     const responseData = bulkSales.map((sale) => ({
      type: "Bulk Phone",
      _id: sale._id,
      salePrice: sale.salePrice,
      purchasePrice: sale.purchasePrice || 0,
      totalInvoice: sale.totalInvoice,
      sellingPaymentType: sale.sellingPaymentType,
      profit: sale.profit || 0,
      warranty: sale.warranty,
      dateSold: sale.dateSold,
      customerName: sale.customerName,
      customerNumber: sale.customerNumber,
      invoiceNumber: sale.invoiceNumber,
      dispatch: sale.dispatch,
      bankAccountUsed: sale.bankAccountUsed,
      pocketCash: sale.pocketCash,
      // Bulk purchase details (only if available)
      bulkPurchase: sale.bulkPhonePurchaseId
        ? {
            id: sale.bulkPhonePurchaseId._id,
            date: sale.bulkPhonePurchaseId.date,
            purchasePaymentStatus:
              sale.bulkPhonePurchaseId.purchasePaymentStatus,
            purchasePaymentType: sale.bulkPhonePurchaseId.purchasePaymentType,
            prices: sale.bulkPhonePurchaseId.prices,
            creditPaymentData: sale.bulkPhonePurchaseId.creditPaymentData,
            status: sale.bulkPhonePurchaseId.status,
            ramSimDetails: sale.bulkPhonePurchaseId.ramSimDetails?.map(
              (ramSim) => ({
                id: ramSim._id,
                companyName: ramSim.companyName,
                modelName: ramSim.modelName,
                ramMemory: ramSim.ramMemory,
                simOption: ramSim.simOption,
                priceOfOne: ramSim.priceOfOne,
                imeiNumbers: ramSim.imeiNumbers?.map((imei) => ({
                  id: imei._id,
                  imei1: imei.imei1,
                  imei2: imei.imei2 || null,
                  color: imei.color,
                  batteryHealth: imei.batteryHealth,
                  isDispatched: imei.isDispatched,
                })),
              })
            ),
            dispatch: sale.bulkPhonePurchaseId.dispatch,
          }
        : null,
      // Accessories
      accessories: sale.accessories || [],
      // IMEI details
      imei1: Array.isArray(sale.imei1) ? sale.imei1 : [sale.imei1],
      imei2: Array.isArray(sale.imei2) ? sale.imei2 : sale.imei2 || null,
      createdAt: sale.createdAt,
      updatedAt: sale.updatedAt,
    }));

    res.status(200).json({
      message: "Bulk phone sales retrieved successfully!",
      data: responseData,
      count: responseData.length,
    });
  } catch (error) {
    console.error("Error fetching bulk sales:", error);
    res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

exports.getSoldBulkPhoneDetailById = async (req, res) => {
  try {
    const { id } = req.params;
    const saleDetail = await SoldPhone.findById(id).populate({
      path: "bulkPhonePurchaseId",
      model: "BulkPhonePurchase",
    });

    res.status(200).json({
      message: "Sales detail retrived successfully!",
      data: saleDetail,
    });
  } catch (error) {
    console.error("Error fetching dwetail:", error);
    res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

exports.getDeviceByImei = async (req, res) => {
  try {
    const userId = req.user.id; // Extract user ID from request
    const { imei } = req.query;

    if (!imei) {
      return res.status(400).json({ error: "IMEI number is required." });
    }

    // Search in BulkPhonePurchase (filtered by user ID)
    const bulkPhone = await BulkPhonePurchase.findOne({
      userId, // Ensure it belongs to the logged-in user
      $or: [{ "imeiNumbers.imei1": imei }, { "imeiNumbers.imei2": imei }],
    }).populate("ramSimDetails");

    // Search in PurchasePhone (filtered by user ID)
    const purchasePhone = await PurchasePhone.findOne({
      userId, // Ensure it belongs to the logged-in user
      $or: [{ imei1: imei }, { imei2: imei }],
    }).populate("shopid userId soldDetails");

    if (!bulkPhone && !purchasePhone) {
      return res
        .status(404)
        .json({ error: "No phone details found for this user." });
    }

    res.status(200).json({ bulkPhone, purchasePhone });
  } catch (error) {
    console.error("Error fetching phone details:", error);
    res.status(500).json({ error: "Internal server error." });
  }
};

exports.payBulkPurchaseCreditAmount = async (req, res) => {
  try {
    const userId = req.user.id; // Extract user ID from request
    const bulkPhonePurchaseId = req.params.id;
    const { amountToPay } = req.body;
    const bulkPhonePurchase = await BulkPhonePurchase.findById(
      bulkPhonePurchaseId
    );
    if (!userId) {
      return res.status(404).json({ message: "Authenticate please" });
    }
    if (!bulkPhonePurchase) {
      return res.status(404).json({ message: "Bulk phone purchase not found" });
    }
    if (bulkPhonePurchase.purchasePaymentStatus === "Paid") {
      return res.status(400).json({ message: "Payment already made" });
    }
    if (
      bulkPhonePurchase.creditPaymentData.payableAmountLater === 0 ||
      bulkPhonePurchase.creditPaymentData.payableAmountLater === "0"
    ) {
      return res.status(400).json({ message: "No amount to pay" });
    }

    const response =
      Number(bulkPhonePurchase.creditPaymentData.payableAmountLater) -
      Number(amountToPay);
    if (response < 0) {
      return res
        .status(400)
        .json({ message: "Amount to pay is greater than payable amount" });
    }
    bulkPhonePurchase.creditPaymentData.payableAmountLater = response;
    if (response === 0) {
      bulkPhonePurchase.purchasePaymentStatus = "paid";
    }

    // Initialize totalPaidAmount with payableAmountNow if it's the first payment
    // if (!bulkPhonePurchase.creditPaymentData.totalPaidAmount) {
    //   bulkPhonePurchase.creditPaymentData.totalPaidAmount = Number(bulkPhonePurchase.creditPaymentData.payableAmountNow) || 0;
    // }

    // Add amountToPay to totalPaidAmount
    bulkPhonePurchase.creditPaymentData.totalPaidAmount += Number(amountToPay);

    bulkPhonePurchase.save();
    res
      .status(200)
      .json({ message: "Payment made successfully", bulkPhonePurchase });
  } catch (error) {
    console.error("Error paying credit amount:", error);
    res.status(500).json({ message: "Internal server error", error });
  }
};

// Dispatch a single purchase phone
exports.dispatchSinglePurchase = async (req, res) => {
  try {
    const { shopName, receiverName, warranty, purchasePrice } = req.body;
    const purchasePhoneId = req.params.id;
    const userId = req.user.id;

    await PurchasePhone.findByIdAndUpdate(
      purchasePhoneId,
      {
        dispatch: true,
        ...(warranty && {
          $set: { warranty: warranty },
        }),
        ...(purchasePrice && {
          $set: { "price.purchasePrice": purchasePrice },
        }),
      },
      { new: true }
    );

    const dispatchEntry = await Dispatch.create({
      userId,
      shopName,
      receiverName,
      purchasePhoneId,
    });

    res
      .status(200)
      .json({ message: "Phone dispatched", dispatch: dispatchEntry });
  } catch (error) {
    console.error("Error dispatching single phone:", error);
    res.status(500).json({ message: "Internal server error", error });
  }
};

exports.dispatchSingleReturn = async (req, res) => {
  try {
    const purchasePhoneId = req.params.id;
    const userId = req.user.id;

    // 1. Update PurchasePhone dispatch status to false
    const updatedPhone = await PurchasePhone.findByIdAndUpdate(
      purchasePhoneId,
      { dispatch: false },
      { new: true }
    );

    if (!updatedPhone) {
      return res.status(404).json({ message: "Purchase phone not found" });
    }

    // 2. Delete the corresponding Dispatch entry
    const deletedDispatch = await Dispatch.findOneAndDelete({
      purchasePhoneId,
      userId,
    });

    if (!deletedDispatch) {
      return res
        .status(404)
        .json({ message: "Dispatch record not found or unauthorized" });
    }

    return res.status(200).json({
      message: "Phone return processed successfully",
      phone: updatedPhone,
      dispatch: deletedDispatch,
    });
  } catch (error) {
    console.error("Error returning dispatched phone:", error);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

// Dispatch a bulk purchase
// exports.dispatchBulkPurchase = async (req, res) => {
//   try {
//     const { shopName, receiverName } = req.body;
//     const bulkPhonePurchaseId = req.params.id;
//     const userId = req.user.id;

//     await BulkPhonePurchase.findByIdAndUpdate(bulkPhonePurchaseId, { dispatch: true });

//     const dispatchEntry = await Dispatch.create({
//       userId,
//       shopName,
//       receiverName,
//       bulkPhonePurchaseId,
//     });

//     res.status(200).json({ message: "Bulk phones dispatched", dispatch: dispatchEntry });
//   } catch (error) {
//     console.error("Error dispatching bulk phones:", error);
//     res.status(500).json({ message: "Internal server error", error });
//   }
// };

exports.dispatchBulkPurchase = async (req, res) => {
  try {
    const { shopName, receiverName, imeiArray = [] } = req.body;
    const bulkPhonePurchaseId = req.params.id;
    const userId = req.user.id;

    // Fetch bulk purchase
    const bulkPurchase = await BulkPhonePurchase.findById(bulkPhonePurchaseId);
    if (!bulkPurchase) {
      return res.status(404).json({ message: "Bulk purchase not found" });
    }

    // Get all RamSim entries linked to this bulk purchase
    const ramSimEntries = await RamSim.find({ bulkPhonePurchaseId });
    const ramSimIds = ramSimEntries.map((r) => r._id);

    // In your controller where you create Imei documents

exports.addImeiWithImage = async (req, res) => {
  try {
    const { imei1, imei2, batteryHealth, color, imeiImage, ramSimId } = req.body;

    const newImei = new Imei({
      imei1,
      imei2,
      batteryHealth,
      color,
      imeiImage, // Save the Cloudinary URL here
      ramSimId,
      status: "Available",
    });

    await newImei.save();

    res.status(201).json({
      success: true,
      message: "IMEI created with image",
      data: newImei,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error creating IMEI",
      error: error.message,
    });
  }
};
    // Get all IMEI documents under those RamSim entries
    const allImeis = await Imei.find({ ramSimId: { $in: ramSimIds } });

    let imeisToDispatch;

    // If user passed imeiArray with imei1/imei2 structure
    if (imeiArray.length > 0) {
      const imei1List = imeiArray
        .map((item) => item.imei1?.trim())
        .filter(Boolean);
      imeisToDispatch = allImeis.filter((i) => imei1List.includes(i.imei1));

      if (imeisToDispatch.length === 0) {
        return res
          .status(400)
          .json({ message: "No matching IMEI1s found for dispatch." });
      }
    } else {
      if (bulkPurchase.dispatch) {
        return res
          .status(400)
          .json({ message: "Bulk phones already dispatched" });
      }
      imeisToDispatch = allImeis;
    }

    const imeiIdsToDispatch = imeisToDispatch.map((i) => i._id);

    // Create Dispatch Entry
    const dispatchEntry = await Dispatch.create({
      userId,
      shopName,
      receiverName,
      bulkPhonePurchaseId,
      dispatchedImeiIds: imeiIdsToDispatch,
    });

    // Mark only the matched IMEIs as dispatched
    await Imei.updateMany(
      { _id: { $in: imeiIdsToDispatch } },
      { $set: { isDispatched: true } }
    );

    // Check if all IMEIs under this bulk purchase are now dispatched
    const undispatchedImeis = await Imei.find({
      ramSimId: { $in: ramSimIds },
      isDispatched: { $ne: true },
    });

    const allDispatched = undispatchedImeis.length === 0;

    if (allDispatched && !bulkPurchase.dispatch) {
      await BulkPhonePurchase.findByIdAndUpdate(bulkPhonePurchaseId, {
        dispatch: true,
      });
    }

    res.status(200).json({
      message: "Bulk phones dispatched",
      dispatch: dispatchEntry,
    });
  } catch (error) {
    console.error("Error dispatching bulk phones:", error);
    res.status(500).json({ message: "Internal server error", error });
  }
};

// exports.returnBulkDispatch = async (req, res) => {
//   try {
//     const dispatchId = req.params.id;
//     const { imeiArray = [] } = req.body;

//     // Find the dispatch entry
//     const dispatchEntry = await Dispatch.findById(dispatchId);
//     if (!dispatchEntry) {
//       return res.status(404).json({ message: "Dispatch entry not found" });
//     }

//     const bulkPhonePurchaseId = dispatchEntry.bulkPhonePurchaseId;
//     const dispatchedImeiIds = dispatchEntry.dispatchedImeiIds;

//     // Get full IMEI documents for the dispatch
//     const allImeis = await Imei.find({ _id: { $in: dispatchedImeiIds } });

//     let imeiIdsToReturn;

//     if (imeiArray.length > 0) {
//       // Return based on imei1 field
//       const imei1List = imeiArray.map(item => item.imei1?.trim()).filter(Boolean);

//       const filtered = allImeis.filter(i => imei1List.includes(i.imei1));
//       imeiIdsToReturn = filtered.map(i => i._id);

//       if (imeiIdsToReturn.length === 0) {
//         return res.status(400).json({ message: "No matching IMEIs found to return." });
//       }

//       // Update IMEIs as not dispatched
//       await Imei.updateMany(
//         { _id: { $in: imeiIdsToReturn } },
//         { $set: { isDispatched: false } }
//       );

//       // Check if any of the IMEI is returned, mark bulk purchase as undelivered
//       await BulkPhonePurchase.findByIdAndUpdate(bulkPhonePurchaseId, { dispatch: false });

//       // Get remaining IMEIs
//       const remainingImeiIds = dispatchedImeiIds.filter(id => !imeiIdsToReturn.includes(id.toString()));

//       if (remainingImeiIds.length === 0) {
//         // All returned → delete dispatch
//         await Dispatch.findByIdAndDelete(dispatchId);
//       } else {
//         // Partially returned → update dispatch entry
//         await Dispatch.findByIdAndUpdate(dispatchId, {
//           dispatchedImeiIds: remainingImeiIds
//         });
//       }
//     } else {
//       // FULL RETURN if no imeiArray provided
//       await Imei.updateMany(
//         { _id: { $in: dispatchedImeiIds } },
//         { $set: { isDispatched: false } }
//       );
//       await Dispatch.findByIdAndDelete(dispatchId);
//       await BulkPhonePurchase.findByIdAndUpdate(bulkPhonePurchaseId, { dispatch: false });
//     }

//     res.status(200).json({ message: "Bulk phone(s) returned successfully." });

//   } catch (error) {
//     console.error("Error returning bulk dispatch:", error);
//     res.status(500).json({ message: "Internal server error", error });
//   }
// };
exports.returnBulkDispatch = async (req, res) => {
  try {
    const dispatchId = req.params.id;
    const { imeiArray = [] } = req.body;

    console.log("this is the imeiArray", imeiArray);

    const dispatchEntry = await Dispatch.findById(dispatchId);
    if (!dispatchEntry) {
      return res.status(404).json({ message: "Dispatch entry not found" });
    }

    const bulkPhonePurchaseId = dispatchEntry.bulkPhonePurchaseId;
    const dispatchedImeiIds = dispatchEntry.dispatchedImeiIds.map((id) =>
      id.toString()
    );

    const allImeis = await Imei.find({ _id: { $in: dispatchedImeiIds } });

    let imeiIdsToReturn = [];

    if (imeiArray.length > 0) {
      const imei1List = imeiArray
        .map((item) => item.imei1?.trim())
        .filter(Boolean);

      const filtered = allImeis.filter((i) => imei1List.includes(i.imei1));
      imeiIdsToReturn = filtered.map((i) => i._id.toString());

      console.log("IMEIs to return:", imeiIdsToReturn);
      console.log("Dispatched IMEIs:", dispatchedImeiIds);

      if (imeiIdsToReturn.length === 0) {
        return res
          .status(400)
          .json({ message: "No matching IMEIs found to return." });
      }

      await Imei.updateMany(
        { _id: { $in: imeiIdsToReturn } },
        { $set: { isDispatched: false } }
      );

      const remainingImeiIds = dispatchedImeiIds.filter(
        (id) => !imeiIdsToReturn.includes(id)
      );
      console.log("Remaining IMEIs after return:", remainingImeiIds);

      if (remainingImeiIds.length === 0) {
        // All returned
        await Dispatch.findByIdAndDelete(dispatchId);
        await BulkPhonePurchase.findByIdAndUpdate(bulkPhonePurchaseId, {
          dispatch: false,
        });
      } else {
        // Partial return
        await Dispatch.findByIdAndUpdate(dispatchId, {
          dispatchedImeiIds: remainingImeiIds,
        });
        await BulkPhonePurchase.findByIdAndUpdate(bulkPhonePurchaseId, {
          dispatch: true,
        });
      }
    } else {
      // FULL return
      await Imei.updateMany(
        { _id: { $in: dispatchedImeiIds } },
        { $set: { isDispatched: false } }
      );
      await Dispatch.findByIdAndDelete(dispatchId);
      await BulkPhonePurchase.findByIdAndUpdate(bulkPhonePurchaseId, {
        dispatch: false,
      });
    }

    res.status(200).json({ message: "Bulk phone(s) returned successfully." });
  } catch (error) {
    console.error("Error returning bulk dispatch:", error);
    res.status(500).json({ message: "Internal server error", error });
  }
};

exports.getSingleDispatches = async (req, res) => {
  try {
    const userId = req.user.id;

    const dispatches = await Dispatch.find({
      userId,
      purchasePhoneId: { $ne: null },
    })
      .populate({
        path: "purchasePhoneId",
        model: "PurchasePhone",
      })
      .lean();

    res.status(200).json({ dispatches });
  } catch (error) {
    console.error("Error fetching single phone dispatches:", error);
    res.status(500).json({ message: "Internal server error", error });
  }
};

exports.getBulkDispatches = async (req, res) => {
  try {
    const userId = req.user.id;

    const dispatches = await Dispatch.find({
      userId,
      bulkPhonePurchaseId: { $ne: null },
    })
      .populate({
        path: "bulkPhonePurchaseId",
        model: "BulkPhonePurchase",
        populate: {
          path: "ramSimDetails",
          model: "RamSim",
          populate: {
            path: "imeiNumbers",
            model: "Imei",
          },
        },
      })
      .lean();

    const formattedDispatches = dispatches.map((dispatch) => {
      const ramSimDetails = (dispatch.bulkPhonePurchaseId?.ramSimDetails || [])
        .filter(
          (ramSim) =>
            Array.isArray(ramSim.imeiNumbers) &&
            ramSim.imeiNumbers.some((imei) => imei?.isDispatched)
        )
        .map((ramSim) => ({
          companyName: ramSim.companyName,
          modelName: ramSim.modelName,
          ramMemory: ramSim.ramMemory,
          simOption: ramSim.simOption,
          priceOfOne: ramSim.priceOfOne,
          imeiNumbers: (ramSim.imeiNumbers || [])
            .filter((imei) => imei?.isDispatched)
            .map((imei) => ({
              _id: imei._id,
              imei1: imei.imei1,
              imei2: imei.imei2,
              isDispatched: imei.isDispatched,
            })),
        }));

      return {
        dispatchId: dispatch._id,
        receiverName: dispatch.receiverName,
        shopName: dispatch.shopName,
        dispatchDate: dispatch.dispatchDate,
        dispatchStatus: dispatch.status,
        bulkPhonePurchaseId: dispatch.bulkPhonePurchaseId?._id || null,
        dispatchedImeiIds: dispatch.dispatchedImeiIds || [],
        ramSimDetails,
      };
    });

    res.status(200).json({ dispatches: formattedDispatches });
  } catch (error) {
    console.error(
      "Error fetching and formatting bulk dispatches:",
      error.message,
      error.stack
    );
    res.status(500).json({ message: "Internal server error", error });
  }
};

// exports.getBulkDispatches = async (req, res) => {
//   try {
//     const userId = req.user.id;

//     const dispatches = await Dispatch.find({
//       userId,
//       bulkPhonePurchaseId: { $ne: null },
//     })
//       .populate({
//         path: 'bulkPhonePurchaseId',
//         model: 'BulkPhonePurchase',
//         populate: {
//           path: 'ramSimDetails',
//           model: 'RamSim',
//           populate: {
//             path: 'imeiNumbers',
//             model: 'Imei',
//           },
//         },
//       })
//       .lean();

//     const formattedDispatches = dispatches.map(dispatch => {
//       const ramSimDetails = (dispatch.bulkPhonePurchaseId.ramSimDetails || [])
//         .filter(ramSim => ramSim.imeiNumbers.some(imei => imei.isDispatched))
//         .map(ramSim => ({
//           companyName: ramSim.companyName,
//           modelName: ramSim.modelName,
//           ramMemory: ramSim.ramMemory,
//           simOption: ramSim.simOption,
//           priceOfOne: ramSim.priceOfOne,
//           imeiNumbers: ramSim.imeiNumbers
//             .filter(imei => imei.isDispatched)
//             .map(imei => ({
//               _id: imei._id,
//               imei1: imei.imei1,
//               imei2: imei.imei2,
//               isDispatched: imei.isDispatched,
//             })),
//         }));

//       return {
//         dispatchId: dispatch._id,
//         receiverName: dispatch.receiverName,
//         shopName: dispatch.shopName,
//         dispatchDate: dispatch.dispatchDate,
//         dispatchStatus: dispatch.status,
//         bulkPhonePurchaseId: dispatch.bulkPhonePurchaseId._id,
//         dispatchedImeiIds: dispatch.dispatchedImeiIds,
//         ramSimDetails,
//       };
//     });

//     res.status(200).json({ dispatches: formattedDispatches });
//   } catch (error) {
//     console.error('Error fetching and formatting bulk dispatches:', error);
//     res.status(500).json({ message: 'Internal server error', error });
//   }
// };
exports.getCustomerSalesRecordDetailsByNumber = async (req, res) => {
  const { customerNumber } = req.params;
  const userId = req.user.id; // Extract user ID from request
  const { imei } = req.body;

  console.log("customerNumber:", customerNumber);
  console.log("userId:", userId);
  console.log("imei:", imei);

  if (!customerNumber || !userId) {
    return res
      .status(400)
      .json({ message: "Customer number and user ID are required" });
  }

  try {
    let singleSoldPhone = [];
    let singlePurchasePhone = [];
    let bulkSoldPhones = [];
    let bulkPurchasePhones = [];

    console.log(imei);

    if (imei) {
      // Search by IMEI
      console.log("Searching by IMEI:", customerNumber);

      // Search in SingleSoldPhone by IMEI
      singleSoldPhone = await SingleSoldPhone.find({
        $or: [{ imei1: customerNumber }, { imei2: customerNumber }],
        userId,
      })
        .populate("purchasePhoneId")
        .populate("bankAccountUsed")
        .populate("pocketCash");

      // Search in PurchasePhone by IMEI
      singlePurchasePhone = await PurchasePhone.find({
        $or: [{ imei1: customerNumber }, { imei2: customerNumber }],
        userId,
      })
        .populate("bankAccountUsed")
        .populate("pocketCash")
        .populate("shopid");

      // Search in SoldPhone (bulk) by IMEI
      bulkSoldPhones = await SoldPhone.find({
        $or: [
          { imei1: { $in: [customerNumber] } },
          { imei2: { $in: [customerNumber] } },
        ],
        userId,
      })
        .populate("bulkPhonePurchaseId")
        .populate("bankAccountUsed")
        .populate("pocketCash");

      // Search in BulkPhonePurchase by IMEI through ramSimDetails
      const bulkPurchases = await BulkPhonePurchase.find({
        userId,
      }).populate({
        path: "ramSimDetails",
        populate: {
          path: "imeiNumbers",
          match: {
            $or: [{ imei1: customerNumber }, { imei2: customerNumber }],
          },
        },
      });

      // Filter bulk purchases that have matching IMEIs
      bulkPurchasePhones = bulkPurchases.filter((bulk) =>
        bulk.ramSimDetails.some(
          (ramSim) => ramSim.imeiNumbers && ramSim.imeiNumbers.length > 0
        )
      );
    } else {
      // Search by customer number (original logic)
      console.log("Searching by customer number:", customerNumber);

      singleSoldPhone = await SingleSoldPhone.find({
        customerNumber,
        userId,
      })
        .populate("purchasePhoneId")
        .populate("bankAccountUsed")
        .populate("pocketCash");

      singlePurchasePhone = await PurchasePhone.find({
        mobileNumber: customerNumber,
        userId,
      })
        .populate("bankAccountUsed")
        .populate("pocketCash")
        .populate("shopid");

      // Search bulk sold phones by customer number
      bulkSoldPhones = await SoldPhone.find({
        customerNumber,
        userId,
      })
        .populate("bulkPhonePurchaseId")
        .populate("bankAccountUsed")
        .populate("pocketCash");

      // Search bulk purchases by personId (if customer is a person)
      const person = await Person.findOne({ number: customerNumber, userId });
      if (person) {
        bulkPurchasePhones = await BulkPhonePurchase.find({
          personId: person._id,
          userId,
        })
          .populate("personId")
          .populate("bankAccountUsed")
          .populate("pocketCash");
      }
    }

    // Format results with additional metadata
    const formatResults = (items, type) => {
      return items.map((item) => ({
        ...item.toObject(),
        recordType: type,
        searchType: imei ? "imei" : "phone_number",
        searchValue: customerNumber,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }));
    };

    const combinedResults = {
      searchInfo: {
        searchValue: customerNumber,
        searchType: imei ? "imei" : "phone_number",
        totalRecords: 0,
      },
      singlePurchases: formatResults(singlePurchasePhone, "single_purchase"),
      singleSales: formatResults(singleSoldPhone, "single_sale"),
      bulkPurchases: formatResults(bulkPurchasePhones, "bulk_purchase"),
      bulkSales: formatResults(bulkSoldPhones, "bulk_sale"),
      summary: {
        totalPurchases: singlePurchasePhone.length + bulkPurchasePhones.length,
        totalSales: singleSoldPhone.length + bulkSoldPhones.length,
        singlePurchases: singlePurchasePhone.length,
        singleSales: singleSoldPhone.length,
        bulkPurchases: bulkPurchasePhones.length,
        bulkSales: bulkSoldPhones.length,
      },
    };

    combinedResults.searchInfo.totalRecords =
      combinedResults.summary.totalPurchases +
      combinedResults.summary.totalSales;

    if (combinedResults.searchInfo.totalRecords === 0) {
      const searchType = imei ? "IMEI" : "phone number";
      return res.status(404).json({
        success: false,
        message: `No records found for this ${searchType}`,
        searchValue: customerNumber,
        searchType: imei ? "imei" : "phone_number",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Records retrieved successfully",
      data: combinedResults,
    });
  } catch (error) {
    console.error("Error fetching customer details:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

// exports.soldAnyPhone = async (req, res) => {
//   try {
//     const userId = req.user.id;
//     const { imei, ...otherDetails } = req.body;

//     if (!imei) {
//       return res.status(400).json({ error: "IMEI number is required." });
//     }

//     // 1. Try to find and sell in single purchase phone
//     const purchasePhone = await PurchasePhone.findOne({
//       userId,
//       $or: [{ imei1: imei }, { imei2: imei }],
//     });

//     if (purchasePhone) {
//       // Mark as sold, create SingleSoldPhone with extra details, then remove from PurchasePhone
//       purchasePhone.isSold = true;
//       await purchasePhone.save();

//       const soldPhone = new SingleSoldPhone({
//         purchasePhoneId: purchasePhone._id,
//         userId,
//         shopid: purchasePhone.shopid,
//         name: purchasePhone.name,
//         fatherName: purchasePhone.fatherName,
//         companyName: purchasePhone.companyName,
//         modelName: purchasePhone.modelName,
//         purchaseDate: purchasePhone.date,
//         phoneCondition: purchasePhone.phoneCondition,
//         warranty: purchasePhone.warranty,
//         specifications: purchasePhone.specifications,
//         ramMemory: purchasePhone.ramMemory,
//         color: purchasePhone.color,
//         imei1: purchasePhone.imei1,
//         imei2: purchasePhone.imei2,
//         phonePicture: purchasePhone.phonePicture,
//         personPicture: purchasePhone.personPicture,
//         accessories: purchasePhone.accessories,
//         purchasePrice: purchasePhone.price?.purchasePrice,
//         finalPrice: purchasePhone.price?.finalPrice,
//         demandPrice: purchasePhone.price?.demandPrice,
//         isApprovedFromEgadgets: purchasePhone.isApprovedFromEgadgets,
//         eGadgetStatusPicture: purchasePhone.eGadgetStatusPicture,
//         invoiceNumber: "INV-" + new Date().getTime(),
//         ...otherDetails, // Allow user to add extra details
//       });

//       await soldPhone.save();
//       await PurchasePhone.findByIdAndDelete(purchasePhone._id);

//       return res.status(200).json({
//         message: "Phone sold and removed from single purchase.",
//         type: "single",
//         imei,
//         soldPhone,
//       });
//     }

//     // 2. Try to find and sell in bulk purchase
//     const bulkPhone = await BulkPhonePurchase.findOne({ userId }).populate({
//       path: "ramSimDetails",
//       populate: { path: "imeiNumbers" },
//     });

//     if (bulkPhone) {
//       let found = false;
//       let soldPhone = null;
//       for (const ramSim of bulkPhone.ramSimDetails) {
//         const imeiIndex = ramSim.imeiNumbers.findIndex(
//           (i) => i.imei1 === imei || i.imei2 === imei
//         );
//         if (imeiIndex !== -1) {
//           // Remove IMEI from Imei collection and from ramSim.imeiNumbers
//           const imeiDoc = ramSim.imeiNumbers[imeiIndex];

//           // Create SoldPhone record with extra details
//           soldPhone = new SoldPhone({
//             bulkPhonePurchaseId: bulkPhone._id,
//             imei1: imeiDoc.imei1,
//             imei2: imeiDoc.imei2,
//             userId,
//             companyName: bulkPhone.companyName,
//             modelName: bulkPhone.modelName,
//             ramMemory: ramSim.ramMemory,
//             simOption: ramSim.simOption,
//             priceOfOne: ramSim.priceOfOne,
//             ...otherDetails, // Allow user to add extra details
//             invoiceNumber: "INV-" + new Date().getTime(),
//           });
//           await soldPhone.save();

//           await Imei.findByIdAndDelete(imeiDoc._id);
//           ramSim.imeiNumbers.splice(imeiIndex, 1);
//           await ramSim.save();
//           found = true;
//           break;
//         }
//       }
//       if (found) {
//         return res.status(200).json({
//           message: "IMEI sold and removed from bulk purchase.",
//           type: "bulk",
//           imei,
//           soldPhone,
//         });
//       }
//     }

//     return res
//       .status(404)
//       .json({ message: "IMEI not found in single or bulk purchase." });
//   } catch (error) {
//     console.error("Error processing sold phone:", error);
//     res
//       .status(500)
//       .json({ message: "Internal server error", error: error.message });
//   }
// };
// exports.soldAnyPhone = async (req, res) => {
//   try {
//     const userId = req.user.id;
//     const { imeis, ...otherDetails } = req.body;
//     const accessories = req.body.accessories || [];

//     if (!Array.isArray(imeis) || imeis.length === 0) {
//       return res.status(400).json({ error: "IMEI array is required." });
//     }

//     const soldPhones = [];
//     const notFoundImeis = [];

//     // Get all bulk phones for this user (not just one)
//     const bulkPhones = await BulkPhonePurchase.find({ userId }).populate({
//       path: "ramSimDetails",
//       populate: { path: "imeiNumbers" },
//     });

//     for (const imei of imeis) {
//       let found = false;

//       // Try single purchase
//       const purchasePhone = await PurchasePhone.findOne({
//         userId,
//         $or: [{ imei1: imei }, { imei2: imei }],
//       });
//       console.log("otherDetail", otherDetails);

//       if (purchasePhone) {
//         purchasePhone.isSold = true;
//         await purchasePhone.save();

//         const soldPhone = new SingleSoldPhone({
//           purchasePhoneId: purchasePhone._id,
//           userId,
//           dateSold: otherDetails.saleDate,
//           shopid: purchasePhone.shopid,
//           name: purchasePhone.name,
//           fatherName: purchasePhone.fatherName,
//           companyName: purchasePhone.companyName,
//           modelName: purchasePhone.modelName,
//           purchaseDate: purchasePhone.date,
//           phoneCondition: purchasePhone.phoneCondition,
//           warranty: purchasePhone.warranty,
//           specifications: purchasePhone.specifications,
//           ramMemory: purchasePhone.ramMemory,
//           color: purchasePhone.color,
//           imei1: purchasePhone.imei1,
//           imei2: purchasePhone.imei2,
//           phonePicture: purchasePhone.phonePicture,
//           personPicture: purchasePhone.personPicture,
//           accessories: purchasePhone.accessories,
//           purchasePrice: purchasePhone.price?.purchasePrice,
//           finalPrice: purchasePhone.price?.finalPrice,
//           demandPrice: purchasePhone.price?.demandPrice,
//           isApprovedFromEgadgets: purchasePhone.isApprovedFromEgadgets,
//           eGadgetStatusPicture: purchasePhone.eGadgetStatusPicture,
//           invoiceNumber: "INV-" + new Date().getTime(),
//           ...otherDetails,
//         });

//         await soldPhone.save();
//         // Delete the phone from single purchase collection
//         await PurchasePhone.findByIdAndDelete(purchasePhone._id);

//         soldPhones.push({ imei, type: "single", soldPhone });
//         found = true;
//         continue;
//       }

//       // Try bulk purchase if not found
//       for (const bulkPhone of bulkPhones) {
//         let ramSimToRemove = [];
//         let ramSimChanged = false;
//         for (const ramSim of bulkPhone.ramSimDetails) {
//           const imeiIndex = ramSim.imeiNumbers.findIndex(
//             (i) => i.imei1 === imei || i.imei2 === imei
//           );
//           if (imeiIndex !== -1) {
//             const imeiDoc = ramSim.imeiNumbers[imeiIndex];

//             const soldPhone = new SoldPhone({
//               bulkPhonePurchaseId: bulkPhone._id,
//               imei1: imeiDoc.imei1,
//               imei2: imeiDoc.imei2,
//               userId,
//               dateSold: otherDetails.saleDate,
//               companyName: bulkPhone.companyName,
//               modelName: bulkPhone.modelName,
//               ramMemory: ramSim.ramMemory,
//               simOption: ramSim.simOption,
//               priceOfOne: ramSim.priceOfOne,
//               invoiceNumber: "INV-" + new Date().getTime(),
//               ...otherDetails,
//             });

//             await soldPhone.save();

//             if (imeiDoc && imeiDoc._id) {
//               await Imei.findByIdAndDelete(imeiDoc._id);
//             } else if (
//               typeof imeiDoc === "string" ||
//               imeiDoc instanceof mongoose.Types.ObjectId
//             ) {
//               await Imei.findByIdAndDelete(imeiDoc);
//             }

//             ramSim.imeiNumbers.splice(imeiIndex, 1);
//             ramSimChanged = true;
//             await ramSim.save();

//             // If ramSim.imeiNumbers is now empty, mark for removal from bulkPhone
//             if (ramSim.imeiNumbers.length === 0) {
//               ramSimToRemove.push(ramSim._id.toString());
//             }

//             soldPhones.push({ imei, type: "bulk", soldPhone });
//             found = true;
//             break;
//           }
//         }
//         // Remove empty ramSimDetails from bulkPhone
//         if (ramSimChanged && ramSimToRemove.length > 0) {
//           bulkPhone.ramSimDetails = bulkPhone.ramSimDetails.filter(
//             (ramSim) => !ramSimToRemove.includes(ramSim._id.toString())
//           );
//           await bulkPhone.save();
//         }
//         // If after removal, bulkPhone.ramSimDetails is empty, delete the bulkPhonePurchase
//         if (ramSimChanged && bulkPhone.ramSimDetails.length === 0) {
//           await BulkPhonePurchase.findByIdAndDelete(bulkPhone._id);
//         }
//         if (found) break;
//       }

//       if (!found) {
//         notFoundImeis.push(imei);
//       }
//     }

//     if (accessories && accessories.length > 0) {
//       for (const accessoryItem of accessories) {
//         const accessory = await Accessory.findOne({
//           _id: accessoryItem.name,
//           userId: req.user.id,
//         });

//         if (!accessory) {
//           return res.status(404).json({ message: "Accessory not found" });
//         }

//         if (Number(accessory.stock) < Number(accessoryItem.quantity)) {
//           return res.status(400).json({ message: "Insufficient Inventory" });
//         }

//         const totalPrice =
//           Number(accessoryItem.quantity) * Number(accessoryItem.price);

//         await AccessoryTransaction.create({
//           userId: req.user.id,
//           accessoryId: accessoryItem.name,
//           quantity: Number(accessoryItem.quantity),
//           perPiecePrice: Number(accessoryItem.price),
//           totalPrice,
//         });

//         accessory.stock -= Number(accessoryItem.quantity);
//         accessory.totalPrice -=
//           Number(accessory.perPiecePrice) * Number(accessoryItem.quantity);
//         accessory.profit +=
//           (Number(accessoryItem.price) - Number(accessory.perPiecePrice)) *
//           Number(accessoryItem.quantity);
//         await accessory.save();
//       }
//     }

//      if (otherDetails?.bankAccountUsed) {
//       const bank = await AddBankAccount.findById(otherDetails?.bankAccountUsed);
//       if (!bank) return res.status(404).json({ message: "Bank not found" });

//       // Deduct purchasePrice from accountCash
//       bank.accountCash += Number(otherDetails?.accountCash);
//       await bank.save();

//       // Log the transaction
//       await BankTransaction.create({
//         bankId: bank._id,
//         userId: req.user.id,
//         sourceOfAmountAddition: `sale of mobile `,
//         accountCash: otherDetails?.accountCash,
//         accountType: bank.accountType,
//       });
//     }
//     if (otherDetails?.pocketCash) {
//       const pocketTransaction = await PocketCashSchema.findOne({
//         userId: req.user.id,
//       });
//       if (!pocketTransaction) {
//         return res
//           .status(404)
//           .json({ message: "Pocket cash account not found." });
//       }

//       pocketTransaction.accountCash += Number(otherDetails?.pocketCash);
//       await pocketTransaction.save();

//       await PocketCashTransactionSchema.create({
//         userId: req.user.id,
//         pocketCashId: pocketTransaction._id, // if you want to associate it
//         amountDeducted: otherDetails?.pocketCash,
//         accountCash: pocketTransaction.accountCash, // ✅ add this line
//         remainingAmount: pocketTransaction.accountCash,
//         reasonOfAmountDeduction: `sale of mobile`,
//         sourceOfAmountAddition: "Payment for mobile sale",
//       });
//     }

//     return res.status(200).json({
//       message: "Processed IMEIs.",
//       soldCount: soldPhones.length,
//       notFoundCount: notFoundImeis.length,
//       soldPhones,
//       notFoundImeis,
//     });
//   } catch (error) {
//     console.error("Error processing sold phones:", error);
//     res
//       .status(500)
//       .json({ message: "Internal server error", error: error.message });
//   }
// };

// exports.soldAnyPhone = async (req, res) => {
//   try {
//     const userId = req.user.id;
//     const {
//       imeis,
//       bankAccountUsed,
//       accountCash,
//       pocketCash,
//       entityData,
//       sellingPaymentType,
//       payableAmountLater,
//       payableAmountNow,
//       payableAmountLaterDate,
//       imeiPrices, // Array of {imei: '', price: ''} objects
//       ...phoneDetails
//     } = req.body;
//     const accessories = req.body.accessories || [];

//     // Arrays to store phone details from ramSim - declare at the top
//     const phoneModels = [];
//     const phoneCompanies = [];
//     const phoneColors = [];
//     const phoneRams = [];
//     const phoneSims = [];

//     if (!Array.isArray(imeis) || imeis.length === 0) {
//       console.log(
//         "bankAccountUsed",
//         bankAccountUsed,
//         "accountCash",
//         accountCash,
//         "pocketCash",
//         pocketCash
//       );
//       return res.status(400).json({ error: "IMEI array is required." });
//     }
//     if (entityData && !entityData._id && !entityData.number) {
//       return res.status(400).json({
//         message: "Either Entity ID or Number must be provided.",
//       });
//     }

//     const soldPhones = [];
//     const notFoundImeis = [];

//     // Create a map of IMEI to price for quick lookup
//     const imeiToPriceMap = new Map();
//     if (imeiPrices && Array.isArray(imeiPrices)) {
//       imeiPrices.forEach((item) => {
//         if (item.imei && item.price) {
//           imeiToPriceMap.set(item.imei, Number(item.price));
//         }
//       });
//     }

//     // Get all bulk phones for this user (not just one)
//     const bulkPhones = await BulkPhonePurchase.find({
//       userId,
//       status: { $in: ["Available", "Partially Sold"] },
//     }).populate({
//       path: "ramSimDetails",
//       populate: {
//         path: "imeiNumbers",
//         // Don't filter by status - we need to see all IMEIs to check if they're available
//       },
//     });

//     for (const imei of imeis) {
//       let found = false;

//       // Try single purchase
//       const purchasePhone = await PurchasePhone.findOne({
//         userId,
//         $or: [
//           { status: "Available" },
//           { status: { $exists: false } }, // Include documents without status field (legacy data)
//         ],
//         $and: [{ $or: [{ imei1: imei }, { imei2: imei }] }],
//       });

//       if (purchasePhone) {
//         purchasePhone.isSold = true;
//         await purchasePhone.save();

//         // Store phone details in arrays for single phones
//         phoneModels.push(purchasePhone.modelName || purchasePhone.name);
//         phoneCompanies.push(purchasePhone.companyName);
//         phoneColors.push(purchasePhone.color);
//         phoneRams.push(purchasePhone.ramMemory);

//         // Calculate profit for single phone
//         const soldPrice =
//           imeiToPriceMap.get(imei) || Number(phoneDetails.salePrice) || 0;
//         const purchasePrice = purchasePhone.price?.purchasePrice || 0;
//         const profit = soldPrice - purchasePrice;

//         const soldPhone = new SingleSoldPhone({
//           purchasePhoneId: purchasePhone._id,
//           userId,
//           dateSold: phoneDetails.saleDate,
//           shopid: purchasePhone.shopid,
//           sellingPaymentType,
//           name: purchasePhone.name,
//           fatherName: purchasePhone.fatherName,
//           companyName: purchasePhone.companyName,
//           modelName: purchasePhone.modelName,
//           purchaseDate: purchasePhone.date,
//           phoneCondition: purchasePhone.phoneCondition,
//           warranty: purchasePhone.warranty,
//           specifications: purchasePhone.specifications,
//           ramMemory: purchasePhone.ramMemory,
//           color: purchasePhone.color,
//           imei1: purchasePhone.imei1,
//           imei2: purchasePhone.imei2,
//           phonePicture: purchasePhone.phonePicture,
//           personPicture: purchasePhone.personPicture,
//           accessories: purchasePhone.accessories,
//           purchasePrice: purchasePhone.price?.purchasePrice,
//           finalPrice: purchasePhone.price?.finalPrice,
//           demandPrice: purchasePhone.price?.demandPrice,
//           salePrice: soldPrice,
//           totalInvoice: soldPrice,
//           profit: profit,
//           isApprovedFromEgadgets: purchasePhone.isApprovedFromEgadgets,
//           eGadgetStatusPicture: purchasePhone.eGadgetStatusPicture,
//           ...(sellingPaymentType === "Credit" && {
//             payableAmountNow: Number(payableAmountNow || 0),
//             payableAmountLater: Number(payableAmountLater || 0),
//             payableAmountLaterDate: payableAmountLaterDate
//               ? new Date(payableAmountLaterDate)
//               : undefined,
//           }),
//           invoiceNumber: "INV-" + new Date().getTime(),
//           ...phoneDetails, // Now filtered to exclude financial fields
//         });

//         await soldPhone.save();
//         // Mark the phone as sold instead of deleting
//         purchasePhone.status = "Sold";
//         purchasePhone.isSold = true;
//         purchasePhone.soldDetails = soldPhone._id;
//         await purchasePhone.save();

//         soldPhones.push({ imei, type: "single", soldPhone });
//         found = true;
//         continue;
//       }

//       // Try bulk purchase if not found
//       for (const bulkPhone of bulkPhones) {
//         let ramSimToRemove = [];
//         let ramSimChanged = false;
//         for (const ramSim of bulkPhone.ramSimDetails) {
//           console.log("ramSim", ramSim);
//           const imeiIndex = ramSim.imeiNumbers.findIndex(
//             (i) =>
//               (i.imei1 === imei || i.imei2 === imei) && i.status === "Available"
//           );
//           if (imeiIndex !== -1) {
//             const imeiDoc = ramSim.imeiNumbers[imeiIndex];

//             // Store phone details in arrays
//             phoneModels.push(ramSim.modelName);
//             phoneCompanies.push(ramSim.companyName);
//             phoneColors.push(imeiDoc.color);
//             phoneRams.push(ramSim.ramMemory);
//             phoneSims.push(ramSim.simOption);

//             // Calculate profit for bulk phone using unit price, not total bulk price
//             const soldPrice =
//               imeiToPriceMap.get(imei) || Number(phoneDetails.salePrice) || 0;
//             const unitPrice = Number(ramSim.priceOfOne) || 0;
//             const profit = soldPrice - unitPrice;

//             const soldPhone = new SoldPhone({
//               bulkPhonePurchaseId: bulkPhone._id,
//               imei1: imeiDoc.imei1,
//               imei2: imeiDoc.imei2,
//               userId,
//               dateSold: phoneDetails.saleDate,
//               companyName: ramSim.companyName || phoneDetails.companyName,
//               modelName: ramSim.modelName || phoneDetails.modelName,
//               color: imeiDoc.color || phoneDetails.color,
//               ramMemory: ramSim.ramMemory,
//               simOption: ramSim.simOption,
//               priceOfOne: ramSim.priceOfOne,
//               purchasePrice: unitPrice, // Use unit price instead of total bulk price
//               salePrice: soldPrice,
//               totalInvoice: soldPrice,
//               profit: profit,
//               sellingPaymentType,
//               ...(sellingPaymentType === "Credit" && {
//                 payableAmountNow: Number(payableAmountNow || 0),
//                 payableAmountLater: Number(payableAmountLater || 0),
//                 payableAmountLaterDate: payableAmountLaterDate
//                   ? new Date(payableAmountLaterDate)
//                   : undefined,
//               }),
//               customerName: phoneDetails.customerName,
//               customerNumber: phoneDetails.customerNumber,
//               warranty: phoneDetails.warranty,
//               invoiceNumber: "INV-" + new Date().getTime(),
//               ...phoneDetails, // Now filtered to exclude financial fields
//             });

//             await soldPhone.save();

//             // Mark IMEI as sold instead of deleting
//             if (imeiDoc && imeiDoc._id) {
//               imeiDoc.status = "Sold";
//               await imeiDoc.save();
//             } else if (
//               typeof imeiDoc === "string" ||
//               imeiDoc instanceof mongoose.Types.ObjectId
//             ) {
//               const imeiToUpdate = await Imei.findById(imeiDoc);
//               if (imeiToUpdate) {
//                 imeiToUpdate.status = "Sold";
//                 await imeiToUpdate.save();
//               }
//             }

//             // DON'T remove IMEI from ramSim.imeiNumbers - keep it but mark as sold
//             // This is the key difference from the old approach
//             ramSimChanged = true;
//             await ramSim.save();

//             soldPhones.push({ imei, type: "bulk", soldPhone });
//             found = true;
//             break;
//           }
//         }

//         // Update bulk purchase status based on remaining IMEIs
//         if (ramSimChanged) {
//           console.log(
//             `Updating bulk purchase status for bulkPhone._id: ${bulkPhone._id}`
//           );
//           await updateBulkPurchaseStatus(bulkPhone._id);

//           // Verify the status was updated
//           const updatedBulkPhone = await BulkPhonePurchase.findById(
//             bulkPhone._id
//           );
//           console.log(
//             `Bulk purchase status after update: ${updatedBulkPhone.status}`
//           );
//         }
//         if (found) break;
//       }

//       if (!found) {
//         notFoundImeis.push(imei);
//       }
//     }

//     if (accessories && accessories.length > 0) {
//       for (const accessoryItem of accessories) {
//         const accessory = await Accessory.findOne({
//           _id: accessoryItem.name,
//           userId: req.user.id,
//         });

//         if (!accessory) {
//           return res.status(404).json({ message: "Accessory not found" });
//         }

//         if (Number(accessory.stock) < Number(accessoryItem.quantity)) {
//           return res.status(400).json({ message: "Insufficient Inventory" });
//         }

//         const totalPrice =
//           Number(accessoryItem.quantity) * Number(accessoryItem.price);

//         await AccessoryTransaction.create({
//           userId: req.user.id,
//           accessoryId: accessoryItem.name,
//           type: "sale",
//           quantity: Number(accessoryItem.quantity),
//           perPiecePrice: Number(accessoryItem.price),
//           totalPrice,
//         });

//         accessory.stock -= Number(accessoryItem.quantity);
//         accessory.totalPrice -=
//           Number(accessory.perPiecePrice) * Number(accessoryItem.quantity);
//         accessory.profit +=
//           (Number(accessoryItem.price) - Number(accessory.perPiecePrice)) *
//           Number(accessoryItem.quantity);
//         await accessory.save();
//       }
//     }

//     // Handle financial transactions separately
//     if (bankAccountUsed) {
//       const bank = await AddBankAccount.findById(bankAccountUsed);
//       if (!bank) return res.status(404).json({ message: "Bank not found" });

//       // Add the sale amount to accountCash
//       bank.accountCash += Number(accountCash || 0);
//       await bank.save();

//       // Log the transaction
//       await BankTransaction.create({
//         bankId: bank._id,
//         userId: req.user.id,
//         sourceOfAmountAddition: `Phone Sale: ${imeis.length} of company name ${
//           phoneCompanies.join(", ") || "N/A"
//         } and model name ${phoneModels.join(", ") || "N/A"} and color ${
//           phoneColors.join(", ") || "N/A"
//         } and ram ${phoneRams.join(", ") || "N/A"} and sold to ${
//           entityData.name || "Customer"
//         } | Amount: Rs. ${accountCash || 0}`,
//         accountCash: accountCash || 0,
//         accountType: bank.accountType,
//       });
//     }

//     if (pocketCash) {
//       const pocketTransaction = await PocketCashSchema.findOne({
//         userId: req.user.id,
//       });
//       if (!pocketTransaction) {
//         return res
//           .status(404)
//           .json({ message: "Pocket cash account not found." });
//       }

//       pocketTransaction.accountCash += Number(pocketCash || 0);
//       await pocketTransaction.save();

//       await PocketCashTransactionSchema.create({
//         userId: req.user.id,
//         pocketCashId: pocketTransaction._id,
//         amountDeducted: pocketCash || 0,
//         accountCash: pocketTransaction.accountCash,
//         remainingAmount: pocketTransaction.accountCash,
//         sourceOfAmountAddition: `Phone Sale: ${imeis.length} of company name ${
//           phoneCompanies.join(", ") || "N/A"
//         } and model name ${phoneModels.join(", ") || "N/A"} and color ${
//           phoneColors.join(", ") || "N/A"
//         } and ram ${phoneRams.join(", ") || "N/A"} and sold to ${
//           entityData.name || "Customer"
//         } | Amount: Rs. ${pocketCash || 0}`,
//       });
//     }
//     let person = null;
//     if (entityData._id || entityData.number) {
//       person = await Person.findOne({
//         ...(!entityData.number && entityData._id && { _id: entityData._id }),
//         ...(entityData.number && { number: entityData.number }),
//         userId: req.user.id,
//       });
//     }
//     const currentGiveCreditAmount = person ? person.givingCredit : 0;
//     console.log("person found:", person);
//     console.log("soldPhones structure:", JSON.stringify(soldPhones, null, 2));

//     // Log the arrays containing phone details
//     console.log("=== PHONE DETAILS ARRAYS ===");
//     console.log("phoneModels:", phoneModels);
//     console.log("phoneCompanies:", phoneCompanies);
//     console.log("phoneColors:", phoneColors);
//     console.log("phoneRams:", phoneRams);
//     console.log("phoneSims:", phoneSims);
//     console.log("=== END PHONE DETAILS ARRAYS ===");

//     // Helper function to extract phone details for credit transaction description
//     const getPhoneDetailsForDescription = (soldPhones) => {
//       const models = soldPhones
//         .map((phone) => {
//           if (phone.type === "single") {
//             return phone.soldPhone?.modelName || phone.soldPhone?.name || "N/A";
//           } else {
//             // For bulk phones, get model name from the sold phone object
//             return phone.soldPhone?.modelName || "N/A";
//           }
//         })
//         .filter((model) => model !== "N/A");

//       const companies = soldPhones
//         .map((phone) => {
//           if (phone.type === "single") {
//             return phone.soldPhone?.companyName || "N/A";
//           } else {
//             // For bulk phones, get company name from the sold phone object
//             return phone.soldPhone?.companyName || "N/A";
//           }
//         })
//         .filter((company) => company !== "N/A");

//       const colors = soldPhones
//         .map((phone) => {
//           if (phone.type === "single") {
//             return phone.soldPhone?.color || "N/A";
//           } else {
//             // For bulk phones, get color from the sold phone object
//             return phone.soldPhone?.color || "N/A";
//           }
//         })
//         .filter((color) => color !== "N/A");

//       const result = {
//         models: models.length > 0 ? models.join(", ") : "N/A",
//         companies: companies.length > 0 ? companies.join(", ") : "N/A",
//         colors: colors.length > 0 ? colors.join(", ") : "N/A",
//       };

//       console.log("Extracted phone details:", result);
//       return result;
//     };

//     if (sellingPaymentType === "Credit") {
//       if (!person) {
//         person = await Person.create({
//           userId: req.user.id,
//           name: entityData.name,
//           number: entityData.number,
//           reference: "phone Sale",
//           givingCredit: Number(payableAmountLater),
//           status: "Receivable",
//         });
//         await CreditTransaction.create({
//           userId: req.user.id,
//           personId: person._id,
//           givingCredit: Number(payableAmountLater),
//           balanceAmount: Number(payableAmountLater),
//           description: `Credit Sale: received amount of ${
//             imeis.length
//           } phones is ${payableAmountNow} and sold to ${
//             entityData.name || person.name
//           } || Credit: ${payableAmountLater} || Model: ${
//             phoneModels.join(", ") || "N/A"
//           } || Company: ${phoneCompanies.join(", ") || "N/A"} || Color: ${
//             phoneColors.join(", ") || "N/A"
//           } || RAM: ${phoneRams.join(", ") || "N/A"} || SIM: ${
//             phoneSims.join(", ") || "N/A"
//           }`,
//         });
//       } else {
//         const currentGivingCredit =
//           Number(person.givingCredit || 0) + Number(payableAmountLater);
//         const currentTakingCredit = Number(person.takingCredit || 0);
//         const currentAmount = Math.abs(
//           Number(currentGivingCredit - currentTakingCredit)
//         );
//         const previousBalance = Number(person.takingCredit || 0);
//         person.givingCredit += Number(payableAmountLater);
//         person.status = "Receivable";
//         await person.save();
//         await CreditTransaction.create({
//           userId: req.user.id,
//           personId: person._id,
//           givingCredit: Number(payableAmountLater),
//           balanceAmount: Math.abs(currentAmount),
//           description: `Credit Sale: received amount of ${
//             imeis.length
//           } phones is ${payableAmountNow} and sold to ${
//             entityData.name || person.name
//           } || Credit: ${payableAmountLater} || Model: ${
//             phoneModels.join(", ") || "N/A"
//           } || Company: ${phoneCompanies.join(", ") || "N/A"} || Color: ${
//             phoneColors.join(", ") || "N/A"
//           } || RAM: ${phoneRams.join(", ") || "N/A"} || SIM: ${
//             phoneSims.join(", ") || "N/A"
//           }`,
//         });
//       }
//     }

//     // Do NOT create a new entity if sellingPaymentType is "Full Payment"
//     if (sellingPaymentType === "Full Payment") {
//       if (person) {
//         await CreditTransaction.create({
//           userId: req.user.id,
//           personId: person._id,
//           balanceAmount: Number(person.givingCredit),
//           givingCredit: 0,
//           description: `Complete Payment of phone Sale:  ${
//             imeis.length
//           } phones sold to  ${entityData.name || person.name}  || Model: ${
//             phoneModels.join(", ") || "N/A"
//           } || Company: ${phoneCompanies.join(", ") || "N/A"} || Color: ${
//             phoneColors.join(", ") || "N/A"
//           } || RAM: ${phoneRams.join(", ") || "N/A"} || SIM: ${
//             phoneSims.join(", ") || "N/A"
//           }`,
//         });
//       } else {
//         // Do not create a new Person entity, just log or skip
//         console.log(
//           "No existing entity found for full payment sale, not creating new entity."
//         );
//       }
//     }

//     // Calculate total profit from all sold phones
//     const totalProfit = soldPhones.reduce((sum, phone) => {
//       return sum + (phone.soldPhone?.profit || 0);
//     }, 0);

//     return res.status(200).json({
//       message: "Processed IMEIs.",
//       soldCount: soldPhones.length,
//       notFoundCount: notFoundImeis.length,
//       totalProfit: totalProfit,
//       soldPhones,
//       notFoundImeis,
//     });
//   } catch (error) {
//     console.error("Error processing sold phones:", error);
//     res
//       .status(500)
//       .json({ message: "Internal server error", error: error.message });
//   }
// };
exports.soldAnyPhone = async (req, res) => {
  // Transactions disabled: run without Mongo session/transaction.
  try {
    const userId = req.user.id;

      // Input validation
      const {
        imeis,
        bankAccountUsed,
        accountCash,
        pocketCash,
        entityData,
        sellingPaymentType,
        payableAmountLater,
        payableAmountNow,
        payableAmountLaterDate,
        imeiPrices,
        invoiceNumber: rawClientInvoiceNumber,
        ...phoneDetails
      } = req.body;

    const clientInvoiceNumber = normalizeClientSaleInvoiceNumber(
      rawClientInvoiceNumber
    );

    console.log("📱 [Sale][Generic] soldAnyPhone called:", {
  userId,
  imeiCount: Array.isArray(imeis) ? imeis.length : 0,   // ← use imeis here, not resolvedImeis
      sellingPaymentType,
      bankAccountUsed,
      accountCash,
      pocketCash,
      customerName: phoneDetails?.customerName,
      customerNumber: phoneDetails?.customerNumber,
      saleDate: phoneDetails?.saleDate,
      clientInvoiceNumber: clientInvoiceNumber || "(missing/invalid)",
    });

    const accessories = req.body.accessories || [];

    // Validate required fields
    if (!Array.isArray(imeis) || imeis.length === 0) {
      throw new Error("IMEI array is required and must not be empty.");
    }
    if (!sellingPaymentType) {
      throw new Error("Selling payment type is required.");
    }
    if (!clientInvoiceNumber) {
      throw new Error(
        "Invoice number is required in #12345 format for Sale Mobile."
      );
    }

    if (sellingPaymentType === "Credit") {
      if (!payableAmountLater || payableAmountLater <= 0) {
        throw new Error("Payable amount later is required for credit sales.");
      }
      // if (!payableAmountNow || payableAmountNow < 0) {
      //   throw new Error(
      //     "Payable amount now must be provided for credit sales."
      //   );
      // }
    }

    if (entityData && !entityData._id && !entityData.number) {
      throw new Error("Either Entity ID or Number must be provided.");
    }

    // Validate financial amounts
    const totalAccountCash = Number(accountCash || 0);
    const totalPocketCash = Number(pocketCash || 0);

    if (totalAccountCash < 0 || totalPocketCash < 0) {
      throw new Error("Cash amounts cannot be negative.");
    }

    // Arrays to store phone details
    const phoneModels = [];
    const phoneCompanies = [];
    const phoneColors = [];
    const phoneRams = [];
    const phoneSims = [];

    const soldPhones = [];
    const notFoundImeis = [];

    // Create a map of IMEI to price for quick lookup
    const imeiToPriceMap = new Map();
    if (imeiPrices && Array.isArray(imeiPrices)) {
      imeiPrices.forEach((item) => {
        if (item.imei && item.price && Number(item.price) > 0) {
          imeiToPriceMap.set(item.imei, Number(item.price));
        }
      });
    }

    // If imeiPrices is not provided, calculate price per IMEI from total salePrice
    // ✅ FIX: If imeiPrices has more entries than imeis, derive imeis from imeiPrices
let resolvedImeis = Array.isArray(imeis) ? [...imeis] : [];
if (
  imeiPrices &&
  Array.isArray(imeiPrices) &&
  imeiPrices.length > resolvedImeis.length
) {
  resolvedImeis = imeiPrices
    .map((ip) => String(ip.imei || "").trim())
    .filter(Boolean);
  console.log("📱 [soldAnyPhone] Derived imeis from imeiPrices:", resolvedImeis);
}

// If imeiPrices is not provided, calculate price per IMEI from total salePrice
const totalSalePrice = Number(phoneDetails.salePrice) || 0;
const pricePerImei =
  imeiToPriceMap.size === 0 && totalSalePrice > 0 && resolvedImeis.length > 0
    ? totalSalePrice / resolvedImeis.length
    : 0;

// Validate that we have a way to determine prices
if (
  imeiToPriceMap.size === 0 &&
  totalSalePrice <= 0 &&
  (!imeiPrices || !Array.isArray(imeiPrices) || imeiPrices.length === 0)
) {
  throw new Error(
    "Sale price is required. Please provide either salePrice or imeiPrices array."
  );
}

    // Debug log for price calculation
    console.log("🔍 [soldAnyPhone] Price calculation setup:", {
      totalSalePrice,
      pricePerImei,
      imeiPricesCount: imeiToPriceMap.size,
      imeisCount: imeis.length,
      hasImeiPrices:
        imeiPrices && Array.isArray(imeiPrices) && imeiPrices.length > 0,
    });

    // Get all bulk phones for this user with proper population
    const bulkPhones = await BulkPhonePurchase.find({
      userId,
      status: { $in: ["Available", "Partially Sold"] },
    }).populate({
      path: "ramSimDetails",
      populate: {
        path: "imeiNumbers",
      },
    });

      // Process each IMEI
      for (const imei of resolvedImeis) {

         let found = false;

        // Try single purchase first - with proper status check
        const purchasePhone = await PurchasePhone.findOne({
          userId,
          $or: [
            { status: "Available" },
            { status: { $exists: false } }, // Include documents without status field (legacy data)
          ],
          isSold: { $ne: true }, // Ensure not already sold
          $and: [{ $or: [{ imei1: imei }, { imei2: imei }] }],
        });

        if (purchasePhone) {
          // Double-check the phone is not already sold (race condition protection)
          if (purchasePhone.isSold || purchasePhone.status === "Sold") {
            notFoundImeis.push(imei);
            continue;
          }

          // Store phone details in arrays for single phones
          phoneModels.push(purchasePhone.modelName || purchasePhone.name);
          phoneCompanies.push(purchasePhone.companyName);
          phoneColors.push(purchasePhone.color);
          phoneRams.push(purchasePhone.ramMemory);

          // Calculate profit for single phone
          // Priority: 1) imeiPrices map, 2) pricePerImei (if calculated), 3) phoneDetails.salePrice, 4) 0
          const soldPrice =
            imeiToPriceMap.get(imei) ||
            (pricePerImei > 0
              ? pricePerImei
              : Number(phoneDetails.salePrice) || 0);
          const purchasePrice = purchasePhone.price?.purchasePrice || 0;
          const profit = soldPrice - purchasePrice;

          if (soldPrice <= 0) {
            throw new Error(
              `Invalid sale price for IMEI ${imei}. Sale price must be greater than 0. Please provide imeiPrices or a valid salePrice.`
            );
          }

          const lineInvoiceNumber = clientInvoiceNumber;
          const soldPhone = new SingleSoldPhone({
            purchasePhoneId: purchasePhone._id,
            userId,
            dateSold: phoneDetails.saleDate || new Date(),
            shopid: purchasePhone.shopid,
            sellingPaymentType,
            name: purchasePhone.name,
            fatherName: purchasePhone.fatherName,
            companyName: purchasePhone.companyName,
            modelName: purchasePhone.modelName,
            purchaseDate: purchasePhone.date,
            phoneCondition: purchasePhone.phoneCondition,
            warranty: purchasePhone.warranty,
            specifications: purchasePhone.specifications,
            ramMemory: purchasePhone.ramMemory,
            color: purchasePhone.color,
            imei1: purchasePhone.imei1,
            imei2: purchasePhone.imei2,
            phonePicture: purchasePhone.phonePicture,
            personPicture: purchasePhone.personPicture,
            accessories: purchasePhone.accessories,
            purchasePrice: purchasePhone.price?.purchasePrice,
            finalPrice: purchasePhone.price?.finalPrice,
            demandPrice: purchasePhone.price?.demandPrice,
            salePrice: soldPrice,
            totalInvoice: soldPrice,
            profit: profit,
            isApprovedFromEgadgets: purchasePhone.isApprovedFromEgadgets,
            eGadgetStatusPicture: purchasePhone.eGadgetStatusPicture,
            ...(sellingPaymentType === "Credit" && {
              payableAmountNow: Number(payableAmountNow || 0),
              payableAmountLater: Number(payableAmountLater || 0),
              payableAmountLaterDate: payableAmountLaterDate
                ? new Date(payableAmountLaterDate)
                : undefined,
            }),
            ...phoneDetails,
            invoiceNumber: lineInvoiceNumber,
          });

          await soldPhone.save();

          // Mark the phone as sold
          purchasePhone.status = "Sold";
          purchasePhone.isSold = true;
          purchasePhone.soldDetails = soldPhone._id;
          await purchasePhone.save();

          soldPhones.push({ imei, type: "single", soldPhone });
          found = true;
          continue;
        }

        // Try bulk purchase if not found in single phones
        for (const bulkPhone of bulkPhones) {
          let ramSimChanged = false;

          for (const ramSim of bulkPhone.ramSimDetails) {
            const imeiIndex = ramSim.imeiNumbers.findIndex(
              (i) =>
                (i.imei1 === imei || i.imei2 === imei) &&
                i.status === "Available"
            );

            if (imeiIndex !== -1) {
              const imeiDoc = ramSim.imeiNumbers[imeiIndex];

              // Double-check the IMEI is not already sold
              if (imeiDoc.status === "Sold") {
                continue;
              }

              // Store phone details in arrays
              phoneModels.push(ramSim.modelName);
              phoneCompanies.push(ramSim.companyName);
              phoneColors.push(imeiDoc.color);
              phoneRams.push(ramSim.ramMemory);
              phoneSims.push(ramSim.simOption);

              // Calculate profit for bulk phone using unit price
              // Priority: 1) imeiPrices map, 2) pricePerImei (if calculated), 3) phoneDetails.salePrice, 4) 0
              const soldPrice =
                imeiToPriceMap.get(imei) ||
                (pricePerImei > 0
                  ? pricePerImei
                  : Number(phoneDetails.salePrice) || 0);
              const unitPrice = Number(ramSim.priceOfOne) || 0;
              const profit = soldPrice - unitPrice;

              if (soldPrice <= 0) {
                throw new Error(
                  `Invalid sale price for IMEI ${imei}. Sale price must be greater than 0. Please provide imeiPrices or a valid salePrice.`
                );
              }

              const lineInvoiceNumberBulk = clientInvoiceNumber;
              const soldPhone = new SoldPhone({
                bulkPhonePurchaseId: bulkPhone._id,
                imei1: imeiDoc.imei1,
                imei2: imeiDoc.imei2,
                userId,
                dateSold: phoneDetails.saleDate || new Date(),
                companyName: ramSim.companyName || phoneDetails.companyName,
                modelName: ramSim.modelName || phoneDetails.modelName,
                color: imeiDoc.color || phoneDetails.color,
                ramMemory: ramSim.ramMemory,
                simOption: ramSim.simOption,
                priceOfOne: ramSim.priceOfOne,
                purchasePrice: unitPrice,
                salePrice: soldPrice,
                totalInvoice: soldPrice,
                profit: profit,
                sellingPaymentType,
                ...(sellingPaymentType === "Credit" && {
                  payableAmountNow: Number(payableAmountNow || 0),
                  payableAmountLater: Number(payableAmountLater || 0),
                  payableAmountLaterDate: payableAmountLaterDate
                    ? new Date(payableAmountLaterDate)
                    : undefined,
                }),
                customerName: phoneDetails.customerName,
                customerNumber: phoneDetails.customerNumber,
                warranty: phoneDetails.warranty,
                ...phoneDetails,
                invoiceNumber: lineInvoiceNumberBulk,
              });

              await soldPhone.save();

              // Mark IMEI as sold
              imeiDoc.status = "Sold";
              await imeiDoc.save();

              ramSimChanged = true;
              await ramSim.save();

              soldPhones.push({ imei, type: "bulk", soldPhone });
              found = true;
              break;
            }
          }

          // Update bulk purchase status if any IMEI was sold
          if (ramSimChanged) {
            await updateBulkPurchaseStatus(bulkPhone._id);
          }

          if (found) break;
        }

        if (!found) {
          notFoundImeis.push(imei);
        }
      }

      const primaryInvoiceNumber =
        soldPhones.length > 0
          ? soldPhones[0].soldPhone.invoiceNumber
          : clientInvoiceNumber;

      // Process accessories if any
      if (accessories && accessories.length > 0) {
        for (const accessoryItem of accessories) {
          if (
            !accessoryItem.name ||
            !accessoryItem.quantity ||
            !accessoryItem.price
          ) {
            throw new Error(
              "Accessory name, quantity, and price are required."
            );
          }

          const accessory = await Accessory.findOne({
            _id: accessoryItem.name,
            userId: req.user.id,
          });

          if (!accessory) {
            throw new Error(
              `Accessory with ID ${accessoryItem.name} not found.`
            );
          }
          console.log(
            "accessory stock",
            accessory.quantity,
            "accessory item quantity",
            accessoryItem.quantity
          );

          if (Number(accessory.quantity) < Number(accessoryItem.quantity)) {
            throw new Error(
              `Insufficient inventory for accessory ${accessory.name}. Available: ${accessory.stock}, Requested: ${accessoryItem.quantity}`
            );
          }

          const totalPrice =
            Number(accessoryItem.quantity) * Number(accessoryItem.price);

          const accessoryProfit =
            (Number(accessoryItem.price) - Number(accessory.perPiecePrice)) *
            Number(accessoryItem.quantity);

          await AccessoryTransaction.create(
            [
              {
                userId: req.user.id,
                accessoryId: accessoryItem.name,
                type: "sale",
                quantity: Number(accessoryItem.quantity),
                perPiecePrice: Number(accessoryItem.price),
                totalPrice,
                profit: accessoryProfit,
              },
            ]
          );

          accessory.stock -= Number(accessoryItem.quantity);
          accessory.totalPrice -=
            Number(accessory.perPiecePrice) * Number(accessoryItem.quantity);
          accessory.profit += accessoryProfit;
          await accessory.save();
        }
      }

      // Handle bank account transactions
      if (bankAccountUsed && totalAccountCash > 0) {
        const bank = await AddBankAccount.findById(bankAccountUsed);
        if (!bank) {
          throw new Error("Bank account not found.");
        }

        // Add the sale amount to accountCash
        bank.accountCash += totalAccountCash;
        await bank.save();

        // Log the transaction
        await BankTransaction.create(
          [
            {
              bankId: bank._id,
              userId: req.user.id,
              sourceOfAmountAddition: `Phone Sale: ${
                imeis.length
              } of company name ${
                phoneCompanies.join(", ") || "N/A"
              } and model name ${phoneModels.join(", ") || "N/A"} and color ${
                phoneColors.join(", ") || "N/A"
              } and ram ${phoneRams.join(", ") || "N/A"} and sold to ${
                entityData?.name || "Customer"
              } | Amount: Rs. ${totalAccountCash}`,
              accountCash: totalAccountCash,
              accountType: bank.accountType,
            },
          ]
        );
      }

      // Handle pocket cash transactions
      if (totalPocketCash > 0) {
        const pocketTransaction = await PocketCashSchema.findOne({
          userId: req.user.id,
        });

        if (!pocketTransaction) {
          throw new Error("Pocket cash account not found.");
        }

        pocketTransaction.accountCash += totalPocketCash;
        await pocketTransaction.save();

        await PocketCashTransactionSchema.create(
          [
            {
              userId: req.user.id,
              pocketCashId: pocketTransaction._id,
              amountAdded: totalPocketCash, // Fixed: should be amountAdded for sales
              accountCash: pocketTransaction.accountCash,
              remainingAmount: pocketTransaction.accountCash,
              sourceOfAmountAddition: `Phone Sale: ${
                imeis.length
              } of company name ${
                phoneCompanies.join(", ") || "N/A"
              } and model name ${phoneModels.join(", ") || "N/A"} and color ${
                phoneColors.join(", ") || "N/A"
              } and ram ${phoneRams.join(", ") || "N/A"} and sold to ${
                entityData?.name || "Customer"
              } | Amount: Rs. ${totalPocketCash}`,
            },
          ]
        );
      }

      // Handle person/entity and credit transactions
      let person = null;
      if (entityData?._id || entityData?.number) {
        person = await Person.findOne({
          ...(!entityData.number && entityData._id && { _id: entityData._id }),
          ...(entityData.number && { number: entityData.number }),
          userId: req.user.id,
        });
      }

      if (sellingPaymentType === "Credit") {
        if (!person) {
          person = await Person.create(
            [
              {
                userId: req.user.id,
                name: entityData.name,
                number: entityData.number,
                reference: "phone Sale",
                givingCredit: Number(payableAmountLater),
                status: "Receivable",
              },
            ]
          );
          person = person[0];

          await CreditTransaction.create(
            [
              {
                userId: req.user.id,
                personId: person._id,
                givingCredit: Number(payableAmountLater),
                balanceAmount: Number(payableAmountLater),
                invoiceExist: true,
                invoiceNumber: primaryInvoiceNumber,
                invoiceDetails: {
                  imeis: imeis,
                  phoneModels: phoneModels,
                  phoneCompanies: phoneCompanies,
                  phoneColors: phoneColors,
                  phoneRams: phoneRams,
                  phoneSims: phoneSims,
                },
                description: `Credit Sale: received amount of ${
                  imeis.length
                } phones is ${payableAmountNow} and sold to ${
                  entityData.name || person.name
                } || Credit: ${payableAmountLater} || Model: ${
                  phoneModels.join(", ") || "N/A"
                } || Company: ${phoneCompanies.join(", ") || "N/A"} || Color: ${
                  phoneColors.join(", ") || "N/A"
                } || RAM: ${phoneRams.join(", ") || "N/A"} || SIM: ${
                  phoneSims.join(", ") || "N/A"
                }`,
              },
            ]
          );
        } else {
          const currentGivingCredit =
            Number(person.givingCredit || 0) + Number(payableAmountLater);
          const currentTakingCredit = Number(person.takingCredit || 0);
          const currentAmount = Math.abs(
            Number(currentGivingCredit - currentTakingCredit)
          );

          person.givingCredit += Number(payableAmountLater);
          person.status = "Receivable";
          await person.save();

          await CreditTransaction.create(
            [
              {
                userId: req.user.id,
                personId: person._id,
                givingCredit: Number(payableAmountLater),
                balanceAmount: Math.abs(currentAmount),
                invoiceExist: true,
                invoiceNumber: primaryInvoiceNumber,
                invoiceDetails: {
                  imeis: imeis,
                  phoneModels: phoneModels,
                  phoneCompanies: phoneCompanies,
                  phoneColors: phoneColors,
                  phoneRams: phoneRams,
                  phoneSims: phoneSims,
                },
                description: `Credit Sale: received amount of ${
                  imeis.length
                } phones is ${payableAmountNow} and sold to ${
                  entityData.name || person.name
                } || Credit: ${payableAmountLater} || Model: ${
                  phoneModels.join(", ") || "N/A"
                } || Company: ${phoneCompanies.join(", ") || "N/A"} || Color: ${
                  phoneColors.join(", ") || "N/A"
                } || RAM: ${phoneRams.join(", ") || "N/A"} || SIM: ${
                  phoneSims.join(", ") || "N/A"
                }`,
              },
            ]
          );
        }
      }

      // Handle full payment transactions
      if (sellingPaymentType === "Full Payment" && person) {
        await CreditTransaction.create(
          [
            {
              userId: req.user.id,
              personId: person._id,
              balanceAmount: Number(person.givingCredit),
              givingCredit: 0,
              invoiceExist: true,
              invoiceNumber: primaryInvoiceNumber,
              invoiceDetails: {
                imeis: imeis,
                phoneModels: phoneModels,
                phoneCompanies: phoneCompanies,
                phoneColors: phoneColors,
                phoneRams: phoneRams,
                phoneSims: phoneSims,
              },
              description: `Complete Payment of phone Sale: ${
                imeis.length
              } phones sold to ${entityData?.name || person.name} || Model: ${
                phoneModels.join(", ") || "N/A"
              } || Company: ${phoneCompanies.join(", ") || "N/A"} || Color: ${
                phoneColors.join(", ") || "N/A"
              } || RAM: ${phoneRams.join(", ") || "N/A"} || SIM: ${
                phoneSims.join(", ") || "N/A"
              }`,
            },
          ]
        );
      }

      // Calculate total profit from all sold phones
      const totalProfit = soldPhones.reduce((sum, phone) => {
        return sum + (phone.soldPhone?.profit || 0);
      }, 0);

      // Create invoice for generic sale (combines all phones)
      try {
        // Calculate totals from sold phones - ensure we get the actual saved values
        const totalSalePrice = soldPhones.reduce((sum, phone) => {
          // Get salePrice from the saved soldPhone document
          const salePrice = Number(phone.soldPhone?.salePrice) || 0;
          const totalInvoice = Number(phone.soldPhone?.totalInvoice) || 0;
          // Use salePrice if available, otherwise totalInvoice, but ensure it's > 0
          const price =
            salePrice > 0 ? salePrice : totalInvoice > 0 ? totalInvoice : 0;

          // Debug log for each phone
          if (price === 0) {
            console.warn("⚠️ [soldAnyPhone] Phone with 0 price detected:", {
              imei: phone.imei,
              type: phone.type,
              salePrice: phone.soldPhone?.salePrice,
              totalInvoice: phone.soldPhone?.totalInvoice,
              soldPhoneId: phone.soldPhone?._id,
            });
          }

          return sum + price;
        }, 0);

        const totalPurchasePrice = soldPhones.reduce((sum, phone) => {
          return sum + (Number(phone.soldPhone?.purchasePrice) || 0);
        }, 0);

        // Calculate accessories total
        const accessoriesTotal = (accessories || []).reduce((sum, acc) => {
          const quantity = Number(acc.quantity) || 0;
          const price = Number(acc.price) || Number(acc.perPiecePrice) || 0;
          return sum + quantity * price;
        }, 0);

        // Total invoice = sale price + accessories
        const totalInvoice = totalSalePrice + accessoriesTotal;
        const finalProfit = totalInvoice - totalPurchasePrice;

        // Validate that we have a valid total
        if (totalInvoice <= 0) {
          console.error("❌ [soldAnyPhone] Invalid totalInvoice calculated:", {
            totalSalePrice,
            accessoriesTotal,
            totalInvoice,
            soldPhonesCount: soldPhones.length,
            soldPhonesDetails: soldPhones.map((p) => ({
              imei: p.imei,
              type: p.type,
              salePrice: p.soldPhone?.salePrice,
              totalInvoice: p.soldPhone?.totalInvoice,
              purchasePrice: p.soldPhone?.purchasePrice,
            })),
          });
          throw new Error(
            `Invalid invoice total: ${totalInvoice}. Total sale price: ${totalSalePrice}, Accessories total: ${accessoriesTotal}`
          );
        }

        // Debug log to verify calculations
        console.log("🔍 [soldAnyPhone] Invoice calculation:", {
          soldPhonesCount: soldPhones.length,
          totalSalePrice,
          totalPurchasePrice,
          accessoriesTotal,
          totalInvoice,
          finalProfit,
          soldPhonesDetails: soldPhones.map((p) => ({
            type: p.type,
            salePrice: p.soldPhone?.salePrice,
            totalInvoice: p.soldPhone?.totalInvoice,
            purchasePrice: p.soldPhone?.purchasePrice,
          })),
        });

        // Get IMEIs from sold phones
        const allImei1s = soldPhones
          .map((phone) => {
            if (phone.soldPhone?.imei1) {
              return Array.isArray(phone.soldPhone.imei1)
                ? phone.soldPhone.imei1
                : [phone.soldPhone.imei1];
            }
            return [];
          })
          .flat();

        const allImei2s = soldPhones
          .map((phone) => {
            if (phone.soldPhone?.imei2) {
              return Array.isArray(phone.soldPhone.imei2)
                ? phone.soldPhone.imei2
                : [phone.soldPhone.imei2];
            }
            return [];
          })
          .flat()
          .filter(Boolean);

        // Format accessories for invoice (ensure they have name, quantity, price, totalPrice)
        const formattedAccessories = (accessories || []).map((acc) => ({
          name: acc.name || acc.accessoryId || acc._id,
          quantity: Number(acc.quantity) || 1,
          price: Number(acc.price) || Number(acc.perPiecePrice) || 0,
          totalPrice:
            (Number(acc.quantity) || 1) *
            (Number(acc.price) || Number(acc.perPiecePrice) || 0),
        }));

        // Prepare metadata with IMEI prices
        const metadataImeiPrices = [];
        if (imeiPrices && Array.isArray(imeiPrices) && imeiPrices.length > 0) {
          // Use provided imeiPrices
          metadataImeiPrices.push(
            ...imeiPrices
              .map((ip) => ({
                imei: String(ip.imei || "").trim(),
                price: Number(ip.price) || 0,
              }))
              .filter((ip) => ip.imei)
          );
        } else if (allImei1s.length > 0 && totalSalePrice > 0) {
          // Calculate price per IMEI if not provided
          const pricePerImei = totalSalePrice / allImei1s.length;
          metadataImeiPrices.push(
            ...allImei1s.map((imei) => ({
              imei: String(imei).trim(),
              price: pricePerImei,
            }))
          );
        }

        // Get first phone details for summary
        const firstPhone = soldPhones[0]?.soldPhone;

        const invoiceData = await createInvoiceFromSale(req.user.id, {
          saleType: "generic",
          invoiceNumber: primaryInvoiceNumber,
          saleDate: phoneDetails.saleDate || new Date(),
          customerName: phoneDetails.customerName,
          customerNumber: phoneDetails.customerNumber,
          imei1:
            allImei1s.length > 0
              ? allImei1s.length === 1
                ? allImei1s[0]
                : allImei1s
              : undefined,
          imei2:
            allImei2s.length > 0
              ? allImei2s.length === 1
                ? allImei2s[0]
                : allImei2s
              : undefined,
          companyName:
            phoneCompanies.length > 0
              ? phoneCompanies[0]
              : firstPhone?.companyName || phoneDetails.companyName,
          modelName:
            phoneModels.length > 0
              ? phoneModels[0]
              : firstPhone?.modelName || phoneDetails.modelName,
          color:
            phoneColors.length > 0
              ? phoneColors[0]
              : firstPhone?.color || phoneDetails.color,
          ramMemory:
            phoneRams.length > 0
              ? phoneRams[0]
              : firstPhone?.ramMemory || phoneDetails.ramMemory,
          simOption:
            phoneSims.length > 0
              ? phoneSims[0]
              : firstPhone?.simOption || phoneDetails.simOption,
          batteryHealth:
            firstPhone?.batteryHealth || phoneDetails.batteryHealth,
          specifications:
            firstPhone?.specifications || phoneDetails.specifications,
          phoneCondition:
            firstPhone?.phoneCondition || phoneDetails.phoneCondition,
          warranty: phoneDetails.warranty || firstPhone?.warranty,
          salePrice: totalSalePrice,
          purchasePrice: totalPurchasePrice,
          totalInvoice: totalInvoice, // Include accessories in total
          profit: finalProfit, // Recalculate profit with accessories
          sellingPaymentType,
          bankAccountUsed,
          accountCash: totalAccountCash,
          pocketCash: totalPocketCash,
          bankName: phoneDetails.bankName,
          payableAmountNow:
            sellingPaymentType === "Credit"
              ? Number(payableAmountNow || 0)
              : undefined,
          payableAmountLater:
            sellingPaymentType === "Credit"
              ? Number(payableAmountLater || 0)
              : undefined,
          payableAmountLaterDate:
            sellingPaymentType === "Credit"
              ? payableAmountLaterDate
                ? new Date(payableAmountLaterDate)
                : undefined
              : undefined,
          exchangePhoneDetail: phoneDetails.exchangePhoneDetail,
          accessories: formattedAccessories,
          entityData: person
            ? {
                _id: person._id,
                name: entityData?.name || phoneDetails.customerName,
                number: entityData?.number || phoneDetails.customerNumber,
              }
            : entityData || {},
         singleSoldPhoneId: soldPhones.find((p) => p.type === "single")
            ?.soldPhone?._id,
          soldPhoneId: soldPhones.find((p) => p.type === "bulk")?.soldPhone
            ?._id,
          shopid: soldPhones.find((p) => p.soldPhone?.shopid)?.soldPhone?.shopid || undefined,
          imeiPrices: metadataImeiPrices,
          notes: `Generic sale of ${soldPhones.length} phone(s)`,
        });
        console.log("✅ [soldAnyPhone] Invoice created:", {
          invoiceNumber: invoiceData?.invoiceNumber,
          totalInvoice: invoiceData?.pricing?.totalInvoice,
          salePrice: invoiceData?.pricing?.salePrice,
          purchasePrice: invoiceData?.pricing?.purchasePrice,
          profit: invoiceData?.pricing?.profit,
          accessoriesCount: formattedAccessories.length,
          accessoriesTotal: accessoriesTotal,
          phoneDetails: invoiceData?.phoneDetails,
          metadata: invoiceData?.metadata,
        });
      } catch (invoiceError) {
        console.error(
          "❌ [soldAnyPhone] Error creating invoice:",
          invoiceError
        );
        // Continue even if invoice creation fails
      }

      console.log("✅ [Sale][Generic] Phones sold successfully:", {
        userId,
        soldCount: soldPhones.length,
        notFoundCount: notFoundImeis.length,
        totalProfit,
        imeiCount: resolvedImeis.length,
        sellingPaymentType,
      });

   // CURRENT (broken) — around line 6090
return res.status(200).json({
  message: "Phones sold successfully.",
  invoiceNumber: soldPhones?.[0]?.soldPhone?.invoiceNumber || "",
  soldCount: soldPhones.length,
  notFoundImeis,
  soldPhones,
});

// FIX — add phoneDetails and imeiPrices to response
return res.status(200).json({
  message: "Phones sold successfully.",
  invoiceNumber: soldPhones?.[0]?.soldPhone?.invoiceNumber || "",
  soldCount: soldPhones.length,
  notFoundImeis,
  soldPhones,
  // ✅ ADD THESE:
  companyName: phoneCompanies[0] || null,
  modelName: phoneModels[0] || null,
  color: phoneColors[0] || null,
  ramMemory: phoneRams[0] || null,
  imeiPrices: metadataImeiPrices,
  phoneDetails: {
    companyName: phoneCompanies[0] || null,
    modelName: phoneModels[0] || null,
    color: phoneColors[0] || null,
    ramMemory: phoneRams[0] || null,
  },
});
  } catch (error) {
    console.error("Error processing sold phones:", error);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};
exports.updateSoldPhone = async (req, res) => {
  try {
    const userId = req.user.id; // Extract user ID from request
    if (!userId) {
      return res.status(404).json({ message: "Authenticate please" });
    }
    const { id } = req.params;
    const updateData = req.body;
    console.log("Update data:", updateData);

    // Try to update in SingleSoldPhone first
    let singleSoldPhone = await SingleSoldPhone.findById(id);
    if (singleSoldPhone) {
      // Handle conditional fields based on sellingPaymentType
      const sellingPaymentType =
        updateData.sellingPaymentType || singleSoldPhone.sellingPaymentType;
      const previousPaymentType = singleSoldPhone.sellingPaymentType;

      // Prepare update object with $set and $unset
      const updateObject = { $set: {}, $unset: {} };

      // Set all provided fields
      Object.keys(updateData).forEach((key) => {
        if (updateData[key] !== undefined && updateData[key] !== null) {
          updateObject.$set[key] = updateData[key];
        }
      });

      // Clear conditional fields only if payment type is changing
      if (sellingPaymentType !== previousPaymentType) {
        if (sellingPaymentType !== "Credit") {
          updateObject.$unset.payableAmountNow = "";
          updateObject.$unset.payableAmountLater = "";
          updateObject.$unset.payableAmountLaterDate = "";
          // Remove from $set if they exist to avoid conflict
          delete updateObject.$set.payableAmountNow;
          delete updateObject.$set.payableAmountLater;
          delete updateObject.$set.payableAmountLaterDate;
        }
        if (sellingPaymentType !== "Bank") {
          updateObject.$unset.bankName = "";
          // Remove from $set if it exists to avoid conflict
          delete updateObject.$set.bankName;
        }
        if (sellingPaymentType !== "Exchange") {
          updateObject.$unset.exchangePhoneDetail = "";
          // Remove from $set if it exists to avoid conflict
          delete updateObject.$set.exchangePhoneDetail;
        }
      }

      // Remove empty $unset if no fields to unset
      if (Object.keys(updateObject.$unset).length === 0) {
        delete updateObject.$unset;
      }
      if (Object.keys(updateObject.$set).length === 0) {
        delete updateObject.$set;
      }

      console.log(
        "Update object for SingleSoldPhone:",
        JSON.stringify(updateObject, null, 2)
      );

      // Use findByIdAndUpdate with runValidators
      const updated = await SingleSoldPhone.findByIdAndUpdate(
        id,
        updateObject,
        { new: true, runValidators: true }
      );

      if (!updated) {
        return res
          .status(404)
          .json({ message: "Single sold phone record not found" });
      }

      return res.status(200).json({
        message: "Single sold phone record updated successfully",
        soldPhone: updated,
      });
    }
    console.log(
      "Single sold phone not found, checking SoldPhone...",
      singleSoldPhone
    );

    // Find the sold phone record
    const soldPhone = await SoldPhone.findById(id);
    if (!soldPhone) {
      return res.status(404).json({ message: "Sold phone record not found" });
    }

    // Handle conditional fields based on sellingPaymentType
    const sellingPaymentType =
      updateData.sellingPaymentType || soldPhone.sellingPaymentType;
    const previousPaymentType = soldPhone.sellingPaymentType;

    // Prepare update object with $set and $unset
    const updateObject = { $set: {}, $unset: {} };

    // Set all provided fields
    Object.keys(updateData).forEach((key) => {
      if (updateData[key] !== undefined && updateData[key] !== null) {
        updateObject.$set[key] = updateData[key];
      }
    });

    // Clear conditional fields only if payment type is changing
    if (sellingPaymentType !== previousPaymentType) {
      if (sellingPaymentType !== "Credit") {
        updateObject.$unset.payableAmountNow = "";
        updateObject.$unset.payableAmountLater = "";
        updateObject.$unset.payableAmountLaterDate = "";
        // Remove from $set if they exist to avoid conflict
        delete updateObject.$set.payableAmountNow;
        delete updateObject.$set.payableAmountLater;
        delete updateObject.$set.payableAmountLaterDate;
      }
      if (sellingPaymentType !== "Bank") {
        updateObject.$unset.bankName = "";
        // Remove from $set if it exists to avoid conflict
        delete updateObject.$set.bankName;
      }
      if (sellingPaymentType !== "Exchange") {
        updateObject.$unset.exchangePhoneDetail = "";
        // Remove from $set if it exists to avoid conflict
        delete updateObject.$set.exchangePhoneDetail;
      }
    }

    // Remove empty $unset if no fields to unset
    if (Object.keys(updateObject.$unset).length === 0) {
      delete updateObject.$unset;
    }
    if (Object.keys(updateObject.$set).length === 0) {
      delete updateObject.$set;
    }

    console.log(
      "Update object for SoldPhone:",
      JSON.stringify(updateObject, null, 2)
    );

    // Use findByIdAndUpdate with runValidators
    const updated = await SoldPhone.findByIdAndUpdate(id, updateObject, {
      new: true,
      runValidators: true,
    });

    if (!updated) {
      return res.status(404).json({ message: "Sold phone record not found" });
    }

    return res.status(200).json({
      message: "Sold phone record updated successfully",
      soldPhone: updated,
    });
  } catch (error) {
    console.error("Error updating sold phone:", error);
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

exports.deleteSoldPhone = async (req, res) => {
  try {
    const { id } = req.params;
    console.log("id", id);

    // Validate id before querying

    // Check if the sold phone exists in SingleSoldPhone as well
    let singleSoldPhone = await SingleSoldPhone.findById(id);
    if (singleSoldPhone) {
      await SingleSoldPhone.findByIdAndDelete(id);
      return res
        .status(200)
        .json({ message: "Single sold phone record deleted successfully" });
    }

    // Find the sold phone record
    const soldPhone = await SoldPhone.findById(id);
    if (!soldPhone) {
      return res.status(404).json({ message: "Sold phone record not found" });
    }

    // Delete the sold phone record
    await SoldPhone.findByIdAndDelete(id);
    return res
      .status(200)
      .json({ message: "Sold phone record deleted successfully" });
  } catch (error) {
    console.error("Error deleting sold phone:", error);
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};
exports.getDetailByImeiNumber = async (req, res) => {
  try {
    let { imei } = req.params;
    const userId = req.user.id;

    if (!imei) {
      return res.status(400).json({ error: "IMEI number is required." });
    }

    // Support comma-separated IMEIs
    let imeiList = Array.isArray(imei)
      ? imei
      : imei
          .split(",")
          .map((i) => i.trim())
          .filter(Boolean);

    const results = [];

    for (const singleImei of imeiList) {
      // 1. Check in single purchase
      const singlePurchasePhone = await PurchasePhone.findOne({
        userId,
        $or: [{ imei1: singleImei }, { imei2: singleImei }],
      });

      if (singlePurchasePhone) {
        results.push({
          imei1: singlePurchasePhone.imei1,
          companyName: singlePurchasePhone.companyName,
          modelName: singlePurchasePhone.modelName,
          specifications: singlePurchasePhone.specifications,
          ramMemory: singlePurchasePhone.ramMemory,
          batteryHealth: singlePurchasePhone.batteryHealth,
          color: singlePurchasePhone.color,
          simOption: singlePurchasePhone.simOption || "",
          imeiImage: singlePurchasePhone.imeiImage || null, // ✅ ADD: Include image URL
          type: "single",
        });
        continue;
      }

      // 2. Check in bulk purchase (deep search in IMEI collection)
      const bulkPhones = await BulkPhonePurchase.find({ userId }).populate({
        path: "ramSimDetails",
        populate: { path: "imeiNumbers" },
      });

      let found = false;
      for (const bulkPhone of bulkPhones) {
        for (const ramSim of bulkPhone.ramSimDetails) {
          for (const imeiDoc of ramSim.imeiNumbers) {
            if (imeiDoc.imei1 === singleImei || imeiDoc.imei2 === singleImei) {
              results.push({
                imei1: imeiDoc.imei1,
                companyName: ramSim.companyName || bulkPhone.companyName,
                modelName: ramSim.modelName || bulkPhone.modelName,
                specifications: ramSim.specifications || "",
                ramMemory: ramSim.ramMemory,
                batteryHealth:
                  imeiDoc.batteryHealth || ramSim.batteryHealth || "",
                color: imeiDoc.color || "",
                simOption: ramSim.simOption || "",
                imeiImage: imeiDoc.imeiImage || null, // ✅ ADD: Include image URL from bulk Imei
                type: "bulk",
              });
              found = true;
              break;
            }
          }
          if (found) break;
        }
        if (found) break;
      }

      if (!found) {
        results.push({
          imei1: singleImei,
          type: "not_found",
        });
      }
    }

    return res.status(200).json({ results });
  } catch (error) {
    console.error("Error fetching phone details by IMEI:", error);
    return res.status(500).json({ error: "Internal server error." });
  }
};
exports.returnSingleSoldToPurchase = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { newBuyingPrice, remainingWarranty } = req.body;

    console.log(
      "Returning single sold phone to purchase:",
      id,
      userId,
      newBuyingPrice,
      remainingWarranty
    );
    if (!userId) {
      return res.status(404).json({ message: "Authenticate please" });
    }
    // Only handle SingleSoldPhone
    const singleSoldPhone = await SingleSoldPhone.findById(id);
    if (!singleSoldPhone) {
      return res
        .status(404)
        .json({ message: "Single sold phone record not found" });
    }
    console.log("Single sold phone record found:", singleSoldPhone);

    // Create a new PurchasePhone record from SingleSoldPhone
    const purchasePhone = new PurchasePhone({
      userId,
      shopid: singleSoldPhone.shopid,
      name: singleSoldPhone.name,
      mobileNumber: singleSoldPhone.mobileNumber,
      fatherName: singleSoldPhone.fatherName,
      cnic:
        singleSoldPhone.cnicNumber ||
        singleSoldPhone.customerCnic ||
        singleSoldPhone.cnic ||
        "", // Fix: ensure cnic is set
      companyName: singleSoldPhone.companyName,
      modelName: singleSoldPhone.modelName,
      date: singleSoldPhone.purchaseDate,
      phoneCondition: singleSoldPhone.phoneCondition,
      warranty: remainingWarranty || singleSoldPhone.warranty,
      specifications: singleSoldPhone.specifications,
      ramMemory: singleSoldPhone.ramMemory,
      color: singleSoldPhone.color,
      imei1: singleSoldPhone.imei1,
      imei2: singleSoldPhone.imei2,
      phonePicture: singleSoldPhone.phonePicture,
      personPicture: singleSoldPhone.personPicture,
      accessories: singleSoldPhone.accessories,
      price: {
        purchasePrice: Number(newBuyingPrice) || singleSoldPhone.purchasePrice,
        finalPrice: singleSoldPhone.finalPrice,
        demandPrice: singleSoldPhone.demandPrice,
      },
      isApprovedFromEgadgets: singleSoldPhone.isApprovedFromEgadgets,
      eGadgetStatusPicture: singleSoldPhone.eGadgetStatusPicture,
      invoiceNumber: singleSoldPhone.invoiceNumber,
    });
    await purchasePhone.save();

    // Delete the sold phone record
    await SingleSoldPhone.findByIdAndDelete(id);
    return res.status(200).json({
      message: "Single sold phone record returned to purchase successfully",
      purchasePhone,
    });
  } catch (error) {
    console.error("Error returning sold phone to purchase:", error);
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

exports.returnBulkSoldToPurchase = async (req, res) => {
  try {
    const {
      bulkSoldId,
      imeiNumbersWithPrices = [],
      pocketCash,
      bankAccountUsed,
      accountCash,
      deviceInfo = {}, // optional fallback for required fields when SoldPhone lacks them
    } = req.body;

    // Validate input
    if (
      !bulkSoldId &&
      (!imeiNumbersWithPrices || imeiNumbersWithPrices.length === 0)
    ) {
      return res.status(400).json({
        message: "Either bulkSoldId or imeiNumbersWithPrices array is required",
      });
    }

    // Find the sold phone record
    const soldPhone = await SoldPhone.findById(bulkSoldId);
    if (!soldPhone) {
      return res.status(404).json({ message: "Sold phone record not found" });
    }

    // Use IMEI arrays directly from SoldPhone; do not rely on BulkPhonePurchase
    const soldImei1List = Array.isArray(soldPhone.imei1)
      ? soldPhone.imei1.map(String)
      : soldPhone.imei1
      ? [String(soldPhone.imei1)]
      : [];

    let phonesToReturn = [];
    let totalReturnPrice = 0;

    if (imeiNumbersWithPrices.length > 0) {
      // Return specific phones with their return prices
      for (const imeiWithPrice of imeiNumbersWithPrices) {
        const imei1Value = String(imeiWithPrice.imei1);
        if (soldImei1List.includes(imei1Value)) {
          phonesToReturn.push({
            imei1: imei1Value,
            returnPrice: Number(imeiWithPrice.returnPrice),
            originalSalePrice: Number(soldPhone.salePrice),
            originalPurchasePrice: Number(soldPhone.purchasePrice),
          });
          totalReturnPrice += Number(imeiWithPrice.returnPrice);
        }
      }
    } else {
      // Return all phones from the bulk purchase
      for (const imei1Value of soldImei1List) {
        phonesToReturn.push({
          imei1: imei1Value,
          returnPrice: Number(soldPhone.salePrice), // default to sale price
          originalSalePrice: Number(soldPhone.salePrice),
          originalPurchasePrice: Number(soldPhone.purchasePrice),
        });
        totalReturnPrice += Number(soldPhone.salePrice);
      }
    }

    // Handle bank account deduction
    if (bankAccountUsed && accountCash) {
      const bank = await AddBankAccount.findById(bankAccountUsed);
      if (!bank) {
        return res.status(404).json({ message: "Bank account not found" });
      }

      if (accountCash > bank.accountCash) {
        return res
          .status(400)
          .json({ message: "Insufficient bank account balance" });
      }

      bank.accountCash -= accountCash;
      await bank.save();

      await BankTransaction.create({
        bankId: bank._id,
        userId: req.user.id,
        reasonOfAmountDeduction: `Return of bulk phones - Total return amount ( purchase ): ${totalReturnPrice}`,
        accountCash: accountCash,
        accountType: bank.accountType,
      });
    }

    // Handle pocket cash deduction
    if (pocketCash) {
      const pocketTransaction = await PocketCashSchema.findOne({
        userId: req.user.id,
      });
      if (!pocketTransaction) {
        return res
          .status(404)
          .json({ message: "Pocket cash account not found" });
      }

      if (pocketCash > pocketTransaction.accountCash) {
        return res.status(400).json({ message: "Insufficient pocket cash" });
      }

      pocketTransaction.accountCash -= pocketCash;
      await pocketTransaction.save();

      await PocketCashTransactionSchema.create({
        userId: req.user.id,
        pocketCashId: pocketTransaction._id,
        amountDeducted: pocketCash,
        accountCash: pocketTransaction.accountCash,
        remainingAmount: pocketTransaction.accountCash,
        reasonOfAmountDeduction: `Return of bulk phones - Total return amount( purchase ): ${totalReturnPrice}`,
      });
    }

    // Handle credit manipulation if the original sale was on credit
    if (
      soldPhone.sellingPaymentType === "Credit" &&
      soldPhone.payableAmountLater
    ) {
      // Lookup person by customer number + user
      let person = await Person.findOne({
        number: Number(soldPhone.customerNumber),
        userId: req.user.id,
      });
      if (person) {
        const payableAmountLater = Number(soldPhone.payableAmountLater);
        const returnPrice = totalReturnPrice;

        let remainingAmount = 0;
        let creditType = "";
        let creditAmount = 0;

        if (returnPrice > payableAmountLater) {
          // Person owes us more
          remainingAmount = returnPrice - payableAmountLater;
          creditType = "takingCredit";
          creditAmount = remainingAmount;
          person.takingCredit =
            Number(person.takingCredit || 0) + remainingAmount;
        } else {
          // We owe person
          remainingAmount = payableAmountLater - returnPrice;
          creditType = "givingCredit";
          creditAmount = remainingAmount;
          person.givingCredit =
            Number(person.givingCredit || 0) + remainingAmount;
        }

        person.status =
          creditType === "takingCredit" ? "Payable" : "Receivable";
        await person.save();

        // Create credit transaction
        await CreditTransaction.create({
          userId: req.user.id,
          personId: person._id,
          [creditType]: creditAmount,
          balanceAmount:
            creditType === "takingCredit"
              ? Number(person.takingCredit || 0)
              : Number(person.givingCredit || 0),
          description: `Phone return adjustment - Return amount: ${returnPrice}, Original credit: ${payableAmountLater}, ${creditType}: ${creditAmount}`,
        });
      }
    }

    // Create a new bulk purchase record for returned phones
    const resolvedCompanyName =
      soldPhone.companyName || deviceInfo.companyName || "Unknown";
    const resolvedModelName =
      soldPhone.modelName || deviceInfo.modelName || "Unknown";
    const resolvedRamMemory =
      soldPhone.ramMemory || deviceInfo.ramMemory || "N/A";
    const resolvedSpecifications = deviceInfo.specifications || "Returned";
    const resolvedPhoneCondition = deviceInfo.phoneCondition || "Used";
    const resolvedWarranty =
      soldPhone.warranty || deviceInfo.warranty || "12 month";

    // Create bulk purchase record for returned phones
    const bulkReturnPurchase = new BulkPhonePurchase({
      userId: req.user.id,
      date: new Date(),
      prices: {
        buyingPrice: totalReturnPrice.toString(),
        dealerPrice: totalReturnPrice.toString(),
      },
      purchasePaymentType: "full-payment",
      purchasePaymentStatus: "paid",
      status: "Available",
      cnicFrontPic: soldPhone.cnicFrontPic || undefined,
      cnicBackPic: soldPhone.cnicBackPic || undefined,
    });

    const savedBulkReturn = await bulkReturnPurchase.save();

    // Create RamSim record for the returned phones
    const ramSimData = new RamSim({
      companyName: resolvedCompanyName,
      modelName: resolvedModelName,
      batteryHealth: deviceInfo.batteryHealth || "Unknown",
      ramMemory: resolvedRamMemory,
      simOption: deviceInfo.simOption || "Dual",
      priceOfOne: totalReturnPrice / phonesToReturn.length, // Average price per phone
      bulkPhonePurchaseId: savedBulkReturn._id,
    });

    const savedRamSim = await ramSimData.save();

    // Create IMEI records for returned phones
    const imeiNumbers = await Promise.all(
      phonesToReturn.map(async (phone) => {
        const newImei = new Imei({
          imei1: phone.imei1,
          imei2: phone.imei2 || undefined,
          color: soldPhone.color || deviceInfo.color || "",
          batteryHealth: deviceInfo.batteryHealth || "Unknown",
          ramSimId: savedRamSim._id,
        });
        return await newImei.save();
      })
    );

    savedRamSim.imeiNumbers = imeiNumbers;
    await savedRamSim.save();

    savedBulkReturn.ramSimDetails = [savedRamSim._id];
    await savedBulkReturn.save();

    // Calculate and update profit for the sold phone record
    let totalProfitAdjustment = 0;
    for (const phone of phonesToReturn) {
      const previousProfit =
        Number(phone.originalSalePrice) - Number(phone.originalPurchasePrice);
      const profitAdjustment = previousProfit - Number(phone.returnPrice);
      totalProfitAdjustment += profitAdjustment;
    }
    soldPhone.profit = Number(soldPhone.profit || 0) - totalProfitAdjustment;

    // Remove returned IMEIs from the sold phone record
    const returnedImei1s = phonesToReturn.map((phone) => String(phone.imei1));
    const remainingImeis = (soldPhone.imei1 || []).filter(
      (imei) => !returnedImei1s.includes(String(imei))
    );

    if (remainingImeis.length === 0) {
      // All phones returned, delete the sold phone record
      await SoldPhone.findByIdAndDelete(bulkSoldId);
    } else {
      // Some phones remain, update the record
      soldPhone.imei1 = remainingImeis;
      await soldPhone.save();
    }

    res.status(200).json({
      message: "Phones returned successfully as bulk purchase",
      data: {
        bulkReturnPurchase: savedBulkReturn,
        totalReturnPrice,
        returnedPhoneCount: phonesToReturn.length,
        remainingImeis: remainingImeis.length,
        soldPhoneDeleted: remainingImeis.length === 0,
      },
    });
  } catch (error) {
    console.error("Error returning bulk sold phones:", error);
    res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Get all IMEI1 data for both single and bulk phones by userId
exports.getAllImeis = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get IMEI1 from single purchase phones
    const singlePhones = await PurchasePhone.find(
      { userId: userId },
      {
        imei1: 1,
        companyName: 1,
        modelName: 1,
        color: 1,
        ramMemory: 1,
        status: 1,
        createdAt: 1,
      }
    ).sort({ createdAt: -1 });

    // Get IMEI1 from bulk purchase phones through RamSim and Imei collections
    const bulkPhones = await BulkPhonePurchase.find({ userId: userId })
      .populate({
        path: "ramSimDetails",
        populate: {
          path: "imeiNumbers",
          select: "imei1 imei2 batteryHealth color status",
        },
      })
      .select("companyName modelName date createdAt status");

    // Format single phones data
    const singlePhonesData = singlePhones.map((phone) => ({
      imei1: phone.imei1,
      phoneType: "single",
      companyName: phone.companyName,
      modelName: phone.modelName,
      color: phone.color,
      ramMemory: phone.ramMemory,
      status: phone.status,
      purchaseDate: phone.createdAt,
    }));

    // Format bulk phones data
    const bulkPhonesData = [];
    bulkPhones.forEach((bulkPhone) => {
      bulkPhone.ramSimDetails.forEach((ramSim) => {
        ramSim.imeiNumbers.forEach((imei) => {
          bulkPhonesData.push({
            imei1: imei.imei1,
            phoneType: "bulk",
            companyName: bulkPhone.companyName,
            modelName: ramSim.modelName,
            color: imei.color,
            ramMemory: ramSim.ramMemory,
            status: imei.status,
            purchaseDate: bulkPhone.createdAt,
          });
        });
      });
    });

    // Combine and sort all IMEI data
    const allImeis = [...singlePhonesData, ...bulkPhonesData].sort(
      (a, b) => new Date(b.purchaseDate) - new Date(a.purchaseDate)
    );

    res.status(200).json({
      success: true,
      message: "All IMEI1 data retrieved successfully",
      data: {
        totalCount: allImeis.length,
        singlePhonesCount: singlePhonesData.length,
        bulkPhonesCount: bulkPhonesData.length,
        imeis: allImeis,
      },
    });
  } catch (error) {
    console.error("Error in getAllImeis:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Return purchase phone (single or bulk) to supplier
exports.returnPurchasePhone = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { phoneType, returnAmount, bankAccountUsed, amountFromPocket } =
      req.body;

    // Validate input
    if (!id) {
      return res.status(400).json({ message: "Purchase phone ID is required" });
    }

    if (!phoneType || !["single", "bulk"].includes(phoneType)) {
      return res.status(400).json({
        message: "phoneType is required and must be 'single' or 'bulk'",
      });
    }

    if (phoneType === "single") {
      // Handle single phone return
      const purchasePhone = await PurchasePhone.findOne({
        _id: id,
        userId,
      });

      if (!purchasePhone) {
        return res
          .status(404)
          .json({ message: "Purchase phone not found or unauthorized" });
      }

      if (purchasePhone.status === "Sold") {
        return res.status(400).json({
          message:
            "Cannot return a sold phone. Please return from sold phones instead.",
        });
      }

      // Calculate return amount (use purchase price if not provided)
      const amountToReturn =
        returnAmount || purchasePhone.price?.purchasePrice || 0;

      // Handle bank payment return
      if (bankAccountUsed && amountFromPocket === 0) {
        const bank = await AddBankAccount.findById(bankAccountUsed);
        if (!bank) {
          return res.status(404).json({ message: "Bank account not found" });
        }

        bank.accountCash += Number(amountToReturn);
        await bank.save();

        await BankTransaction.create({
          bankId: bank._id,
          userId,
          sourceOfAmountAddition: `Return of purchase phone: ${purchasePhone.companyName} ${purchasePhone.modelName} (IMEI: ${purchasePhone.imei1})`,
          amount: Number(amountToReturn),
          accountCash: bank.accountCash,
          accountType: bank.accountType,
        });
      }

      // Handle pocket cash return
      if (amountFromPocket > 0) {
        const pocket = await PocketCashSchema.findOne({ userId });
        if (!pocket) {
          return res
            .status(404)
            .json({ message: "Pocket cash account not found" });
        }

        pocket.accountCash += Number(amountFromPocket);
        await pocket.save();

        await PocketCashTransactionSchema.create({
          userId,
          pocketCashId: pocket._id,
          amountAdded: Number(amountFromPocket),
          accountCash: pocket.accountCash,
          sourceOfAmountAddition: `Return of purchase phone: ${purchasePhone.companyName} ${purchasePhone.modelName} (IMEI: ${purchasePhone.imei1})`,
        });
      }

      // Handle credit adjustment if person exists
      if (purchasePhone.personId) {
        const person = await Person.findById(purchasePhone.personId);
        if (person) {
          const creditAmount = Number(amountToReturn);
          if (person.takingCredit > 0) {
            person.takingCredit = Math.max(
              0,
              person.takingCredit - creditAmount
            );
            if (person.takingCredit === 0 && person.givingCredit === 0) {
              person.status = "Settled";
            }
            await person.save();

            await CreditTransaction.create({
              userId,
              personId: person._id,
              takingCredit: -creditAmount,
              balanceAmount: person.takingCredit,
              description: `Return of purchase phone: ${purchasePhone.companyName} ${purchasePhone.modelName} - Credit adjustment: ${creditAmount}`,
            });
          }
        }
      }

      // Delete the purchase phone record
      await PurchasePhone.findByIdAndDelete(id);

      res.status(200).json({
        message: "Purchase phone returned successfully",
        returnedAmount: amountToReturn,
      });
    } else {
      // Handle bulk phone return
      const bulkPurchase = await BulkPhonePurchase.findOne({
        _id: id,
        userId,
      }).populate("ramSimDetails");

      if (!bulkPurchase) {
        return res
          .status(404)
          .json({ message: "Bulk purchase phone not found or unauthorized" });
      }

      if (bulkPurchase.status === "Sold") {
        return res.status(400).json({
          message: "Cannot return a fully sold bulk purchase.",
        });
      }

      // Calculate return amount
      const totalPhones = bulkPurchase.ramSimDetails.reduce((sum, ramSim) => {
        return sum + (ramSim.imeiNumbers?.length || 0);
      }, 0);

      const pricePerPhone = bulkPurchase.prices?.buyingPrice
        ? Number(bulkPurchase.prices.buyingPrice)
        : 0;
      const amountToReturn = returnAmount || totalPhones * pricePerPhone;

      // Handle bank payment return
      if (bankAccountUsed && amountFromPocket === 0) {
        const bank = await AddBankAccount.findById(bankAccountUsed);
        if (!bank) {
          return res.status(404).json({ message: "Bank account not found" });
        }

        bank.accountCash += Number(amountToReturn);
        await bank.save();

        await BankTransaction.create({
          bankId: bank._id,
          userId,
          sourceOfAmountAddition: `Return of bulk purchase: ${bulkPurchase.companyName} (${totalPhones} phones)`,
          amount: Number(amountToReturn),
          accountCash: bank.accountCash,
          accountType: bank.accountType,
        });
      }

      // Handle pocket cash return
      if (amountFromPocket > 0) {
        const pocket = await PocketCashSchema.findOne({ userId });
        if (!pocket) {
          return res
            .status(404)
            .json({ message: "Pocket cash account not found" });
        }

        pocket.accountCash += Number(amountFromPocket);
        await pocket.save();

        await PocketCashTransactionSchema.create({
          userId,
          pocketCashId: pocket._id,
          amountAdded: Number(amountFromPocket),
          accountCash: pocket.accountCash,
          sourceOfAmountAddition: `Return of bulk purchase: ${bulkPurchase.companyName} (${totalPhones} phones)`,
        });
      }

      // Handle credit adjustment if person exists
      if (bulkPurchase.personId) {
        const person = await Person.findById(bulkPurchase.personId);
        if (person) {
          const creditAmount = Number(amountToReturn);
          if (person.takingCredit > 0) {
            person.takingCredit = Math.max(
              0,
              person.takingCredit - creditAmount
            );
            if (person.takingCredit === 0 && person.givingCredit === 0) {
              person.status = "Settled";
            }
            await person.save();

            await CreditTransaction.create({
              userId,
              personId: person._id,
              takingCredit: -creditAmount,
              balanceAmount: person.takingCredit,
              description: `Return of bulk purchase: ${bulkPurchase.companyName} - Credit adjustment: ${creditAmount}`,
            });
          }
        }
      }

      // Delete all related IMEIs and RamSim records
      for (const ramSim of bulkPurchase.ramSimDetails) {
        if (ramSim.imeiNumbers && ramSim.imeiNumbers.length > 0) {
          await Imei.deleteMany({ _id: { $in: ramSim.imeiNumbers } });
        }
        await RamSim.findByIdAndDelete(ramSim._id);
      }

      // Delete the bulk purchase record
      await BulkPhonePurchase.findByIdAndDelete(id);

      res.status(200).json({
        message: "Bulk purchase phone returned successfully",
        returnedAmount: amountToReturn,
      });
    }
  } catch (error) {
    console.error("Error returning purchase phone:", error);
    res.status(500).json({
      message: "Failed to return purchase phone",
      error: error.message,
    });
  }
};