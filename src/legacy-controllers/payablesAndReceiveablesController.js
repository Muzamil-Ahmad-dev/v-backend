 // controllers/creditController.js
 const mongoose = require("mongoose");  // ✅ ADD THIS

const bcrypt = require("bcryptjs");
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
  PurchasePhone,
  SoldPhone,
  BulkPhonePurchase,
  SingleSoldPhone,
} = require("../schema/purchasePhoneSchema");
const User = require("../schema/UserSchema");
// GET /api/person/summary  — dashboard totals
exports.getDashboardSummary = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await Person.aggregate([
      {
        $match: { userId: new mongoose.Types.ObjectId(userId) }
      },
      {
        $group: {
          _id: null,
          totalCustomers: { $sum: 1 },
          totalReceivables: {
            $sum: {
              $cond: [
                { $gt: ["$givingCredit", "$takingCredit"] },
                { $subtract: ["$givingCredit", "$takingCredit"] },
                0
              ]
            }
          },
          totalPayables: {
            $sum: {
              $cond: [
                { $gt: ["$takingCredit", "$givingCredit"] },
                { $subtract: ["$takingCredit", "$givingCredit"] },
                0
              ]
            }
          },
          receivablesCount: {
            $sum: { $cond: [{ $gt: ["$givingCredit", "$takingCredit"] }, 1, 0] }
          },
          payablesCount: {
            $sum: { $cond: [{ $gt: ["$takingCredit", "$givingCredit"] }, 1, 0] }
          },
          activeAccounts: {
            $sum: { $cond: [{ $ne: ["$status", "Settled"] }, 1, 0] }
          }
        }
      }
    ]);

    const summary = result[0] || {
      totalCustomers: 0,
      totalReceivables: 0,
      totalPayables: 0,
      receivablesCount: 0,
      payablesCount: 0,
      activeAccounts: 0
    };
    delete summary._id;

    res.status(200).json({ success: true, data: summary });
  } catch (error) {
    console.error("Error fetching dashboard summary:", error);
    res.status(500).json({ success: false, message: "Error fetching summary", error: error.message });
  }
};
// 1. Create a Person

exports.createPerson = async (req, res) => {
  try {
    const { name, number, reference } = req.body;
    const userId = req.user.id;
    if (!name || !number || !reference) {
      return res
        .status(400)
        .json({ message: "Name, number, and reference are required" });
    }
    if (await Person.findOne({ number, userId })) {
      return res.status(400).json({ message: "Person already exists" });
    }

    const newPerson = new Person({ userId, name, number, reference });
    await newPerson.save();

    res
      .status(201)
      .json({ message: "Person created successfully", person: newPerson });
  } catch (error) {
    res.status(500).json({ message: "Error creating person", error });
  }
};

// 2. Give Credit
exports.giveCredit = async (req, res) => {
  try {
    const { personId, amount, description, giveCredit } = req.body;
    const userId = req.user.id;

    // Fetch person details first to get the name for descriptions
    const person = await Person.findOne({ _id: personId, userId });
    if (!person) return res.status(404).json({ message: "Person not found" });

    console.log("give credit", giveCredit);
    if (giveCredit?.bankAccountUsed) {
      const bank = await AddBankAccount.findById(giveCredit?.bankAccountUsed);
      if (!bank) return res.status(404).json({ message: "Bank not found" });

      // Deduct purchasePrice from accountCash
      bank.accountCash -= Number(giveCredit?.amountFromBank);
      await bank.save();
      console.log("bank", bank);
      // Log the transaction
      await BankTransaction.create({
        bankId: bank._id,
        userId: req.user.id,
        reasonOfAmountDeduction: `give credit to person: ${person.name}, amount from bank: ${giveCredit?.amountFromBank} | total amount: ${amount}`,
        accountCash: giveCredit?.amountFromBank,
        accountType: bank.accountType,
      });
    }
    console.log("giveCredit", giveCredit);
    if (giveCredit?.amountFromPocket) {
      const pocketTransaction = await PocketCashSchema.findOne({
        userId: req.user.id,
      });
      if (!pocketTransaction) {
        return res
          .status(404)
          .json({ message: "Pocket cash account not found." });
      }

      if (giveCredit?.amountFromPocket > pocketTransaction.accountCash) {
        return res.status(400).json({ message: "Insufficient pocket cash" });
      }

      pocketTransaction.accountCash -= Number(giveCredit?.amountFromPocket);
      await pocketTransaction.save();
      console.log("pocketTransaction", pocketTransaction);
      await PocketCashTransactionSchema.create({
        userId: req.user.id,
        pocketCashId: pocketTransaction._id, // if you want to associate it
        amountDeducted: giveCredit?.amountFromPocket,
        accountCash: pocketTransaction.accountCash, // ✅ add this line
        remainingAmount: pocketTransaction.accountCash,
        reasonOfAmountDeduction: `give credit to person: ${person.name}, amount from pocket: ${giveCredit?.amountFromPocket} | total amount: ${amount}`,
      });
    }

    let updatedGiving = person.givingCredit + amount;
    let updatedTaking = person.takingCredit;

    if (person.takingCredit > 0) {
      const diff = person.takingCredit - amount;
      if (diff >= 0) {
        updatedTaking = diff;
        updatedGiving = person.givingCredit;
      } else {
        updatedTaking = 0;
        updatedGiving = person.givingCredit + Math.abs(diff);
      }
    }

    const status =
      updatedTaking > 0
        ? "Payable"
        : updatedGiving > 0
        ? "Receivable"
        : "Settled";

    person.givingCredit = updatedGiving;
    person.takingCredit = updatedTaking;
    person.status = status;
    await person.save();
    const balanceAmount =
      person.takingCredit > person.givingCredit
        ? person.takingCredit - person.givingCredit
        : person.givingCredit - person.takingCredit;

    await CreditTransaction.create({
      userId,
      personId,
      givingCredit: amount,
      description,
      balanceAmount,
    });

    res.status(200).json({ message: "Credit given successfully", person });
  } catch (error) {
    res.status(500).json({ message: "Error in giving credit", error });
  }
};

// 3. Take Credit
exports.takeCredit = async (req, res) => {
  try {
    const { personId, amount, description, takeCredit } = req.body;
    const userId = req.user.id;

    // Fetch person details first to get the name for descriptions
    const person = await Person.findOne({ _id: personId, userId });
    if (!person) return res.status(404).json({ message: "Person not found" });

    if (takeCredit?.bankAccountUsed) {
      const bank = await AddBankAccount.findById(takeCredit?.bankAccountUsed);
      if (!bank) return res.status(404).json({ message: "Bank not found" });

      // Deduct purchasePrice from accountCash
      bank.accountCash += Number(takeCredit?.amountFromBank);
      await bank.save();

      // Log the transaction
      await BankTransaction.create({
        bankId: bank._id,
        userId: req.user.id,
        sourceOfAmountAddition: `take credit from person: ${person.name}, amount from bank: ${takeCredit?.amountFromBank} | total amount: ${amount}`,
        accountCash: amount,
        accountType: bank.accountType,
      });
    }
    console.log("giveCredit", takeCredit);
    if (takeCredit?.amountFromPocket) {
      const pocketTransaction = await PocketCashSchema.findOne({
        userId: req.user.id,
      });
      if (!pocketTransaction) {
        return res
          .status(404)
          .json({ message: "Pocket cash account not found." });
      }

      pocketTransaction.accountCash += Number(takeCredit?.amountFromPocket);
      await pocketTransaction.save();

      await PocketCashTransactionSchema.create({
        userId: req.user.id,
        pocketCashId: pocketTransaction._id, // if you want to associate it
        amountAdded: takeCredit?.amountFromPocket,
        accountCash: pocketTransaction.accountCash, // ✅ add this line
        remainingAmount: pocketTransaction.accountCash,
        sourceOfAmountAddition: `take credit from person: ${person.name}, amount from pocket: ${takeCredit?.amountFromPocket} | total amount: ${amount}`,
      });
    }

    let updatedTaking = person.takingCredit + amount;
    let updatedGiving = person.givingCredit;

    if (person.givingCredit > 0) {
      const diff = person.givingCredit - amount;
      if (diff >= 0) {
        updatedGiving = diff;
        updatedTaking = person.takingCredit;
      } else {
        updatedGiving = 0;
        updatedTaking = person.takingCredit + Math.abs(diff);
      }
    }

    const status =
      updatedTaking > 0
        ? "Payable"
        : updatedGiving > 0
        ? "Receivable"
        : "Settled";

    person.givingCredit = updatedGiving;
    person.takingCredit = updatedTaking;
    person.status = status;
    await person.save();

    const balanceAmount =
      person.takingCredit > person.givingCredit
        ? person.takingCredit - person.givingCredit
        : person.givingCredit - person.takingCredit;

    await CreditTransaction.create({
      userId,
      personId,
      takingCredit: amount,
      description,
      balanceAmount,
    });

    res.status(200).json({ message: "Credit taken successfully", person });
  } catch (error) {
    res.status(500).json({ message: "Error in taking credit", error });
  }
};

// 4. Get All Persons with Total Credit Info
exports.getAllPersons = async (req, res) => {
  try {
    const userId = req.user.id;

    const persons = await Person.find({ userId }).sort({
      createdAt: -1,
    });
    res.status(200).json(persons);
  } catch (error) {
    res.status(500).json({ message: "Error fetching persons", error });
  }
};

// 5. Get Person Detail by ID
exports.getPersonDetail = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const person = await Person.findOne({ _id: id, userId });
    if (!person) return res.status(404).json({ message: "Person not found" });

    const transactions = await CreditTransaction.find({
      personId: id,
      userId,
    }).sort({ createdAt: -1 });

    res.status(200).json({ person, transactions });
  } catch (error) {
    res.status(500).json({ message: "Error fetching person detail", error });
  }
};

exports.deleteTransaction = async (req, res) => {
  try {
    const id = req.params.id;
    if (!id)
      return res.status(400).json({ message: "Transaction ID is required" });

    const transaction = await CreditTransaction.findOne({
      _id: id,
      userId: req.user.id, // Fixed: use req.user.id
    });

    if (!transaction) {
      return res.status(404).json({ message: "Transaction not found" });
    }

    const givingCredit = transaction.givingCredit;
    const takingCredit = transaction.takingCredit;

    const person = await Person.findOne({
      _id: transaction.personId,
      userId: req.user.id,
    });

    if (!person) {
      res.status(404).json({ message: "Person not found" });
      return;
    }

    if (takingCredit) {
      await Person.findOneAndUpdate(
        { _id: transaction.personId, userId: req.user.id },
        { $inc: { takingCredit: -takingCredit } },
        { new: true }
      );
    }
    if (givingCredit) {
      await Person.findOneAndUpdate(
        { _id: transaction.personId, userId: req.user.id },
        { $inc: { givingCredit: -givingCredit } },
        { new: true }
      );
    }
    await CreditTransaction.findOneAndDelete({
      _id: id,
      userId: req.user.id,
    });
    await person.save();
    res.status(200).json({ message: "Transaction deleted successfully" });
  } catch (error) {
    console.error("Error deletingg transaction:", error);
    res
      .status(500)
      .json({ message: "Error deleting transaction", error: error.message });
  }
};
exports.getAllPersonsNameAndId = async (req, res) => {
  try {
    const userId = req.user.id;
    const persons = await Person.find({ userId })
      .select("name _id number")
      .sort({ createdAt: -1 });
    res.status(200).json(persons);
  } catch (error) {
    res.status(500).json({ message: "Error fetching persons", error });
  }
};
exports.editTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      givingCredit,
      takingCredit,
      description,
      balanceAmount,
      createdAt,
      updatedAt,
    } = req.body;

    console.log("Edit Transaction Request Body:", req.body);
    console.log("Received createdAt:", createdAt, "Type:", typeof createdAt);
    console.log("Received updatedAt:", updatedAt, "Type:", typeof updatedAt);

    const existing = await CreditTransaction.findOne({
      _id: id,
      userId: req.user.id,
    });
    if (!existing) {
      return res
        .status(404)
        .json({ success: false, message: "Transaction not found" });
    }

    const person = await Person.findOne({
      _id: existing.personId,
      userId: req.user.id,
    });
    if (!person) {
      return res
        .status(404)
        .json({ success: false, message: "Person not found" });
    }

    let newGiving, newTaking, newBalanceAmount;

    // Check if any credit values are actually being changed (different from existing values)
    const isChangingCredits =
      (givingCredit !== undefined &&
        Number(givingCredit) !== Number(existing.givingCredit || 0)) ||
      (takingCredit !== undefined &&
        Number(takingCredit) !== Number(existing.takingCredit || 0)) ||
      (balanceAmount !== undefined &&
        Number(balanceAmount) !== Number(existing.balanceAmount || 0));

    console.log("Credit change check:");
    console.log(
      "givingCredit:",
      givingCredit,
      "existing:",
      existing.givingCredit,
      "changed:",
      givingCredit !== undefined &&
        Number(givingCredit) !== Number(existing.givingCredit || 0)
    );
    console.log(
      "takingCredit:",
      takingCredit,
      "existing:",
      existing.takingCredit,
      "changed:",
      takingCredit !== undefined &&
        Number(takingCredit) !== Number(existing.takingCredit || 0)
    );
    console.log(
      "balanceAmount:",
      balanceAmount,
      "existing:",
      existing.balanceAmount,
      "changed:",
      balanceAmount !== undefined &&
        Number(balanceAmount) !== Number(existing.balanceAmount || 0)
    );
    console.log("isChangingCredits:", isChangingCredits);

    if (isChangingCredits) {
      // First, revert the existing transaction's impact on person totals
      person.givingCredit =
        Number(person.givingCredit || 0) - Number(existing.givingCredit || 0);
      person.takingCredit =
        Number(person.takingCredit || 0) - Number(existing.takingCredit || 0);

      // Ensure values don't go negative
      if (person.givingCredit < 0) person.givingCredit = 0;
      if (person.takingCredit < 0) person.takingCredit = 0;

      // Now calculate new values based on what's being updated
      if (balanceAmount !== undefined && balanceAmount !== null) {
        newBalanceAmount = Number(balanceAmount);

        // Determine if this should be payable or receivable based on the balance amount
        // If balanceAmount > 0, we need to determine which credit to set
        if (newBalanceAmount > 0) {
          // Check if we have givingCredit or takingCredit provided to determine direction
          if (givingCredit !== undefined && takingCredit !== undefined) {
            // Both provided - use them directly
            newGiving = Number(givingCredit);
            newTaking = Number(takingCredit);
          } else if (givingCredit !== undefined) {
            // Only givingCredit provided - this is receivable
            newGiving = Number(givingCredit);
            newTaking = 0;
          } else if (takingCredit !== undefined) {
            // Only takingCredit provided - this is payable
            newTaking = Number(takingCredit);
            newGiving = 0;
          } else {
            // Neither provided - maintain current direction or default to receivable
            if (existing.takingCredit > existing.givingCredit) {
              // Was payable - make it payable
              newTaking = newBalanceAmount;
              newGiving = 0;
            } else {
              // Was receivable or settled - make it receivable
              newGiving = newBalanceAmount;
              newTaking = 0;
            }
          }
        } else {
          // Balance is 0 - settled
          newGiving = 0;
          newTaking = 0;
        }
      } else {
        // Use provided values or existing values
        newGiving =
          givingCredit !== undefined
            ? Number(givingCredit)
            : Number(existing.givingCredit || 0);
        newTaking =
          takingCredit !== undefined
            ? Number(takingCredit)
            : Number(existing.takingCredit || 0);
        newBalanceAmount = Math.abs(Number(newTaking) - Number(newGiving));
      }

      // Now add the new transaction values to person totals
      person.givingCredit =
        Number(person.givingCredit || 0) + Number(newGiving);
      person.takingCredit =
        Number(person.takingCredit || 0) + Number(newTaking);

      // Ensure values don't go negative
      if (person.givingCredit < 0) person.givingCredit = 0;
      if (person.takingCredit < 0) person.takingCredit = 0;

      // Recalculate person status
      person.status =
        person.takingCredit > person.givingCredit
          ? "Payable"
          : person.givingCredit > person.takingCredit
          ? "Receivable"
          : "Settled";
      await person.save();
    } else {
      // No credit values being changed, keep existing values
      newGiving = existing.givingCredit;
      newTaking = existing.takingCredit;
      newBalanceAmount = existing.balanceAmount;
    }

    // Prepare update object
    const updateData = {};

    // Update credit fields only if credits are being changed
    if (isChangingCredits) {
      updateData.givingCredit = newGiving;
      updateData.takingCredit = newTaking;
      updateData.balanceAmount = newBalanceAmount;
    }

    // Update description if provided
    if (typeof description === "string") {
      updateData.description = description;
    }

    // Update dates if provided
    if (
      createdAt &&
      createdAt !== null &&
      createdAt !== "" &&
      createdAt !== undefined
    ) {
      try {
        const dateCreated = new Date(createdAt);
        if (!isNaN(dateCreated.getTime())) {
          updateData.createdAt = dateCreated;
          console.log("Will update createdAt to:", dateCreated);
        } else {
          console.log("Invalid createdAt format:", createdAt);
        }
      } catch (error) {
        console.log("Error parsing createdAt:", error);
      }
    } else {
      console.log("createdAt not provided or empty:", createdAt);
    }

    if (
      updatedAt &&
      updatedAt !== null &&
      updatedAt !== "" &&
      updatedAt !== undefined
    ) {
      try {
        const dateUpdated = new Date(updatedAt);
        if (!isNaN(dateUpdated.getTime())) {
          updateData.updatedAt = dateUpdated;
          console.log("Will update updatedAt to:", dateUpdated);
        } else {
          console.log("Invalid updatedAt format:", updatedAt);
        }
      } catch (error) {
        console.log("Error parsing updatedAt:", error);
      }
    } else {
      console.log("updatedAt not provided or empty:", updatedAt);
    }

    console.log("Update data:", updateData);

    // Use direct MongoDB update to bypass Mongoose timestamp handling
    const result = await CreditTransaction.collection.updateOne(
      { _id: existing._id },
      { $set: updateData }
    );

    console.log("MongoDB update result:", result);

    // Fetch the updated transaction
    const updatedTransaction = await CreditTransaction.findById(existing._id);

    console.log("Updated transaction:", updatedTransaction);

    return res.status(200).json({
      message: "Transaction edited successfully",
      transaction: updatedTransaction,
      person,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Error editing transaction", error });
  }
};

// exports.editTransaction = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { givingCredit, takingCredit, description, balanceAmount } = req.body;
//     const transaction = await CreditTransaction.findOne({ _id: id, userId: req.user.id });
//     if (!transaction) return res.status(404).json({ message: "Transaction not found" });

//     transaction.givingCredit = givingCredit;
//     transaction.takingCredit = takingCredit;
//     transaction.description = description;
//     transaction.balanceAmount = balanceAmount;
//     await transaction.save();
//     res.status(200).json({ message: "Transaction edited successfully", transaction });
//   } catch (error) {
//     res.status(500).json({ message: "Error editing transaction", error });
//   }
// };
exports.deletePerson = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const person = await Person.findOneAndDelete({ _id: id, userId });
    if (!person) return res.status(404).json({ message: "Person not found" });

    res.status(200).json({ message: "Person deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting person", error });
  }
};
exports.toggleFavouritePerson = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const person = await Person.findOne({ _id: id, userId });
    if (!person) return res.status(404).json({ message: "Person not found" });

    person.favourite = !person.favourite;
    await person.save();

    res.status(200).json({ message: "Favourite status toggled", person });
  } catch (error) {
    res.status(500).json({ message: "Error toggling favourite status", error });
  }
};

exports.updatePerson = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { name, number, reference } = req.body;

    const person = await Person.findOne({ _id: id, userId });
    if (!person) return res.status(404).json({ message: "Person not found" });

    person.name = name;
    person.number = number;
    person.reference = reference;
    await person.save();

    res.status(200).json({ message: "Person updated successfully", person });
  } catch (error) {
    res.status(500).json({ message: "Error updating person", error });
  }
};

exports.getDetailOfPurchaseSaleByPerson = async (req, res) => {
  try {
    const userId = req.user.id;
    const { personId } = req.params;
    const { number, startDate, endDate } = req.query; // Get number and date range from query params

    let person = null;
    let customerNumber = null;

    // If personId is provided, find person by ID
    if (personId) {
      person = await Person.findOne({ _id: personId, userId });
      if (!person) {
        return res.status(404).json({ message: "Person not found" });
      }
      customerNumber = person.number;
    }
    // If personId is not provided but number is provided, find person by number
    else if (number) {
      person = await Person.findOne({ number, userId });
      if (!person) {
        return res
          .status(404)
          .json({ message: "Person not found with this number" });
      }
      customerNumber = number;
    }
    // If neither personId nor number is provided
    else {
      return res
        .status(400)
        .json({ message: "Either Person ID or number is required" });
    }

    // Build date filter object if date range is provided
    let dateFilter = {};
    if (startDate || endDate) {
      dateFilter = {};
      if (startDate) {
        dateFilter.$gte = new Date(startDate);
      }
      if (endDate) {
        dateFilter.$lte = new Date(endDate);
      }
    }

    // Get all purchase and sale details with populated data and date filtering
    const bulkPurchasesQuery = { personId: person._id, userId };
    if (Object.keys(dateFilter).length > 0) {
      bulkPurchasesQuery.date = dateFilter;
    }
    const bulkPurchasesDetails = await BulkPhonePurchase.find(
      bulkPurchasesQuery
    )
      .populate({
        path: "ramSimDetails",
        populate: {
          path: "imeiNumbers",
          model: "Imei",
        },
      })
      .populate(
        "personId",
        "name number reference givingCredit takingCredit status"
      )
      .populate("bankAccountUsed", "accountName accountType accountCash")
      .populate("pocketCash", "accountCash")
      .sort({ createdAt: -1 });

    const singlePurchaseQuery = { mobileNumber: customerNumber, userId };
    if (Object.keys(dateFilter).length > 0) {
      singlePurchaseQuery.date = dateFilter;
    }
    const singlePurchase = await PurchasePhone.find(singlePurchaseQuery)
      .populate("soldDetails")
      .populate("bankAccountUsed", "accountName accountType accountCash")
      .populate("pocketCash", "accountCash")
      .populate("shopid", "shopName")
      .sort({ createdAt: -1 });

    const bulkSalesQuery = { customerNumber, userId };
    if (Object.keys(dateFilter).length > 0) {
      bulkSalesQuery.dateSold = dateFilter;
    }
    const bulkSales = await SoldPhone.find(bulkSalesQuery)
      .populate({
        path: "bulkPhonePurchaseId",
        populate: [
          {
            path: "ramSimDetails",
            populate: {
              path: "imeiNumbers",
              model: "Imei",
            },
          },
          {
            path: "personId",
            model: "Person",
            select: "name number reference givingCredit takingCredit status",
          },
        ],
      })
      .populate("bankAccountUsed", "accountName accountType accountCash")
      .populate("pocketCash", "accountCash")
      .sort({ createdAt: -1 });

    // For single sales, find them by customerNumber directly
    const singleSalesQuery = { customerNumber, userId };
    if (Object.keys(dateFilter).length > 0) {
      singleSalesQuery.saleDate = dateFilter;
    }
    const singleSales = await SingleSoldPhone.find(singleSalesQuery)
      .populate("purchasePhoneId", "companyName modelName imei1 imei2 price")
      .populate("bankAccountUsed", "accountName accountType accountCash")
      .populate("pocketCash", "accountCash")
      .populate("shopid", "shopName")
      .sort({ createdAt: -1 });

    // Get sold items from purchases that belong to this party
    const soldFromPurchasesQuery = {
      mobileNumber: customerNumber,
      userId,
      status: "Sold",
      soldDetails: { $exists: true },
    };
    if (Object.keys(dateFilter).length > 0) {
      soldFromPurchasesQuery.date = dateFilter;
    }
    const soldFromPurchases = await PurchasePhone.find(soldFromPurchasesQuery)
      .populate("soldDetails")
      .populate("bankAccountUsed", "accountName accountType accountCash")
      .populate("pocketCash", "accountCash")
      .populate("shopid", "shopName")
      .sort({ createdAt: -1 });

    // Calculate totals
    const totalBulkPurchases = bulkPurchasesDetails.length;
    const totalSinglePurchases = singlePurchase.length;
    const totalBulkSales = bulkSales.length;
    const totalSingleSales = singleSales.length + soldFromPurchases.length;

    // Combine all purchase and sale data
    const purchaseDetails = {
      bulkPurchases: bulkPurchasesDetails,
      singlePurchases: singlePurchase,
    };

    const saleDetails = {
      bulkSales: bulkSales,
      singleSales: [...singleSales, ...soldFromPurchases],
    };

    // Collect unique businesses (shops) associated with this person from transactions
    const shopMap = new Map();
    const addShop = (doc) => {
      const shop = doc?.shopid;
      if (shop && (shop._id || shop.id)) {
        const id = shop._id?.toString?.() || shop.id;
        if (!shopMap.has(id)) {
          shopMap.set(id, {
            _id: shop._id || shop.id,
            shopName: shop.shopName || shop.name || "Unknown",
          });
        }
      }
    };
    singlePurchase.forEach(addShop);
    singleSales.forEach(addShop);
    soldFromPurchases.forEach(addShop);

    const businesses = Array.from(shopMap.values());

    res.status(200).json({
      person,
      purchaseDetails,
      saleDetails,
      businesses,
      summary: {
        totalBulkPurchases,
        totalSinglePurchases,
        totalBulkSales,
        totalSingleSales,
      },
      filters: {
        dateRange: {
          startDate: startDate || null,
          endDate: endDate || null,
          applied: Object.keys(dateFilter).length > 0,
        },
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching purchase sale details", error });
  }
};

// exports.getDetailOfPurchaseSaleByPerson = async (req, res) => {
//   try {
//     const userId = req.user.id;
//     const { personId } = req.params;
//     const { number, startDate, endDate } = req.query; // Get number and date range from query params

//     let person = null;
//     let customerNumber = null;

//     // If personId is provided, find person by ID
//     if (personId) {
//       person = await Person.findOne({ _id: personId, userId });
//       if (!person) {
//         return res.status(404).json({ message: "Person not found" });
//       }
//       customerNumber = person.number;
//     }
//     // If personId is not provided but number is provided, find person by number
//     else if (number) {
//       person = await Person.findOne({ number, userId });
//       if (!person) {
//         return res.status(404).json({ message: "Person not found with this number" });
//       }
//       customerNumber = number;
//     }
//     // If neither personId nor number is provided
//     else {
//       return res.status(400).json({ message: "Either Person ID or number is required" });
//     }

//     // Build date filter object if date range is provided
//     let dateFilter = {};
//     if (startDate || endDate) {
//       dateFilter = {};
//       if (startDate) {
//         dateFilter.$gte = new Date(startDate);
//       }
//       if (endDate) {
//         dateFilter.$lte = new Date(endDate);
//       }
//     }

//     // Get all purchase and sale details with populated data and date filtering
//     const bulkPurchasesQuery = { personId: person._id, userId };
//     if (Object.keys(dateFilter).length > 0) {
//       bulkPurchasesQuery.date = dateFilter;
//     }
//     // Keep all bulk purchases for this person; IMEIs include both available and sold
//     const bulkPurchasesDetails = await BulkPhonePurchase.find(bulkPurchasesQuery)
//       .populate({
//         path: "ramSimDetails",
//         populate: {
//           path: "imeiNumbers",
//           model: "Imei"
//         }
//       })
//       .populate("personId", "name number reference givingCredit takingCredit status")
//       .populate("bankAccountUsed", "accountName accountType accountCash")
//       .populate("pocketCash", "accountCash")
//       .sort({ createdAt: -1 });

//     // Include legacy and current flow (status may not exist on legacy docs)
//     const singlePurchaseQuery = {
//       mobileNumber: customerNumber,
//       userId,
//       $or: [
//         { status: "Available" },
//         { status: "Sold" },
//         { status: { $exists: false } }
//       ]
//     };
//     if (Object.keys(dateFilter).length > 0) {
//       singlePurchaseQuery.date = dateFilter;
//     }
//     const singlePurchase = await PurchasePhone.find(singlePurchaseQuery)
//       .populate("soldDetails")
//       .populate("bankAccountUsed", "accountName accountType accountCash")
//       .populate("pocketCash", "accountCash")
//       .populate("shopid", "shopName")
//       .sort({ createdAt: -1 });

//     const bulkSalesQuery = { customerNumber, userId };
//     if (Object.keys(dateFilter).length > 0) {
//       bulkSalesQuery.dateSold = dateFilter;
//     }
//     const bulkSales = await SoldPhone.find(bulkSalesQuery)
//       .populate({
//         path: "bulkPhonePurchaseId",
//         populate: [
//           {
//             path: "ramSimDetails",
//             populate: {
//               path: "imeiNumbers",
//               model: "Imei"
//             }
//           },
//           {
//             path: "personId",
//             model: "Person",
//             select: "name number reference givingCredit takingCredit status"
//           }
//         ]
//       })
//       .populate("bankAccountUsed", "accountName accountType accountCash")
//       .populate("pocketCash", "accountCash")
//       .sort({ createdAt: -1 });

//     // For single sales, find them by customerNumber directly
//     const singleSalesQuery = { customerNumber, userId };
//     if (Object.keys(dateFilter).length > 0) {
//       singleSalesQuery.saleDate = dateFilter;
//     }
//     const singleSales = await SingleSoldPhone.find(singleSalesQuery)
//       .populate("purchasePhoneId", "companyName modelName imei1 imei2 price")
//       .populate("bankAccountUsed", "accountName accountType accountCash")
//       .populate("pocketCash", "accountCash")
//       .populate("shopid", "shopName")
//       .sort({ createdAt: -1 });

//     // Calculate totals
//     const totalBulkPurchases = bulkPurchasesDetails.length;
//     const totalSinglePurchases = singlePurchase.length;
//     const totalBulkSales = bulkSales.length;
//     const totalSingleSales = singleSales.length;

//     // Combine all purchase and sale data
//     const purchaseDetails = {
//       bulkPurchases: bulkPurchasesDetails,
//       singlePurchases: singlePurchase
//     };

//     const saleDetails = {
//       bulkSales: bulkSales,
//       singleSales: singleSales
//     };

//     res.status(200).json({
//       person,
//       purchaseDetails,
//       saleDetails,
//       summary: {
//         totalBulkPurchases,
//         totalSinglePurchases,
//         totalBulkSales,
//         totalSingleSales
//       },
//       filters: {
//         dateRange: {
//           startDate: startDate || null,
//           endDate: endDate || null,
//           applied: Object.keys(dateFilter).length > 0
//         }
//       }
//     });
//   } catch (error) {
//     res.status(500).json({ message: "Error fetching purchase sale details", error });
//   }
// };

exports.getVerificationByPassword = async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || typeof password !== "string") {
      return res.status(400).json({ message: "Password is required" });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await User.findById(userId).select("password active");
    if (!user || user.active === false) {
      // Return boolean as requested by frontend expectations
      return res.status(200).json(false);
    }

    const isMatch = await bcrypt.compare(password, user.password);
    // Return plain boolean to match frontend expectation
    return res.status(200).json(isMatch);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching verification by password", error });
  }
};

// Get detailed credit transaction information
exports.getCreditTransactionDetails = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Credit transaction ID is required",
      });
    }

    // Find the credit transaction with populated person details
    const creditTransaction = await CreditTransaction.findOne({
      _id: id,
      userId: userId,
    }).populate({
      path: "personId",
      select:
        "name number reference favourite status takingCredit givingCredit createdAt updatedAt",
    });

    if (!creditTransaction) {
      return res.status(404).json({
        success: false,
        message: "Credit transaction not found",
      });
    }

    // Build comprehensive transaction details
    const transactionDetails = {
      _id: creditTransaction._id,
      userId: creditTransaction.userId,
      personId: creditTransaction.personId?._id,
      personDetails: creditTransaction.personId
        ? {
            name: creditTransaction.personId.name,
            number: creditTransaction.personId.number,
            reference: creditTransaction.personId.reference,
            favourite: creditTransaction.personId.favourite,
            status: creditTransaction.personId.status,
            takingCredit: creditTransaction.personId.takingCredit,
            givingCredit: creditTransaction.personId.givingCredit,
            createdAt: creditTransaction.personId.createdAt,
            updatedAt: creditTransaction.personId.updatedAt,
          }
        : null,
      transactionType: creditTransaction.takingCredit > 0 ? "taking" : "giving",
      amounts: {
        takingCredit: creditTransaction.takingCredit,
        givingCredit: creditTransaction.givingCredit,
        netAmount:
          creditTransaction.takingCredit - creditTransaction.givingCredit,
      },
      description: creditTransaction.description,
      invoiceInfo: {
        invoiceExist: creditTransaction.invoiceExist,
        invoiceNumber: creditTransaction.invoiceNumber,
        invoiceDetails: creditTransaction.invoiceDetails,
      },
      balanceAmount: creditTransaction.balanceAmount,
      createdAt: creditTransaction.createdAt,
      updatedAt: creditTransaction.updatedAt,
    };

    // Add additional context based on invoice information
    if (creditTransaction.invoiceExist && creditTransaction.invoiceDetails) {
      transactionDetails.invoiceContext = {
        hasInvoiceData: true,
        saleType: creditTransaction.invoiceDetails.saleType,
        totalInvoice: creditTransaction.invoiceDetails.pricing?.totalInvoice,
        customerName: creditTransaction.invoiceDetails.customerName,
        customerNumber: creditTransaction.invoiceDetails.customerNumber,
        saleDate: creditTransaction.invoiceDetails.saleDate,
        paymentType:
          creditTransaction.invoiceDetails.payment?.sellingPaymentType,
        phoneCount:
          creditTransaction.invoiceDetails.phoneDetails?.imei1?.length || 1,
        accessoriesCount:
          creditTransaction.invoiceDetails.accessories?.length || 0,
      };
    } else {
      transactionDetails.invoiceContext = {
        hasInvoiceData: false,
      };
    }

    res.status(200).json({
      success: true,
      message: "Credit transaction details retrieved successfully",
      data: transactionDetails,
    });
  } catch (error) {
    console.error("Error fetching credit transaction details:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Get all credit transactions for a user with filtering options
exports.getAllCreditTransactions = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      personId,
      startDate,
      endDate,
      transactionType, // "taking", "giving", or "all"
      invoiceExist, // true, false, or "all"
      page = 1,
      limit = 50,
    } = req.query;

    // Build filter
    const filter = { userId };

    if (personId) {
      filter.personId = personId;
    }

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    if (transactionType === "taking") {
      filter.takingCredit = { $gt: 0 };
    } else if (transactionType === "giving") {
      filter.givingCredit = { $gt: 0 };
    }

    if (invoiceExist === "true") {
      filter.invoiceExist = true;
    } else if (invoiceExist === "false") {
      filter.invoiceExist = false;
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Fetch transactions with pagination
    const transactions = await CreditTransaction.find(filter)
      .populate({
        path: "personId",
        select: "name number reference status",
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Get total count for pagination
    const total = await CreditTransaction.countDocuments(filter);

    // Format transactions for response
    const formattedTransactions = transactions.map((transaction) => ({
      _id: transaction._id,
      personId: transaction.personId?._id,
      personName: transaction.personId?.name,
      personNumber: transaction.personId?.number,
      personReference: transaction.personId?.reference,
      personStatus: transaction.personId?.status,
      transactionType: transaction.takingCredit > 0 ? "taking" : "giving",
      amounts: {
        takingCredit: transaction.takingCredit,
        givingCredit: transaction.givingCredit,
        netAmount: transaction.takingCredit - transaction.givingCredit,
      },
      description: transaction.description,
      invoiceInfo: {
        invoiceExist: transaction.invoiceExist,
        invoiceNumber: transaction.invoiceNumber,
        hasDetails: !!transaction.invoiceDetails,
      },
      balanceAmount: transaction.balanceAmount,
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt,
    }));

    res.status(200).json({
      success: true,
      message: "Credit transactions retrieved successfully",
      data: {
        transactions: formattedTransactions,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalItems: total,
          itemsPerPage: parseInt(limit),
        },
      },
    });
  } catch (error) {
    console.error("Error fetching credit transactions:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};