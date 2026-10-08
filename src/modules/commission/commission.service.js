const Commission = require('../../models/Commission');

// Called when a referred Admin's account becomes ACTIVE.
// Creates a commission stub (amount = 0, status PENDING).
// Super Admin will later set the actual commissionAmount via PATCH /api/superadmin/commissions/:id
const createCommissionStubForActivatedAdmin = async (user) => {
  if (user.registrationSource !== 'REFERRAL' || !user.salesAgentId) return null;

  const existing = await Commission.findOne({ admin: user._id });
  if (existing) return existing;

  const commission = await Commission.create({
    salesAgent: user.salesAgentId,
    admin: user._id,
    planType: user.planType,
    commissionAmount: 0,
    commissionStatus: 'PENDING',
  });

  return commission;
};

module.exports = { createCommissionStubForActivatedAdmin };
