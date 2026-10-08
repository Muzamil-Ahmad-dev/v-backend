const Shop = require('../../models/Shop');
const cloudinary = require('../../config/cloudinary');
const ApiError = require('../../utils/ApiError');

// Ported from Okiee-Backend's shopController (create/update/delete/get/getAll
// + logo upload/get/delete), rewritten as a service layer to match this
// project's controller/service/routes convention. Scoped by adminId so a
// Branch Admin (parentAdminId === the Admin's id) manages the same shops
// their parent Admin does, same convention as everything else here.
const tenantAdminId = (req) => req.user.parentAdminId || req.user._id;

exports.create = (req) =>
  Shop.create({ ...req.body, adminId: tenantAdminId(req) });

exports.getAll = (req) => {
  const { branchId, status } = req.query;
  const filter = { adminId: tenantAdminId(req) };
  if (branchId) filter.branchId = branchId;
  if (status) filter.status = status;
  return Shop.find(filter).sort('-createdAt');
};

exports.getOne = async (req) => {
  const shop = await Shop.findOne({ _id: req.params.id, adminId: tenantAdminId(req) });
  if (!shop) throw new ApiError(404, 'Shop not found.');
  return shop;
};

// Kept for backward compatibility with the pre-existing
// GET /api/shop/getshop/:userId route.
exports.getByAdminId = async (adminId) => {
  const shop = await Shop.findOne({ adminId }).sort('-createdAt');
  if (!shop) throw new ApiError(404, 'Shop not found.');
  return shop;
};

exports.update = async (req) => {
  const shop = await Shop.findOneAndUpdate(
    { _id: req.params.id, adminId: tenantAdminId(req) },
    req.body,
    { new: true, runValidators: true }
  );
  if (!shop) throw new ApiError(404, 'Shop not found or you do not have permission to update it.');
  return shop;
};

exports.remove = async (req) => {
  const shop = await Shop.findOneAndDelete({ _id: req.params.id, adminId: tenantAdminId(req) });
  if (!shop) throw new ApiError(404, 'Shop not found.');
  // Best-effort cleanup of the logo on Cloudinary — don't fail the delete if this fails.
  if (shop.logoPublicId) {
    cloudinary.uploader.destroy(shop.logoPublicId).catch(() => {});
  }
  return shop;
};

// Uploads req.file.buffer to Cloudinary and saves the URL on the shop,
// replacing (and cleaning up) any previous logo.
exports.uploadLogo = async (req) => {
  const shop = await Shop.findOne({ _id: req.params.id, adminId: tenantAdminId(req) });
  if (!shop) throw new ApiError(404, 'Shop not found.');
  if (!req.file) throw new ApiError(400, 'No logo file provided.');

  const oldPublicId = shop.logoPublicId;

  const result = await new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: 'shop-logos', resource_type: 'image', public_id: `shop-${shop._id}-${Date.now()}` },
      (error, uploadResult) => (error ? reject(error) : resolve(uploadResult))
    );
    uploadStream.on('error', reject);
    uploadStream.end(req.file.buffer);
  });

  shop.logo = result.secure_url;
  shop.logoPublicId = result.public_id;
  await shop.save();

  if (oldPublicId) cloudinary.uploader.destroy(oldPublicId).catch(() => {});

  return shop;
};

exports.deleteLogo = async (req) => {
  const shop = await Shop.findOne({ _id: req.params.id, adminId: tenantAdminId(req) });
  if (!shop) throw new ApiError(404, 'Shop not found.');

  if (shop.logoPublicId) {
    await cloudinary.uploader.destroy(shop.logoPublicId).catch(() => {});
  }
  shop.logo = '';
  shop.logoPublicId = '';
  await shop.save();

  return shop;
};
