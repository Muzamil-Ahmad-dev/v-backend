/**
 * Seeds the Super Admin account.
 * Run once: node src/seed/seedSuperAdmin.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const ROLES = require('../constants/roles');
const STATUS = require('../constants/status');

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);

  const existing = await User.findOne({ role: ROLES.SUPER_ADMIN });
  if (existing) {
    console.log('Super Admin already exists:', existing.email);
    await mongoose.disconnect();
    return;
  }

  const superAdmin = await User.create({
    name: process.env.SUPER_ADMIN_NAME || 'Super Admin',
    email: (process.env.SUPER_ADMIN_EMAIL || 'superadmin@okiee.com').toLowerCase(),
    password: process.env.SUPER_ADMIN_PASSWORD || 'Admin@123!',
    role: ROLES.SUPER_ADMIN,
    status: STATUS.ACTIVE,
    emailVerified: true,
    registrationOtpVerified: false,
  });

  console.log('Super Admin created:', superAdmin.email);
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
