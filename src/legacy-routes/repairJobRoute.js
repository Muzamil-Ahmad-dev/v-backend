const express = require("express");
const router = express.Router();
const {
  createRepairJob,
  toggleRepairJobStatus,
  getAllRepairJobs,
  getRepairJobById,
  toggleRepairJobStatusToPrevious,
  updateRepairJob,
  deleteRepairJob,
  returnRepairJob,
} = require("../controllers/repairJobController");
const { decoderMiddleware } = require("../services/authServices");

// Create a new repair job
router.post("/repair-job", decoderMiddleware, createRepairJob);

// Toggle repair job status (todo -> in-progress -> complete -> handover)
router.patch(
  "/repair-job/:id/toggle-status",
  decoderMiddleware,
  toggleRepairJobStatus
);

// Toggle repair job status to previous one (reverse: handover -> complete -> in-progress -> todo)
router.patch(
  "/repair-job/:id/toggle-status-previous",
  decoderMiddleware,
  toggleRepairJobStatusToPrevious
);

// Update/edit repair job
router.put("/repair-job/:id", decoderMiddleware, updateRepairJob);

// Get all repair jobs (optional query: ?status=todo|in-progress|complete|handover)
router.get("/repair-jobs", decoderMiddleware, getAllRepairJobs);

// Get repair job by ID
router.get("/repair-job/:id", decoderMiddleware, getRepairJobById);

// Delete repair job
router.delete("/repair-job/:id", decoderMiddleware, deleteRepairJob);

// Return handover repair job (with note/description/reason)
router.post("/repair-job/:id/return", decoderMiddleware, returnRepairJob);

module.exports = router;
