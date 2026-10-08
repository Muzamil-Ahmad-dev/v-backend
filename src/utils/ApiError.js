 class ApiError extends Error {
  constructor(statusCode, message, errors = [], stack = '', meta = {}) {
    super(message);
    this.statusCode = statusCode;
    this.success = false;
    this.errors = errors;
    this.meta = meta; // extra machine-readable context (e.g. accountStatus)
    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

module.exports = ApiError;
