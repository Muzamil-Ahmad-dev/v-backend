const express = require('express');
const controller = require('./branchAdmin.controller');

const router = express.Router();

// All routes already protected by admin.routes.js (protect, authorize(ADMIN), requireActiveAdmin)

// POST /api/admin/branch-admins        — create a Branch Admin (no branch pre-assigned;
//                                          they create their own branches + staff from here)
// GET  /api/admin/branch-admins        — list all branch admins under this Admin
// PATCH /api/admin/branch-admins/:id/status   body: { action: 'activate'|'deactivate' }
router.post('/', controller.createBranchAdmin);
router.get('/', controller.listBranchAdmins);
router.patch('/:id/status', controller.toggleBranchAdminStatus);

module.exports = router;
