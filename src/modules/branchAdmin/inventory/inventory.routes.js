const express = require('express');
const Phone = require('../../../models/Phone');
const Dispatch = require('../../../models/Dispatch');
const { createBranchScopedCRUDRouter } = require('../../../utils/branchScopedCrudFactory');
const accessoryRoutes = require('../../purchase/accessory/accessory.routes');

// Reuses the same branch-scoped CRUD factory the BILLING/SALE/PURCHASE staff
// routes use. These models (Phone, Dispatch) originally only had tenant-wide
// adminId scoping (ported over from the older Okiee-Backend monolith); an
// optional branchId field was added to each so a Branch Admin can now manage
// their own branch's catalog/dispatch without seeing another branch's
// records. adminId is still required and untouched — nothing about the
// Admin's own /api/admin/inventory/* routes changes.
const router = express.Router();

// POST/GET/PUT/DELETE /api/branch-admin/inventory/phones[/:id]
router.use('/phones', createBranchScopedCRUDRouter(Phone, 'Phone'));

// /api/branch-admin/inventory/accessories — the real purchase/stock/sale-
// linked accessory module (same one PURCHASE staff use at
// /api/purchase/accessories), NOT a raw CRUD on the model. Routing this
// through the generic branch-scoped CRUD factory instead would let stock/
// quantity be edited directly, bypassing StockMovement history and the
// payment/credit ledger that purchaseAccessories()/restockAccessory() keep
// in sync — so it is intentionally reused here rather than duplicated.
router.use('/accessories', accessoryRoutes);

// POST/GET/PUT/DELETE /api/branch-admin/inventory/dispatch[/:id]
router.use('/dispatch', createBranchScopedCRUDRouter(Dispatch, 'Dispatch'));

module.exports = router;
