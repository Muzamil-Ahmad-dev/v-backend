const express = require('express');
const controller = require('./branch.controller');

const router = express.Router();

// All routes already protected by admin.routes.js
//
// Branches are now exclusively created/managed by a BRANCH_ADMIN
// (see /api/branch-admin/branches). The Admin's role here is oversight
// only — viewing every branch across the whole business, however many
// Branch Admins created them — never creating/editing/deleting one directly.
router.get('/', controller.listBranches);
router.get('/admins', controller.listBranchAdmins);        // GET /api/admin/branches/admins
router.get('/:id', controller.getBranch);

module.exports = router;
