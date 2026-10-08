const mongoose = require("mongoose");
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

// CREATE a new accessory
// const createAccessory = async (req, res) => {
//   try {
//     const userId = req.user.id;
//     const {
//       accessoryName,
//       quantity,
//       perPiecePrice,
//       givePayment,
//       entityData,
//       purchasePaymentType,
//       creditPaymentData,
//     } = req.body;

//     if (!accessoryName || !quantity || !perPiecePrice || !purchasePaymentType) {
//       return res.status(400).json({
//         message:
//           "Accessory name, quantity, price, and payment type are required",
//       });
//     }

//     if (
//       isNaN(quantity) ||
//       isNaN(perPiecePrice) ||
//       quantity <= 0 ||
//       perPiecePrice <= 0
//     ) {
//       return res
//         .status(400)
//         .json({ message: "Quantity and price must be positive numbers" });
//     }

//     const totalPrice = quantity * perPiecePrice;
//     let person;
//     person = await Person.findOne({
//       ...(!entityData.number && { _id: entityData._id }),

//       ...(entityData.number && { number: entityData.number }),
//       userId: req.user.id,
//     });
//     if (purchasePaymentType === "credit") {
//       console.log("entityData", person);
//       if (!person) {
//         person = await Person.create({
//           userId: req.user.id,
//           name: entityData.name,
//           number: entityData.number,
//           reference: "Accessory Purchase",
//           takingCredit: Number(creditPaymentData.payableAmountLater),
//           status: "Payable",
//         });
//       } else {
//         person.takingCredit =
//           Number(person.takingCredit || 0) +
//           Number(creditPaymentData.payableAmountLater);
//         person.status = "Payable";
//         person.reference = "accessory Purchase";
//         await person.save();
//       }

//       await CreditTransaction.create({
//         userId: req.user.id,
//         personId: person._id,
//         givingCredit: Number(creditPaymentData.payableAmountLater),
//         description: `Credit purchase of accessory: ${accessoryName} by ${entityData.name}`,
//       });
//     }
//     console.log("quantity", quantity, "perPiecePrice", perPiecePrice);

//     if (purchasePaymentType === "full-payment") {
//       if (!person) {
//         const newPerson = await Person.create({
//           userId: req.user.id,
//           name: entityData.name,
//           number: entityData.number,
//           reference: "Accessory Purchase",
//           takingCredit: 0,
//           status: "Settled",
//         });
//         await newPerson.save();
//         await CreditTransaction.create({
//           userId: req.user.id,
//           personId: newPerson._id,
//           givingCredit: 0,
//           description: `Full payment purchase of accessory:
//           ${accessoryName} by ${entityData.name || newPerson.name}
//            of quantity ${quantity}
//             and price ${perPiecePrice} each. Total price: ${totalPrice}
//            `,
//         });
//       } else {
//         await CreditTransaction.create({
//           userId: req.user.id,
//           personId: person._id,
//           givingCredit: 0,
//           description: `Full payment purchase of accessory:
//           ${accessoryName} by ${entityData.name || person.name}
//            of quantity ${quantity}
//             and price ${perPiecePrice} each. Total price: ${totalPrice}
//            `,
//         });
//       }
//     }

//     if (givePayment?.bankAccountUsed) {
//       const bank = await AddBankAccount.findById(givePayment.bankAccountUsed);
//       if (!bank) return res.status(404).json({ message: "Bank not found" });

//       const amountToDeduct =
//         purchasePaymentType === "full-payment"
//           ? totalPrice
//           : Number(creditPaymentData.payableAmountNow);

//       if (
//         isNaN(amountToDeduct) ||
//         amountToDeduct <= 0 ||
//         amountToDeduct > bank.accountCash
//       ) {
//         return res
//           .status(400)
//           .json({ message: "Invalid or insufficient bank amount" });
//       }

//       bank.accountCash -= amountToDeduct;
//       await bank.save();

//       await BankTransaction.create({
//         bankId: bank._id,
//         userId,
//         reasonOfAmountDeduction: `Purchasing accessory: ${accessoryName}`,
//         amount: amountToDeduct,
//         accountCash: bank.accountCash,
//         accountType: bank.accountType,
//       });

//       if (givePayment?.amountFromPocket) {
//         const pocketTransaction = await PocketCashSchema.findOne({ userId });
//         if (!pocketTransaction) {
//           return res
//             .status(404)
//             .json({ message: "Pocket cash account not found." });
//         }

//         const amountToDeduct =
//           purchasePaymentType === "full-payment"
//             ? totalPrice
//             : Number(creditPaymentData.payableAmountNow);

//         if (
//           isNaN(amountToDeduct) ||
//           amountToDeduct <= 0 ||
//           amountToDeduct > pocketTransaction.accountCash
//         ) {
//           return res
//             .status(400)
//             .json({ message: "Invalid or insufficient pocket cash" });
//         }

//         pocketTransaction.accountCash -= amountToDeduct;
//         await pocketTransaction.save();

//         await PocketCashTransactionSchema.create({
//           userId,
//           pocketCashId: pocketTransaction._id,
//           amountDeducted: amountToDeduct,
//           accountCash: pocketTransaction.accountCash,
//           remainingAmount: pocketTransaction.accountCash,
//           reasonOfAmountDeduction: `Purchasing accessory: ${accessoryName}`,
//         });
//       }
//     }

//     const newAccessory = await Accessory.create({
//       userId,
//       accessoryName,
//       quantity,
//       perPiecePrice,
//       totalPrice,
//       stock: quantity,
//       ...(entityData._id || person?._id
//         ? { personId: entityData._id || person._id }
//         : {}),
//     });

//     await AccessoryTransaction.create({
//       userId,
//       accessoryId: newAccessory._id,
//       quantity,
//       perPiecePrice,
//       totalPrice,
//       ...(entityData._id || person?._id
//         ? { personId: entityData._id || person._id }
//         : {}),
//       type: "purchase", // Set type to 'purchase'
//     });

//     res.status(201).json({
//       message: "Accessory created successfully",
//       accessory: newAccessory,
//     });
//   } catch (error) {
//     console.error("Error creating accessory:", error);
//     res.status(500).json({
//       message: "Failed to create accessory",
//       error: error.message,
//     });
//   }
// };
const createAccessory = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      accessories, // Array of {accessoryName, quantity, perPiecePrice}
      givePayment,
      entityData,
      purchasePaymentType,
      creditPaymentData,
    } = req.body;

    // Validate inputs
    if (!Array.isArray(accessories) || accessories.length === 0) {
      return res.status(400).json({ message: "Accessories array is required" });
    }

    // Validate each accessory
    for (const accessory of accessories) {
      if (
        !accessory.accessoryName ||
        !accessory.quantity ||
        !accessory.perPiecePrice
      ) {
        return res.status(400).json({
          message: "Each accessory must have name, quantity, and price",
        });
      }
      if (
        isNaN(accessory.quantity) ||
        isNaN(accessory.perPiecePrice) ||
        accessory.quantity <= 0 ||
        accessory.perPiecePrice <= 0
      ) {
        return res.status(400).json({
          message:
            "Quantity and price must be positive numbers for all accessories",
        });
      }
    }

    // Calculate total amount
    const totalAmount = accessories.reduce((sum, acc) => {
      return sum + acc.quantity * acc.perPiecePrice;
    }, 0);

    let person;
    person = await Person.findOne({
      ...(!entityData.number && { _id: entityData._id }),
      ...(entityData.number && { number: entityData.number }),
      userId: req.user.id,
    });

    if (purchasePaymentType === "credit") {
      console.log("entityData", person);
      if (!person) {
        person = await Person.create({
          userId: req.user.id,
          name: entityData.name,
          number: entityData.number,
          reference: "Accessory Purchase",
          takingCredit: Number(creditPaymentData.payableAmountLater),
          status: "Payable",
        });
      } else {
        person.takingCredit =
          Number(person.takingCredit || 0) +
          Number(creditPaymentData.payableAmountLater);
        person.status = "Payable";
        person.reference = "Accessory Purchase";
        await person.save();
      }

      await CreditTransaction.create({
        userId: req.user.id,
        personId: person._id,
        takingCredit: Number(creditPaymentData.payableAmountLater), // Changed to takingCredit
        description: `Credit purchase of accessories by ${
          entityData.name
        } of amount ${creditPaymentData.payableAmountLater} for ${accessories
          .map((acc) => acc.accessoryName)
          .join(", ")} of per piece price ${accessories
          .map((acc) => acc.perPiecePrice)
          .join(", ")} and total amount ${totalAmount}`,
        balanceAmount:
          Number(person.takingCredit) +
          Number(creditPaymentData.payableAmountLater),
      });
    }

    if (purchasePaymentType === "full-payment") {
      if (!person) {
        const newPerson = await Person.create({
          userId: req.user.id,
          name: entityData.name,
          number: entityData.number,
          reference: "Accessory Purchase",
          takingCredit: 0,
          status: "Settled",
        });
        await CreditTransaction.create({
          userId: req.user.id,
          personId: newPerson._id,
          takingCredit: 0,
          balanceAmount: 0,
          description: `Full payment purchase of accessories by ${
            entityData.name || newPerson.name
          } for ${accessories
            .map((acc) => acc.accessoryName)
            .join(", ")} of per piece price ${accessories
            .map((acc) => acc.perPiecePrice)
            .join(", ")} and total amount ${totalAmount}`,
        });
      } else {
        await CreditTransaction.create({
          userId: req.user.id,
          personId: person._id,
          takingCredit: 0,
          balanceAmount: Number(person.takingCredit),
          description: `Full payment purchase of accessories by ${
            entityData.name || person.name
          } for ${accessories
            .map((acc) => acc.accessoryName)
            .join(", ")} of per piece price ${accessories
            .map((acc) => acc.perPiecePrice)
            .join(", ")} and total amount ${totalAmount}`,
        });
      }
    }

    // Process payments
    if (givePayment?.bankAccountUsed) {
      const bank = await AddBankAccount.findById(givePayment.bankAccountUsed);
      if (!bank) return res.status(404).json({ message: "Bank not found" });

      const amountToDeduct = givePayment?.amountFromBank;

      if (amountToDeduct > bank.accountCash) {
        return res.status(400).json({ message: "Insufficient bank balance" });
      }

      bank.accountCash -= amountToDeduct;
      await bank.save();

      await BankTransaction.create({
        bankId: bank._id,
        userId,
        reasonOfAmountDeduction: `Purchase of ${
          accessories.length
        } accessories | ${accessories
          .map((acc) => acc.accessoryName)
          .join(", ")}`,
        amount: amountToDeduct,
        accountCash: bank.accountCash,
        accountType: bank.accountType,
      });
    }

    // Process pocket payment if exists
    if (givePayment?.amountFromPocket) {
      const pocket = await PocketCashSchema.findOne({ userId });
      if (!pocket) {
        return res
          .status(404)
          .json({ message: "Pocket cash account not found" });
      }

      const amountToDeduct = givePayment?.amountFromPocket;
      // purchasePaymentType === "full-payment"
      //   ? totalAmount - (givePayment?.bankAccountUsed ? amountToDeduct : 0)
      //   : Number(creditPaymentData?.payableAmountNow) || 0;

      if (amountToDeduct > pocket.accountCash) {
        return res.status(400).json({ message: "Insufficient pocket cash" });
      }

      pocket.accountCash -= amountToDeduct;
      await pocket.save();

      await PocketCashTransactionSchema.create({
        userId,
        pocketCashId: pocket._id,
        amountDeducted: amountToDeduct,
        accountCash: pocket.accountCash,
        reasonOfAmountDeduction: `Purchase of ${
          accessories.length
        } accessories | ${accessories
          .map((acc) => acc.accessoryName)
          .join(", ")}`,
      });
    }

    // Create all accessories
    const createdAccessories = await Promise.all(
      accessories.map((acc) =>
        Accessory.create({
          userId,
          accessoryName: acc.accessoryName,
          quantity: acc.quantity,
          perPiecePrice: acc.perPiecePrice,
          totalPrice: acc.quantity * acc.perPiecePrice,
          stock: acc.quantity,
          ...(acc.picture ? { picture: acc.picture } : {}),
          ...(person?._id ? { personId: person._id } : {}),
        })
      )
    );

    // Create a single transaction record for all accessories
    await AccessoryTransaction.create({
      userId,
      type: "purchase",
      accessoriesList: accessories.map((acc) => ({
        name: acc.accessoryName,
        quantity: acc.quantity,
        perPiecePrice: acc.perPiecePrice,
      })),
      quantity: accessories.reduce((sum, acc) => sum + acc.quantity, 0),
      perPiecePrice:
        totalAmount / accessories.reduce((sum, acc) => sum + acc.quantity, 0),
      totalPrice: totalAmount,
      ...(person?._id ? { personId: person._id } : {}),
      accessories: createdAccessories.map((acc) => ({
        accessoryId: acc._id,
        accessoryName: acc.accessoryName,
        quantity: acc.quantity,
        perPiecePrice: acc.perPiecePrice,
      })),
    });

    res.status(201).json({
      message: `${accessories.length} accessories purchased successfully`,
      accessories: createdAccessories,
      totalAmount,
    });
  } catch (error) {
    console.error("Error purchasing accessories:", error);
    res.status(500).json({
      message: "Failed to purchase accessories",
      error: error.message,
    });
  }
};

// GET all accessories for the user
const getAllAccessories = async (req, res) => {
  try {
    const userId = req.user.id;
    const accessories = await Accessory.find({ userId })
      .populate("personId", "name _id number")
      .sort({ createdAt: -1 });
    res.status(200).json(accessories);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch accessories", error });
  }
};

// GET total sold accessories count (sum of quantities from sale transactions)
const getTotalSoldAccessories = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    const userObjectId =
      typeof userId === "string"
        ? new mongoose.Types.ObjectId(userId)
        : userId;
    const result = await AccessoryTransaction.aggregate([
      { $match: { userId: userObjectId, type: "sale" } },
      { $group: { _id: null, totalQuantity: { $sum: "$quantity" } } },
    ]);
    const totalSoldQuantity = result[0]?.totalQuantity ?? 0;
    res.status(200).json({ success: true, totalSoldQuantity });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch total sold accessories",
      error: error.message,
    });
  }
};

// const sellMultipleAccessories = async (req, res) => {
//   try {
//     const userId = req.user.id;
//     const sales = req.body.sales;

//     if (!Array.isArray(sales) || sales.length === 0) {
//       return res.status(400).json({ message: "Sales array is required" });
//     }

//     const { getPayment, entityData,
//       purchasePaymentType,
//       creditPaymentData, } = req.body;
//     const transactions = [];
//     console.log("getPayment", getPayment);

//     // Handle bank payment if provided
//     if (getPayment?.bankAccountUsed) {
//       const bank = await AddBankAccount.findById(getPayment.bankAccountUsed);
//       if (!bank) return res.status(404).json({ message: "Bank not found" });
//       console.log("amountFromBank", getPayment.amountFromBank);

//       // Validate amount
//       if (
//         typeof Number(getPayment.amountFromBank) !== "number" ||
//         Number(getPayment.amountFromBank) <= 0
//       ) {
//         return res.status(400).json({ message: "Invalid amount from bank" });
//       }

//       // Add to bank account (since we're receiving money from sale)
//       bank.accountCash += Number(getPayment.amountFromBank);
//       await bank.save();

//       // Log the transaction
//       await BankTransaction.create({
//         bankId: bank._id,
//         userId: userId,
//         reasonOfAmountDeduction: `selling accessories`,
//         amount: getPayment.amountFromBank,
//         accountCash: bank.accountCash,
//         accountType: bank.accountType,
//         transactionType: "credit",
//       });
//     }

//     // Handle pocket cash if provided
//     if (getPayment?.amountFromPocket) {
//       const pocketTransaction = await PocketCashSchema.findOne({
//         userId: userId,
//       });
//       if (!pocketTransaction) {
//         return res
//           .status(404)
//           .json({ message: "Pocket cash account not found." });
//       }

//       if (
//         typeof Number(getPayment.amountFromPocket) !== "number" ||
//         Number(getPayment.amountFromPocket) <= 0
//       ) {
//         return res.status(400).json({ message: "Invalid pocket cash amount" });
//       }

//       // Add to pocket cash (since we're receiving money from sale)
//       pocketTransaction.accountCash += Number(getPayment.amountFromPocket);
//       await pocketTransaction.save();

//       await PocketCashTransactionSchema.create({
//         userId: userId,
//         pocketCashId: pocketTransaction._id,
//         amountAdded: getPayment.amountFromPocket,
//         accountCash: pocketTransaction.accountCash,
//         remainingAmount: pocketTransaction.accountCash,
//         sourceOfAmountAddition: `making sale of accessories`,
//       });
//     }
//     let person = await Person.findOne({
//       ...(!entityData.number && { _id: entityData._id }),
//       // name: personData,
//       ...(entityData.number && { number: entityData.number }),
//       userId: req.user.id,
//     });
//     if (purchasePaymentType === "credit") {

//       // Use Person and CreditTransaction for receivables

//       // Find or create the person (customer) by name and number
//       console.log("entityData", person);
//       if (!person) {
//         person = await Person.create({
//           userId: req.user.id,
//           name: entityData.name,
//           number: entityData.number,
//           reference: "Accessory Sale",
//           givingCredit: Number(creditPaymentData.payableAmountLater),
//           status: "Receivable",
//         });
//       } else {
//         person.givingCredit =
//           Number(person.givingCredit || 0) + Number(creditPaymentData.payableAmountLater);
//         person.status = "Receivable";
//         person.reference = "accessory sale";
//         await person.save();
//       }

//       // Log the credit transaction
//       // Get accessory names by their IDs and push to an array
//       const accessoryNames = [];
//       for (const sale of sales) {
//         const accessory = await Accessory.findById(sale.accessoryId);
//         if (accessory) {
//           accessoryNames.push(accessory.accessoryName);
//         }
//       }

//       await CreditTransaction.create({
//         userId: req.user.id,
//         personId: person._id,
//         givingCredit: Number(creditPaymentData.payableAmountLater),
//         description: `Credit Sale of accessory: ${accessoryNames.join(", ")} by ${entityData.name}`,
//       });
//     }
//     // Process each sale
//     for (const sale of sales) {
//       const { accessoryId, quantity, perPiecePrice } = sale;

//       // Validate sale data
//       if (!accessoryId || !quantity || !perPiecePrice) {
//         return res
//           .status(400)
//           .json({ message: "Missing required fields in sale item" });
//       }

//       if (quantity <= 0 || perPiecePrice <= 0) {
//         return res
//           .status(400)
//           .json({ message: "Quantity and price must be positive numbers" });
//       }

//       const accessory = await Accessory.findOne({ _id: accessoryId, userId });
//       if (!accessory) {
//         return res
//           .status(404)
//           .json({ message: `Accessory not found: ${accessoryId}` });
//       }

//       if (accessory.stock < quantity) {
//         return res.status(400).json({
//           message: `Not enough stock for accessory: ${accessory.name}`,
//         });
//       }

//       const totalPrice = quantity * perPiecePrice;
//       const profit = (Number(perPiecePrice) - Number(accessory.perPiecePrice)) * Number(quantity);
//       console.log(`Profit for ${accessory.accessoryName}:`, profit);

//       const transaction = await AccessoryTransaction.create({
//         userId,
//         accessoryId,
//         quantity,
//         perPiecePrice,
//         totalPrice,
//         // transactionType: "sale",
//         type: "sale", // Set type to 'sale'
//         profit: (Number(perPiecePrice) - Number(accessory.perPiecePrice)) * Number(quantity),
//        ...(entityData._id || person?._id ? { personId: entityData._id || person._id } : {}),
//       });

//       // Update stock`
//       accessory.stock -= quantity;
//       accessory.totalPrice -=
//         Number(accessory.perPiecePrice) * Number(quantity);
//       accessory.profit +=
//         (Number(perPiecePrice) - Number(accessory.perPiecePrice)) *
//         Number(quantity); // Calculate profit
//       await accessory.save();

//       transactions.push(transaction);
//     }

//     res
//       .status(201)
//       .json({ message: "Accessories sold successfully", transactions });
//   } catch (error) {
//     console.error("Error selling accessories:", error);
//     res
//       .status(500)
//       .json({ message: "Failed to sell accessories", error: error.message });
//   }
// };

// const sellMultipleAccessories = async (req, res) => {
//   try {
//     const userId = req.user.id;
//     const sales = req.body.sales;

//     if (!Array.isArray(sales) || sales.length === 0) {
//       return res.status(400).json({ message: "Sales array is required" });
//     }

//     const { getPayment, entityData, purchasePaymentType, creditPaymentData } =
//       req.body;
//     const transactions = [];

//     // Payment handling (for both full and credit)
//     if (getPayment?.bankAccountUsed) {
//       // ... existing bank payment logic ...
//     }

//     if (getPayment?.amountFromPocket) {
//       // ... existing pocket payment logic ...
//     }

//     const accessoryNames = [];
//     const accessoryData = [];
//     for (const sale of sales) {
//       const accessory = await Accessory.findById(sale.accessoryId);
//       if (accessory) accessoryNames.push(accessory.accessoryName);
//       accessoryData.push({
//         accessoryId: sale.accessoryId,
//         quantity: sale.quantity,
//         perPiecePrice: sale.perPiecePrice,
//       });
//     }

//     // Only handle person/credit for credit payments
//     let person = null;
//     person = await Person.findOne({
//       ...(!entityData.number &&
//         entityData._id &&
//         entityData._id !== "" && { _id: entityData._id }),
//       ...(entityData.number && { number: entityData.number }),
//       userId: req.user.id,
//     });
//     if (purchasePaymentType === "credit") {
//       if (!entityData) {
//         return res
//           .status(400)
//           .json({ message: "Entity data required for credit sales" });
//       }

//       if (!person) {
//         person = await Person.create({
//           userId: req.user.id,
//           name: entityData.name,
//           number: entityData.number,
//           reference: "Accessory Sale",
//           givingCredit: Number(creditPaymentData.payableAmountLater),
//           status: "Receivable",
//         });
//       } else {
//         person.givingCredit =
//           Number(person.givingCredit || 0) +
//           Number(creditPaymentData.payableAmountLater);
//         person.status = "Receivable";
//         await person.save();
//       }

//       await CreditTransaction.create({
//         userId: req.user.id,
//         personId: person._id,
//         givingCredit: Number(creditPaymentData.payableAmountLater),
//         description: `Credit Sale: ${accessoryNames.join(", ")} to ${
//           entityData.name || person.name
//         } of ${accessoryData
//           .map(
//             (item) => `quantity ${item.quantity} at ${item.perPiecePrice} each`
//           )
//           .join(", ")}
//            and credit amount: ${creditPaymentData.payableAmountLater}
//         `,
//       });
//     }
//     if (purchasePaymentType === "full-payment") {
//       if (entityData.name && !person) {
//         const newPerson = await Person.create({
//           userId: req.user.id,
//           name: entityData.name,
//           number: entityData.number,
//           reference: "Accessory Sale",
//           takingCredit: 0,
//           status: "Settled",
//         });
//         await newPerson.save();
//         await CreditTransaction.create({
//           userId: req.user.id,
//           personId: newPerson._id,
//           givingCredit: 0,
//           description: `Complete Payment of Sale: ${accessoryNames.join(
//             ", "
//           )} to ${entityData.name || person.name} of ${accessoryData
//             .map(
//               (item) =>
//                 `quantity ${item.quantity} at ${item.perPiecePrice} each`
//             )
//             .join(", ")}
//         `,
//         });
//       } else if (person) {
//         await CreditTransaction.create({
//           userId: req.user.id,
//           personId: person._id,
//           givingCredit: 0,
//           description: `Complete Payment of Sale: ${accessoryNames.join(
//             ", "
//           )} from ${entityData.name || person.name} of ${accessoryData
//             .map(
//               (item) =>
//                 `quantity ${item.quantity} at ${item.perPiecePrice} each`
//             )
//             .join(", ")}
//         `,
//         });
//       } else {
//         console.log("no required entityData for full payment sale");
//       }
//     }
//     // Process each sale
//     for (const sale of sales) {
//       const { accessoryId, quantity, perPiecePrice } = sale;

//       const accessory = await Accessory.findOne({ _id: accessoryId, userId });
//       if (!accessory) {
//         return res
//           .status(404)
//           .json({ message: `Accessory not found: ${accessoryId}` });
//       }

//       const transactionData = {
//         userId,
//         accessoryId,
//         quantity,
//         perPiecePrice,
//         totalPrice: quantity * perPiecePrice,
//         type: "sale",
//         profit:
//           (Number(perPiecePrice) - Number(accessory.perPiecePrice)) *
//           Number(quantity),
//       };

//       if (purchasePaymentType === "credit" && person?._id) {
//         transactionData.personId = person._id;
//       }

//       const transaction = await AccessoryTransaction.create(transactionData);

//       // Update stock
//       accessory.stock -= quantity;
//       accessory.totalPrice -=
//         Number(accessory.perPiecePrice) * Number(quantity);
//       accessory.profit +=
//         (Number(perPiecePrice) - Number(accessory.perPiecePrice)) *
//         Number(quantity);
//       await accessory.save();

//       transactions.push(transaction);
//     }

//     res
//       .status(201)
//       .json({ message: "Accessories sold successfully", transactions });
//   } catch (error) {
//     console.error("Error selling accessories:", error);
//     res
//       .status(500)
//       .json({ message: "Failed to sell accessories", error: error.message });
//   }
// };
const sellMultipleAccessories = async (req, res) => {
  try {
    const userId = req.user.id;
    const sales = req.body.sales;

    if (!Array.isArray(sales) || sales.length === 0) {
      return res.status(400).json({ message: "Sales array is required" });
    }
    console.log("sales", sales);
    const { getPayment, entityData, purchasePaymentType, creditPaymentData } =
      req.body;
    const transactions = [];
    console.log(getPayment, "getPayment");

    if (getPayment?.bankAccountUsed) {
      const bank = await AddBankAccount.findById(getPayment?.bankAccountUsed);
      if (!bank) {
        return res.status(404).json({ message: "Bank account not found" });
      }

      const amountToAdd = getPayment?.amountFromBank || 0;

      bank.accountCash += Number(amountToAdd);
      await bank.save();

      // Get person name for better description
      let personName = "Unknown";
      if (entityData.name) {
        personName = entityData.name;
      } else if (entityData._id) {
        const personFromId = await Person.findById(entityData._id);
        if (personFromId) {
          personName = personFromId.name;
        }
      }

      await BankTransaction.create({
        bankId: bank._id,
        userId,
        sourceOfAmountAddition: `Sale of ${sales.length} accessories to ${personName} | Amount: ${amountToAdd}`,
        amount: Number(amountToAdd),
        accountCash: bank.accountCash,
        accountType: bank.accountType,
      });
    }

    if (getPayment?.amountFromPocket) {
      const pocket = await PocketCashSchema.findOne({ userId });
      if (!pocket) {
        return res
          .status(404)
          .json({ message: "Pocket cash account not found" });
      }

      const amountToAdd = getPayment?.amountFromPocket || 0;

      pocket.accountCash += Number(amountToAdd);
      await pocket.save();

      // Get person name for better description
      let personName = "Unknown";
      if (entityData.name) {
        personName = entityData.name;
      } else if (entityData._id) {
        const personFromId = await Person.findById(entityData._id);
        if (personFromId) {
          personName = personFromId.name;
        }
      }

      await PocketCashTransactionSchema.create({
        userId,
        pocketCashId: pocket._id,
        amountAdded: Number(amountToAdd),
        accountCash: pocket.accountCash,
        sourceOfAmountAddition: `Sale of ${sales.length} accessories to ${personName} | Amount: ${amountToAdd}`,
      });
    }

    const accessoryNames = [];
    const accessoryData = [];
    let totalQuantity = 0;
    let totalPrice = 0;
    let totalProfit = 0;

    for (const sale of sales) {
      const accessory = await Accessory.findById(sale.accessoryId);
      if (!accessory) {
        return res
          .status(404)
          .json({ message: `Accessory not found: ${sale.accessoryId}` });
      }
      if (accessory.stock < sale.quantity) {
        return res.status(400).json({
          message: `Insufficient stock for ${accessory.accessoryName}. Available: ${accessory.stock}, Requested: ${sale.quantity}`,
        });
      }

      accessoryNames.push(accessory.accessoryName);
      accessoryData.push({
        name: sale.name,
        accessoryId: sale.accessoryId,
        quantity: sale.quantity,
        perPiecePrice: sale.perPiecePrice,
      });
      console.log("accessoryData", accessoryData);
      const profit =
        (Number(sale.perPiecePrice) - Number(accessory.perPiecePrice)) *
        Number(sale.quantity);
      totalQuantity += Number(sale.quantity);
      totalPrice += Number(sale.quantity) * Number(sale.perPiecePrice);
      totalProfit += profit;
    }

    // Handle person/credit logic
    let person = null;
    if (entityData.number || entityData._id) {
      person = await Person.findOne({
        ...(!entityData.number && entityData._id && { _id: entityData._id }),
        ...(entityData.number && { number: entityData.number }),
        userId: req.user.id,
      });
    }

    if (purchasePaymentType === "credit") {
      if (!entityData) {
        return res
          .status(400)
          .json({ message: "Entity data required for credit sales" });
      }

      if (!person) {
        person = await Person.create({
          userId: req.user.id,
          name: entityData.name,
          number: entityData.number,
          reference: "Accessory Sale",
          givingCredit: Number(creditPaymentData.payableAmountLater),
          status: "Receivable",
        });
      } else {
        person.givingCredit += Number(creditPaymentData.payableAmountLater);
        person.status = "Receivable";
        await person.save();
      }

      await CreditTransaction.create({
        userId: req.user.id,
        personId: person._id,
        balanceAmount:
          Number(person.givingCredit) +
          Number(creditPaymentData.payableAmountLater),
        givingCredit: Number(creditPaymentData.payableAmountLater),
        description: `Credit Sale: ${accessoryNames.join(", ")} to ${
          person.name
        } | Total: ${totalPrice} | Credit: ${
          creditPaymentData.payableAmountLater
        }`,
      });
    }

    if (purchasePaymentType === "full-payment") {
      if (entityData.name && !person) {
        const newPerson = await Person.create({
          userId: req.user.id,
          name: entityData.name,
          number: entityData.number,
          reference: "Accessory Sale",
          givingCredit: 0,
          status: "Settled",
        });
        await newPerson.save();
        await CreditTransaction.create({
          userId: req.user.id,
          personId: newPerson._id,
          givingCredit: 0,
          balanceAmount: 0,
          description: `Complete Payment of Sale: ${accessoryNames.join(
            ", "
          )} to ${
            newPerson.name
          } | Total: ${totalPrice} | Quantity: ${totalQuantity}`,
        });
      } else if (person) {
        await CreditTransaction.create({
          userId: req.user.id,
          personId: person._id,
          givingCredit: 0,
          balanceAmount: Number(person.givingCredit),
          description: `Complete Payment of Sale: ${accessoryNames.join(
            ", "
          )} to ${
            person.name
          } | Total: ${totalPrice} | Quantity: ${totalQuantity}`,
        });
      } else {
        console.log("no required entityData for full payment sale");
      }
    }

    // Create single transaction for all sales
    const transaction = await AccessoryTransaction.create({
      userId,
      type: "sale",
      accessoriesList: accessoryData.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        perPiecePrice: item.perPiecePrice,
      })),
      quantity: totalQuantity,
      perPiecePrice: totalPrice / totalQuantity,
      totalPrice: totalPrice,
      profit: totalProfit,
      ...(person?._id && { personId: person._id }),
      accessories: accessoryData,
    });

    // Update stock for all accessories
    for (const sale of sales) {
      const accessory = await Accessory.findById(sale.accessoryId);
      accessory.stock -= sale.quantity;
      accessory.totalPrice -=
        Number(accessory.perPiecePrice) * Number(sale.quantity);
      accessory.profit +=
        (Number(sale.perPiecePrice) - Number(accessory.perPiecePrice)) *
        Number(sale.quantity);
      await accessory.save();
    }

    res.status(201).json({
      message: "Accessories sold successfully",
      transaction,
    });
  } catch (error) {
    console.error("Error selling accessories:", error);
    res.status(500).json({
      message: "Failed to sell accessories",
      error: error.message,
    });
  }
};
// GET all transactions for the user
const getAllTransactions = async (req, res) => {
  try {
    const userId = req.user.id;
    const transactions = await AccessoryTransaction.find({ userId }).populate(
      "accessoryId",
      "accessoryName"
    );
    res.status(200).json(transactions);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch transactions", error });
  }
};

// DELETE accessory by ID (if owned by user)
const deleteAccessory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const accessory = await Accessory.findOneAndDelete({ _id: id, userId });
    if (!accessory)
      return res
        .status(404)
        .json({ message: "Accessory not found or unauthorized" });

    // Optionally, delete related transactions
    await AccessoryTransaction.deleteMany({ accessoryId: id, userId });

    res
      .status(200)
      .json({ message: "Accessory and related transactions deleted" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete accessory", error });
  }
};

const getAccessoriesData = async (req, res) => {
  try {
    const userId = req.user.id;
    const accessories = await Accessory.find({ userId });
    const totalProfit = accessories.reduce(
      (sum, accessory) => sum + accessory.profit,
      0
    );
    // Fallback: count all transactions if transactionType is missing
    let salesTransactions = await AccessoryTransaction.find({
      userId,
      transactionType: "sale",
    });
    if (!salesTransactions || salesTransactions.length === 0) {
      // Try without transactionType in case old records don't have it
      salesTransactions = await AccessoryTransaction.find({ userId });
    }
    const totalSales = salesTransactions ? salesTransactions.length : 0;
    res.status(200).json({ totalProfit, totalSales });
  } catch (error) {
    console.error("Error calculating total profit:", error);
    res
      .status(500)
      .json({ message: "Failed to calculate total profit", error });
  }
};
const handleAddAcessoryStockById = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const {
      quantity,
      perPiecePrice,
      givePayment,
      purchasePaymentType,
      creditPaymentData,
      entityData,
    } = req.body;

    // Validate basic required fields
    if (!quantity || quantity === undefined || quantity === null) {
      return res.status(400).json({ message: "quantity is required" });
    }

    if (
      !perPiecePrice ||
      perPiecePrice === undefined ||
      perPiecePrice === null
    ) {
      return res.status(400).json({ message: "perPiecePrice is required" });
    }

    // Validate quantity - must be positive integer
    if (
      isNaN(quantity) ||
      quantity <= 0 ||
      !Number.isInteger(Number(quantity))
    ) {
      return res.status(400).json({
        message: "quantity must be a positive integer",
      });
    }

    // Validate perPiecePrice - must be positive number
    if (isNaN(perPiecePrice) || perPiecePrice < 0) {
      return res.status(400).json({
        message: "perPiecePrice must be a positive number",
      });
    }

    // Validate purchasePaymentType
    if (!purchasePaymentType) {
      return res.status(400).json({
        message: "purchasePaymentType is required",
      });
    }

    if (
      purchasePaymentType !== "full-payment" &&
      purchasePaymentType !== "credit"
    ) {
      return res.status(400).json({
        message: 'purchasePaymentType must be "full-payment" or "credit"',
      });
    }

    // Validate entityData
    if (!entityData || typeof entityData !== "object") {
      return res.status(400).json({
        message: "entityData is required and must be an object",
      });
    }

    const totalPrice = Number(quantity) * Number(perPiecePrice);

    // Validate givePayment for full-payment
    if (purchasePaymentType === "full-payment") {
      if (!givePayment || typeof givePayment !== "object") {
        return res.status(400).json({
          message: "givePayment is required for full-payment transactions",
        });
      }

      const amountFromBank = Number(givePayment.amountFromBank || 0);
      const amountFromPocket = Number(givePayment.amountFromPocket || 0);

      // At least one payment method should have amount > 0git add

      // Total payment should match or be less than total purchase amount
      const totalPayment = amountFromBank + amountFromPocket;
      if (totalPayment > totalPrice) {
        return res.status(400).json({
          message: "Total payment cannot exceed total purchase amount",
        });
      }
    }

    // Validate creditPaymentData for credit payments
    if (purchasePaymentType === "credit") {
      if (!creditPaymentData || typeof creditPaymentData !== "object") {
        return res.status(400).json({
          message: "creditPaymentData is required for credit transactions",
        });
      }

      const payableAmountNow = Number(creditPaymentData.payableAmountNow || 0);
      const payableAmountLater = Number(
        creditPaymentData.payableAmountLater || 0
      );

      if (isNaN(payableAmountNow) || payableAmountNow < 0) {
        return res.status(400).json({
          message: "creditPaymentData.payableAmountNow must be a number >= 0",
        });
      }

      if (isNaN(payableAmountLater) || payableAmountLater < 0) {
        return res.status(400).json({
          message: "creditPaymentData.payableAmountLater must be a number >= 0",
        });
      }

      // Validate dateOfPayment if provided (optional according to docs)
      if (creditPaymentData.dateOfPayment) {
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(creditPaymentData.dateOfPayment)) {
          return res.status(400).json({
            message: "dateOfPayment must be in ISO format (YYYY-MM-DD)",
          });
        }
      }

      // payableAmountNow + payableAmountLater should equal total purchase amount
      const creditTotal = payableAmountNow + payableAmountLater;
      if (Math.abs(creditTotal - totalPrice) > 0.01) {
        return res.status(400).json({
          message:
            "payableAmountNow + payableAmountLater must equal total price (quantity * perPiecePrice)",
        });
      }

      // For credit, validate givePayment if payableAmountNow > 0
      if (payableAmountNow > 0) {
        if (!givePayment || typeof givePayment !== "object") {
          return res.status(400).json({
            message: "givePayment is required when payableAmountNow > 0",
          });
        }

        const amountFromBank = Number(givePayment.amountFromBank || 0);
        const amountFromPocket = Number(givePayment.amountFromPocket || 0);
        const totalPayment = amountFromBank + amountFromPocket;

        if (Math.abs(totalPayment - payableAmountNow) > 0.01) {
          return res.status(400).json({
            message:
              "Total payment (amountFromBank + amountFromPocket) must equal payableAmountNow for credit payments",
          });
        }

        // Validate bankAccountUsed if amountFromBank > 0
        if (
          amountFromBank > 0 &&
          (!givePayment.bankAccountUsed || givePayment.bankAccountUsed === 0)
        ) {
          return res.status(400).json({
            message: "bankAccountUsed is required when amountFromBank > 0",
          });
        }
      }
    }

    // Find the accessory
    const accessory = await Accessory.findOne({ _id: id, userId });
    if (!accessory) {
      return res.status(404).json({
        message: "Accessory not found or unauthorized",
      });
    }

    // Handle entity (Person) - find or create
    let person;
    if (entityData._id) {
      // Existing entity - verify it exists
      person = await Person.findOne({
        _id: entityData._id,
        userId: req.user.id,
      });
      if (!person) {
        return res.status(404).json({ message: "Entity not found" });
      }
    } else {
      // New entity - check if exists by number, otherwise create
      person = await Person.findOne({
        number: Number(entityData.number),
        userId: req.user.id,
      });

      if (!person) {
        person = await Person.create({
          userId: req.user.id,
          name: entityData.name,
          number: Number(entityData.number),
          reference: `Accessory Stock Purchase: ${accessory.accessoryName}`,
          takingCredit: 0,
          status: "Settled",
        });
      }
    }

    // Process credit payment if applicable
    if (purchasePaymentType === "credit") {
      const payableLater = Number(creditPaymentData.payableAmountLater || 0);
      const payableNow = Number(creditPaymentData.payableAmountNow || 0);

      person.takingCredit = Number(person.takingCredit || 0) + payableLater;
      person.status = "Payable";
      await person.save();

      const dateOfPayment = creditPaymentData.dateOfPayment || "Not specified";
      await CreditTransaction.create({
        userId: req.user.id,
        personId: person._id,
        takingCredit: payableLater,
        description: `Credit purchase of ${quantity} ${accessory.accessoryName} at ${perPiecePrice} per piece by ${entityData.name}. Total: ${totalPrice}, Paid now: ${payableNow}, Due: ${payableLater}, Due date: ${dateOfPayment}`,
        balanceAmount: Number(person.takingCredit),
      });
    } else {
      // Full payment - create a settled transaction record
      await CreditTransaction.create({
        userId: req.user.id,
        personId: person._id,
        takingCredit: 0,
        balanceAmount: Number(person.takingCredit || 0),
        description: `Full payment purchase of ${quantity} ${accessory.accessoryName} at ${perPiecePrice} per piece by ${entityData.name}. Total: ${totalPrice}`,
      });
    }

    // Process bank payment (for both full-payment and credit with payableAmountNow > 0)
    if (givePayment && Number(givePayment.amountFromBank || 0) > 0) {
      const bank = await AddBankAccount.findById(givePayment.bankAccountUsed);
      if (!bank) {
        return res.status(404).json({ message: "Bank account not found" });
      }

      const amountToDeduct = Number(givePayment.amountFromBank);

      if (amountToDeduct > bank.accountCash) {
        return res.status(400).json({ message: "Insufficient bank balance" });
      }

      bank.accountCash -= amountToDeduct;
      await bank.save();

      await BankTransaction.create({
        bankId: bank._id,
        userId,
        reasonOfAmountDeduction: `Purchase of ${quantity} ${accessory.accessoryName} at ${perPiecePrice} per piece from ${entityData.name}`,
        amount: amountToDeduct,
        accountCash: bank.accountCash,
        accountType: bank.accountType,
      });
    }

    // Process pocket cash payment (for both full-payment and credit with payableAmountNow > 0)
    if (givePayment && Number(givePayment.amountFromPocket || 0) > 0) {
      const pocket = await PocketCashSchema.findOne({ userId });
      if (!pocket) {
        return res
          .status(404)
          .json({ message: "Pocket cash account not found" });
      }

      const amountToDeduct = Number(givePayment.amountFromPocket);

      if (amountToDeduct > pocket.accountCash) {
        return res.status(400).json({ message: "Insufficient pocket cash" });
      }

      pocket.accountCash -= amountToDeduct;
      await pocket.save();

      await PocketCashTransactionSchema.create({
        userId,
        pocketCashId: pocket._id,
        amountDeducted: amountToDeduct,
        accountCash: pocket.accountCash,
        remainingAmount: pocket.accountCash,
        reasonOfAmountDeduction: `Purchase of ${quantity} ${accessory.accessoryName} at ${perPiecePrice} per piece from ${entityData.name}`,
      });
    }

    // Calculate new average perPiecePrice based on existing and added stock
    const existingStock = Number(accessory.stock);
    const existingTotalCost = Number(accessory.perPiecePrice) * existingStock;
    const addedStock = Number(quantity);
    const addedTotalCost = Number(perPiecePrice) * addedStock;
    const newTotalStock = existingStock + addedStock;
    const newTotalCost = existingTotalCost + addedTotalCost;
    accessory.perPiecePrice =
      newTotalStock > 0 ? newTotalCost / newTotalStock : Number(perPiecePrice);

    // Update stock and total price
    accessory.stock += Number(quantity);
    accessory.totalPrice += Number(perPiecePrice) * Number(quantity);

    // Update personId if not already set
    if (!accessory.personId) {
      accessory.personId = person._id;
    }

    await accessory.save();

    // Create AccessoryTransaction record
    const transaction = await AccessoryTransaction.create({
      userId,
      accessoryId: accessory._id,
      quantity: Number(quantity),
      perPiecePrice: Number(perPiecePrice),
      totalPrice: totalPrice,
      personId: person._id,
      type: "purchase",
    });

    res.status(200).json({
      success: true,
      message: "Stock added successfully",
      data: {
        accessory,
        transaction,
        entity: person,
      },
    });
  } catch (error) {
    console.error("Error updating accessory stock:", error);
    res.status(500).json({
      message: "Failed to update accessory stock",
      error: error.message,
    });
  }
};
// const getAccessoriesPersonRecord = async (req, res) => {
//   try {
//     const userId = req.user.id;
//     const records = await AccessoryTransaction.find({
//       userId,
//       type: "sale",
//     }).populate("accessoryId", "accessoryName");
//     // Map records to include accessoryName at the top level
//     const result = records.map((record) => ({
//       ...record.toObject(),
//       accessoryName: record.accessoryId?.accessoryName || null,
//     }));
//     res.status(200).json(result);
//   } catch (error) {
//     console.error("Error fetching accessories for person:", error);
//     res.status(500).json({ message: "Failed to fetch accessories", error });
//   }
// };
const getAccessoriesPersonRecord = async (req, res) => {
  try {
    const userId = req.user.id;
    const records = await AccessoryTransaction.find({
      userId,
      type: "sale",
    })
      .populate("accessoryId", "accessoryName")
      .populate(
        "personId",
        "name number reference givingCredit takingCredit status"
      );
    const result = records.map((record) => {
      return {
        _id: record._id,
        userId: record.userId,
        accessoriesList: record.accessoriesList,
        accessoryId: record.accessoryId?._id || null,
        accessoryName: record.accessoryId?.accessoryName || null,
        quantity: record.quantity,
        perPiecePrice: record.perPiecePrice,
        totalPrice: record.totalPrice,
        profit: record.profit,
        type: record.type,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        // Person fields
        personId: record.personId?._id || null,
        personName: record.personId?.name || "Walk-in",
        personNumber: record.personId?.number || null,
        personReference: record.personId?.reference || null,
        personGivingCredit: record.personId?.givingCredit || 0,
        personTakingCredit: record.personId?.takingCredit || 0,
        personStatus: record.personId?.status || "Settled",
      };
    });

    res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching accessories sales records:", error);
    res.status(500).json({
      message: "Failed to fetch sales records",
      error: error.message,
    });
  }
};
// const getAccessoriesPersonPurchaseRecord = async (req, res) => {
//   try {
//     const userId = req.user.id;
//     const records = await AccessoryTransaction.find({
//       userId,
//       type: "purchase",
//     }).populate("accessoryId", "accessoryName");
//     // Map records to include accessoryName at the top level
//     const result = records.map((record) => ({
//       ...record.toObject(),
//       accessoryName: record.accessoryId?.accessoryName || null,
//     }));
//     res.status(200).json(result);
//   } catch (error) {
//     console.error("Error fetching accessories for person:", error);
//     res.status(500).json({ message: "Failed to fetch accessories", error });
//   }
// };
const getAccessoriesPersonPurchaseRecord = async (req, res) => {
  try {
    const userId = req.user.id;
    const records = await AccessoryTransaction.find({
      userId,
      type: "purchase",
    })
      .populate("accessoryId", "accessoryName")
      .populate(
        "personId",
        "name number reference givingCredit takingCredit status"
      );

    // Flatten the structure
    const result = records.map((record) => {
      const flatRecord = {
        _id: record._id,
        userId: record.userId,
        accessoryList: record.accessoriesList || [],
        accessoryId: record.accessoryId?._id || null,
        accessoryName: record.accessoryId?.accessoryName || null,
        quantity: record.quantity,
        perPiecePrice: record.perPiecePrice,
        totalPrice: record.totalPrice,
        profit: record.profit,
        type: record.type,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        // Person fields directly in the object
        personId: record.personId?._id || null,
        personName: record.personId?.name || null,
        personNumber: record.personId?.number || null,
        personReference: record.personId?.reference || null,
        personGivingCredit: record.personId?.givingCredit || 0,
        personTakingCredit: record.personId?.takingCredit || 0,
        personStatus: record.personId?.status || null,
      };
      return flatRecord;
    });

    res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching accessories for person:", error);
    res.status(500).json({
      message: "Failed to fetch accessories",
      error: error.message,
    });
  }
};
const deleteAccessoryById = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    // Validate accessory ID
    if (!id) {
      return res.status(400).json({ message: "Accessory ID is required" });
    }
    const accessory = await Accessory.findOneAndDelete({ _id: id, userId });
    if (!accessory) {
      return res
        .status(404)
        .json({ message: "Accessory not found or unauthorized" });
    }

    // Optionally, delete related transactions
    await AccessoryTransaction.deleteMany({ accessoryId: id, userId });

    res.status(200).json({
      message: "Accessory and related transactions deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting accessory:", error);
    res.status(500).json({ message: "Failed to delete accessory", error });
  }
};
const returnSoldAccessories = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      accessoryId,
      quantity,
      perPiecePrice,
      accessoryName,
      bankAccountUsed,
      pocketCash,
    } = req.body;
    const accessory = await Accessory.findOne({ _id: accessoryId, userId });
    if (!accessory) {
      const accessory = await Accessory.create({
        userId,
        accessoryName,
        quantity,
        perPiecePrice,
        totalPrice: perPiecePrice * quantity,
      });
      return res
        .status(200)
        .json({ message: "Accessory returned successfully", accessory });
    }
    accessory.stock += quantity;
    accessory.totalPrice += perPiecePrice * quantity;
    await accessory.save();
    res
      .status(200)
      .json({ message: "Accessory returned successfully", accessory });
    const transaction = await AccessoryTransaction.create({
      userId,
      accessoryId,
      quantity,
      perPiecePrice,
      totalPrice: perPiecePrice * quantity,
      type: "return",
    });
    if (bankAccountUsed) {
      const bank = await AddBankAccount.findById(bankAccountUsed);
      if (!bank) {
        return res.status(404).json({ message: "Bank account not found" });
      }
      bank.accountCash -= perPiecePrice * quantity;
      await bank.save();
      await BankTransaction.create({
        bankId: bank._id,
        userId,
        amount: perPiecePrice * quantity,
        accountCash: bank.accountCash,
        accountType: bank.accountType,
        reasonOfAmountDeduction: `Return of accessory: ${accessoryName}`,
      });
    }
    if (pocketCash) {
      const pocket = await PocketCashSchema.findById(userId);
      if (!pocket) {
        return res.status(404).json({ message: "Pocket cash not found" });
      }
      pocket.accountCash -= perPiecePrice * quantity;
      await pocket.save();
      await PocketCashTransactionSchema.create({
        userId,
        pocketCashId: pocket._id,
        amountDeducted: perPiecePrice * quantity,
        remainingAmount: pocket.accountCash,
        accountCash: pocket.accountCash,
        reasonOfAmountDeduction: `Return of accessory: ${accessoryName}`,
      });
    }
    res
      .status(200)
      .json({ message: "Accessory returned successfully", transaction });
  } catch (error) {
    console.error("Error returning sold accessories:", error);
    res
      .status(500)
      .json({ message: "Failed to return sold accessories", error });
  }
};

// EDIT accessory by ID
const editAccessory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { accessoryName, perPiecePrice, picture } = req.body;

    // Validate input
    if (!id) {
      return res.status(400).json({ message: "Accessory ID is required" });
    }

    if (!accessoryName && perPiecePrice === undefined && picture === undefined) {
      return res.status(400).json({
        message:
          "At least one field (accessoryName, perPiecePrice, or picture) is required to update",
      });
    }

    // Validate perPiecePrice if provided
    if (perPiecePrice !== undefined) {
      if (isNaN(perPiecePrice) || perPiecePrice <= 0) {
        return res.status(400).json({
          message: "perPiecePrice must be a positive number",
        });
      }
    }

    // Find the accessory
    const accessory = await Accessory.findOne({ _id: id, userId });
    if (!accessory) {
      return res
        .status(404)
        .json({ message: "Accessory not found or unauthorized" });
    }

    // Update fields
    if (accessoryName) {
      accessory.accessoryName = accessoryName;
    }

    if (perPiecePrice !== undefined) {
      accessory.perPiecePrice = Number(perPiecePrice);
      // Recalculate totalPrice based on current quantity
      accessory.totalPrice = Number(perPiecePrice) * Number(accessory.quantity);
    }

    if (picture !== undefined) {
      accessory.picture = picture;
    }

    await accessory.save();

    res.status(200).json({
      message: "Accessory updated successfully",
      accessory,
    });
  } catch (error) {
    console.error("Error updating accessory:", error);
    res.status(500).json({
      message: "Failed to update accessory",
      error: error.message,
    });
  }
};

// Reduce stock from accessory
const reduceAccessoryStock = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { quantity } = req.body;

    // Validate input
    if (!id) {
      return res.status(400).json({ message: "Accessory ID is required" });
    }

    if (!quantity || isNaN(quantity) || quantity <= 0) {
      return res.status(400).json({
        message: "Quantity is required and must be a positive number",
      });
    }

    // Find the accessory
    const accessory = await Accessory.findOne({ _id: id, userId });
    if (!accessory) {
      return res
        .status(404)
        .json({ message: "Accessory not found or unauthorized" });
    }

    // Check if stock is sufficient
    if (accessory.stock < quantity) {
      return res.status(400).json({
        message: `Insufficient stock. Available: ${accessory.stock}, Requested: ${quantity}`,
      });
    }

    // Reduce stock
    accessory.stock -= Number(quantity);
    accessory.totalPrice -= Number(accessory.perPiecePrice) * Number(quantity);

    await accessory.save();

    res.status(200).json({
      message: "Stock reduced successfully",
      accessory,
    });
  } catch (error) {
    console.error("Error reducing accessory stock:", error);
    res.status(500).json({
      message: "Failed to reduce accessory stock",
      error: error.message,
    });
  }
};

// Return sold accessory (restore stock and refund payment)
const returnSoldAccessory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params; // AccessoryTransaction ID (sale transaction)
    const { returnAmount, bankAccountUsed, amountFromPocket } = req.body;

    // Validate input
    if (!id) {
      return res.status(400).json({
        message: "Accessory sale transaction ID is required",
      });
    }

    // Find the sale transaction
    const saleTransaction = await AccessoryTransaction.findOne({
      _id: id,
      userId,
      type: "sale",
    }).populate("accessoryId", "accessoryName stock perPiecePrice");

    if (!saleTransaction) {
      return res.status(404).json({
        message: "Accessory sale transaction not found or unauthorized",
      });
    }

    // Calculate return amount (use transaction total price if not provided)
    const amountToReturn = returnAmount || saleTransaction.totalPrice || 0;

    // Handle single accessory or multiple accessories
    if (saleTransaction.accessoryId) {
      // Single accessory sale
      const accessory = await Accessory.findById(saleTransaction.accessoryId);
      if (!accessory) {
        return res.status(404).json({ message: "Accessory not found" });
      }

      // Restore stock and adjust total price and profit
      accessory.stock += saleTransaction.quantity;
      accessory.totalPrice +=
        Number(accessory.perPiecePrice) * Number(saleTransaction.quantity);
      // Subtract the profit that was made from this sale
      accessory.profit = Math.max(
        0,
        accessory.profit - (saleTransaction.profit || 0)
      );

      await accessory.save();
    } else if (
      saleTransaction.accessories &&
      Array.isArray(saleTransaction.accessories) &&
      saleTransaction.accessories.length > 0
    ) {
      // Multiple accessories sale - restore stock for each
      for (const accItem of saleTransaction.accessories) {
        const accessory = await Accessory.findById(accItem.accessoryId);
        if (accessory) {
          accessory.stock += Number(accItem.quantity);
          accessory.totalPrice +=
            Number(accessory.perPiecePrice) * Number(accItem.quantity);
          // Calculate and subtract profit for this item
          const itemProfit =
            (Number(accItem.perPiecePrice) - Number(accessory.perPiecePrice)) *
            Number(accItem.quantity);
          accessory.profit = Math.max(0, accessory.profit - itemProfit);
          await accessory.save();
        }
      }
    }

    // Handle bank payment refund
    if (bankAccountUsed && (!amountFromPocket || amountFromPocket === 0)) {
      const bank = await AddBankAccount.findById(bankAccountUsed);
      if (!bank) {
        return res.status(404).json({ message: "Bank account not found" });
      }

      // Deduct from bank (refund to customer)
      bank.accountCash -= Number(amountToReturn);
      await bank.save();

      await BankTransaction.create({
        bankId: bank._id,
        userId,
        reasonOfAmountDeduction: `Return of sold accessory: ${
          saleTransaction.accessoryId?.accessoryName || "Multiple accessories"
        } (Quantity: ${saleTransaction.quantity})`,
        amount: Number(amountToReturn),
        accountCash: bank.accountCash,
        accountType: bank.accountType,
      });
    }

    // Handle pocket cash refund
    if (amountFromPocket > 0) {
      const pocket = await PocketCashSchema.findOne({ userId });
      if (!pocket) {
        return res
          .status(404)
          .json({ message: "Pocket cash account not found" });
      }

      // Deduct from pocket cash (refund to customer)
      pocket.accountCash -= Number(amountFromPocket);
      await pocket.save();

      await PocketCashTransactionSchema.create({
        userId,
        pocketCashId: pocket._id,
        amountDeducted: Number(amountFromPocket),
        accountCash: pocket.accountCash,
        remainingAmount: pocket.accountCash,
        reasonOfAmountDeduction: `Return of sold accessory: ${
          saleTransaction.accessoryId?.accessoryName || "Multiple accessories"
        } (Quantity: ${saleTransaction.quantity})`,
      });
    }

    // Handle credit adjustment if person exists (credit sale)
    if (saleTransaction.personId) {
      const person = await Person.findById(saleTransaction.personId);
      if (person) {
        const creditAmount = Number(amountToReturn);
        if (person.givingCredit > 0) {
          // Reduce the credit we're giving (customer owes us less)
          person.givingCredit = Math.max(0, person.givingCredit - creditAmount);
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
            description: `Return of sold accessory: ${
              saleTransaction.accessoryId?.accessoryName ||
              "Multiple accessories"
            } (Quantity: ${
              saleTransaction.quantity
            }) - Credit adjustment: ${creditAmount}`,
          });
        }
      }
    }

    // Delete the sale transaction
    await AccessoryTransaction.findByIdAndDelete(id);

    res.status(200).json({
      message: "Sold accessory returned successfully",
      returnedAmount: amountToReturn,
      restoredStock: saleTransaction.quantity,
    });
  } catch (error) {
    console.error("Error returning sold accessory:", error);
    res.status(500).json({
      message: "Failed to return sold accessory",
      error: error.message,
    });
  }
};

// Return accessory purchase to supplier
const returnAccessoryPurchase = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params; // AccessoryTransaction ID
    const { returnAmount, bankAccountUsed, amountFromPocket } = req.body;

    // Validate input
    if (!id) {
      return res.status(400).json({
        message: "Accessory purchase transaction ID is required",
      });
    }

    // Find the purchase transaction
    const transaction = await AccessoryTransaction.findOne({
      _id: id,
      userId,
      type: "purchase",
    });

    if (!transaction) {
      return res.status(404).json({
        message: "Accessory purchase transaction not found or unauthorized",
      });
    }

    // Find the accessory
    const accessory = await Accessory.findById(transaction.accessoryId);
    if (!accessory) {
      return res.status(404).json({ message: "Accessory not found" });
    }

    // Calculate return amount (use transaction total price if not provided)
    const amountToReturn = returnAmount || transaction.totalPrice || 0;

    // Check if we have enough stock to return
    if (accessory.stock < transaction.quantity) {
      return res.status(400).json({
        message: `Insufficient stock to return. Available: ${accessory.stock}, Requested: ${transaction.quantity}`,
      });
    }

    // Reduce stock and total price
    accessory.stock -= transaction.quantity;
    accessory.totalPrice -= transaction.totalPrice;

    await accessory.save();

    // Handle bank payment return
    if (bankAccountUsed && (!amountFromPocket || amountFromPocket === 0)) {
      const bank = await AddBankAccount.findById(bankAccountUsed);
      if (!bank) {
        return res.status(404).json({ message: "Bank account not found" });
      }

      bank.accountCash += Number(amountToReturn);
      await bank.save();

      await BankTransaction.create({
        bankId: bank._id,
        userId,
        sourceOfAmountAddition: `Return of accessory purchase: ${accessory.accessoryName} (Quantity: ${transaction.quantity})`,
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
        sourceOfAmountAddition: `Return of accessory purchase: ${accessory.accessoryName} (Quantity: ${transaction.quantity})`,
      });
    }

    // Handle credit adjustment if person exists
    if (transaction.personId) {
      const person = await Person.findById(transaction.personId);
      if (person) {
        const creditAmount = Number(amountToReturn);
        if (person.takingCredit > 0) {
          person.takingCredit = Math.max(0, person.takingCredit - creditAmount);
          if (person.takingCredit === 0 && person.givingCredit === 0) {
            person.status = "Settled";
          }
          await person.save();

          await CreditTransaction.create({
            userId,
            personId: person._id,
            takingCredit: -creditAmount,
            balanceAmount: person.takingCredit,
            description: `Return of accessory purchase: ${accessory.accessoryName} (Quantity: ${transaction.quantity}) - Credit adjustment: ${creditAmount}`,
          });
        }
      }
    }

    // Delete the purchase transaction
    await AccessoryTransaction.findByIdAndDelete(id);

    res.status(200).json({
      message: "Accessory purchase returned successfully",
      accessory,
      returnedAmount: amountToReturn,
    });
  } catch (error) {
    console.error("Error returning accessory purchase:", error);
    res.status(500).json({
      message: "Failed to return accessory purchase",
      error: error.message,
    });
  }
};

module.exports = {
  createAccessory,
  getAllAccessories,
  getTotalSoldAccessories,
  sellMultipleAccessories,
  getAllTransactions,
  deleteAccessory,
  getAccessoriesData,
  handleAddAcessoryStockById,
  getAccessoriesPersonRecord,
  deleteAccessoryById,
  getAccessoriesPersonPurchaseRecord,
  returnSoldAccessories,
  editAccessory,
  reduceAccessoryStock,
  returnAccessoryPurchase,
  returnSoldAccessory,
};
