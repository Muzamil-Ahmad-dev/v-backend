const express = require('express');
const controller = require('./shopOwner.controller');

const router = express.Router();

// All routes below are already protected by admin.routes.js middleware
router.get('/dashboard', controller.getDashboardStats);

router.post('/', controller.createShopOwner);
router.get('/', controller.listShopOwners);
router.get('/:id', controller.getShopOwner);
router.put('/:id', controller.updateShopOwner);
router.patch('/:id/status', controller.toggleShopOwnerStatus);
router.delete('/:id', controller.deleteShopOwner);

module.exports = router;
