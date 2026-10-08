const cloudinary = require('../../config/cloudinary');
const asyncHandler = require('../../utils/asyncHandler');
const ApiError = require('../../utils/ApiError');
const ApiResponse = require('../../utils/ApiResponse');

// Ported from Okiee-Backend's cloudinaryController.uploadImeiImage, made
// generic (any authenticated role can upload IMEI photos, shop logos,
// accessory pictures, etc. by passing a different `folder`).
//
// POST /upload/image  (multipart/form-data, field name "image")
// body/query: folder  — optional Cloudinary folder, defaults to "okiee-uploads"
exports.uploadImage = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError(400, 'No file provided.');
  }

  const folder = (req.body.folder || req.query.folder || 'okiee-uploads')
    .toString()
    .replace(/[^a-zA-Z0-9-_/]/g, '');
  const safeTag = (req.body.tag || 'img').toString().replace(/[^a-zA-Z0-9-_]/g, '');
  const public_id = `${safeTag}-${Date.now()}`;

  const result = await new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'auto', public_id, timeout: 60000 },
      (error, uploadResult) => (error ? reject(error) : resolve(uploadResult))
    );
    uploadStream.on('error', reject);
    uploadStream.end(req.file.buffer);
  });

  res.status(200).json(
    new ApiResponse(
      200,
      { imageUrl: result.secure_url, publicId: result.public_id },
      'Image uploaded successfully.'
    )
  );
});

// POST /upload/delete   body: { publicId }
exports.deleteImage = asyncHandler(async (req, res) => {
  const { publicId } = req.body;
  if (!publicId) {
    throw new ApiError(400, 'publicId is required.');
  }

  await cloudinary.uploader.destroy(publicId);
  res.status(200).json(new ApiResponse(200, {}, 'Image deleted successfully.'));
});
