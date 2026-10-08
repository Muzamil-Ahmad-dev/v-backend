const { default: mongoose } = require("mongoose");
const PartyLedger = require("../schema/PartyLedgerSchema");
const { BulkPhonePurchase } = require("../schema/purchasePhoneSchema");
const { Accessory } = require("../schema/accessorySchema");

exports.createParty = async (req, res) => {
    const { partyName } = req.body;

    try {
        const existingParty = await PartyLedger.findOne({ partyName }).exec();
        if (existingParty) {
            return res.status(400).json({
                success: false,
                message: "Party name already exists. Please choose a different name.",
            });
        }

        const party = new PartyLedger({
            userId: req.user.id,
            partyName,
        });

        await party.save();

        res.status(201).json({
            success: true,
            message: "Record created successfully",
            data: party,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message || "Party not created successfully",
        });
    }
};


exports.getAllPartyNames = async (req, res) => {
    try {
        // Ensure the user is authenticated
        if (!req.user || !req.user.id) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized: User ID is required",
            });
        }

        // Fetch only party names for the logged-in user
        const parties = await PartyLedger.find({ userId: req.user.id })
            .select("partyName -_id")
            .exec();

        if (parties.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No parties found for this user",
            });
        }

        // Extract party names into an array
        const partyNames = parties.map(party => party.partyName);

        res.status(200).json({
            success: true,
            message: "Party names retrieved successfully",
            data: partyNames,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message || "Failed to retrieve party names",
        });
    }
};



exports.getAllPartiesRecords = async (req, res) => {
    try {
        const userId = req.user.id; // Get user ID from request

        const partyLedger = await PartyLedger.find({ userId }).select("_id");

        if (!partyLedger) {
            return res.status(400).json({
                success: false,
                message: "No parties found"
            })
        }

        const partyLedgerIds = partyLedger.map(party => party._id)

        const bulkPurchases = await BulkPhonePurchase.find({ partyLedgerId: { $in: partyLedgerIds } })
            .populate("partyLedgerId", "partyName") // Get Party Name
            .populate("ramSimDetails"); // Get RAM/SIM details

        const formattedBulkPurchases = bulkPurchases.map((item) => {
            return {
                buyingPrice: item.prices.buyingPrice,
                dealerPrice: item.prices.dealerPrice,
                _id: item._id,
                userId: item.userId,
                partyName: item.partyName,
                totalPurchasedMobiles: item.ramSimDetails.reduce((total, item) => total + item.imeiNumbers.length, 0),
                createdDate: item.createdAt,
                companyName: item.companyName,
                modelName: item.modelName,
                partyName: item.partyName,
                purchasePaymentStatus: item.purchasePaymentStatus,
                purchasePaymentType: item.purchasePaymentType,
                ...(item.purchasePaymentType === "credit" && {
                    payableAmountNow: item.creditPaymentData?.payableAmountNow || null,
                    payableAmountLater: item.creditPaymentData?.payableAmountLater || null,
                    dateOfPayment: item.creditPaymentData?.dateOfPayment || null,
                    totalPaidAmount: item.creditPaymentData?.totalPaidAmount || null,
                }),
            }
        })
        return res.status(200).json({
            success: true,
            message: "parties found successfully",
            data: formattedBulkPurchases
        })
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message || "Failed to retrieve purchases",
        });
    }
};

exports.getBulkPurchasesByPartyId = async (req, res) => {
    try {
        const { id } = req.params; // ✅ Correctly extract ID

        const bulkPurchase = await BulkPhonePurchase.findById(id)
            .populate("partyLedgerId", "partyName") // ✅ Get party name
            .populate("ramSimDetails"); // ✅ Get RAM/SIM details

        if (!bulkPurchase) {
            return res.status(404).json({ success: false, message: "Bulk purchase not found" }); // ✅ Proper response
        }

        res.status(200).json({ success: true, data: bulkPurchase }); // ✅ Send response properly
    } catch (error) {
        console.error("Error fetching bulk purchase:", error);
        res.status(500).json({ success: false, message: "Failed to fetch bulk purchase details" }); // ✅ Handle error correctly
    }
};

exports.getPartiesNameAndId = async (req, res) => {
    try {
        const userId = req.user.id; // Get user ID from request

        const partyLedger = await PartyLedger.find({ userId }).select("partyName _id");

        if (!partyLedger || partyLedger.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No parties found for this user"
            });
        }

        res.status(200).json({
            success: true,
            message: "Parties found successfully",
            data: partyLedger
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message || "Failed to retrieve parties",
        });
    }
}
exports.getPartyDetailById = async (req, res) => {
    try {
        const { id } = req.params; // PartyLedger ID
        const userId = req.user.id; // Get user ID from request

        // Ensure the user is authenticated
        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized: User ID is required",
            });
        }
        // Find the party details
        const partyDetail = await PartyLedger.findById(id)
            .select("partyName userId createdAt updatedAt")
            .exec();

        if (!partyDetail) {
            return res.status(404).json({
                success: false,
                message: "Party not found"
            });
        }

        // Find all bulk purchases for this party
        const bulkPurchases = await BulkPhonePurchase.find({ partyLedgerId: id })
            .populate("ramSimDetails");

        // --- Accessory imports ---

        // Find all accessories for this party
        const accessories = await Accessory.find({ partyLedgerId: id });

        // Aggregate stats
        let totalBuyingPrice = 0;
        let totalDealerPrice = 0;
        let totalPurchasedMobiles = 0;
        let totalPaidAmount = 0;
        let totalPayableAmountNow = 0;
        let totalPayableAmountLater = 0;

        bulkPurchases.forEach(item => {
            totalBuyingPrice += Number(item.prices?.buyingPrice) || 0;
            totalDealerPrice += Number(item.prices?.dealerPrice) || 0;
            totalPurchasedMobiles += item.ramSimDetails.reduce((sum, r) => sum + (r.imeiNumbers?.length || 0), 0);

            if (item.purchasePaymentType === "credit" && item.creditPaymentData) {
                totalPayableAmountNow += Number(item.creditPaymentData.payableAmountNow) || 0;
                totalPayableAmountLater += Number(item.creditPaymentData.payableAmountLater) || 0;
                totalPaidAmount += Number(item.creditPaymentData.totalPaidAmount) || 0;
            } else if (item.purchasePaymentType === "cash") {
                totalPaidAmount += Number(item.prices?.buyingPrice) || 0;
            }
        });

        // Aggregate accessory stats
        let totalAccessoryPrice = 0;
        let totalAccessoryPaidAmount = 0;
        let totalAccessoryPayableNow = 0;
        let totalAccessoryPayableLater = 0;
        let totalAccessoryQuantity = 0;

        accessories.forEach(acc => {
            totalAccessoryPrice += Number(acc.totalPrice) || 0;
            totalAccessoryQuantity += Number(acc.quantity) || 0;

            if (acc.purchasePaymentType === "credit" && acc.creditPaymentData) {
                totalAccessoryPayableNow += Number(acc.creditPaymentData.payableAmountNow) || 0;
                totalAccessoryPayableLater += Number(acc.creditPaymentData.payableAmountLater) || 0;
                totalAccessoryPaidAmount += Number(acc.creditPaymentData.totalPaidAmount) || 0;
            } else if (acc.purchasePaymentType === "full-payment") {
                totalAccessoryPaidAmount += Number(acc.totalPrice) || 0;
            }
        });

        res.status(200).json({
            success: true,
            message: "Party details and stats retrieved successfully",
            data: {
                party: partyDetail,
                stats: {
                    totalBuyingPrice,
                    totalDealerPrice,
                    totalPurchasedMobiles,
                    totalPaidAmount,
                    totalPayableAmountNow,
                    totalPayableAmountLater,
                    // Accessory stats
                    totalAccessoryPrice,
                    totalAccessoryPaidAmount,
                    totalAccessoryPayableNow,
                    totalAccessoryPayableLater,
                    totalAccessoryQuantity
                },
                accessories // send accessory data as well
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message || "Failed to retrieve party details",
        });
    }
}