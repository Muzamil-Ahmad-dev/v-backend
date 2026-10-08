 const User = require('../../models/User');
const Commission = require('../../models/Commission');
const Notification = require('../../models/Notification');
const ROLES = require('../../constants/roles');
const STATUS = require('../../constants/status');
const ApiError = require('../../utils/ApiError');
const emailService = require('../email/email.service');
const negotiationSubmittedEmailTemplate = require('../email/templates/negotiationSubmittedEmail');
const { logAudit } = require('../../utils/auditHelper');

// ── Referrals ─────────────────────────────────────────────

const getReferrals = async (salesAgentId) =>
  User.find({ salesAgentId, role: ROLES.ADMIN })
    .select('name businessName email planType planPrice negotiatedPrice negotiationPrice superadminDesiredPrice priceRejectionReason negotiationRound approvalStatus status createdAt submittedToSuperAdminAt priceRejectedAt')
    .sort({ createdAt: -1 });

const getReferralStats = async (salesAgentId) => {
  const [totalReferrals, pendingNegotiation, priceRejected, submitted, approvedAdmins, rejectedAdmins] = await Promise.all([
    User.countDocuments({ salesAgentId, role: ROLES.ADMIN }),
    User.countDocuments({ salesAgentId, role: ROLES.ADMIN, status: STATUS.PENDING_NEGOTIATION }),
    User.countDocuments({ salesAgentId, role: ROLES.ADMIN, status: { $in: [STATUS.PRICE_REJECTED, STATUS.COUNTER_OFFER] } }),
    User.countDocuments({ salesAgentId, role: ROLES.ADMIN, status: STATUS.NEGOTIATION_SUBMITTED }),
    User.countDocuments({ salesAgentId, role: ROLES.ADMIN, status: { $in: [STATUS.APPROVED, STATUS.ACTIVE] } }),
    User.countDocuments({ salesAgentId, role: ROLES.ADMIN, status: STATUS.REJECTED }),
  ]);

  return { totalReferrals, pendingNegotiation, priceRejected, submitted, approvedAdmins, rejectedAdmins };
};

// ── Negotiation ───────────────────────────────────────────

/**
 * Sales Agent updates the negotiated price for a referral.
 *
 * Allowed statuses:
 *   PENDING_NEGOTIATION — first-time negotiation
 *   PRICE_REJECTED      — re-negotiation after superadmin rejected the price
 *   COUNTER_OFFER       — admin accepted the super admin's counter-offer price; agent re-submits
 *
 * Cannot re-negotiate once NEGOTIATION_SUBMITTED (already with superadmin).
 */
const updateNegotiatedPrice = async (salesAgentId, registrationId, { negotiatedPrice, note }) => {
  if (negotiatedPrice === undefined || negotiatedPrice === null) {
    throw new ApiError(400, 'negotiatedPrice is required.');
  }
  if (typeof negotiatedPrice !== 'number' || negotiatedPrice < 0) {
    throw new ApiError(400, 'negotiatedPrice must be a non-negative number.');
  }

  const registration = await User.findOne({ _id: registrationId, salesAgentId, role: ROLES.ADMIN });
  if (!registration) throw new ApiError(404, 'Referral registration not found.');

  if (registration.status === STATUS.NEGOTIATION_SUBMITTED) {
    throw new ApiError(400, 'Price has already been submitted to Super Admin and cannot be changed. Wait for a response.');
  }

  const allowedStatuses = [STATUS.PENDING_NEGOTIATION, STATUS.PENDING_APPROVAL, STATUS.PRICE_REJECTED, STATUS.COUNTER_OFFER];
  if (!allowedStatuses.includes(registration.status)) {
    throw new ApiError(400, `Cannot negotiate on a registration with status: ${registration.status}.`);
  }

  registration.negotiatedPrice = negotiatedPrice;
  registration.negotiatedBy    = salesAgentId;
  await registration.save();

  await logAudit({
    entityType:     'User',
    entityId:       registration._id,
    action:         'NEGOTIATION_UPDATED',
    performedBy:    salesAgentId,
    performedByRole:ROLES.SALES_AGENT,
    note:           note || '',
    metadata:       { negotiatedPrice, negotiationRound: registration.negotiationRound },
  });

  return registration;
};

/**
 * Sales Agent finalizes and submits to Super Admin.
 *
 * Works for both first-time submissions and re-submissions after PRICE_REJECTED.
 * A negotiated price must be set before calling this.
 */
const submitToSuperAdmin = async (salesAgentId, registrationId) => {
  const registration = await User.findOne({ _id: registrationId, salesAgentId, role: ROLES.ADMIN });
  if (!registration) throw new ApiError(404, 'Referral registration not found.');

  if (registration.status === STATUS.NEGOTIATION_SUBMITTED) {
    throw new ApiError(400, 'Already submitted to Super Admin.');
  }

  const allowedStatuses = [STATUS.PENDING_NEGOTIATION, STATUS.PENDING_APPROVAL, STATUS.PRICE_REJECTED, STATUS.COUNTER_OFFER];
  if (!allowedStatuses.includes(registration.status)) {
    throw new ApiError(400, `Cannot submit a registration with status: ${registration.status}.`);
  }

  if (!registration.negotiatedPrice) {
    throw new ApiError(400, 'Please set a negotiated price before submitting.');
  }

  const isResubmission = registration.status === STATUS.PRICE_REJECTED || registration.status === STATUS.COUNTER_OFFER;

  registration.status               = STATUS.NEGOTIATION_SUBMITTED;
  registration.approvalStatus       = 'SUBMITTED';
  registration.submittedToSuperAdminAt = new Date();
  await registration.save();

  await logAudit({
    entityType:     'User',
    entityId:       registration._id,
    action:         isResubmission ? 'RESUBMITTED_TO_SUPERADMIN' : 'SUBMITTED_TO_SUPERADMIN',
    performedBy:    salesAgentId,
    performedByRole:ROLES.SALES_AGENT,
    note:           isResubmission
      ? `Re-submission after price rejection (round ${registration.negotiationRound})`
      : 'Sales Agent submitted final price to Super Admin',
    metadata: {
      negotiatedPrice:  registration.negotiatedPrice,
      negotiationRound: registration.negotiationRound,
    },
  });

  // Notify Super Admin by email
  const salesAgent = await User.findById(salesAgentId).select('name email');
  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL || process.env.FIXED_VERIFICATION_EMAIL;
  if (superAdminEmail) {
    const { subject, html } = negotiationSubmittedEmailTemplate(registration, salesAgent);
    await emailService.sendEmail({ to: superAdminEmail, subject, html });
  }

  // Also create an in-app notification for superadmin if they have a user record
  // (optional: only if SUPER_ADMIN_USER_ID is set in env)
  if (process.env.SUPER_ADMIN_USER_ID) {
    await Notification.create({
      adminId:       process.env.SUPER_ADMIN_USER_ID,
      title:         isResubmission ? 'Re-Negotiated Price Submitted' : 'New Price Submitted for Approval',
      message:       `${salesAgent.name} has ${isResubmission ? 're-submitted a revised' : 'submitted a'} price of PKR ${registration.negotiatedPrice} for ${registration.businessName || registration.name}${isResubmission ? ` (negotiation round ${registration.negotiationRound})` : ''}.`,
      type:          'info',
      recipientRole: 'superadmin',
      relatedUserId: registration._id,
      metadata: {
        negotiatedPrice:  registration.negotiatedPrice,
        negotiationRound: registration.negotiationRound,
        isResubmission,
      },
    });
  }

  return registration;
};

// ── Commissions ───────────────────────────────────────────

const getCommissions = async (salesAgentId) => {
  const commissionHistory = await Commission.find({ salesAgent: salesAgentId })
    .populate('admin', 'name businessName email planType')
    .sort({ createdAt: -1 });

  const totalCommissionEarned = commissionHistory.reduce((sum, c) => sum + c.commissionAmount, 0);
  const pendingCommission     = commissionHistory.filter((c) => c.commissionStatus === 'PENDING').reduce((sum, c) => sum + c.commissionAmount, 0);
  const paidCommission        = commissionHistory.filter((c) => c.commissionStatus === 'PAID').reduce((sum, c) => sum + c.commissionAmount, 0);

  return { totalCommissionEarned, pendingCommission, paidCommission, commissionHistory };
};

// ── Admin login status message (for admin user) ───────────

/**
 * Returns the structured status banner that the admin user sees on login.
 * Call this from the admin's own profile/auth endpoint after login.
 */
const getMyStatusMessage = async (adminId) => {
  const user = await User.findById(adminId).select(
    'status approvalStatus rejectionReason priceRejectionReason superadminDesiredPrice negotiationRound planPrice negotiatedPrice'
  );
  if (!user) throw new ApiError(404, 'User not found.');

  const map = {
    [STATUS.PENDING_APPROVAL]: {
      type: 'info',
      title: 'Application Under Review',
      message: 'Your registration is currently being reviewed by our team. You will be notified once a decision is made.',
    },
    [STATUS.PENDING_NEGOTIATION]: {
      type: 'info',
      title: 'Price Being Prepared',
      message: 'Your assigned sales agent is preparing a price offer for you. You will be notified shortly.',
    },
    [STATUS.NEGOTIATION_SUBMITTED]: {
      type: 'info',
      title: 'Sent for Final Approval',
      message: 'Your registration has been submitted for final approval. Please wait while it is being reviewed.',
    },
    [STATUS.PRICE_REJECTED]: {
      type: 'warning',
      title: 'Price Under Re-Negotiation',
      message: `Your registration was reviewed but the submitted price was not accepted.${user.priceRejectionReason ? ` Reason: "${user.priceRejectionReason}".` : ''} ${user.superadminDesiredPrice ? `Required price: PKR ${user.superadminDesiredPrice}.` : ''} Your sales agent is working on a revised offer (round ${user.negotiationRound}).`,
      metadata: {
        priceRejectionReason:   user.priceRejectionReason,
        superadminDesiredPrice: user.superadminDesiredPrice,
        negotiationRound:       user.negotiationRound,
        yourSubmittedPrice:     user.negotiatedPrice,
      },
    },
    [STATUS.REJECTED]: {
      type: 'error',
      title: 'Registration Not Approved',
      message: `Your application was not approved.${user.rejectionReason ? ` Reason: "${user.rejectionReason}".` : ''} Please contact support for more information.`,
    },
    [STATUS.APPROVED]: {
      type: 'success',
      title: 'Registration Approved',
      message: 'Your registration has been approved! Please check your email to verify your account.',
    },
    [STATUS.ACTIVE]: {
      type: 'success',
      title: 'Account Active',
      message: 'Your account is active and fully operational.',
    },
  };

  return map[user.status] || { type: 'info', title: 'Status Unknown', message: 'Please contact support.' };
};

module.exports = {
  getReferrals,
  getReferralStats,
  updateNegotiatedPrice,
  submitToSuperAdmin,
  getCommissions,
  getMyStatusMessage,
};
