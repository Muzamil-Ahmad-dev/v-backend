const express = require('express');
const { check } = require('express-validator');
const addPhoneController = require('../controllers/addPhoneController');
const router = express.Router();

router.post('/addPhone', addPhoneController.addPhone);
router.put('/updatePhone/:id', addPhoneController.updatePhone);
router.delete('/deletePhone/:id', addPhoneController.deletePhone);
router.get('/getPhoneUsingId/:id', addPhoneController.getPhone);
router.get('/getAllPhones/:id', addPhoneController.getAllPhones);

module.exports = router;