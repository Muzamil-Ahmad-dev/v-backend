const crypto = require('crypto');

/**
 * Generates a 6-digit numeric OTP and a sha256 hash for DB storage.
 * The raw OTP is sent in the email; only the hash is stored.
 */
const generateOtp = () => {
  // Cryptographically random 6-digit number (000000 – 999999)
  const raw = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const hashed = crypto.createHash('sha256').update(raw).digest('hex');
  return { raw, hashed };
};

const OTP_EXPIRY_MINUTES = 10;
const OTP_EXPIRY_MS = OTP_EXPIRY_MINUTES * 60 * 1000;

module.exports = { generateOtp, OTP_EXPIRY_MS, OTP_EXPIRY_MINUTES };
