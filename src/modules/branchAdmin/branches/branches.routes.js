const express = require('express');
const controller = require('./branches.controller');

const router = express.Router();

// All routes already protected by branchAdmin.routes.js (protect, authorize(BRANCH_ADMIN))

// POST   /api/branch-admin/branches
// GET    /api/branch-admin/branches
// GET    /api/branch-admin/branches/:id
// PUT    /api/branch-admin/branches/:id
// DELETE /api/branch-admin/branches/:id
router.post('/', controller.createBranch);
router.get('/', controller.listBranches);
router.get('/:id', controller.getBranch);
router.put('/:id', controller.updateBranch);
router.delete('/:id', controller.deleteBranch);

module.exports = router;
