const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  let error = err;

  if (!(error instanceof ApiError)) {
    let statusCode = error.statusCode || 500;
    let message = 'Something went wrong. Please try again.';
    let errors = [];

    // Mongoose duplicate key — tell user exactly what is taken
    if (error.code === 11000) {
      statusCode = 409;
      const field = Object.keys(error.keyPattern || {})[0];
      const fieldLabel = field === 'email' ? 'Email address'
        : field === 'phone' ? 'Phone number'
        : field ? `${field.charAt(0).toUpperCase() + field.slice(1)}`
        : 'This value';
      message = `${fieldLabel} is already registered. Please use a different one.`;
    }

    // Mongoose validation — surface every broken field clearly
    else if (error.name === 'ValidationError') {
      statusCode = 400;
      errors = Object.values(error.errors).map((e) => {
        const field = e.path || 'Field';
        const label = field.charAt(0).toUpperCase() + field.slice(1);
        return `${label}: ${e.message}`;
      });
      message = errors.length === 1
        ? errors[0]
        : `Please fix the following: ${errors.join('; ')}`;
    }

    // Mongoose bad ObjectId — don't leak internal path names
    else if (error.name === 'CastError') {
      statusCode = 400;
      message = 'The ID you provided is not valid. Please check and try again.';
    }

    // JWT errors (backup — auth middleware should catch these first)
    else if (error.name === 'JsonWebTokenError') {
      statusCode = 401;
      message = 'Your session token is invalid. Please log in again.';
    }
    else if (error.name === 'TokenExpiredError') {
      statusCode = 401;
      message = 'Your session has expired. Please log in again.';
    }

    error = new ApiError(statusCode, message, errors, error.stack);
  }

  // Log server errors with full context
  if (error.statusCode >= 500) {
    logger.error(`[${req.method}] ${req.originalUrl} — ${error.message}`, error.stack);
  }

  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message,
    ...(error.errors && error.errors.length > 0 ? { errors: error.errors } : {}),
    ...(process.env.NODE_ENV === 'development' ? { stack: error.stack } : {}),
  });
};

const notFound = (req, res, next) => {
  next(new ApiError(404, `The route "${req.originalUrl}" does not exist.`));
};

module.exports = { errorHandler, notFound };
