const {
  Accessory,
  AccessoryTransaction,
} = require("../schema/accessorySchema");
const Ledger = require("../schema/LedgerSchema");
const {
  Person,
  CreditTransaction,
} = require("../schema/PayablesAndReceiveablesSchema");
const {
  PurchasePhone,
  SoldPhone,
  SingleSoldPhone,
  BulkPhonePurchase,
} = require("../schema/purchasePhoneSchema");
const { Expense } = require("../schema/ExpenseSchema");
const RepairJob = require("../schema/repairJobSchema");
const { getTodaysLedger } = require("./ledgerController");
// exports.getToDayBook = async (req, res) => {
//     try {
//       const today = new Date();
//       today.setHours(0,0,0,0);
//       const tomorrow = new Date(today);
//         tomorrow.setDate(tomorrow.getDate() + 1);

//         const [ledger,purchasedSinglePhone,purchaseBulkPhone,soldSinglePhone, soldBulkPhone] = await Promise.all([
//             Ledger.find({createdAt: { $gte: today, $lt: tomorrow }}),
//             PurchasePhone.find({createdAt: { $gte: today, $lt: tomorrow }}),
//             BulkPhonePurchase.find({createdAt: { $gte: today, $lt: tomorrow }}),
//             SingleSoldPhone.find({createdAt: { $gte: today, $lt: tomorrow }}),
//             SoldPhone.find({createdAt: { $gte: today, $lt: tomorrow }}),
//         ]);

//         res.status(200).json({
//             message: "Today's records fetched successfully",
//             data: {
//                 ledger,
//                 purchasedSinglePhone,
//                 purchaseBulkPhone,
//                 soldSinglePhone,
//                 soldBulkPhone
//             },
//           });
//     }
//     catch (err) {
//         console.log(err);
//         res.status(500).json({ message: "Internal Server Error" });
//     }
// }
// exports.getToDayBook = async (req, res) => {
//     try {
//       const userId = req.user.id;

//       const today = new Date();
//       today.setHours(0, 0, 0, 0);
//       const tomorrow = new Date(today);
//       tomorrow.setDate(tomorrow.getDate() + 1);

//       const [ledger, purchasedSinglePhone, purchaseBulkPhone, soldSinglePhone, soldBulkPhone] = await Promise.all([
//         Ledger.find({ userId, createdAt: { $gte: today, $lt: tomorrow } }),
//         PurchasePhone.find({ userId, createdAt: { $gte: today, $lt: tomorrow } }),
//         BulkPhonePurchase.find({ userId, createdAt: { $gte: today, $lt: tomorrow } }),
//         SingleSoldPhone.find({ userId, createdAt: { $gte: today, $lt: tomorrow } }),
//         SoldPhone.find({ userId, createdAt: { $gte: today, $lt: tomorrow } }),
//       ]);

//       res.status(200).json({
//         message: "Today's records fetched successfully",
//         data: {
//           ledger,
//           purchasedSinglePhone,
//           purchaseBulkPhone,
//           soldSinglePhone,
//           soldBulkPhone,
//         },
//       });
//     } catch (err) {
//       console.log(err);
//       res.status(500).json({ message: "Internal Server Error" });
//     }
// //   };
// exports.getToDayBook = async (req, res) => {
//   try {
//     const userId = req.user.id;
//     const dateParam = req.query.date;

//     let selectedDate = new Date();
//     if (dateParam) {
//       selectedDate = new Date(dateParam);
//       if (isNaN(selectedDate.getTime())) {
//         return res.status(400).json({ message: "Invalid date format. Use YYYY-MM-DD." });
//       }
//     }

//     // Set start and end of the day
//     selectedDate.setHours(0, 0, 0, 0);
//     const nextDate = new Date(selectedDate);
//     nextDate.setDate(nextDate.getDate() + 1);

//     const [ledger, purchasedSinglePhone, purchaseBulkPhone, soldSinglePhone, soldBulkPhone] = await Promise.all([
//       Ledger.find({ userId, createdAt: { $gte: selectedDate, $lt: nextDate } }),
//       PurchasePhone.find({ userId, createdAt: { $gte: selectedDate, $lt: nextDate } }),
//       BulkPhonePurchase.find({ userId, createdAt: { $gte: selectedDate, $lt: nextDate } }).populate('ramSimDetails'),
//       SingleSoldPhone.find({ userId, createdAt: { $gte: selectedDate, $lt: nextDate } }),
//       SoldPhone.find({ userId, createdAt: { $gte: selectedDate, $lt: nextDate } }).populate({
//         path: "bulkPhonePurchaseId",
//         select: "prices.buyingPrice"
//       }),
//     ]);
//     const [allSinglePhones, allBulkPhones] = await Promise.all([
//       PurchasePhone.find({ userId }),
//       BulkPhonePurchase.find({ userId })
//         .populate({
//           path: "ramSimDetails",
//           populate: {
//             path: "imeiNumbers"
//           }
//         }),
//     ]);

//     // === SINGLE PHONES ===
//     const totalSinglePhones = allSinglePhones.length;

//     const totalSingleAmount = allSinglePhones.reduce((sum, phone) => {
//       return sum + (phone.price?.purchasePrice || 0);
//     }, 0);

//     // === BULK PHONES ===
//     let totalBulkPhones = 0;
//     let totalBulkAmount = 0;

//     allBulkPhones.forEach((bulk) => {
//       if (!bulk.ramSimDetails) return;

//       bulk.ramSimDetails.forEach((ramSim) => {
//         const imeiCount = ramSim.imeiNumbers?.length || 0;
//         const priceOfOne = parseFloat(ramSim.priceOfOne) || 0;

//         totalBulkPhones += imeiCount;
//         totalBulkAmount += imeiCount * priceOfOne;
//       });
//     });

//     const totalStockCount = totalSinglePhones + totalBulkPhones;
//     const totalStockAmount = totalSingleAmount + totalBulkAmount;

//     res.status(200).json({
//       message: `Records fetched for ${dateParam || 'today'}`,
//       data: {
//         ledger,
//         purchasedSinglePhone,
//         purchaseBulkPhone,
//         soldSinglePhone,
//         soldBulkPhone,
//         totalStockCount,
//         totalStockAmount,
//       },
//     });

//   } catch (err) {
//     console.log("Error in getToDayBook:", err);
//     res.status(500).json({ message: "Internal Server Error" });
//   }
// };

const DAY_RESET_HOUR = 6;

const setBusinessDayStart = (d) => {
  const x = new Date(d);
  x.setHours(DAY_RESET_HOUR, 0, 0, 0);
  return x;
};

exports.getToDayBook = async (req, res) => {
  try {
    const userId = req.user.id;
    const dateParam = req.query.date;
    const startParam = req.query.startDate;
    const endParam = req.query.endDate;

    let selectedDate = new Date();
    let nextDate;

    // If both startDate and endDate are provided, use range mode
    if (startParam && endParam) {
      const start = new Date(startParam);
      const end = new Date(endParam);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({
          message:
            "Invalid date range. Use YYYY-MM-DD for startDate and endDate.",
        });
      }
      // Normalize to business day window [start@06:00, end+1day@06:00)
      selectedDate = setBusinessDayStart(start);
      nextDate = setBusinessDayStart(end);
      nextDate.setDate(nextDate.getDate() + 1);
    } else {
      // Fallback to single day mode (existing behavior)
      if (dateParam) {
        selectedDate = new Date(dateParam);
        if (isNaN(selectedDate.getTime())) {
          return res
            .status(400)
            .json({ message: "Invalid date format. Use YYYY-MM-DD." });
        }
      }
      // Default window is business day [06:00, next day 06:00)
      if (dateParam) {
        selectedDate = setBusinessDayStart(selectedDate);
        nextDate = new Date(selectedDate);
        nextDate.setDate(nextDate.getDate() + 1);
      } else {
        // No explicit date: before 6 AM still belongs to previous business day
        const now = new Date();
        const start = setBusinessDayStart(now);
        if (now < start) {
          start.setDate(start.getDate() - 1);
        }
        selectedDate = start;
        nextDate = new Date(selectedDate);
        nextDate.setDate(nextDate.getDate() + 1);
      }
    }

    const [
      ledger,
      purchasedSinglePhone,
      purchaseBulkPhone,
      soldSinglePhone,
      soldBulkPhone,
      allSinglePhones,
      allBulkPhones,
      persons,
      creditTransactions,
      accessories,
      accessoryTransactions,
      expenses,
      repairJobs,
    ] = await Promise.all([
      Ledger.find({ userId, createdAt: { $gte: selectedDate, $lt: nextDate } }),
      PurchasePhone.find({
        userId,
        createdAt: { $gte: selectedDate, $lt: nextDate },
      }),
      BulkPhonePurchase.find({
        userId,
        createdAt: { $gte: selectedDate, $lt: nextDate },
      }).populate("ramSimDetails"),
      SingleSoldPhone.find({
        userId,
        createdAt: { $gte: selectedDate, $lt: nextDate },
      }),
      SoldPhone.find({
        userId,
        createdAt: { $gte: selectedDate, $lt: nextDate },
      }).populate({
        path: "bulkPhonePurchaseId",
        select: "prices.buyingPrice salePrice",
      }),
      PurchasePhone.find({ userId }),
      BulkPhonePurchase.find({ userId }).populate({
        path: "ramSimDetails",
        populate: {
          path: "imeiNumbers",
        },
      }),
      Person.find({ userId }),
      CreditTransaction.find({
        userId,
        createdAt: { $gte: selectedDate, $lt: nextDate },
      }),
      Accessory.find({
        userId,
        //  updatedAt: { $gte: selectedDate, $lt: nextDate }
      }),
      AccessoryTransaction.find({
        userId,
        createdAt: { $gte: selectedDate, $lt: nextDate },
      }),
      Expense.find({
        userId,
        date: { $gte: selectedDate, $lt: nextDate },
      }),
      RepairJob.find({
        userId,
        createdAt: { $gte: selectedDate, $lt: nextDate },
      }),
    ]);
    console.log("accessories", accessories);
    // === PHONE STOCK CALCULATIONS ===
    // Filter out sold single phones
    const availableSinglePhones = allSinglePhones.filter(
      (phone) => phone.status !== "Sold" && !phone.isSold
    );
    const totalSinglePhones = availableSinglePhones.length;
    const totalSingleAmount = availableSinglePhones.reduce(
      (sum, phone) => sum + (phone.price?.purchasePrice || 0),
      0
    );
    const totalSingleNewAmount = availableSinglePhones.reduce(
      (sum, phone) =>
        phone.phoneCondition === "New"
          ? sum + (phone.price?.purchasePrice || 0)
          : sum,
      0
    );
    const totalSingleUsedAmount = availableSinglePhones.reduce(
      (sum, phone) =>
        phone.phoneCondition === "Used"
          ? sum + (phone.price?.purchasePrice || 0)
          : sum,
      0
    );

    let totalBulkPhones = 0;
    let totalBulkAmount = 0;
    allBulkPhones.forEach((bulk) => {
      if (!bulk.ramSimDetails) return;
      bulk.ramSimDetails.forEach((ramSim) => {
        // Count only IMEIs that are not sold
        const availableImeis =
          ramSim.imeiNumbers?.filter((imei) => imei.status !== "Sold") || [];
        const imeiCount = availableImeis.length;
        const priceOfOne = parseFloat(ramSim.priceOfOne) || 0;
        totalBulkPhones += imeiCount;
        totalBulkAmount += imeiCount * priceOfOne;
      });
    });
    const totalPayablePersons =
      persons.status === "Payable" ? persons.length : 0;
    const totalReceivablePersons =
      persons.status === "Receivable" ? persons.length : 0;
    // === CREDIT CALCULATIONS ===
    const totalPayable = persons.reduce(
      (sum, person) => sum + person.takingCredit,
      0
    );
    const totalReceivable = persons.reduce(
      (sum, person) => sum + person.givingCredit,
      0
    );

    // Daily credit transactions
    const dailyPayable = creditTransactions.reduce(
      (sum, txn) => sum + txn.takingCredit,
      0
    );
    const dailyReceivable = creditTransactions.reduce(
      (sum, txn) => sum + txn.givingCredit,
      0
    );
    const totalAccessoriesProfit = accessoryTransactions.reduce(
      (sum, transaction) => sum + (transaction.profit || 0),
      0
    );
    // const totalAccessoriesProfit = accessories.reduce(
    //   (sum, accessory) => sum + (accessory.profit || 0),
    //   0
    // );
    const totalAccesoriesTransactionLength = accessoryTransactions.length;
    // const totalAccessoryTransactionAmount = accessoryTransactions.reduce(
    //   (sum, transaction) => sum + (transaction.totalPrice || 0),
    //   0
    // );
    const totalAccessoryTransactionAmount = accessories.reduce(
      (sum, accessory) => sum + (accessory.totalPrice || 0),
      0
    );
    const todayPersonsOfAccessories = accessories.map((accessory) => ({
      name: accessory?.personId?.name || "Unknown",
      phone: accessory?.personId?.number || "Unknown",
      totalPrice: accessory?.totalPrice || 0,
      profit: accessory?.profit || 0,
      accessoryName: accessory.accessoryName || "Unknown",
      quantity: accessory.quantity || 0,
    }));

    // === EXPENSE CALCULATIONS ===
    const totalExpenses = expenses.reduce(
      (sum, expense) => sum + (expense.price || 0),
      0
    );

    // === REPAIR JOB PROFIT CALCULATIONS ===
    const totalRepairProfit = repairJobs.reduce(
      (sum, job) => sum + (job.profit || 0),
      0
    );
    console.log("total single new stock amount:", totalSingleNewAmount);
    console.log("total single used stock amount:", totalSingleUsedAmount);
    console.log(
      "total single used stock amount length:",
      availableSinglePhones.filter((phone) => phone.phoneCondition === "Used")
        .length
    );
    console.log(
      "total single new stock amount length:",
      availableSinglePhones.filter((phone) => phone.phoneCondition === "New")
        .length
    );
    console.log("total bulk stock amount:", totalBulkAmount);
    console.log(
      "total accessory stock amount:",
      totalAccessoryTransactionAmount
    );
    res.status(200).json({
      message: `Records fetched for ${dateParam || "today"}`,
      data: {
        ledger,
        purchasedSinglePhone,
        purchaseBulkPhone,
        soldSinglePhone,
        soldBulkPhone,
        totalStockCount: totalSinglePhones + totalBulkPhones,
        totalStockAmount:
          totalSingleAmount +
          totalBulkAmount +
          Number(totalAccessoryTransactionAmount),
        todayPersonsOfAccessories,
        totalAccessoriesProfit,
        totalAccesoriesTransactionLength,
        totalAccessoryTransactionAmount,
        totalExpenses,
        totalRepairProfit,
        // Echo back the effective date range used so the frontend can display it
        dateRange: {
          startDate: selectedDate,
          endDate: new Date(nextDate.getTime() - 1), // inclusive end (just before nextDate)
        },
        creditSummary: {
          totalPayable,
          totalReceivable,
          totalPayablePersons,
          totalReceivablePersons,
          dailyPayable,
          dailyReceivable,
          creditTransactions,
        },
      },
    });
  } catch (err) {
    console.log("Error in getToDayBook:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

/**
 * Parse date/range from query using 6:00 AM business day boundaries.
 * Returns { selectedDate, nextDate } or throws.
 */
const parseDateRange = (req) => {
  const dateParam = req.query.date;
  const startParam = req.query.startDate;
  const endParam = req.query.endDate;
  let selectedDate = new Date();
  let nextDate;

  if (startParam && endParam) {
    const start = new Date(startParam);
    const end = new Date(endParam);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      const err = new Error("Invalid date range. Use YYYY-MM-DD for startDate and endDate.");
      err.status = 400;
      throw err;
    }
    selectedDate = setBusinessDayStart(start);
    nextDate = setBusinessDayStart(end);
    nextDate.setDate(nextDate.getDate() + 1);
  } else {
    if (dateParam) {
      selectedDate = new Date(dateParam);
      if (isNaN(selectedDate.getTime())) {
        const err = new Error("Invalid date format. Use YYYY-MM-DD.");
        err.status = 400;
        throw err;
      }
    }
    if (dateParam) {
      selectedDate = setBusinessDayStart(selectedDate);
      nextDate = new Date(selectedDate);
      nextDate.setDate(nextDate.getDate() + 1);
    } else {
      const now = new Date();
      const start = setBusinessDayStart(now);
      if (now < start) {
        start.setDate(start.getDate() - 1);
      }
      selectedDate = start;
      nextDate = new Date(selectedDate);
      nextDate.setDate(nextDate.getDate() + 1);
    }
  }
  return { selectedDate, nextDate };
};

/**
 * GET /cardDetail?cardType=xxx&date=...&startDate=...&endDate=...
 * Returns related profit, expense, analytics and details for the selected card.
 */
exports.getCardDetail = async (req, res) => {
  try {
    const userId = req.user.id;
    const cardType = req.query.cardType || "";
    const { selectedDate, nextDate } = parseDateRange(req);

    const [
      ledger,
      purchasedSinglePhone,
      purchaseBulkPhone,
      soldSinglePhone,
      soldBulkPhone,
      allSinglePhones,
      allBulkPhones,
      persons,
      creditTransactions,
      accessories,
      accessoryTransactions,
      expenses,
      repairJobs,
    ] = await Promise.all([
      Ledger.find({ userId, createdAt: { $gte: selectedDate, $lt: nextDate } }),
      PurchasePhone.find({
        userId,
        createdAt: { $gte: selectedDate, $lt: nextDate },
      }),
      BulkPhonePurchase.find({
        userId,
        createdAt: { $gte: selectedDate, $lt: nextDate },
      }).populate("ramSimDetails"),
      SingleSoldPhone.find({
        userId,
        createdAt: { $gte: selectedDate, $lt: nextDate },
      }),
      SoldPhone.find({
        userId,
        createdAt: { $gte: selectedDate, $lt: nextDate },
      }).populate({
        path: "bulkPhonePurchaseId",
        select: "prices.buyingPrice salePrice",
      }),
      PurchasePhone.find({ userId }),
      BulkPhonePurchase.find({ userId }).populate({
        path: "ramSimDetails",
        populate: { path: "imeiNumbers" },
      }),
      Person.find({ userId }),
      CreditTransaction.find({
        userId,
        createdAt: { $gte: selectedDate, $lt: nextDate },
      }),
      Accessory.find({ userId }).populate("personId", "name number"),
      AccessoryTransaction.find({
        userId,
        createdAt: { $gte: selectedDate, $lt: nextDate },
      }),
      Expense.find({
        userId,
        date: { $gte: selectedDate, $lt: nextDate },
      }),
      RepairJob.find({
        userId,
        createdAt: { $gte: selectedDate, $lt: nextDate },
      }),
    ]);

    // Ledger-based totals (expense from ledger entries as used on frontend)
    const ledgerExpense = ledger.reduce(
      (sum, entry) => sum + (Number(entry.expense) || 0),
      0
    );
    const totalExpensesFromModel = expenses.reduce(
      (sum, expense) => sum + (expense.price || 0),
      0
    );
    const totalExpenses = totalExpensesFromModel;
    const totalAccessoriesProfit = accessoryTransactions.reduce(
      (sum, t) => sum + (t.profit || 0),
      0
    );
    const totalRepairProfit = repairJobs.reduce(
      (sum, job) => sum + (job.profit || 0),
      0
    );

    const singleProfit = soldSinglePhone.reduce(
      (acc, p) => acc + (Number(p.profit) || 0),
      0
    );
    const bulkProfit = soldBulkPhone.reduce(
      (acc, p) => acc + (Number(p.profit) || 0),
      0
    );
    const totalProfitPhones = singleProfit + bulkProfit;
    const totalProfit = totalProfitPhones + totalAccessoriesProfit;

    const totalPayable = persons.reduce(
      (sum, person) => sum + person.takingCredit,
      0
    );
    const totalReceivable = persons.reduce(
      (sum, person) => sum + person.givingCredit,
      0
    );

    const availableSinglePhones = allSinglePhones.filter(
      (p) => p.status !== "Sold" && !p.isSold
    );
    let totalBulkPhones = 0;
    let totalBulkAmount = 0;
    allBulkPhones.forEach((bulk) => {
      if (!bulk.ramSimDetails) return;
      bulk.ramSimDetails.forEach((ramSim) => {
        const availableImeis =
          ramSim.imeiNumbers?.filter((imei) => imei.status !== "Sold") || [];
        const imeiCount = availableImeis.length;
        const priceOfOne = parseFloat(ramSim.priceOfOne) || 0;
        totalBulkPhones += imeiCount;
        totalBulkAmount += imeiCount * priceOfOne;
      });
    });
    const totalSingleAmount = availableSinglePhones.reduce(
      (sum, phone) => sum + (phone.price?.purchasePrice || 0),
      0
    );
    const totalStockCount = availableSinglePhones.length + totalBulkPhones;
    const totalAccessoryTransactionAmount = accessories.reduce(
      (sum, a) => sum + (a.totalPrice || 0),
      0
    );
    const totalStockAmount =
      totalSingleAmount + totalBulkAmount + Number(totalAccessoryTransactionAmount);

    const totalPurchasePrice =
      (purchasedSinglePhone.reduce(
        (acc, p) =>
          acc +
          (Number(p.price?.purchasePrice) || Number(p.purchasePrice) || 0),
        0
      ) || 0) +
      (purchaseBulkPhone.reduce((price, phone) => {
        const phoneCount = phone?.ramSimDetails?.reduce(
          (sum, ramSim) => sum + (ramSim?.imeiNumbers?.length || 0),
          0
        );
        return price + (Number(phone.prices?.buyingPrice) || 0) * (phoneCount || 1);
      }, 0) || 0);

    const uniqueBulkSales = new Map();
    const totalInvoicesWithoutAccessory =
      (soldSinglePhone.reduce((acc, p) => acc + (p.salePrice || 0), 0) || 0) +
      (soldBulkPhone.reduce((acc, phone) => {
        if (!phone.bulkPhonePurchaseId?._id) return acc + (phone.salePrice || 0);
        if (uniqueBulkSales.has(phone.bulkPhonePurchaseId._id)) return acc;
        uniqueBulkSales.set(phone.bulkPhonePurchaseId._id, true);
        const imeiCount = Array.isArray(phone.imei1) ? phone.imei1.length : 1;
        return acc + (phone.salePrice || 0) * imeiCount;
      }, 0) || 0);

    const todayPersonsOfAccessories = accessories.map((a) => ({
      name: a?.personId?.name || "Unknown",
      phone: a?.personId?.number || "Unknown",
      totalPrice: a?.totalPrice || 0,
      profit: a?.profit || 0,
      accessoryName: a.accessoryName || "Unknown",
      quantity: a.quantity || 0,
    }));

    const dateRange = {
      startDate: selectedDate,
      endDate: new Date(nextDate.getTime() - 1),
    };

    const buildResponse = (payload) =>
      res.status(200).json({
        message: "Card detail fetched successfully",
        data: { cardType, dateRange, ...payload },
      });

    switch (cardType) {
      case "salesProfit":
        return buildResponse({
          summary: {
            title: "Sales Profit",
            totalProfit,
            totalProfitPhones,
            totalAccessoriesProfit,
            totalRepairProfit,
          },
          profit: {
            singlePhone: singleProfit,
            bulkPhone: bulkProfit,
            accessories: totalAccessoriesProfit,
            repair: totalRepairProfit,
            total: totalProfit,
          },
          expense: { total: totalExpenses, ledgerExpense },
          analytics: {
            soldSingleCount: soldSinglePhone.length,
            soldBulkCount: soldBulkPhone.length,
            totalInvoices: totalInvoicesWithoutAccessory,
            totalPurchasePrice,
          },
          details: {
            soldSinglePhone: soldSinglePhone.map((p) => ({
              _id: p._id,
              profit: p.profit,
              salePrice: p.salePrice,
              totalInvoice: p.totalInvoice,
            })),
            soldBulkPhone: soldBulkPhone.map((p) => ({
              _id: p._id,
              profit: p.profit,
              salePrice: p.salePrice,
            })),
          },
        });

      case "mobileSales":
        return buildResponse({
          summary: {
            title: "Mobile Sales",
            totalInvoices: totalInvoicesWithoutAccessory,
            totalPurchasePrice,
          },
          profit: { total: totalProfitPhones, single: singleProfit, bulk: bulkProfit },
          expense: { total: totalExpenses },
          analytics: {
            soldSingleCount: soldSinglePhone.length,
            soldBulkCount: soldBulkPhone.length,
            totalInvoices: totalInvoicesWithoutAccessory,
          },
          details: {
            soldSinglePhone,
            soldBulkPhone,
          },
        });

      case "accessoriesTransactions":
        return buildResponse({
          summary: {
            title: "Accessories Transactions",
            count: accessoryTransactions.length,
            totalAmount: totalAccessoryTransactionAmount,
          },
          profit: { accessories: totalAccessoriesProfit, total: totalAccessoriesProfit },
          expense: { total: totalExpenses },
          analytics: {
            transactionCount: accessoryTransactions.length,
            totalAccessoryTransactionAmount,
          },
          details: { accessoryTransactions, todayPersonsOfAccessories },
        });

      case "accessoriesProfit":
        return buildResponse({
          summary: {
            title: "Accessories Profit",
            totalAccessoriesProfit,
          },
          profit: { accessories: totalAccessoriesProfit, total: totalAccessoriesProfit },
          expense: { total: totalExpenses },
          analytics: {
            transactionCount: accessoryTransactions.length,
            totalAccessoryTransactionAmount,
          },
          details: { todayPersonsOfAccessories, accessoryTransactions },
        });

      case "expenses":
        return buildResponse({
          summary: {
            title: "Expenses",
            totalExpenses,
          },
          profit: { total: totalProfit },
          expense: {
            total: totalExpenses,
            ledgerExpense,
            list: expenses.map((e) => ({
              _id: e._id,
              price: e.price,
              description: e.description,
              date: e.date,
              type: e.type,
            })),
          },
          analytics: {
            expenseCount: expenses.length,
            totalExpenses,
          },
          details: { expenses, ledger },
        });

      case "openingBalance":
      case "cashAmount":
      case "bankAmount":
      case "totalAmount": {
        const openingFromLedger = ledger.reduce(
          (acc, e) => acc + (Number(e.openingCash) || 0),
          0
        );
        const closingFromLedger = ledger.reduce(
          (acc, e) => acc + (Number(e.closingCash) || 0),
          0
        );
        const cashReceived = ledger.reduce(
          (acc, e) => acc + (Number(e.cashReceived) || 0),
          0
        );
        const cashPaid = ledger.reduce(
          (acc, e) => acc + (Number(e.cashPaid) || 0),
          0
        );
        return buildResponse({
          summary: {
            title:
              cardType === "openingBalance"
                ? "Opening Balance"
                : cardType === "cashAmount"
                ? "Cash Amount"
                : cardType === "bankAmount"
                ? "Bank Amount"
                : "Total Amount",
            openingFromLedger,
            closingFromLedger,
            cashReceived,
            cashPaid,
          },
          profit: { total: totalProfit },
          expense: { total: totalExpenses },
          analytics: {
            totalInvoices: totalInvoicesWithoutAccessory,
            totalExpenses,
            ledgerEntryCount: ledger.length,
          },
          details: { ledger },
        });
      }

      case "saleTrack":
        return buildResponse({
          summary: {
            title: "Sale Track",
            soldSingleCount: soldSinglePhone.length,
            soldBulkCount: soldBulkPhone.length,
          },
          profit: {
            total: totalProfitPhones,
            single: singleProfit,
            bulk: bulkProfit,
            accessories: totalAccessoriesProfit,
          },
          expense: { total: totalExpenses },
          analytics: {
            soldSingleCount: soldSinglePhone.length,
            soldBulkCount: soldBulkPhone.length,
            totalInvoices: totalInvoicesWithoutAccessory,
            totalProfit,
          },
          details: { soldSinglePhone, soldBulkPhone },
        });

      case "purchaseTrack":
        const purchasedBulkCount = purchaseBulkPhone.reduce((total, bulk) => {
          return (
            total +
            (bulk?.ramSimDetails?.reduce(
              (sum, ramSim) => sum + (ramSim?.imeiNumbers?.length || 0),
              0
            ) || 0)
          );
        }, 0);
        return buildResponse({
          summary: {
            title: "Purchase Track",
            purchasedSingleCount: purchasedSinglePhone.length,
            purchasedBulkCount,
            totalPurchasePrice,
          },
          profit: { total: totalProfit },
          expense: { total: totalExpenses },
          analytics: {
            purchasedSingleCount: purchasedSinglePhone.length,
            purchasedBulkCount,
            totalPurchasePrice,
          },
          details: { purchasedSinglePhone, purchaseBulkPhone },
        });

      case "totalStock":
      case "totalStockAmount":
        return buildResponse({
          summary: {
            title:
              cardType === "totalStock" ? "Total Stock" : "Total Stock Amount",
            totalStockCount,
            totalStockAmount,
          },
          profit: { total: totalProfit },
          expense: { total: totalExpenses },
          analytics: {
            totalStockCount,
            totalStockAmount,
            singleCount: availableSinglePhones.length,
            bulkCount: totalBulkPhones,
          },
          details: {},
        });

      case "totalPayables":
        return buildResponse({
          summary: {
            title: "Total Payables",
            totalPayable,
            personCount: persons.filter((p) => (p.takingCredit || 0) > 0).length,
          },
          profit: { total: totalProfit },
          expense: { total: totalExpenses },
          analytics: {
            totalPayable,
            totalReceivable,
            creditTransactionsCount: creditTransactions.length,
          },
          details: {
            creditSummary: {
              totalPayable,
              totalReceivable,
            },
            creditTransactions,
            persons: persons.filter((p) => (p.takingCredit || 0) > 0),
          },
        });

      case "totalReceivables":
        return buildResponse({
          summary: {
            title: "Total Receivables",
            totalReceivable,
            personCount: persons.filter((p) => (p.givingCredit || 0) > 0).length,
          },
          profit: { total: totalProfit },
          expense: { total: totalExpenses },
          analytics: {
            totalPayable,
            totalReceivable,
            creditTransactionsCount: creditTransactions.length,
          },
          details: {
            creditSummary: { totalPayable, totalReceivable },
            creditTransactions,
            persons: persons.filter((p) => (p.givingCredit || 0) > 0),
          },
        });

      default:
        return buildResponse({
          summary: { title: cardType || "Overview" },
          profit: { total: totalProfit },
          expense: { total: totalExpenses },
          analytics: {},
          details: {},
        });
    }
  } catch (err) {
    if (err.status === 400) {
      return res.status(400).json({ message: err.message });
    }
    console.log("Error in getCardDetail:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
};
