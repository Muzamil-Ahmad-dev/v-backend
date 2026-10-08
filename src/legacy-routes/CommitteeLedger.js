const express = require("express");
const router = express.Router();
const controllers = require("../controllers/committeeLedgerController");
const { decoderMiddleware } = require("../services/authServices");

router.post("/createCommittee",decoderMiddleware,controllers.createCommittee)
router.get("/getComitteesRecords",decoderMiddleware,controllers.getUserCommitteeRecord)
router.patch("/updateComittee/:committeeId/:committeeRecordId",controllers.updateCommitteeStatus)



module.exports = router;
