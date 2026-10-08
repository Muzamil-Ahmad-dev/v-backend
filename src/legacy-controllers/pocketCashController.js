const {
  PocketCashSchema,
  PocketCashTransactionSchema,
} = require("../schema/PocketCashSchema");
const mongoose = require("mongoose");

// Utility to get or create PocketCash for user
const getOrCreatePocketCash = async (userId) => {
  let pocketCash = await PocketCashSchema.findOne({ userId });
  if (!pocketCash) {
    pocketCash = await PocketCashSchema.create({ userId, accountCash: 0 });
  }
  return pocketCash;
};

// Add Cash
exports.addCash = async (req, res) => {
  try {
    const { amount, sourceOfAmountAddition, personOfCashAddition } = req.body;
    const userId = req.user.id;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Amount must be greater than 0" });
    }

    const pocketCash = await getOrCreatePocketCash(userId);
    pocketCash.accountCash += amount;
    await pocketCash.save();

    const transaction = await PocketCashTransactionSchema.create({
      userId,
      accountCash: amount,
      pocketCashId: pocketCash._id,
      amountAdded: amount,
      remainingAmount: pocketCash.accountCash,
      sourceOfAmountAddition,
      personOfCashAddition,
    });

    return res.status(201).json({
      message: "Cash added successfully",
      updatedBalance: pocketCash.accountCash,
      transaction,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error", error });
  }
};

// Deduct Cash
exports.deductCash = async (req, res) => {
  try {
    const { amount, reasonOfAmountDeduction } = req.body;
    const userId = req.user.id;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Amount must be greater than 0" });
    }

    const pocketCash = await getOrCreatePocketCash(userId);

    if (pocketCash.accountCash < amount) {
      return res.status(400).json({ message: "Insufficient funds" });
    }

    pocketCash.accountCash -= amount;
    await pocketCash.save();

    const transaction = await PocketCashTransactionSchema.create({
      userId,
      accountCash: -amount,
      pocketCashId: pocketCash._id,
      amountDeducted: amount,
      reasonOfAmountDeduction,
      remainingAmount: pocketCash.accountCash,
    });

    return res.status(201).json({
      message: "Cash deducted successfully",
      updatedBalance: pocketCash.accountCash,
      transaction,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error", error });
  }
};

// Get Total Pocket Cash
exports.getTotalPocketCash = async (req, res) => {
  try {
    const userId = req.user.id;

    const pocketCash = await PocketCashSchema.findOne({ userId });

    const total = pocketCash?.accountCash || 0;
    const id = pocketCash?._id || null;
    return res.status(200).json({ total, id });
  } catch (error) {
    console.error("Error fetching total pocket cash:", error);
    return res.status(500).json({ message: "Server error", error });
  }
};

exports.getPocketCashTransactions = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({ message: "Authenticate please" });
    }
    if (!id) {
      return res.status(400).json({ message: "Pocket Cash ID is required" });
    }

    // Fetch transactions from PocketCashTransactionSchema, not PocketCashSchema
    const transactions = await PocketCashTransactionSchema.find({
      userId,
      pocketCashId: id,
    }).sort({ createdAt: -1 });

    return res.status(200).json(transactions);
  } catch (error) {
    console.error("Error fetching pocket cash transactions:", error);
    return res.status(500).json({ message: "Server error", error });
  }
};

exports.deletePocketCashTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    if (!userId) {
      return res.status(401).json({ message: "Authenticate please" });
    }
    const pocketCash = await PocketCashSchema.findOne({ userId });
    const transaction = await PocketCashTransactionSchema.findOne({ _id: id, userId });
    if (!transaction) return res.status(404).json({ success: false, message: "Transaction not found or not authorized" });
    if ((transaction?.reasonOfAmountDeduction || "").toLowerCase().includes("purchase") || (transaction?.sourceOfAmountAddition || "").toLowerCase().includes("purchase") ) {
      console.log("Adding cash to pocket cash", transaction.amountDeducted || transaction.amountAdded);
      pocketCash.accountCash += transaction.amountDeducted || transaction.amountAdded;
      await pocketCash.save();
    }
    else {
      console.log("Deducting cash from pocket cash", transaction.amountDeducted || transaction.amountAdded);
      pocketCash.accountCash -= transaction.amountDeducted || transaction.amountAdded;
      await pocketCash.save();
    }
    
    await PocketCashTransactionSchema.deleteOne({ _id: id, userId });
    res.status(200).json({ success: true, message: "Transaction deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};