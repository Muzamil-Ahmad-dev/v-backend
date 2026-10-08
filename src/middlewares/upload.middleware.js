const multer = require('multer');

// Memory storage (buffer, not disk) — the buffer is streamed straight to
// Cloudinary in modules/upload/upload.controller.js, same pattern
// Okiee-Backend used for its "upload-imei-image" route.
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (JPEG, PNG, GIF, WEBP...) are allowed.'), false);
  }
};

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB, same limit as Okiee-Backend
  fileFilter,
});

module.exports = upload;
