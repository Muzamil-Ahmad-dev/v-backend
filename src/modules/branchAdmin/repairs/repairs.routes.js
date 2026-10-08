const RepairJob = require('../../../models/RepairJob');
const { createBranchScopedCRUDRouter } = require('../../../utils/branchScopedCrudFactory');

// POST/GET/PUT/DELETE /api/branch-admin/repairs[/:id]
// Scoped to the Branch Admin's own branch (branchId is optional/additive on
// RepairJob, same pattern as the inventory routes).
module.exports = createBranchScopedCRUDRouter(RepairJob, 'Repair Job');
