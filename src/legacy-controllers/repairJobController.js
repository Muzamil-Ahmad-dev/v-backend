const RepairJob = require("../schema/repairJobSchema");
const { Company, Model } = require("../schema/CompanySchema");
const {
  Person,
  CreditTransaction,
} = require("../schema/PayablesAndReceiveablesSchema");
const {
  Accessory,
  AccessoryTransaction,
} = require("../schema/accessorySchema");
const mongoose = require("mongoose");

// Create a new repair job (no MongoDB transactions so it works on standalone / non-replica set)
exports.createRepairJob = async (req, res) => {
  try {
    const userId = req.user.id;

      const {
        customerName,
        customerNumber,
        customerType,
        company,
        model,
        receivedDate,
        deliveryDate,
        faultIssue,
        isPhoneReceived,
        isDeadApproval,
        parts,
        estimatedAmount,
        paymentType,
        advance,
      } = req.body;

      // Validate required fields
      if (!customerName || !customerNumber || !customerType) {
        throw new Error("Customer information is required");
      }

      if (!company || !model) {
        throw new Error("Company and model are required");
      }

      if (!faultIssue) {
        throw new Error("Fault issue description is required");
      }

      if (!estimatedAmount || estimatedAmount <= 0) {
        throw new Error(
          "Estimated amount is required and must be greater than 0"
        );
      }

      if (!paymentType || !["full", "credit"].includes(paymentType)) {
        throw new Error("Payment type must be either 'full' or 'credit'");
      }

      // Validate credit payment
      // if (paymentType === "credit") {
      //   if (!advance || advance < 0) {
      //     throw new Error("Advance amount is required for credit payments");
      //   }
      //   if (advance >= estimatedAmount) {
      //     throw new Error("Advance amount must be less than estimated amount");
      //   }
      // }

      // Validate dates
      const received = receivedDate ? new Date(receivedDate) : new Date();
      const delivery = deliveryDate ? new Date(deliveryDate) : null;

      if (!delivery) {
        throw new Error("Delivery date is required");
      }

      // Validate company exists
      const companyDoc = await Company.findOne({
        _id: company,
        userId: userId,
      });

      if (!companyDoc) {
        throw new Error("Company not found");
      }

      // Validate model exists and belongs to the company
      const modelDoc = await Model.findOne({
        _id: model,
        companyId: company,
        userId: userId,
      });

      if (!modelDoc) {
        throw new Error(
          "Model not found or does not belong to the specified company"
        );
      }

      // Calculate payLate for credit payments
      const payLate = paymentType === "credit" ? estimatedAmount - advance : 0;

      // Create repair job
      const repairJob = new RepairJob({
        userId,
        customerName,
        customerNumber,
        customerType,
        company,
        model,
        receivedDate: received,
        deliveryDate: delivery,
        faultIssue,
        isPhoneReceived: isPhoneReceived || false,
        isDeadApproval: isDeadApproval || false,
        parts: parts || [],
        estimatedAmount,
        paymentType,
        ...(paymentType === "credit" && {
          advance,
          payLate,
        }),
        status: "todo",
      });

      await repairJob.save();

      // Process parts: deduct once per unique accessory id to avoid double deduction when one part is added
      if (Array.isArray(parts) && parts.length > 0) {
        const processedIds = new Set();
        for (const part of parts) {
          if (!part.id) continue;
          if (processedIds.has(part.id)) continue;
          processedIds.add(part.id);

          const accessory = await Accessory.findOne({
            _id: part.id,
            userId: userId,
          });

          if (!accessory) {
            throw new Error(`Accessory not found for part: ${part.name || part.id}`);
          }

          if (accessory.stock < 1) {
            throw new Error(
              `Insufficient stock for accessory: ${accessory.accessoryName}. Available: ${accessory.stock}`
            );
          }

          accessory.stock -= 1;
          accessory.totalPrice -= Number(accessory.perPiecePrice);
          accessory.profit +=
            (Number(part.price) - Number(accessory.perPiecePrice)) * 1;

          await accessory.save();

          await AccessoryTransaction.create([
            {
              userId: userId,
              accessoryId: accessory._id,
              quantity: 1,
              perPiecePrice: Number(part.price),
              totalPrice: Number(part.price),
              type: "sale",
              profit: Number(part.price) - Number(accessory.perPiecePrice),
            },
          ]);
        }
      }

      // Handle credit payment - create or update Person and CreditTransaction
      if (paymentType === "credit") {
        // Find or create the person (customer) by name and number
        let person = await Person.findOne({
          name: customerName,
          number: customerNumber,
          userId: userId,
        });

        if (!person) {
          person = await Person.create([
            {
              userId: userId,
              name: customerName,
              number: Number(customerNumber),
              reference: `Repair Job: ${companyDoc.name} ${modelDoc.name}`,
              givingCredit: payLate,
              status: "Receivable",
            },
          ]);
          person = person[0];

          await CreditTransaction.create([
            {
              userId: userId,
              personId: person._id,
              givingCredit: payLate,
              balanceAmount: payLate,
              description: `Repair Job Credit: ${companyDoc.name} ${modelDoc.name} - Customer: ${customerName} | Estimated: ${estimatedAmount} | Advance: ${advance} | Credit: ${payLate}`,
            },
          ]);
        } else {
          const currentGivingCredit = Number(person.givingCredit || 0);
          const currentTakingCredit = Number(person.takingCredit || 0);

          person.givingCredit = currentGivingCredit + payLate;
          person.status = "Receivable";
          await person.save();

          const updatedGivingCredit = Number(person.givingCredit || 0);
          const updatedTakingCredit = Number(person.takingCredit || 0);
          const balanceAmount = Math.abs(
            updatedGivingCredit - updatedTakingCredit
          );

          await CreditTransaction.create([
            {
              userId: userId,
              personId: person._id,
              givingCredit: payLate,
              balanceAmount: balanceAmount,
              description: `Repair Job Credit: ${companyDoc.name} ${modelDoc.name} - Customer: ${customerName} | Estimated: ${estimatedAmount} | Advance: ${advance} | Credit: ${payLate}`,
            },
          ]);
        }
      }

    await repairJob.populate("company", "name");
    await repairJob.populate("model", "name");

    return res.status(201).json({
      success: true,
      message: "Repair job created successfully",
      data: repairJob,
    });
  } catch (error) {
    console.error("Error creating repair job:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Toggle repair job status
exports.toggleRepairJobStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Repair job ID is required",
      });
    }

    // Find the repair job
    const repairJob = await RepairJob.findOne({
      _id: id,
      userId: userId,
    });

    if (!repairJob) {
      return res.status(404).json({
        success: false,
        message: "Repair job not found",
      });
    }

    // Toggle status: todo -> in-progress -> complete -> handover
    const statusFlow = {
      todo: "in-progress",
      "in-progress": "complete",
      complete: "handover",
      handover: "handover", // Stay at handover if already there
    };

    const newStatus = statusFlow[repairJob.status] || repairJob.status;
    repairJob.status = newStatus;
    await repairJob.save();

    // Populate company and model for response
    await repairJob.populate("company", "name");
    await repairJob.populate("model", "name");

    return res.status(200).json({
      success: true,
      message: `Repair job status updated to ${newStatus}`,
      data: repairJob,
    });
  } catch (error) {
    console.error("Error toggling repair job status:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Get all repair jobs for the user
exports.getAllRepairJobs = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status } = req.query;

    const query = { userId };
    if (status) {
      query.status = status;
    }

    const repairJobs = await RepairJob.find(query)
      .populate("company", "name")
      .populate("model", "name")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: repairJobs.length,
      data: repairJobs,
    });
  } catch (error) {
    console.error("Error fetching repair jobs:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Get repair job by ID
exports.getRepairJobById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const repairJob = await RepairJob.findOne({
      _id: id,
      userId: userId,
    })
      .populate("company", "name")
      .populate("model", "name");

    if (!repairJob) {
      return res.status(404).json({
        success: false,
        message: "Repair job not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: repairJob,
    });
  } catch (error) {
    console.error("Error fetching repair job:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Delete repair job
exports.deleteRepairJob = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Repair job ID is required",
      });
    }

    const deletedJob = await RepairJob.findOneAndDelete({
      _id: id,
      userId: userId,
    });

    if (!deletedJob) {
      return res.status(404).json({
        success: false,
        message: "Repair job not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Repair job deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting repair job:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Toggle repair job status to previous one (reverse)
exports.toggleRepairJobStatusToPrevious = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Repair job ID is required",
      });
    }

    // Find the repair job
    const repairJob = await RepairJob.findOne({
      _id: id,
      userId: userId,
    });

    if (!repairJob) {
      return res.status(404).json({
        success: false,
        message: "Repair job not found",
      });
    }

    // Reverse status flow: handover -> complete -> in-progress -> todo
    const reverseStatusFlow = {
      handover: "complete",
      complete: "in-progress",
      "in-progress": "todo",
      todo: "todo", // Stay at todo if already there
    };

    const newStatus = reverseStatusFlow[repairJob.status] || repairJob.status;
    repairJob.status = newStatus;
    await repairJob.save();

    // Populate company and model for response
    await repairJob.populate("company", "name");
    await repairJob.populate("model", "name");

    return res.status(200).json({
      success: true,
      message: `Repair job status reverted to ${newStatus}`,
      data: repairJob,
    });
  } catch (error) {
    console.error("Error reverting repair job status:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Update/edit repair job (no MongoDB transactions so it works on standalone / non-replica set)
exports.updateRepairJob = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

      if (!id) {
        throw new Error("Repair job ID is required");
      }

      // Find the repair job
      const repairJob = await RepairJob.findOne({
        _id: id,
        userId: userId,
      });

      if (!repairJob) {
        throw new Error("Repair job not found");
      }

      const {
        customerName,
        customerNumber,
        customerType,
        company,
        model,
        receivedDate,
        deliveryDate,
        faultIssue,
        isPhoneReceived,
        isDeadApproval,
        parts,
        estimatedAmount,
        paymentType,
        advance,
      } = req.body;

      // Store original values for credit transaction handling
      const originalPaymentType = repairJob.paymentType;
      const originalPayLate = repairJob.payLate || 0;
      const originalCustomerName = repairJob.customerName;
      const originalCustomerNumber = repairJob.customerNumber;
      const originalParts = repairJob.parts || [];

      // Validate dates if provided
      if (receivedDate && deliveryDate) {
        const received = new Date(receivedDate);
        const delivery = new Date(deliveryDate);
      } else if (deliveryDate) {
        const delivery = new Date(deliveryDate);
      } else if (receivedDate) {
        const received = new Date(receivedDate);
      }

      // Validate company if provided
      if (company) {
        const companyDoc = await Company.findOne({
          _id: company,
          userId: userId,
        });

        if (!companyDoc) {
          throw new Error("Company not found");
        }
      }

      // Validate model if provided
      if (model) {
        const modelCompanyId = company || repairJob.company;
        const modelDoc = await Model.findOne({
          _id: model,
          companyId: modelCompanyId,
          userId: userId,
        });

        if (!modelDoc) {
          throw new Error(
            "Model not found or does not belong to the specified company"
          );
        }
      }

      // Validate payment type if provided
      if (paymentType && !["full", "credit"].includes(paymentType)) {
        throw new Error("Payment type must be either 'full' or 'credit'");
      }

      // Validate credit payment if paymentType is credit
      const finalPaymentType = paymentType || repairJob.paymentType;
      if (finalPaymentType === "credit") {
        const finalAdvance =
          advance !== undefined ? advance : repairJob.advance;
        const finalEstimatedAmount =
          estimatedAmount !== undefined
            ? estimatedAmount
            : repairJob.estimatedAmount;

        if (finalAdvance === undefined || finalAdvance < 0) {
          throw new Error("Advance amount is required for credit payments");
        }
        if (finalAdvance >= finalEstimatedAmount) {
          throw new Error("Advance amount must be less than estimated amount");
        }
      }

      // Update fields
      if (customerName !== undefined) repairJob.customerName = customerName;
      if (customerNumber !== undefined)
        repairJob.customerNumber = customerNumber;
      if (customerType !== undefined) repairJob.customerType = customerType;
      if (company !== undefined) repairJob.company = company;
      if (model !== undefined) repairJob.model = model;
      if (receivedDate !== undefined)
        repairJob.receivedDate = new Date(receivedDate);
      if (deliveryDate !== undefined)
        repairJob.deliveryDate = new Date(deliveryDate);
      if (faultIssue !== undefined) repairJob.faultIssue = faultIssue;
      if (isPhoneReceived !== undefined)
        repairJob.isPhoneReceived = isPhoneReceived;
      if (isDeadApproval !== undefined)
        repairJob.isDeadApproval = isDeadApproval;
      if (parts !== undefined) repairJob.parts = parts;
      if (estimatedAmount !== undefined)
        repairJob.estimatedAmount = estimatedAmount;
      if (paymentType !== undefined) repairJob.paymentType = paymentType;
      if (advance !== undefined) repairJob.advance = advance;

      // Calculate payLate if paymentType is credit
      if (repairJob.paymentType === "credit") {
        repairJob.payLate = repairJob.estimatedAmount - repairJob.advance;
      } else {
        repairJob.advance = undefined;
        repairJob.payLate = undefined;
      }

      // Recalculate profit = estimatedAmount - total parts price
      if (Array.isArray(repairJob.parts) && repairJob.parts.length > 0) {
        const totalPartsPrice = repairJob.parts.reduce(
          (sum, part) => sum + Number(part.price || 0),
          0
        );
        repairJob.profit = Math.max(
          0,
          Number(repairJob.estimatedAmount || 0) - totalPartsPrice
        );
      } else {
        repairJob.profit = Number(repairJob.estimatedAmount || 0);
      }

      // Handle parts changes - restore stock for removed parts, deduct for new parts
      if (parts !== undefined) {
        const newParts = Array.isArray(parts) ? parts : [];
        const oldPartsMap = new Map(
          originalParts.map((part) => [part.id, part])
        );
        const newPartsMap = new Map(
          newParts.map((part) => [part.id, part])
        );

        // Restore stock for removed parts (in old but not in new)
        for (const oldPart of originalParts) {
          if (!newPartsMap.has(oldPart.id)) {
            const accessory = await Accessory.findOne({
              _id: oldPart.id,
              userId: userId,
            });

            if (accessory) {
              // Restore stock
              accessory.stock += 1;
              accessory.totalPrice += Number(accessory.perPiecePrice);
              // Adjust profit (subtract the profit that was made from this sale)
              const profitFromSale = Number(oldPart.price) - Number(accessory.perPiecePrice);
              accessory.profit = Math.max(0, accessory.profit - profitFromSale);

              await accessory.save();

              // Note: We don't create a return transaction since the schema only supports "purchase" and "sale"
              // The stock restoration is sufficient to track the return
            }
          }
        }

        // Deduct stock for new parts (in new but not in old); skip parts with no id; process each unique id once only
        const newProcessedIds = new Set();
        for (const newPart of newParts) {
          if (!newPart.id) continue;
          if (newProcessedIds.has(newPart.id)) continue;
          if (!oldPartsMap.has(newPart.id)) {
            newProcessedIds.add(newPart.id);

            const accessory = await Accessory.findOne({
              _id: newPart.id,
              userId: userId,
            });

            if (!accessory) {
              throw new Error(`Accessory not found for part: ${newPart.name || newPart.id}`);
            }

            // Check if stock is available
            if (accessory.stock < 1) {
              throw new Error(
                `Insufficient stock for accessory: ${accessory.accessoryName}. Available: ${accessory.stock}`
              );
            }

            // Deduct stock
            accessory.stock -= 1;
            accessory.totalPrice -= Number(accessory.perPiecePrice);
            accessory.profit +=
              (Number(newPart.price) - Number(accessory.perPiecePrice)) * 1;

            await accessory.save();

            // Create accessory sale transaction
            await AccessoryTransaction.create(
              [
                {
                  userId: userId,
                  accessoryId: accessory._id,
                  quantity: 1,
                  perPiecePrice: Number(newPart.price),
                  totalPrice: Number(newPart.price),
                  type: "sale",
                  profit: Number(newPart.price) - Number(accessory.perPiecePrice),
                },
              ]
            );
          }
        }
      }

      await repairJob.save();

      // Handle credit transaction updates if payment type changed or credit amounts changed
      const finalCustomerName = customerName || originalCustomerName;
      const finalCustomerNumber = customerNumber || originalCustomerNumber;
      const newPayLate =
        repairJob.paymentType === "credit" ? repairJob.payLate : 0;
      const payLateDifference = newPayLate - originalPayLate;

      // If payment type changed from credit to full, reverse the credit
      if (
        originalPaymentType === "credit" &&
        repairJob.paymentType === "full"
      ) {
        const person = await Person.findOne({
          name: originalCustomerName,
          number: originalCustomerNumber,
          userId: userId,
        });

        if (person) {
          const currentGivingCredit = Number(person.givingCredit || 0);
          person.givingCredit = Math.max(
            0,
            currentGivingCredit - originalPayLate
          );

          // Update status if credit becomes zero
          if (person.givingCredit === 0 && person.takingCredit === 0) {
            person.status = undefined;
          }

          await person.save();

          // Log the reversal transaction
          const updatedGivingCredit = Number(person.givingCredit || 0);
          const updatedTakingCredit = Number(person.takingCredit || 0);
          const balanceAmount = Math.abs(
            updatedGivingCredit - updatedTakingCredit
          );

          await CreditTransaction.create([
            {
              userId: userId,
              personId: person._id,
              takingCredit: originalPayLate, // Reversing the credit
              balanceAmount: balanceAmount,
              description: `Repair Job Credit Reversal: ${repairJob._id} - Payment type changed from credit to full`,
            },
          ]);
        }
      }
      // If payment type changed from full to credit, add credit
      else if (
        originalPaymentType === "full" &&
        repairJob.paymentType === "credit"
      ) {
        const companyDoc = await Company.findById(repairJob.company);
        const modelDoc = await Model.findById(repairJob.model);

        let person = await Person.findOne({
          name: finalCustomerName,
          number: finalCustomerNumber,
          userId: userId,
        });

        if (!person) {
          person = await Person.create([
            {
              userId: userId,
              name: finalCustomerName,
              number: Number(finalCustomerNumber),
              reference: `Repair Job: ${companyDoc?.name || ""} ${
                modelDoc?.name || ""
              }`,
              givingCredit: newPayLate,
              status: "Receivable",
            },
          ]);
          person = person[0];

          await CreditTransaction.create([
            {
              userId: userId,
              personId: person._id,
              givingCredit: newPayLate,
              balanceAmount: newPayLate,
              description: `Repair Job Credit: ${companyDoc?.name || ""} ${
                modelDoc?.name || ""
              } - Customer: ${finalCustomerName} | Estimated: ${
                repairJob.estimatedAmount
              } | Advance: ${repairJob.advance} | Credit: ${newPayLate}`,
            },
          ]);
        } else {
          const currentGivingCredit = Number(person.givingCredit || 0);
          person.givingCredit = currentGivingCredit + newPayLate;
          person.status = "Receivable";
          await person.save();

          const updatedGivingCredit = Number(person.givingCredit || 0);
          const updatedTakingCredit = Number(person.takingCredit || 0);
          const balanceAmount = Math.abs(
            updatedGivingCredit - updatedTakingCredit
          );

          await CreditTransaction.create([
            {
              userId: userId,
              personId: person._id,
              givingCredit: newPayLate,
              balanceAmount: balanceAmount,
              description: `Repair Job Credit: ${companyDoc?.name || ""} ${
                modelDoc?.name || ""
              } - Customer: ${finalCustomerName} | Estimated: ${
                repairJob.estimatedAmount
              } | Advance: ${repairJob.advance} | Credit: ${newPayLate}`,
            },
          ]);
        }
      }
      // If payment type is still credit but amounts changed
      else if (repairJob.paymentType === "credit" && payLateDifference !== 0) {
        const person = await Person.findOne({
          name: finalCustomerName,
          number: finalCustomerNumber,
          userId: userId,
        });

        if (person) {
          const currentGivingCredit = Number(person.givingCredit || 0);
          person.givingCredit = currentGivingCredit + payLateDifference;
          person.status = "Receivable";
          await person.save();

          const updatedGivingCredit = Number(person.givingCredit || 0);
          const updatedTakingCredit = Number(person.takingCredit || 0);
          const balanceAmount = Math.abs(
            updatedGivingCredit - updatedTakingCredit
          );

          const companyDoc = await Company.findById(repairJob.company);
          const modelDoc = await Model.findById(repairJob.model);

          await CreditTransaction.create([
            {
              userId: userId,
              personId: person._id,
              givingCredit: payLateDifference > 0 ? payLateDifference : 0,
              takingCredit:
                payLateDifference < 0 ? Math.abs(payLateDifference) : 0,
              balanceAmount: balanceAmount,
              description: `Repair Job Credit Update: ${
                companyDoc?.name || ""
              } ${
                modelDoc?.name || ""
              } - Customer: ${finalCustomerName} | Previous Credit: ${originalPayLate} | New Credit: ${newPayLate} | Difference: ${payLateDifference}`,
            },
          ]);
        }
      }

    await repairJob.populate("company", "name");
    await repairJob.populate("model", "name");

    return res.status(200).json({
      success: true,
      message: "Repair job updated successfully",
      data: repairJob,
    });
  } catch (error) {
    console.error("Error updating repair job:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Return handover repair job (with note)
exports.returnRepairJob = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { note } = req.body;

    // Validate required fields
    if (!note) {
      return res.status(400).json({
        success: false,
        message: "Note is required for return",
      });
    }

    // Find the repair job
    const repairJob = await RepairJob.findOne({
      _id: id,
      userId: userId,
    });

    if (!repairJob) {
      return res.status(404).json({
        success: false,
        message: "Repair job not found",
      });
    }

    // Check if job is in handover status
    if (repairJob.status !== "handover") {
      return res.status(400).json({
        success: false,
        message: `Cannot return repair job. Current status is "${repairJob.status}". Only jobs with status "handover" can be returned.`,
      });
    }

    // Update status back to "complete"
    repairJob.status = "complete";

    // Append return note to faultIssue
    repairJob.faultIssue = `${repairJob.faultIssue}\n\n[RETURNED] Return Note: ${note}`;

    await repairJob.save();

    // Populate company and model for response
    await repairJob.populate("company", "name");
    await repairJob.populate("model", "name");

    return res.status(200).json({
      success: true,
      message: "Repair job returned successfully",
      data: {
        ...repairJob.toObject(),
        returnNote: note,
      },
    });
  } catch (error) {
    console.error("Error returning repair job:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};
