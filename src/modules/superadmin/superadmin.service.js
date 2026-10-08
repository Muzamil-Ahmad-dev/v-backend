 const User = require('../../models/User');
const Commission = require('../../models/Commission');
const Branch = require('../../models/Branch');
const ShopOwner = require('../../models/ShopOwner');
const AuditLog = require('../../models/AuditLog');
const Notification = require('../../models/Notification');
const ApiError = require('../../utils/ApiError');
const ROLES = require('../../constants/roles');
const STATUS = require('../../constants/status');
const generateReferralCode = require('../../utils/generateReferralCode');
const generateVerificationToken = require('../../utils/generateVerificationToken');
const emailService = require('../email/email.service');
const verificationEmailTemplate = require('../email/templates/verificationEmail');
const priceRejectedEmailTemplate = require('../email/templates/priceRejectedEmail');
const { logAudit } = require('../../utils/auditHelper');

const VERIFICATION_EXPIRY_MS = 24 * 60 * 60 * 1000;

// ── Registration list ──────────────────────────────────────

/**
 * List registrations.
 * - Default: returns PENDING_APPROVAL + NEGOTIATION_SUBMITTED
 * - Pass ?status= to filter by specific status
 */
const listRegistrations = async (status) => {
  const filter = { role: ROLES.ADMIN };
  if (status) {
    filter.status = status;
  } else {
    filter.status = { $in: [STATUS.PENDING_APPROVAL, STATUS.NEGOTIATION_SUBMITTED] };
  }
  return User.find(filter)
    .populate('salesAgentId', 'name email referralCode')
    .populate('negotiatedBy', 'name email')
    .sort({ createdAt: -1 });
};

const getRegistration = async (id) => {
  const user = await User.findOne({ _id: id, role: ROLES.ADMIN })
    .populate('salesAgentId', 'name email referralCode')
    .populate('negotiatedBy', 'name email')
    .populate('approvedBy', 'name email');
  if (!user) throw new ApiError(404, 'Registration not found.');
  return user;
};

// ── Approve ────────────────────────────────────────────────

/**
 * Super Admin approves a registration.
 * - DIRECT registrations: must be PENDING_APPROVAL
 * - REFERRAL registrations: must be NEGOTIATION_SUBMITTED
 * - Super Admin cannot override the negotiated price for referral registrations.
 */
const approveRegistration = async (id, approverId, finalPrice) => {
  const user = await User.findOne({ _id: id, role: ROLES.ADMIN });
  if (!user) throw new ApiError(404, 'Registration not found.');

  const allowedStatuses = [STATUS.PENDING_APPROVAL, STATUS.NEGOTIATION_SUBMITTED];
  if (!allowedStatuses.includes(user.status)) {
    throw new ApiError(400, `Cannot approve a registration with status: ${user.status}.`);
  }

  user.status = STATUS.APPROVED;
  user.approvalStatus = 'APPROVED';
  user.approvedBy = approverId;
  user.approvedAt = new Date();

  if (user.registrationSource === 'REFERRAL') {
    user.finalPrice = user.negotiatedPrice || user.negotiationPrice || user.planPrice;
  } else {
    user.finalPrice = finalPrice || user.negotiationPrice || user.planPrice;
  }

  const { rawToken, hashedToken } = generateVerificationToken();
  user.verificationToken = hashedToken;
  user.verificationTokenExpiry = new Date(Date.now() + VERIFICATION_EXPIRY_MS);

  await user.save();

  // Notify admin user of approval
  await Notification.create({
    adminId:       user._id,
    title:         'Registration Approved',
    message:       'Congratulations! Your registration has been approved. Please check your email to verify your account and get started.',
    type:          'success',
    recipientRole: 'admin',
    relatedUserId: user._id,
    metadata:      { finalPrice: user.finalPrice },
  });

  const baseUrl = process.env.BASE_URL || 'http://localhost:5000';
  const verifyLink = `${baseUrl}/api/auth/verify-email/${rawToken}`;
  const { subject, html } = verificationEmailTemplate(user, verifyLink);
  await emailService.sendEmail({ to: process.env.FIXED_VERIFICATION_EMAIL, subject, html });

  await logAudit({
    entityType:     'User',
    entityId:       user._id,
    action:         'APPROVED',
    performedBy:    approverId,
    performedByRole:ROLES.SUPER_ADMIN,
    note:           'Registration approved by Super Admin',
    metadata:       { finalPrice: user.finalPrice },
  });

  return user;
};

// ── Reject (price issue — re-negotiation loop) ─────────────

/**
 * Super Admin rejects a registration because the negotiated price is not acceptable.
 * This is NOT a hard rejection — the sales agent is notified to re-negotiate.
 *
 * Body: { priceRejectionReason, superadminDesiredPrice }
 *
 * Flow after this call:
 *   NEGOTIATION_SUBMITTED → PRICE_REJECTED → sales agent updates price → NEGOTIATION_SUBMITTED → ...
 */
const rejectPrice = async (id, approverId, { priceRejectionReason, superadminDesiredPrice }) => {
  const user = await User.findOne({ _id: id, role: ROLES.ADMIN });
  if (!user) throw new ApiError(404, 'Registration not found.');

  if (user.status !== STATUS.NEGOTIATION_SUBMITTED) {
    throw new ApiError(
      400,
      `Price rejection only applies to NEGOTIATION_SUBMITTED registrations. Current status: ${user.status}.`
    );
  }
  // Note: COUNTER_OFFER → re-submit by sales agent → back to NEGOTIATION_SUBMITTED before this can be called.

  if (!priceRejectionReason) {
    throw new ApiError(400, 'priceRejectionReason is required when rejecting a price.');
  }

  // Bump negotiation round counter
  user.negotiationRound = (user.negotiationRound || 0) + 1;

  user.status               = STATUS.PRICE_REJECTED;
  user.approvalStatus       = 'PRICE_REJECTED';
  user.priceRejectionReason = priceRejectionReason;
  user.superadminDesiredPrice = superadminDesiredPrice || null;
  user.priceRejectedAt      = new Date();

  await user.save();

  // ── Notify the admin user (shown as login banner) ────────
  await Notification.create({
    adminId:       user._id,
    title:         'Price Under Re-Negotiation',
    message:       `Your registration request was reviewed by the Super Admin. The submitted price was not accepted. Reason: "${priceRejectionReason}". Your sales agent is working on a revised offer.`,
    type:          'warning',
    recipientRole: 'admin',
    relatedUserId: user._id,
    metadata: {
      priceRejectionReason,
      superadminDesiredPrice: superadminDesiredPrice || null,
      negotiationRound: user.negotiationRound,
      submittedPrice: user.negotiatedPrice,
    },
  });

  // ── Notify the sales agent ───────────────────────────────
  if (user.salesAgentId) {
    await Notification.create({
      adminId:       user.salesAgentId,
      title:         'Price Rejected — Re-Negotiation Required',
      message:       `Super Admin rejected the price for ${user.businessName || user.name}. Reason: "${priceRejectionReason}". ${superadminDesiredPrice ? `Desired price: PKR ${superadminDesiredPrice}.` : ''} Please contact the customer and submit a revised price.`,
      type:          'error',
      recipientRole: 'sales_agent',
      relatedUserId: user._id,
      metadata: {
        priceRejectionReason,
        superadminDesiredPrice: superadminDesiredPrice || null,
        negotiationRound: user.negotiationRound,
        rejectedPrice: user.negotiatedPrice,
      },
    });

    // Send email to sales agent
    const salesAgent = await User.findById(user.salesAgentId).select('name email');
    if (salesAgent && salesAgent.email) {
      const { subject, html } = priceRejectedEmailTemplate(
        user,
        superadminDesiredPrice,
        priceRejectionReason,
        user.negotiationRound
      );
      await emailService.sendEmail({ to: salesAgent.email, subject, html });
    }
  }

  await logAudit({
    entityType:     'User',
    entityId:       user._id,
    action:         'PRICE_REJECTED',
    performedBy:    approverId,
    performedByRole:ROLES.SUPER_ADMIN,
    note:           priceRejectionReason,
    metadata: {
      rejectedPrice:          user.negotiatedPrice,
      superadminDesiredPrice: superadminDesiredPrice || null,
      negotiationRound:       user.negotiationRound,
    },
  });

  return user;
};

// ── Counter-Offer (direct pricing update to admin) ───────

/**
 * Super Admin sends a counter-offer price directly to the admin.
 * Use this when the Super Admin cannot approve the requested price but also
 * does not want to permanently reject the account. Instead, they send a
 * final approved price and an explanation message.
 *
 * The admin will see this on login and must contact their sales agent to proceed.
 *
 * Body: { counterOfferPrice, counterOfferMessage }
 * - counterOfferPrice   {Number} required — the final price the Super Admin is willing to approve
 * - counterOfferMessage {String} optional — explanation / note for the admin
 */
const sendCounterOffer = async (id, approverId, { counterOfferPrice, counterOfferMessage }) => {
  if (counterOfferPrice === undefined || counterOfferPrice === null) {
    throw new ApiError(400, 'counterOfferPrice is required.');
  }
  if (typeof counterOfferPrice !== 'number' || counterOfferPrice < 0) {
    throw new ApiError(400, 'counterOfferPrice must be a non-negative number.');
  }

  const user = await User.findOne({ _id: id, role: ROLES.ADMIN });
  if (!user) throw new ApiError(404, 'Registration not found.');

  const allowedStatuses = [STATUS.NEGOTIATION_SUBMITTED, STATUS.PRICE_REJECTED, STATUS.COUNTER_OFFER];
  if (!allowedStatuses.includes(user.status)) {
    throw new ApiError(
      400,
      `A counter-offer can only be sent for registrations with status: ${allowedStatuses.join(', ')}. Current status: ${user.status}.`
    );
  }

  const requestedPrice = user.negotiatedPrice || user.negotiationPrice || null;

  user.status              = STATUS.COUNTER_OFFER;
  user.approvalStatus      = 'COUNTER_OFFER';
  user.counterOfferPrice   = counterOfferPrice;
  user.counterOfferMessage = counterOfferMessage || null;
  user.counterOfferSentAt  = new Date();

  await user.save();

  // Notify the admin user — they will see this banner on their next login attempt
  await Notification.create({
    adminId:       user._id,
    title:         'Pricing Update from Super Admin',
    message:       `The Super Admin has reviewed your pricing request but was unable to approve the requested amount. Requested Price: $${requestedPrice != null ? requestedPrice : 'N/A'}. Final Approved Price: $${counterOfferPrice}.${counterOfferMessage ? ` Message: "${counterOfferMessage}"` : ''} Please contact your sales agent to proceed.`,
    type:          'warning',
    recipientRole: 'admin',
    relatedUserId: user._id,
    metadata: {
      requestedPrice,
      counterOfferPrice,
      counterOfferMessage: counterOfferMessage || null,
    },
  });

  // Notify the sales agent so they can follow up with the admin
  if (user.salesAgentId) {
    const salesAgent = await User.findById(user.salesAgentId).select('name email');
    await Notification.create({
      adminId:       user.salesAgentId,
      title:         'Counter-Offer Sent to Admin — Action Required',
      message:       `The Super Admin has sent a counter-offer of $${counterOfferPrice} for ${user.businessName || user.name}.${counterOfferMessage ? ` Super Admin message: "${counterOfferMessage}"` : ''} Please contact the admin to confirm whether they wish to proceed at this price.`,
      type:          'info',
      recipientRole: 'sales_agent',
      relatedUserId: user._id,
      metadata: {
        requestedPrice,
        counterOfferPrice,
        counterOfferMessage: counterOfferMessage || null,
      },
    });
  }

  await logAudit({
    entityType:     'User',
    entityId:       user._id,
    action:         'COUNTER_OFFER_SENT',
    performedBy:    approverId,
    performedByRole:ROLES.SUPER_ADMIN,
    note:           `Counter-offer of $${counterOfferPrice} sent to admin${counterOfferMessage ? `: "${counterOfferMessage}"` : ''}`,
    metadata: {
      requestedPrice,
      counterOfferPrice,
      counterOfferMessage: counterOfferMessage || null,
    },
  });

  return user;
};

// ── Hard Reject (permanent) ────────────────────────────────

/**
 * Permanently rejects a registration (not price-related).
 * Use this when the customer is not suitable regardless of price.
 */
const rejectRegistration = async (id, approverId, rejectionReason) => {
  const user = await User.findOne({ _id: id, role: ROLES.ADMIN });
  if (!user) throw new ApiError(404, 'Registration not found.');

  const allowedStatuses = [
    STATUS.PENDING_APPROVAL,
    STATUS.NEGOTIATION_SUBMITTED,
    STATUS.PENDING_NEGOTIATION,
    STATUS.PRICE_REJECTED,
  ];
  if (!allowedStatuses.includes(user.status)) {
    throw new ApiError(400, `Cannot reject a registration with status: ${user.status}.`);
  }

  user.status         = STATUS.REJECTED;
  user.approvalStatus = 'REJECTED';
  user.rejectedAt     = new Date();
  user.rejectionReason= rejectionReason || null;

  await user.save();

  // Notify the admin user of the hard rejection
  await Notification.create({
    adminId:       user._id,
    title:         'Registration Not Approved',
    message:       `Your registration request has been reviewed and was not approved.${rejectionReason ? ` Reason: "${rejectionReason}".` : ''} Please contact support for more information.`,
    type:          'error',
    recipientRole: 'admin',
    relatedUserId: user._id,
    metadata:      { rejectionReason: rejectionReason || null },
  });

  await logAudit({
    entityType:     'User',
    entityId:       user._id,
    action:         'REJECTED',
    performedBy:    approverId,
    performedByRole:ROLES.SUPER_ADMIN,
    note:           rejectionReason || 'Hard rejected by Super Admin',
  });

  return user;
};

// ── Negotiation activity dashboard ────────────────────────

/**
 * Returns full negotiation history for all referred registrations.
 * Superadmin uses this to see who negotiated what, across how many rounds.
 */
const getNegotiationActivity = async ({ salesAgentId, status } = {}) => {
  const filter = { role: ROLES.ADMIN, registrationSource: 'REFERRAL' };
  if (salesAgentId) filter.salesAgentId = salesAgentId;
  if (status) filter.status = status;

  const registrations = await User.find(filter)
    .select('name businessName email planType planPrice negotiationPrice negotiatedPrice superadminDesiredPrice negotiationRound status approvalStatus priceRejectionReason priceRejectedAt submittedToSuperAdminAt createdAt negotiationReason')
    .populate('salesAgentId', 'name email referralCode')
    .populate('negotiatedBy', 'name email')
    .sort({ updatedAt: -1 });

  // Attach audit trail for each registration (price history across rounds)
  const enriched = await Promise.all(
    registrations.map(async (reg) => {
      const priceHistory = await AuditLog.find({
        entityId:  reg._id,
        entityType:'User',
        action:    { $in: ['NEGOTIATION_UPDATED', 'SUBMITTED_TO_SUPERADMIN', 'PRICE_REJECTED'] },
      })
        .select('action note metadata createdAt performedByRole')
        .sort({ createdAt: 1 });

      return { ...reg.toObject(), priceHistory };
    })
  );

  return enriched;
};

// ── Admin login status message ─────────────────────────────

/**
 * Returns a structured status banner message for the admin user on login.
 * Frontend shows this as a persistent banner until the user dismisses/reads it.
 */
const getAdminStatusMessage = async (adminId) => {
  const user = await User.findById(adminId).select(
    'status approvalStatus rejectionReason priceRejectionReason superadminDesiredPrice negotiationRound planPrice negotiatedPrice'
  );
  if (!user) throw new ApiError(404, 'User not found.');

  const messages = {
    [STATUS.PENDING_APPROVAL]: {
      type:    'info',
      title:   'Application Under Review',
      message: 'Your registration is currently being reviewed by our team. You will be notified once a decision is made.',
    },
    [STATUS.PENDING_NEGOTIATION]: {
      type:    'info',
      title:   'Price Being Prepared',
      message: 'Your assigned sales agent is preparing a price offer for you. You will be notified shortly.',
    },
    [STATUS.NEGOTIATION_SUBMITTED]: {
      type:    'info',
      title:   'Sent for Final Approval',
      message: 'Your registration has been submitted for final approval by the Super Admin. Please wait while it is reviewed.',
    },
    [STATUS.PRICE_REJECTED]: {
      type:    'warning',
      title:   'Price Under Re-Negotiation',
      message: `Your registration was reviewed but the submitted price was not accepted.${user.priceRejectionReason ? ` Reason: "${user.priceRejectionReason}".` : ''} ${user.superadminDesiredPrice ? `The required price is PKR ${user.superadminDesiredPrice}.` : ''} Your sales agent is working on a revised offer. This is negotiation round ${user.negotiationRound}.`,
      metadata: {
        priceRejectionReason:   user.priceRejectionReason,
        superadminDesiredPrice: user.superadminDesiredPrice,
        negotiationRound:       user.negotiationRound,
        yourSubmittedPrice:     user.negotiatedPrice,
      },
    },
    [STATUS.REJECTED]: {
      type:    'error',
      title:   'Registration Not Approved',
      message: `Your application was reviewed and was not approved.${user.rejectionReason ? ` Reason: "${user.rejectionReason}".` : ''} Please contact support for more information.`,
    },
    [STATUS.APPROVED]: {
      type:    'success',
      title:   'Registration Approved',
      message: 'Your registration has been approved! Please check your email to verify your account and activate your subscription.',
    },
    [STATUS.ACTIVE]: {
      type:    'success',
      title:   'Account Active',
      message: 'Your account is active and fully operational.',
    },
  };

  return messages[user.status] || { type: 'info', title: 'Status Unknown', message: 'Please contact support.' };
};

// ── User management ────────────────────────────────────────

const listUsers = async ({ role, status }) => {
  const filter = {};
  if (role)   filter.role = role;
  if (status) filter.status = status;
  return User.find(filter).populate('salesAgentId', 'name email referralCode').sort({ createdAt: -1 });
};

const createSalesAgent = async ({ name, email, phone, password }) => {
  if (!name || !email || !phone || !password) {
    throw new ApiError(400, 'name, email, phone and password are required.');
  }

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) throw new ApiError(409, 'An account with this email already exists.');

  const referralCode = await generateReferralCode();

  const agent = await User.create({
    name,
    email: email.toLowerCase(),
    phone,
    password,
    role:          ROLES.SALES_AGENT,
    status:        STATUS.ACTIVE,
    emailVerified: true,
    referralCode,
  });

  await logAudit({
    entityType:     'User',
    entityId:       agent._id,
    action:         'SALES_AGENT_CREATED',
    performedByRole:ROLES.SUPER_ADMIN,
    note:           `Sales Agent ${name} created`,
  });

  return agent.toSafeObject();
};

const listSalesAgents = async () => User.find({ role: ROLES.SALES_AGENT }).sort({ createdAt: -1 });

// ── Commissions ────────────────────────────────────────────

const listCommissions = async ({ salesAgentId, status }) => {
  const filter = {};
  if (salesAgentId)    filter.salesAgent = salesAgentId;
  if (status) filter.commissionStatus = status;
  return Commission.find(filter)
    .populate('salesAgent', 'name email referralCode')
    .populate('admin', 'name businessName email planType')
    .sort({ createdAt: -1 });
};

const setCommission = async (id, { commissionAmount, commissionStatus }) => {
  const commission = await Commission.findById(id);
  if (!commission) throw new ApiError(404, 'Commission not found.');

  if (commissionAmount !== undefined) {
    if (typeof commissionAmount !== 'number' || commissionAmount < 0) {
      throw new ApiError(400, 'commissionAmount must be a non-negative number.');
    }
    commission.commissionAmount = commissionAmount;
  }

  if (commissionStatus) {
    const allowed = ['PENDING', 'PAID'];
    if (!allowed.includes(commissionStatus)) {
      throw new ApiError(400, `commissionStatus must be one of: ${allowed.join(', ')}.`);
    }
    commission.commissionStatus = commissionStatus;
    if (commissionStatus === 'PAID' && !commission.paidAt) commission.paidAt = new Date();
  }

  await commission.save();
  return commission;
};

const getCommissionByAdmin = async (adminId) => {
  const commission = await Commission.findOne({ admin: adminId })
    .populate('salesAgent', 'name email referralCode')
    .populate('admin', 'name businessName email planType');
  if (!commission) throw new ApiError(404, 'No commission record found for this admin.');
  return commission;
};

// ── Analytics ──────────────────────────────────────────────

const getAnalytics = async () => {
  const [
    totalAdmins,
    activeAdmins,
    pendingApprovals,
    pendingNegotiation,
    negotiationSubmitted,
    priceRejected,
    rejectedAdmins,
    totalSalesAgents,
    totalBranches,
    totalShopOwners,
    planBreakdown,
    commissionBreakdown,
  ] = await Promise.all([
    User.countDocuments({ role: ROLES.ADMIN }),
    User.countDocuments({ role: ROLES.ADMIN, status: STATUS.ACTIVE }),
    User.countDocuments({ role: ROLES.ADMIN, status: STATUS.PENDING_APPROVAL }),
    User.countDocuments({ role: ROLES.ADMIN, status: STATUS.PENDING_NEGOTIATION }),
    User.countDocuments({ role: ROLES.ADMIN, status: STATUS.NEGOTIATION_SUBMITTED }),
    User.countDocuments({ role: ROLES.ADMIN, status: STATUS.PRICE_REJECTED }),
    User.countDocuments({ role: ROLES.ADMIN, status: STATUS.REJECTED }),
    User.countDocuments({ role: ROLES.SALES_AGENT }),
    Branch.countDocuments(),
    ShopOwner.countDocuments(),
    User.aggregate([
      { $match: { role: ROLES.ADMIN, status: STATUS.ACTIVE } },
      { $group: { _id: '$planType', count: { $sum: 1 }, revenue: { $sum: '$finalPrice' } } },
    ]),
    Commission.aggregate([
      { $group: { _id: '$commissionStatus', total: { $sum: '$commissionAmount' }, count: { $sum: 1 } } },
    ]),
  ]);

  return {
    totalAdmins, activeAdmins,
    pendingApprovals, pendingNegotiation, negotiationSubmitted,
    priceRejected,
    rejectedAdmins, totalSalesAgents, totalBranches, totalShopOwners,
    planBreakdown, commissionBreakdown,
  };
};

const toggleAdminStatus = async (id, action) => {
  if (!['activate', 'deactivate'].includes(action)) {
    throw new ApiError(400, 'action must be either "activate" or "deactivate".');
  }

  const user = await User.findOne({ _id: id, role: ROLES.ADMIN });
  if (!user) throw new ApiError(404, 'Admin user not found.');

  if (action === 'deactivate') {
    if (user.status !== STATUS.ACTIVE) throw new ApiError(400, `Cannot deactivate a user with status ${user.status}.`);
    user.status = STATUS.DEACTIVATED;
  } else {
    if (user.status !== STATUS.DEACTIVATED) throw new ApiError(400, `Cannot activate a user with status ${user.status}.`);
    user.status = STATUS.ACTIVE;
  }

  await user.save();

  await logAudit({
    entityType:     'User',
    entityId:       user._id,
    action:         action === 'deactivate' ? 'ACCOUNT_DEACTIVATED' : 'ACCOUNT_ACTIVATED',
    performedByRole:ROLES.SUPER_ADMIN,
  });

  return user;
};

// ── Branch management ──────────────────────────────────────

const listAllBranches = async ({ adminId } = {}) => {
  const filter = {};
  if (adminId) filter.adminId = adminId;
  return Branch.find(filter).populate('adminId', 'name businessName email').sort({ createdAt: -1 });
};

// ── Audit Logs ─────────────────────────────────────────────

const getAuditLogs = async ({ entityId, entityType, action, page = 1, limit = 50 }) => {
  const filter = {};
  if (entityId)   filter.entityId = entityId;
  if (entityType) filter.entityType = entityType;
  if (action)     filter.action = action;

  const skip = (Number(page) - 1) * Number(limit);
  const [logs, total] = await Promise.all([
    AuditLog.find(filter)
      .populate('performedBy', 'name email role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    AuditLog.countDocuments(filter),
  ]);

  return { logs, pagination: { total, page: Number(page), pages: Math.ceil(total / limit) } };
};

module.exports = {
  listRegistrations,
  getRegistration,
  approveRegistration,
  rejectPrice,
  sendCounterOffer,
  rejectRegistration,
  getNegotiationActivity,
  getAdminStatusMessage,
  listUsers,
  createSalesAgent,
  listSalesAgents,
  listCommissions,
  setCommission,
  getCommissionByAdmin,
  getAnalytics,
  toggleAdminStatus,
  listAllBranches,
  getAuditLogs,
};