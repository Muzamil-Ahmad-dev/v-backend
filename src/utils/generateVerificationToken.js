const crypto = require('crypto');

// Generates a raw token (sent in the email link) and its sha256 hash
// (stored in the DB), so a leaked DB never exposes usable tokens.
const generateVerificationToken = () => {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
  return { rawToken, hashedToken };
};

module.exports = generateVerificationToken;
