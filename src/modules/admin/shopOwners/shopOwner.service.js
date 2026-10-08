const ShopOwner = require('../../../models/ShopOwner');
const Branch = require('../../../models/Branch');
const ApiError = require('../../../utils/ApiError');
const ROLES = require('../../../constants/roles');
const { logAudit } = require('../../../utils/auditHelper');

const createShopOwner = async (adminId, { name, email, phone, password, businessName, address, branchId, planType }) => {
  if (!name || !email || !password) throw new ApiError(400, 'name, email and password are required.');

  // Validate branch belongs to this admin (if branchId provided)
  if (branchId) {
    const branch = await Branch.findOne({ _id: branchId, adminId });
    if (!branch) throw new ApiError(404, 'Branch not found or does not belong to your account.');
  }

  const existing = await ShopOwner.findOne({ email: email.toLowerCase() });
  if (existing) throw new ApiError(409, 'An account with this email already exists.');

  const shopOwner = await ShopOwner.create({
    adminId,
    name,
    email: email.toLowerCase(),
    phone,
    password,
    businessName,
    address,
    branchId: branchId || null,
    planType: planType || null,
    status: 'ACTIVE',
  });

  await logAudit({
    entityType: 'ShopOwner',
    entityId: shopOwner._id,
    action: 'SHOP_OWNER_CREATED',
    performedBy: adminId,
    performedByRole: ROLES.ADMIN,
    note: `Shop Owner ${name} created`,
    metadata: { branchId: branchId || null },
  });

  return shopOwner.toSafeObject();
};

const listShopOwners = async (adminId, { status, branchId, page = 1, limit = 20 } = {}) => {
  const filter = { adminId };
  if (status) filter.status = status;
  if (branchId) filter.branchId = branchId;
  const skip = (Number(page) - 1) * Number(limit);
  const [shopOwners, total] = await Promise.all([
    ShopOwner.find(filter)
      .select('-password')
      .populate('branchId', 'name address')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    ShopOwner.countDocuments(filter),
  ]);
  return { shopOwners, pagination: { total, page: Number(page), pages: Math.ceil(total / limit) } };
};

const getShopOwner = async (adminId, id) => {
  const shopOwner = await ShopOwner.findOne({ _id: id, adminId })
    .select('-password')
    .populate('branchId', 'name address');
  if (!shopOwner) throw new ApiError(404, 'Shop owner not found.');
  return shopOwner;
};

const updateShopOwner = async (adminId, id, data) => {
  const shopOwner = await ShopOwner.findOne({ _id: id, adminId });
  if (!shopOwner) throw new ApiError(404, 'Shop owner not found.');
  const allowed = ['name', 'phone', 'businessName', 'address', 'branchId', 'planType', 'subscriptionStartDate', 'subscriptionEndDate'];
  allowed.forEach((f) => { if (data[f] !== undefined) shopOwner[f] = data[f]; });
  await shopOwner.save();
  return shopOwner.toSafeObject();
};

const toggleShopOwnerStatus = async (adminId, id, action) => {
  if (!['activate', 'deactivate'].includes(action)) throw new ApiError(400, 'action must be activate or deactivate.');
  const shopOwner = await ShopOwner.findOne({ _id: id, adminId });
  if (!shopOwner) throw new ApiError(404, 'Shop owner not found.');
  shopOwner.status = action === 'activate' ? 'ACTIVE' : 'DEACTIVATED';
  await shopOwner.save();

  await logAudit({
    entityType: 'ShopOwner',
    entityId: shopOwner._id,
    action: action === 'activate' ? 'ACCOUNT_ACTIVATED' : 'ACCOUNT_DEACTIVATED',
    performedBy: adminId,
    performedByRole: ROLES.ADMIN,
  });

  return shopOwner.toSafeObject();
};

const deleteShopOwner = async (adminId, id) => {
  const shopOwner = await ShopOwner.findOneAndDelete({ _id: id, adminId });
  if (!shopOwner) throw new ApiError(404, 'Shop owner not found.');
  return shopOwner;
};

const getDashboardStats = async (adminId) => {
  const [total, active, deactivated] = await Promise.all([
    ShopOwner.countDocuments({ adminId }),
    ShopOwner.countDocuments({ adminId, status: 'ACTIVE' }),
    ShopOwner.countDocuments({ adminId, status: 'DEACTIVATED' }),
  ]);
  return { shopOwners: { total, active, deactivated } };
};

module.exports = {
  createShopOwner,
  listShopOwners,
  getShopOwner,
  updateShopOwner,
  toggleShopOwnerStatus,
  deleteShopOwner,
  getDashboardStats,
};
