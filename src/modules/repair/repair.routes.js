const express = require('express');
const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const {
  createRepairJob,
  listRepairJobs,
  getRepairJobById,
  updateRepairJob,
  deleteRepairJob,
  advanceStatus,
  revertStatus,
  returnRepairJob,
} = require('./repair.service');

const router = express.Router();

// GET /repairs[?status=]
router.get('/', asyncHandler(async (req, res) => {
  const jobs = await listRepairJobs(req);
  res.status(200).json(new ApiResponse(200, jobs, 'Repair jobs fetched.'));
}));

// GET /repairs/:id
router.get('/:id', asyncHandler(async (req, res) => {
  const job = await getRepairJobById(req);
  res.status(200).json(new ApiResponse(200, job, 'Repair job fetched.'));
}));

// POST /repairs — deducts accessory stock for parts used, and for credit
// jobs posts the outstanding amount to the customer's PartyLedger.
router.post('/', asyncHandler(async (req, res) => {
  const job = await createRepairJob(req);
  res.status(201).json(new ApiResponse(201, job, 'Repair job created successfully.'));
}));

// PUT /repairs/:id — reconciles accessory stock and customer credit against
// whatever actually changed (not a raw overwrite).
router.put('/:id', asyncHandler(async (req, res) => {
  const job = await updateRepairJob(req);
  res.status(200).json(new ApiResponse(200, job, 'Repair job updated successfully.'));
}));

// DELETE /repairs/:id
router.delete('/:id', asyncHandler(async (req, res) => {
  await deleteRepairJob(req);
  res.status(200).json(new ApiResponse(200, {}, 'Repair job deleted successfully.'));
}));

// PATCH /repairs/:id/advance — todo -> in-progress -> complete -> handover
router.patch('/:id/advance', asyncHandler(async (req, res) => {
  const job = await advanceStatus(req);
  res.status(200).json(new ApiResponse(200, job, `Repair job status updated to ${job.status}.`));
}));

// PATCH /repairs/:id/revert — handover -> complete -> in-progress -> todo
router.patch('/:id/revert', asyncHandler(async (req, res) => {
  const job = await revertStatus(req);
  res.status(200).json(new ApiResponse(200, job, `Repair job status reverted to ${job.status}.`));
}));

// PATCH /repairs/:id/return — body: { note } — brings a handed-over job back to "complete"
router.patch('/:id/return', asyncHandler(async (req, res) => {
  const job = await returnRepairJob(req);
  res.status(200).json(new ApiResponse(200, job, 'Repair job returned successfully.'));
}));

module.exports = router;
