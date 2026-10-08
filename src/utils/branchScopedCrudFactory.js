 const express = require('express');
const ApiError = require('./ApiError');
const ApiResponse = require('./ApiResponse');
const asyncHandler = require('./asyncHandler');
const { resolveBranchId } = require('./branchContext');
const { tenantAdminId } = require('../modules/purchase/shared/tenantAdminId');

/**
 * Branch-scoped CRUD factory.
 *
 * Used by the BILLING / SALE / PURCHASE staff routes AND by the Branch
 * Admin's own Inventory / Repairs / Notifications / Invoices routes.
 * Every record is still owned by the top-level Admin (adminId, same field
 * Admin's own CRUD uses), but is additionally locked to a single branch,
 * so one branch's data can never be seen or touched from another branch —
 * even within the same business.
 *
 * The branch is resolved via resolveBranchId(req):
 *   - BILLING/SALE/PURCHASE staff → always their own fixed branch.
 *   - BRANCH_ADMIN (can own multiple branches) → must pass ?branchId=...
 *     (or body.branchId), validated to belong to them.
 *
 * This is intentionally a separate file from crudFactory.js so the
 * existing Admin CRUD routes are not touched or affected in any way.
 */
const createBranchScopedCRUDController = (Model, resourceName) => ({
  create: asyncHandler(async (req, res) => {
    const branchId = await resolveBranchId(req);
    if (!branchId) {
      throw new ApiError(403, 'Your account has no branch assigned. Contact your Branch Admin.');
    }
    const { branchId: _omit, ...body } = req.body;
    const data = {
      ...body,
      adminId: tenantAdminId(req),
      branchId,
    };
    const doc = await Model.create(data);
    res.status(201).json(new ApiResponse(201, doc, `${resourceName} created successfully.`));
  }),

  getAll: asyncHandler(async (req, res) => {
    const branchId = await resolveBranchId(req);
    if (!branchId) {
      return res.status(200).json(new ApiResponse(200, [], `${resourceName} list fetched.`));
    }
    const { page, limit, sort = '-createdAt', branchId: _omit, ...filter } = req.query;
    let q = Model.find({
      adminId: tenantAdminId(req),
      branchId,
      ...filter,
    }).sort(sort);

    if (page && limit) {
      const skip = (Number(page) - 1) * Number(limit);
      q = q.skip(skip).limit(Number(limit));
    }
    const docs = await q;
    res.status(200).json(new ApiResponse(200, docs, `${resourceName} list fetched.`));
  }),

  getOne: asyncHandler(async (req, res) => {
    const branchId = await resolveBranchId(req);
    const doc = await Model.findOne({
      _id: req.params.id,
      adminId: tenantAdminId(req),
      branchId,
    });
    if (!doc) throw new ApiError(404, `${resourceName} not found or you do not have access to it.`);
    res.status(200).json(new ApiResponse(200, doc, `${resourceName} fetched.`));
  }),

  update: asyncHandler(async (req, res) => {
    const branchId = await resolveBranchId(req);
    const { branchId: _omit, ...body } = req.body;
    const doc = await Model.findOneAndUpdate(
      { _id: req.params.id, adminId: tenantAdminId(req), branchId },
      body,
      { new: true, runValidators: true }
    );
    if (!doc) throw new ApiError(404, `${resourceName} not found or you do not have permission to update it.`);
    res.status(200).json(new ApiResponse(200, doc, `${resourceName} updated successfully.`));
  }),

  remove: asyncHandler(async (req, res) => {
    const branchId = await resolveBranchId(req);
    const doc = await Model.findOneAndDelete({
      _id: req.params.id,
      adminId: tenantAdminId(req),
      branchId,
    });
    if (!doc) throw new ApiError(404, `${resourceName} not found or you do not have permission to delete it.`);
    res.status(200).json(new ApiResponse(200, {}, `${resourceName} deleted successfully.`));
  }),
});

const createBranchScopedCRUDRouter = (Model, resourceName) => {
  const router = express.Router();
  const controller = createBranchScopedCRUDController(Model, resourceName);
  router.post('/', controller.create);
  router.get('/', controller.getAll);
  router.get('/:id', controller.getOne);
  router.put('/:id', controller.update);
  router.delete('/:id', controller.remove);
  return router;
};

module.exports = { createBranchScopedCRUDController, createBranchScopedCRUDRouter };
