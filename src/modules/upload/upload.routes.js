const express = require('express');
const { protect } = require('../../middlewares/auth.middleware');
const upload = require('../../middlewares/upload.middleware');
const controller = require('./upload.controller');

const router = express.Router();

// Any authenticated user (Admin, Branch Admin, Purchase/Sale/Billing staff,
// Shop Owner...) can upload an image — used for IMEI photos, shop logos,
// accessory pictures, etc. Caller distinguishes purpose via `folder`/`tag`.
router.use(protect);

// POST /upload/image  (multipart/form-data, field name "image")
router.post('/image', upload.single('image'), controller.uploadImage);

// POST /upload/delete   body: { publicId }
router.post('/delete', controller.deleteImage);

module.exports = router;
