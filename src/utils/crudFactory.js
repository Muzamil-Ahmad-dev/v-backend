 const express = require('express');
const ApiError = require('./ApiError');
const ApiResponse = require('./ApiResponse');
const asyncHandler = require('./asyncHandler');

/**
 * Creates a standard CRUD service scoped to adminId.
 * All documents must have an `adminId` field.
 */
const createCRUDService = (Model) => ({
  create: (data) => Model.create(data),

  getAll: (adminId, { filter = {}, sort = '-createdAt', page, limit } = {}) => {
    let q = Model.find({ adminId, ...filter }).sort(sort);
    if (page && limit) {
      const skip = (Number(page) - 1) * Number(limit);
      q = q.skip(skip).limit(Number(limit));
    }
    return q;
  },

  getOne: (id, adminId) => Model.findOne({ _id: id, adminId }),

  update: (id, adminId, data) =>
    Model.findOneAndUpdate({ _id: id, adminId }, data, { new: true, runValidators: true }),

  remove: (id, adminId) => Model.findOneAndDelete({ _id: id, adminId }),

  count: (adminId, filter = {}) => Model.countDocuments({ adminId, ...filter }),
});

// The real tenant/admin ID for the current request.
//
// Admin accounts have parentAdminId === null, so they're scoped by their own
// _id. Every other role that can reach finance routes (Branch Admin, BILLING,
// SALE, PURCHASE staff, etc.) has parentAdminId set to the owning Admin's
// _id — and that's what all their financial records (BankAccount, PocketCash,
// PartyLedger, ...) are actually saved under (see purchase/shared/payment.helper.js).
// Scoping finance CRUD by req.user._id instead of this would silently show
// staff members an empty ledger, disconnected from what Purchase/Sale/Billing
// actually recorded.
const tenantAdminId = (req) => req.user.parentAdminId || req.user._id;

/**
 * Creates a standard CRUD controller wrapping a service.
 */
const createCRUDController = (service, resourceName) => ({
  create: asyncHandler(async (req, res) => {
    const data = { ...req.body, adminId: tenantAdminId(req) };
    const doc = await service.create(data);
    res.status(201).json(new ApiResponse(201, doc, `${resourceName} created successfully.`));
  }),

  getAll: asyncHandler(async (req, res) => {
    const { page, limit, sort, ...filter } = req.query;
    const docs = await service.getAll(tenantAdminId(req), { filter, sort, page, limit });
    res.status(200).json(new ApiResponse(200, docs, `${resourceName} list fetched.`));
  }),

   getOne: asyncHandler(async (req, res) => {
    const doc = await service.getOne(req.params.id, tenantAdminId(req));
    if (!doc) throw new ApiError(404, `${resourceName} not found or you do not have access to it.`);
    res.status(200).json(new ApiResponse(200, doc, `${resourceName} fetched.`));
  }),

  update: asyncHandler(async (req, res) => {
    const doc = await service.update(req.params.id, tenantAdminId(req), req.body);
    if (!doc) throw new ApiError(404, `${resourceName} not found or you do not have permission to update it.`);
    res.status(200).json(new ApiResponse(200, doc, `${resourceName} updated successfully.`));
  }),

  remove: asyncHandler(async (req, res) => {
    const doc = await service.remove(req.params.id, tenantAdminId(req));
    if (!doc) throw new ApiError(404, `${resourceName} not found.`);
    res.status(200).json(new ApiResponse(200, {}, `${resourceName} deleted successfully.`));
  }),
});

/**
 * Builds a router with standard CRUD routes.
 * Caller is responsible for applying auth middleware before mounting.
 */
const createCRUDRouter = (controller) => {
  const router = express.Router();
  router.post('/', controller.create);
  router.get('/', controller.getAll);
  router.get('/:id', controller.getOne);
  router.put('/:id', controller.update);
  router.delete('/:id', controller.remove);
  return router;
};

module.exports = { createCRUDService, createCRUDController, createCRUDRouter };
