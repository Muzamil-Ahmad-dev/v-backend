const jwt = require('jsonwebtoken');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const User = require('../models/User');
const ShopOwner = require('../models/ShopOwner');
const STATUS = require('../constants/status');
const ROLES = require('../constants/roles');

const protect = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new ApiError(401, 'Not authenticated. Token missing.');
  }

  const token = authHeader.split(' ')[1];

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    throw new ApiError(401, 'Invalid or expired token.');
  }

  // ShopOwner token has isShopOwner flag
  if (decoded.isShopOwner) {
    const shopOwner = await ShopOwner.findById(decoded.id);
    if (!shopOwner) throw new ApiError(401, 'Shop owner no longer exists.');
    if (shopOwner.status === 'DEACTIVATED') throw new ApiError(403, 'Account deactivated.');
    req.user = shopOwner;
    req.userRole = ROLES.SHOP_OWNER;
    req.isShopOwner = true;
    return next();
  }

  const user = await User.findById(decoded.id);
  if (!user) throw new ApiError(401, 'User no longer exists.');

  req.user = user;
  req.userRole = user.role;
  req.isShopOwner = false;
  next();
});

const authorize = (...roles) => (req, res, next) => {
  const currentRole = req.isShopOwner ? ROLES.SHOP_OWNER : req.user?.role;
  if (!currentRole || !roles.includes(currentRole)) {
    throw new ApiError(403, 'You do not have permission to perform this action.');
  }
  next();
};

// Admin-specific guard: must be ACTIVE + emailVerified
const requireActiveAdmin = (req, res, next) => {
  if (req.user.status !== STATUS.ACTIVE || !req.user.emailVerified) {
    throw new ApiError(403, 'Account is not active yet.');
  }
  next();
};

// ShopOwner guard: must be ACTIVE
const requireActiveShopOwner = (req, res, next) => {
  if (!req.isShopOwner) return next();
  if (req.user.status !== 'ACTIVE') {
    throw new ApiError(403, 'Shop owner account is not active.');
  }
  next();
};

module.exports = { protect, authorize, requireActiveAdmin, requireActiveShopOwner };
