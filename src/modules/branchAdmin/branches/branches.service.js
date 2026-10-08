const Branch = require('../../../models/Branch');
const ApiError = require('../../../utils/ApiError');
const ROLES = require('../../../constants/roles');
const { logAudit } = require('../../../utils/auditHelper');

/**
 * Branch Admin's own branches.
 * Every branch is tagged with:
 *   - adminId       → the top-level Admin (business owner) for global reporting
 *   - branchAdminId → THIS branch admin, so other branch admins under the
 *                     same Admin never see it (isolation).
 */

const createBranch = async (branchAdmin, { name, address, phone, managerName }) => {
  if (!name) throw new ApiError(400, 'Branch name is required.');

  const existing = await Branch.findOne({ branchAdminId: branchAdmin._id, name: name.trim() });
  if (existing) throw new ApiError(409, 'A branch with this name already exists for you.');

  const branch = await Branch.create({
    adminId: branchAdmin.parentAdminId,
    branchAdminId: branchAdmin._id,
    name,
    address,
    phone,
    managerName,
  });

  await logAudit({
    entityType: 'Branch',
    entityId: branch._id,
    action: 'BRANCH_CREATED_BY_BRANCH_ADMIN',
    performedBy: branchAdmin._id,
    performedByRole: ROLES.BRANCH_ADMIN,
    metadata: { name },
  });

  return branch;
};

const listBranches = async (branchAdminId) =>
  Branch.find({ branchAdminId }).sort({ createdAt: -1 });

const getBranch = async (branchAdminId, id) => {
  const branch = await Branch.findOne({ _id: id, branchAdminId });
  if (!branch) throw new ApiError(404, 'Branch not found.');
  return branch;
};

const updateBranch = async (branchAdminId, id, data) => {
  const branch = await Branch.findOne({ _id: id, branchAdminId });
  if (!branch) throw new ApiError(404, 'Branch not found.');
  const fields = ['name', 'address', 'phone', 'managerName', 'isActive'];
  fields.forEach((f) => { if (data[f] !== undefined) branch[f] = data[f]; });
  await branch.save();
  return branch;
};

const deleteBranch = async (branchAdminId, id) => {
  const branch = await Branch.findOneAndDelete({ _id: id, branchAdminId });
  if (!branch) throw new ApiError(404, 'Branch not found.');
  return branch;
};

/**
 * Read-only "my branch" lookup for the currently logged-in user.
 *
 * BILLING / SALE / PURCHASE staff are permanently fixed to one branch
 * (req.user.branchId, set once at staff-creation time by staff.service.js,
 * which already verified that branch belongs to their Branch Admin — so
 * this is safe to trust without re-checking branchAdminId here).
 *
 * A Branch Admin can own several branches, so they don't have a single
 * fixed branchId on their own user record — they should keep using
 * GET /branches (list) or GET /branches/:id instead.
 */
const getMyBranch = async (user) => {
  if (!user.branchId) {
    const hint =
      user.role === ROLES.BRANCH_ADMIN
        ? 'Branch Admins can own multiple branches — use GET /branches to list them, or GET /branches/:id for a specific one.'
        : 'No branch is assigned to this account.';
    throw new ApiError(404, hint);
  }

  const branch = await Branch.findById(user.branchId);
  if (!branch) throw new ApiError(404, 'Branch not found.');
  return branch;
};

module.exports = { createBranch, listBranches, getBranch, updateBranch, deleteBranch, getMyBranch };
