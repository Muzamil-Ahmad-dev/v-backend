 const express = require('express');
const { check } = require('express-validator');
const adminController = require('../controllers/adminController');

const router = express.Router();

router.post(
  '/addUser',
  [
    check('username', 'Username is required').notEmpty(),
    check('email', 'Email is required').isEmail(),
    check('password', 'Password must be 8 or more characters').isLength({ min: 8 })
  ],
  adminController.register
);

router.post(
  '/login',
  [
    check('username', 'Username is required').notEmpty(),
    check('password', 'Password is required').exists()
  ],
  adminController.login
);

router.post(
  '/getAlluser',
  adminController.getAllUsersExceptCurrent
);

router.put(
  '/updateUser',
  adminController.updateUser
);

// 🔥 FIXED: added :userId param (required for controller)
router.put(
  '/updateUserPassword/:userId',
  adminController.updatePassword
);

router.put(
  '/activateDeactivateUser',
  adminController.toggleUserStatus
);

router.post(
  '/send-email',
  adminController.sendEmail
);

module.exports = router;