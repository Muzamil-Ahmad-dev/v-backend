const crypto = require('crypto');
const User = require('../models/User');

// Avoid visually-confusing characters (0/O, 1/I, etc.)
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const randomSegment = (length = 5) => {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[crypto.randomInt(0, ALPHABET.length)];
  }
  return out;
};

const generateReferralCode = async () => {
  let code;
  let exists = true;
  while (exists) {
    code = `REF-${randomSegment(5)}`;
    // eslint-disable-next-line no-await-in-loop
    exists = await User.exists({ referralCode: code });
  }
  return code;
};

module.exports = generateReferralCode;
