const { createParty, getAllPartyNames, getAllPartiesRecords, getBulkPurchasesByPartyId, getPartiesNameAndId, getPartyDetailById } = require("../controllers/partyLedgerControllers");
const PartyLedger = require("../schema/PartyLedgerSchema");
const { decoderMiddleware } = require("../services/authServices");
const ModelValidator = require("../validators/ModelValidator");
const express = require('express');
const { deleteTransaction } = require("../controllers/payablesAndReceiveablesController");

const router = express.Router();

router.post(
    "/create",
    // ModelValidator(PartyLedger),
    decoderMiddleware,
    createParty
)
router.get(
    "/getAllNames",
    decoderMiddleware,
    getAllPartyNames
)

router.get(
    "/getAllPartiesRecords",
    decoderMiddleware,
    getAllPartiesRecords
)
router.get(
    "/bulkPurchase/:id",
    getBulkPurchasesByPartyId
)
router.get(
    "/partyNameAndId",
    decoderMiddleware,
    getPartiesNameAndId
)
router.get(
    "/partyDetail/:id",
    decoderMiddleware,
    getPartyDetailById
)



module.exports = router;