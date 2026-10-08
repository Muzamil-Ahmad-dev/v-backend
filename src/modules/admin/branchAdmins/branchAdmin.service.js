const User = require('../../../models/User');
const ApiError = require('../../../utils/ApiError');
const ROLES = require('../../../constants/roles');
const STATUS = require('../../../constants/status');
const { logAudit } = require('../../../utils/auditHelper');

/**
 * Create a Branch Admin that is NOT pre-assigned to a single branch.
 * This Branch Admin will go on to create their own branches and their
 * own Billing/Sale/Purchase staff, each isolated to this one Branch Admin.
 *
 * This does NOT replace the existing
 *   POST /api/admin/branches/:id/admins
 * flow (which still creates a Branch Admin tied to one specific branch) —
 * that endpoint, controller, and service are untouched.
 */
const createBranchAdmin = async (adminId, { name, email, phone, password }) => {
  if (!name || !email || !password) {
    throw new ApiError(400, 'name, email and password are required.');
  }

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) throw new ApiError(409, 'An account with this email already exists.');

  const branchAdmin = await User.create({
    name,
    email: email.toLowerCase(),
    phone,
    password,
    role: ROLES.BRANCH_ADMIN,
    status: STATUS.ACTIVE,
    emailVerified: true,
    parentAdminId: adminId,
    branchId: null, // not tied to a single branch — they create their own
  });

  await logAudit({
    entityType: 'User',
    entityId: branchAdmin._id,
    action: 'BRANCH_ADMIN_CREATED',
    performedBy: adminId,
    performedByRole: ROLES.ADMIN,
    note: 'Independent Branch Admin created (manages own branches & staff).',
  });

  return branchAdmin.toSafeObject();
};

/**
 * List every Branch Admin under this Admin — both the "independent" ones
 * created here and the legacy ones created via /branches/:id/admins.
 */
const listBranchAdmins = async (adminId) => {
  return User.find({ parentAdminId: adminId, role: ROLES.BRANCH_ADMIN })
    .populate('branchId', 'name address')
    .sort({ createdAt: -1 });
};

const toggleBranchAdminStatus = async (adminId, id, action) => {
  if (!['activate', 'deactivate'].includes(action)) {
    throw new ApiError(400, 'action must be either "activate" or "deactivate".');
  }
  const branchAdmin = await User.findOne({ _id: id, parentAdminId: adminId, role: ROLES.BRANCH_ADMIN });
  if (!branchAdmin) throw new ApiError(404, 'Branch admin not found.');

  branchAdmin.status = action === 'deactivate' ? STATUS.DEACTIVATED : STATUS.ACTIVE;
  await branchAdmin.save();

  await logAudit({
    entityType: 'User',
    entityId: branchAdmin._id,
    action: action === 'deactivate' ? 'BRANCH_ADMIN_DEACTIVATED' : 'BRANCH_ADMIN_ACTIVATED',
    performedBy: adminId,
    performedByRole: ROLES.ADMIN,
  });

  return branchAdmin.toSafeObject();
};

module.exports = { createBranchAdmin, listBranchAdmins, toggleBranchAdminStatus };
