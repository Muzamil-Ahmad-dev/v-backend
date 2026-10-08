const Notification = require('../../../models/Notification');
const { createBranchScopedCRUDRouter } = require('../../../utils/branchScopedCrudFactory');

// POST/GET/PUT/DELETE /api/branch-admin/notifications[/:id]
// PUT is also how a notification gets marked read, e.g. PUT { isRead: true }.
module.exports = createBranchScopedCRUDRouter(Notification, 'Notification');
