 const ApiError = require('../../utils/ApiError');
const RepairJob = require('../../models/RepairJob');
const Accessory = require('../../models/Accessory');
const Company = require('../../models/Company');
const PhoneModel = require('../../models/PhoneModel');
const { tenantAdminId } = require('../purchase/shared/tenantAdminId');
const { resolveBranchId } = require('../../utils/branchContext');
const { applyCustomerCredit, reverseCustomerCredit } = require('../purchase/shared/payment.helper');

// A repair job's `company`/`model` are catalog refs, not free text — this
// confirms both exist for this admin and that the model actually belongs to
// the given company, exactly like the legacy Okiee controller did.
const validateDeviceRefs = async ({ adminId, company, model }) => {
  const companyDoc = await Company.findOne({ _id: company, adminId });
  if (!companyDoc) throw new ApiError(404, 'Company not found.');

  const modelDoc = await PhoneModel.findOne({ _id: model, companyId: company, adminId });
  if (!modelDoc) throw new ApiError(404, 'Model not found or does not belong to the specified company.');

  return { companyDoc, modelDoc };
};

const populateJob = (query) => query.populate('company', 'name').populate('model', 'name');

// Deducts stock for one accessory part (used by a repair job), once per
// unique accessoryId — mirrors Okiee's "processedIds" de-dupe so listing the
// same part twice in one job never double-deducts stock.
const deductPartStock = async ({ adminId, branchId, part }) => {
  const accessory = await Accessory.findOne({ _id: part.id, adminId, branchId });
  if (!accessory) throw new ApiError(404, `Accessory not found for part: ${part.name || part.id}`);
  if (accessory.stock < 1) {
    throw new ApiError(400, `Insufficient stock for "${accessory.accessoryName}". Available: ${accessory.stock}`);
  }
  accessory.stock -= 1;
  accessory.totalPrice = Number(accessory.totalPrice || 0) - Number(accessory.perPiecePrice);
  accessory.profit = Number(accessory.profit || 0) + (Number(part.price) - Number(accessory.perPiecePrice));
  await accessory.save();
};

// Mirror of deductPartStock — restores stock when a part is removed from a
// job (on update) so accessory counts stay accurate.
const restorePartStock = async ({ adminId, branchId, part }) => {
  const accessory = await Accessory.findOne({ _id: part.id, adminId, branchId });
  if (!accessory) return; // part's accessory may have been deleted since; nothing to restore against
  accessory.stock += 1;
  accessory.totalPrice = Number(accessory.totalPrice || 0) + Number(accessory.perPiecePrice);
  const profitFromPart = Number(part.price) - Number(accessory.perPiecePrice);
  accessory.profit = Math.max(0, Number(accessory.profit || 0) - profitFromPart);
  await accessory.save();
};

const validateJobInput = ({ customerName, customerNumber, company, model, faultIssue, estimatedAmount, paymentType }) => {
  if (!customerName || !customerNumber) throw new ApiError(400, 'Customer name and number are required.');
  if (!company || !model) throw new ApiError(400, 'Company and model are required.');
  if (!faultIssue) throw new ApiError(400, 'Fault issue description is required.');
  if (!estimatedAmount || estimatedAmount <= 0) throw new ApiError(400, 'estimatedAmount is required and must be greater than 0.');
  if (paymentType && !['full', 'credit'].includes(paymentType)) throw new ApiError(400, "paymentType must be 'full' or 'credit'.");
};

// Creates a repair job: deducts accessory stock for any parts used, and — for
// credit jobs — posts the outstanding amount (estimatedAmount - advance) to
// the customer's PartyLedger, exactly like a credit sale does.
const createRepairJob = async (req) => {
  const adminId = tenantAdminId(req);
  const branchId = await resolveBranchId(req);
  validateJobInput(req.body);

  const {
    shopId = null,
    customerName,
    customerNumber,
    customerType = 'new',
    company,
    model,
    receivedDate,
    deliveryDate,
    faultIssue,
    isPhoneReceived = false,
    isDeadApproval = false,
    parts = [],
    estimatedAmount,
    paymentType = 'full',
    advance = 0,
  } = req.body;

  const { companyDoc, modelDoc } = await validateDeviceRefs({ adminId, company, model });

  const processedIds = new Set();
  for (const part of parts) {
    if (!part.id || processedIds.has(part.id)) continue;
    processedIds.add(part.id);
    await deductPartStock({ adminId, branchId, part });
  }

  const job = await RepairJob.create({
    adminId,
    branchId,
    shopId,
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
    advance: paymentType === 'credit' ? advance : 0,
  });

  if (paymentType === 'credit') {
    const payLate = Number(estimatedAmount) - Number(advance || 0);
    if (payLate > 0) {
      await applyCustomerCredit({
        adminId,
        shopId,
        partyName: customerName,
        amount: payLate,
        description: `Repair Job ${job._id} — ${companyDoc.name} ${modelDoc.name}: estimated ${estimatedAmount}, advance ${advance}`,
      });
    }
  }

  return populateJob(RepairJob.findById(job._id));
};

const listRepairJobs = async (req) => {
  const adminId = tenantAdminId(req);
  const branchId = await resolveBranchId(req);
  const { status } = req.query;
  const filter = { adminId };
  if (branchId) filter.branchId = branchId;
  if (status) filter.status = status;
  return populateJob(RepairJob.find(filter).sort({ createdAt: -1 }));
};

const getRepairJobById = async (req) => {
  const adminId = tenantAdminId(req);
  const job = await populateJob(RepairJob.findOne({ _id: req.params.id, adminId }));
  if (!job) throw new ApiError(404, 'Repair job not found.');
  return job;
};

// Updates a repair job. If `parts` is provided, reconciles accessory stock
// (restores removed parts, deducts newly added ones). If paymentType/amounts
// change, reconciles the customer's credit ledger by the exact difference —
// never re-posting the full amount again.
const updateRepairJob = async (req) => {
  const adminId = tenantAdminId(req);
  const branchId = await resolveBranchId(req);
  const job = await RepairJob.findOne({ _id: req.params.id, adminId });
  if (!job) throw new ApiError(404, 'Repair job not found.');

  const originalPaymentType = job.paymentType;
  const originalPayLate = originalPaymentType === 'credit' ? Number(job.estimatedAmount || 0) - Number(job.advance || 0) : 0;
  const originalParts = job.parts || [];

  const {
    customerName, customerNumber, customerType, company, model,
    receivedDate, deliveryDate, faultIssue, isPhoneReceived, isDeadApproval,
    parts, estimatedAmount, paymentType, advance,
  } = req.body;

  if (paymentType && !['full', 'credit'].includes(paymentType)) {
    throw new ApiError(400, "paymentType must be 'full' or 'credit'.");
  }

  // Only re-validate company/model when either one is actually being
  // changed — otherwise a job's existing (already-valid) refs are left alone.
  if (company !== undefined || model !== undefined) {
    await validateDeviceRefs({
      adminId,
      company: company !== undefined ? company : job.company,
      model: model !== undefined ? model : job.model,
    });
  }

  // ── Reconcile accessory stock for changed parts ──────────────────────
  if (parts !== undefined) {
    const newParts = Array.isArray(parts) ? parts : [];
    const oldIds = new Set(originalParts.map((p) => p.id));
    const newIds = new Set(newParts.map((p) => p.id));

    for (const oldPart of originalParts) {
      if (oldPart.id && !newIds.has(oldPart.id)) {
        await restorePartStock({ adminId, branchId, part: oldPart });
      }
    }
    const processedIds = new Set();
    for (const newPart of newParts) {
      if (!newPart.id || processedIds.has(newPart.id) || oldIds.has(newPart.id)) continue;
      processedIds.add(newPart.id);
      await deductPartStock({ adminId, branchId, part: newPart });
    }
    job.parts = newParts;
  }

  if (customerName !== undefined) job.customerName = customerName;
  if (customerNumber !== undefined) job.customerNumber = customerNumber;
  if (customerType !== undefined) job.customerType = customerType;
  if (company !== undefined) job.company = company;
  if (model !== undefined) job.model = model;
  if (receivedDate !== undefined) job.receivedDate = receivedDate;
  if (deliveryDate !== undefined) job.deliveryDate = deliveryDate;
  if (faultIssue !== undefined) job.faultIssue = faultIssue;
  if (isPhoneReceived !== undefined) job.isPhoneReceived = isPhoneReceived;
  if (isDeadApproval !== undefined) job.isDeadApproval = isDeadApproval;
  if (estimatedAmount !== undefined) job.estimatedAmount = estimatedAmount;
  if (paymentType !== undefined) job.paymentType = paymentType;
  if (advance !== undefined) job.advance = advance;

  await job.save(); // pre-save hook recalculates profit/payLate

  // ── Reconcile customer credit ledger by the exact difference ─────────
  const newPayLate = job.paymentType === 'credit' ? Number(job.estimatedAmount || 0) - Number(job.advance || 0) : 0;
  const diff = newPayLate - originalPayLate;
  if (diff > 0) {
    await applyCustomerCredit({
      adminId,
      shopId: job.shopId,
      partyName: job.customerName,
      amount: diff,
      description: `Repair Job ${job._id} update — credit increased by ${diff}`,
    });
  } else if (diff < 0) {
    await reverseCustomerCredit({
      adminId,
      partyName: job.customerName,
      amount: Math.abs(diff),
      description: `Repair Job ${job._id} update — credit reduced by ${Math.abs(diff)}`,
    });
  }

  return populateJob(RepairJob.findById(job._id));
};

const deleteRepairJob = async (req) => {
  const adminId = tenantAdminId(req);
  const job = await RepairJob.findOneAndDelete({ _id: req.params.id, adminId });
  if (!job) throw new ApiError(404, 'Repair job not found.');
  return job;
};

const STATUS_FLOW = { todo: 'in-progress', 'in-progress': 'complete', complete: 'handover', handover: 'handover' };
const REVERSE_STATUS_FLOW = { handover: 'complete', complete: 'in-progress', 'in-progress': 'todo', todo: 'todo' };

const advanceStatus = async (req) => {
  const adminId = tenantAdminId(req);
  const job = await RepairJob.findOne({ _id: req.params.id, adminId });
  if (!job) throw new ApiError(404, 'Repair job not found.');
  job.status = STATUS_FLOW[job.status] || job.status;
  await job.save();
  return populateJob(RepairJob.findById(job._id));
};

const revertStatus = async (req) => {
  const adminId = tenantAdminId(req);
  const job = await RepairJob.findOne({ _id: req.params.id, adminId });
  if (!job) throw new ApiError(404, 'Repair job not found.');
  job.status = REVERSE_STATUS_FLOW[job.status] || job.status;
  await job.save();
  return populateJob(RepairJob.findById(job._id));
};

// Returns a handed-over job back to "complete" with a note — e.g. the
// customer brought it back with a new complaint.
const returnRepairJob = async (req) => {
  const adminId = tenantAdminId(req);
  const { note } = req.body;
  if (!note) throw new ApiError(400, 'A note is required to return a repair job.');

  const job = await RepairJob.findOne({ _id: req.params.id, adminId });
  if (!job) throw new ApiError(404, 'Repair job not found.');
  if (job.status !== 'handover') {
    throw new ApiError(400, `Only jobs with status "handover" can be returned (current: "${job.status}").`);
  }

  job.status = 'complete';
  job.faultIssue = `${job.faultIssue}\n\n[RETURNED] ${note}`;
  await job.save();
  return populateJob(RepairJob.findById(job._id));
};

module.exports = {
  createRepairJob,
  listRepairJobs,
  getRepairJobById,
  updateRepairJob,
  deleteRepairJob,
  advanceStatus,
  revertStatus,
  returnRepairJob,
};