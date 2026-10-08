const ShopOwner = require('../../models/ShopOwner');
const Branch = require('../../models/Branch');
const ApiError = require('../../utils/ApiError');

/**
 * Shop Owner dashboard — only sees data for their own branch.
 * All queries are scoped by shopOwnerId and branchId.
 */
const getDashboard = async (shopOwnerId) => {
  const shopOwner = await ShopOwner.findById(shopOwnerId).populate('branchId', 'name address phone');
  if (!shopOwner) throw new ApiError(404, 'Shop owner not found.');

  return {
    shopOwner: shopOwner.toSafeObject(),
    branch: shopOwner.branchId || null,
  };
};

const getProfile = async (shopOwnerId) => {
  const shopOwner = await ShopOwner.findById(shopOwnerId)
    .select('-password')
    .populate('branchId', 'name address phone managerName');
  if (!shopOwner) throw new ApiError(404, 'Shop owner not found.');
  return shopOwner;
};

const updateProfile = async (shopOwnerId, data) => {
  const shopOwner = await ShopOwner.findById(shopOwnerId);
  if (!shopOwner) throw new ApiError(404, 'Shop owner not found.');

  const allowed = ['name', 'phone', 'businessName', 'address'];
  allowed.forEach((f) => { if (data[f] !== undefined) shopOwner[f] = data[f]; });
  await shopOwner.save();
  return shopOwner.toSafeObject();
};

module.exports = { getDashboard, getProfile, updateProfile };
