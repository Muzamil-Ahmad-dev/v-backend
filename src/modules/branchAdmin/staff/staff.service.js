const User = require('../../../models/User');
const Branch = require('../../../models/Branch');
const ApiError = require('../../../utils/ApiError');
const ROLES = require('../../../constants/roles');
const STATUS = require('../../../constants/status');
const { logAudit } = require('../../../utils/auditHelper');

const STAFF_ROLES = [ROLES.BILLING, ROLES.SALE, ROLES.PURCHASE];

/**
 * Branch Admin creates a Billing / Sale / Purchase staff member.
 * The staff member can only ever be assigned to a branch that THIS
 * branch admin owns — enforced below.
 */
const createStaff = async (branchAdmin, { role, branchId, name, email, phone, password }) => {
  if (!role || !STAFF_ROLES.includes(role)) {
    throw new ApiError(400, `role must be one of: ${STAFF_ROLES.join(', ')}.`);
  }
  if (!branchId || !name || !email || !password) {
    throw new ApiError(400, 'branchId, name, email and password are required.');
  }

  // Make sure the branch actually belongs to this branch admin.
  const branch = await Branch.findOne({ _id: branchId, branchAdminId: branchAdmin._id });
  if (!branch) throw new ApiError(404, 'Branch not found or does not belong to you.');

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) throw new ApiError(409, 'An account with this email already exists.');

  const staff = await User.create({
    name,
    email: email.toLowerCase(),
    phone,
    password,
    role,
    status: STATUS.ACTIVE,
    emailVerified: true,
    parentAdminId: branchAdmin.parentAdminId,
    branchAdminId: branchAdmin._id,
    branchId,
  });

  await logAudit({
    entityType: 'User',
    entityId: staff._id,
    action: 'BRANCH_STAFF_CREATED',
    performedBy: branchAdmin._id,
    performedByRole: ROLES.BRANCH_ADMIN,
    note: `${role} staff created for branch ${branch.name}`,
  });

  return staff.toSafeObject();
};

const listStaff = async (branchAdminId, { branchId, role, page = 1, limit = 20 } = {}) => {
  const filter = { branchAdminId, role: { $in: STAFF_ROLES } };
  if (branchId) filter.branchId = branchId;
  if (role) filter.role = role;

  const skip = (Number(page) - 1) * Number(limit);
  const [staff, total] = await Promise.all([
    User.find(filter).populate('branchId', 'name address').sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
    User.countDocuments(filter),
  ]);

  return { staff, pagination: { total, page: Number(page), pages: Math.ceil(total / limit) } };
};

const getStaff = async (branchAdminId, id) => {
  const staff = await User.findOne({ _id: id, branchAdminId, role: { $in: STAFF_ROLES } }).populate('branchId', 'name address');
  if (!staff) throw new ApiError(404, 'Staff member not found.');
  return staff;
};

const updateStaff = async (branchAdminId, id, data) => {
  const staff = await User.findOne({ _id: id, branchAdminId, role: { $in: STAFF_ROLES } });
  if (!staff) throw new ApiError(404, 'Staff member not found.');

  const fields = ['name', 'phone'];
  fields.forEach((f) => { if (data[f] !== undefined) staff[f] = data[f]; });

  // Re-assigning to a different branch must still be one of this branch admin's branches.
  if (data.branchId !== undefined) {
    const branch = await Branch.findOne({ _id: data.branchId, branchAdminId });
    if (!branch) throw new ApiError(404, 'Branch not found or does not belong to you.');
    staff.branchId = data.branchId;
  }

  await staff.save();
  return staff.toSafeObject();
};

const toggleStaffStatus = async (branchAdminId, id, action) => {
  if (!['activate', 'deactivate'].includes(action)) {
    throw new ApiError(400, 'action must be either "activate" or "deactivate".');
  }
  const staff = await User.findOne({ _id: id, branchAdminId, role: { $in: STAFF_ROLES } });
  if (!staff) throw new ApiError(404, 'Staff member not found.');

  staff.status = action === 'deactivate' ? STATUS.DEACTIVATED : STATUS.ACTIVE;
  await staff.save();

  await logAudit({
    entityType: 'User',
    entityId: staff._id,
    action: action === 'deactivate' ? 'BRANCH_STAFF_DEACTIVATED' : 'BRANCH_STAFF_ACTIVATED',
    performedBy: branchAdminId,
    performedByRole: ROLES.BRANCH_ADMIN,
  });

  return staff.toSafeObject();
};

const deleteStaff = async (branchAdminId, id) => {
  const staff = await User.findOneAndDelete({ _id: id, branchAdminId, role: { $in: STAFF_ROLES } });
  if (!staff) throw new ApiError(404, 'Staff member not found.');
  return staff;
};

module.exports = { createStaff, listStaff, getStaff, updateStaff, toggleStaffStatus, deleteStaff };
