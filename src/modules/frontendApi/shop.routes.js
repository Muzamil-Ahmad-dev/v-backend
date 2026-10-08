const express = require('express');
const upload = require('../../middlewares/upload.middleware');
const controller = require('./shop.controller');

const router = express.Router();

// NOTE: mounted at app.js as `app.use('/api/shop', protect, shopRoutesFE)`,
// so `protect` is already applied — every route below has req.user set.

// GET /api/shop/getshop/:userId — kept for backward compatibility with the
// original single-shop-per-admin lookup used elsewhere in the app.
router.get('/getshop/:userId', controller.getShopByAdminId);

// ── Full Shop CRUD (ported from Okiee-Backend's shopController) ──────────
// POST   /api/shop            — create a shop (body: { shopOwnerId, name, ... })
// GET    /api/shop            — list shops (?branchId=&status=)
// GET    /api/shop/:id
// PUT    /api/shop/:id
// DELETE /api/shop/:id
router.post('/', controller.createShop);
router.get('/', controller.getAllShops);
router.get('/:id', controller.getShop);
router.put('/:id', controller.updateShop);
router.delete('/:id', controller.deleteShop);

// ── Logo (Cloudinary) ──────────────────────────────────────────────────
// POST   /api/shop/:id/logo (multipart/form-data, field name "logo")
// DELETE /api/shop/:id/logo
router.post('/:id/logo', upload.single('logo'), controller.uploadLogo);
router.delete('/:id/logo', controller.deleteLogo);

module.exports = router;
