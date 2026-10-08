/**
 * Migration 001 — Add new roles, statuses, and fields
 * 
 * Run with: node src/migrations/001_add_new_roles_and_fields.js
 * 
 * Safe to run multiple times (idempotent).
 */
require('dotenv').config();
const mongoose = require('mongoose');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  const db = mongoose.connection.db;
  const users = db.collection('users');

  // 1. All existing ADMIN users without approvalStatus → set based on current status
  const statusMap = {
    PENDING_APPROVAL: 'PENDING',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
    ACTIVE: 'APPROVED',
    DEACTIVATED: 'APPROVED',
  };

  for (const [mongoStatus, approvalStatus] of Object.entries(statusMap)) {
    const result = await users.updateMany(
      { role: 'ADMIN', status: mongoStatus, approvalStatus: { $exists: false } },
      { $set: { approvalStatus, negotiatedPrice: null, negotiatedBy: null, submittedToSuperAdminAt: null, auditLog: [] } }
    );
    if (result.modifiedCount > 0) {
      console.log(`  Set approvalStatus=${approvalStatus} for ${result.modifiedCount} ADMIN users with status=${mongoStatus}`);
    }
  }

  // 2. Existing SALES_AGENT users — add registrationOtpVerified if missing
  await users.updateMany(
    { role: 'SALES_AGENT', registrationOtpVerified: { $exists: false } },
    { $set: { registrationOtpVerified: false } }
  );

  // 3. Existing SUPER_ADMIN users — add missing fields
  await users.updateMany(
    { role: 'SUPER_ADMIN' },
    { $set: { registrationOtpVerified: false, auditLog: [] } }
  );

  // 4. DIRECT registrations that are PENDING_APPROVAL — approvalStatus should be PENDING
  await users.updateMany(
    { role: 'ADMIN', status: 'PENDING_APPROVAL', registrationSource: 'DIRECT', approvalStatus: { $exists: false } },
    { $set: { approvalStatus: 'PENDING' } }
  );

  // 5. REFERRAL registrations that are PENDING_APPROVAL → migrate to PENDING_NEGOTIATION
  // (Only migrate if not already submitted/approved — legacy referral entries)
  const legacyReferrals = await users.updateMany(
    {
      role: 'ADMIN',
      registrationSource: 'REFERRAL',
      status: 'PENDING_APPROVAL',
      negotiatedPrice: null,
      submittedToSuperAdminAt: null,
    },
    { $set: { status: 'PENDING_NEGOTIATION', approvalStatus: 'NEGOTIATING' } }
  );
  if (legacyReferrals.modifiedCount > 0) {
    console.log(`  Migrated ${legacyReferrals.modifiedCount} legacy referral registrations to PENDING_NEGOTIATION`);
  }

  console.log('Migration 001 complete.');
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
