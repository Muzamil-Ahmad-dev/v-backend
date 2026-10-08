const mongoose = require("mongoose");
const { ExpenseType, Expense } = require("../schema/ExpenseSchema");
const {
  AddBankAccount,
  BankTransaction,
} = require("../schema/BankAccountSchema");
const {
  PocketCashSchema,
  PocketCashTransactionSchema,
} = require("../schema/PocketCashSchema");

// Create a new expense type
exports.createExpenseType = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Expense type name is required",
      });
    }

    const existing = await ExpenseType.findOne({
      userId,
      name: name.trim(),
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: "Expense type with this name already exists",
      });
    }

    const expenseType = await ExpenseType.create({
      userId,
      name: name.trim(),
      description: description || "",
    });

    return res.status(201).json({
      success: true,
      message: "Expense type created successfully",
      data: expenseType,
    });
  } catch (error) {
    console.error("Error creating expense type:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Get all expense types for the user
exports.getExpenseTypes = async (req, res) => {
  try {
    const userId = req.user.id;

    const types = await ExpenseType.find({ userId }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: types.length,
      data: types,
    });
  } catch (error) {
    console.error("Error fetching expense types:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Create a new expense
exports.createExpense = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const userId = req.user.id;
      const {
        expenseTypeId,
        price,
        note,
        date,
        bankAccountUsed,
        pocketCash,
        accountCash,
      } = req.body;

      if (!expenseTypeId) {
        throw new Error("Expense type is required");
      }
      if (price === undefined || price === null || Number(price) < 0) {
        throw new Error("Price is required and must be 0 or greater");
      }

      const type = await ExpenseType.findOne({
        _id: expenseTypeId,
        userId,
      });

      if (!type) {
        throw new Error("Expense type not found");
      }

      // Validate payment amounts if payment methods are provided
      const normalizedPrice = Number(price);
      const normalizedAccountCash = Number(accountCash || 0);
      const normalizedPocketCash = Number(pocketCash || 0);
      const totalPayment = normalizedAccountCash + normalizedPocketCash;

      if (bankAccountUsed || pocketCash) {
        if (totalPayment > normalizedPrice) {
          throw new Error(
            "Total payment amount (accountCash + pocketCash) cannot exceed expense price"
          );
        }
      }

      // Process bank account payment
      if (bankAccountUsed) {
        const bank = await AddBankAccount.findById(bankAccountUsed).session(
          session
        );
        if (!bank) {
          throw new Error("Bank not found");
        }

        if (normalizedAccountCash > bank.accountCash) {
          throw new Error("Insufficient bank account balance");
        }

        // Deduct accountCash from bank account
        bank.accountCash -= normalizedAccountCash;
        await bank.save({ session });

        // Log the transaction
        await BankTransaction.create(
          [
            {
              bankId: bank._id,
              userId: userId,
              reasonOfAmountDeduction: `Expense: ${type.name}${note ? ` - ${note}` : ""}`,
              accountCash: normalizedAccountCash,
              accountType: bank.accountType,
            },
          ],
          { session }
        );
      }

      // Process pocket cash payment
      if (pocketCash) {
        const pocketTransaction = await PocketCashSchema.findOne({
          userId: userId,
        }).session(session);

        if (!pocketTransaction) {
          throw new Error("Pocket cash account not found");
        }

        if (normalizedPocketCash > pocketTransaction.accountCash) {
          throw new Error("Insufficient pocket cash");
        }

        pocketTransaction.accountCash -= normalizedPocketCash;
        await pocketTransaction.save({ session });

        await PocketCashTransactionSchema.create(
          [
            {
              userId: userId,
              pocketCashId: pocketTransaction._id,
              amountDeducted: normalizedPocketCash,
              accountCash: pocketTransaction.accountCash,
              remainingAmount: pocketTransaction.accountCash,
              reasonOfAmountDeduction: `Expense: ${type.name}${note ? ` - ${note}` : ""} - Amount: ${normalizedPrice}`,
            },
          ],
          { session }
        );
      }

      const expense = await Expense.create(
        [
          {
            userId,
            expenseType: expenseTypeId,
            price: normalizedPrice,
            note: note || "",
            date: date ? new Date(date) : new Date(),
          },
        ],
        { session }
      );

      const populated = await Expense.findById(expense[0]._id)
        .populate("expenseType", "name description")
        .session(session);

      return res.status(201).json({
        success: true,
        message: "Expense created successfully",
        data: populated,
      });
    });
  } catch (error) {
    console.error("Error creating expense:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  } finally {
    await session.endSession();
  }
};

// Get all expenses for the user (optionally filter by type or date range)
exports.getUserExpenses = async (req, res) => {
  try {
    const userId = req.user.id;
    const { expenseTypeId, startDate, endDate } = req.query;

    const query = { userId };

    if (expenseTypeId) {
      query.expenseType = expenseTypeId;
    }

    if (startDate || endDate) {
      query.date = {};
      if (startDate) {
        query.date.$gte = new Date(startDate);
      }
      if (endDate) {
        query.date.$lte = new Date(endDate);
      }
    }

    const expenses = await Expense.find(query)
      .populate("expenseType", "name description")
      .sort({ date: -1, createdAt: -1 });

    const totalAmount = expenses.reduce(
      (sum, e) => sum + Number(e.price || 0),
      0
    );

    return res.status(200).json({
      success: true,
      count: expenses.length,
      totalAmount,
      data: expenses,
    });
  } catch (error) {
    console.error("Error fetching user expenses:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};
