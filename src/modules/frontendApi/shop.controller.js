const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const service = require('./shop.service');

exports.createShop = asyncHandler(async (req, res) => {
  const shop = await service.create(req);
  res.status(201).json(new ApiResponse(201, shop, 'Shop created successfully.'));
});

exports.getAllShops = asyncHandler(async (req, res) => {
  const shops = await service.getAll(req);
  res.status(200).json(new ApiResponse(200, shops, 'Shops fetched.'));
});

exports.getShop = asyncHandler(async (req, res) => {
  const shop = await service.getOne(req);
  res.status(200).json(new ApiResponse(200, shop, 'Shop fetched.'));
});

// Backward-compatible with the original GET /api/shop/getshop/:userId route.
exports.getShopByAdminId = asyncHandler(async (req, res) => {
  const shop = await service.getByAdminId(req.params.userId);
  res.status(200).json({ success: true, shop });
});

exports.updateShop = asyncHandler(async (req, res) => {
  const shop = await service.update(req);
  res.status(200).json(new ApiResponse(200, shop, 'Shop updated successfully.'));
});

exports.deleteShop = asyncHandler(async (req, res) => {
  await service.remove(req);
  res.status(200).json(new ApiResponse(200, {}, 'Shop deleted successfully.'));
});

exports.uploadLogo = asyncHandler(async (req, res) => {
  const shop = await service.uploadLogo(req);
  res.status(200).json(new ApiResponse(200, shop, 'Logo uploaded successfully.'));
});

exports.deleteLogo = asyncHandler(async (req, res) => {
  const shop = await service.deleteLogo(req);
  res.status(200).json(new ApiResponse(200, shop, 'Logo deleted successfully.'));
});
