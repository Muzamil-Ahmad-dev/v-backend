const express = require('express');
const controller = require('./staff.controller');

const router = express.Router();

// All routes already protected by branchAdmin.routes.js (protect, authorize(BRANCH_ADMIN))

// POST   /api/branch-admin/staff              body: { role: 'BILLING'|'SALE'|'PURCHASE', branchId, name, email, phone, password }
// GET    /api/branch-admin/staff               ?branchId=&role=&page=&limit=
// GET    /api/branch-admin/staff/:id
// PUT    /api/branch-admin/staff/:id
// PATCH  /api/branch-admin/staff/:id/status    body: { action: 'activate'|'deactivate' }
// DELETE /api/branch-admin/staff/:id
router.post('/', controller.createStaff);
router.get('/', controller.listStaff);
router.get('/:id', controller.getStaff);
router.put('/:id', controller.updateStaff);
router.patch('/:id/status', controller.toggleStaffStatus);
router.delete('/:id', controller.deleteStaff);

module.exports = router;
