 const crypto = require('crypto');
const ApiError = require('../../utils/ApiError');
const generateToken = require('../../utils/generateToken');
const { generateOtp, OTP_EXPIRY_MS, OTP_EXPIRY_MINUTES } = require('../../utils/generateOtp');
const User = require('../../models/User');
const ShopOwner = require('../../models/ShopOwner');
const ROLES = require('../../constants/roles');
const STATUS = require('../../constants/status');
const PLANS = require('../../constants/plans');
const commissionService = require('../commission/commission.service');
const emailService = require('../email/email.service');
const otpEmailTemplate = require('../email/templates/otpEmail');
const salesAgentAssignedEmailTemplate = require('../email/templates/salesAgentAssignedEmail');
const { logAudit } = require('../../utils/auditHelper');

// ─────────────────────────────────────────────────────────
// Step 1: Send OTP to email before registration
// ─────────────────────────────────────────────────────────
const sendRegistrationOtp = async (email) => {
  if (!email || !email.trim()) throw new ApiError(400, 'Email is required.');

  const normalizedEmail = email.toLowerCase().trim();

  // Block if a fully active account already exists with this email
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing && existing.status === STATUS.ACTIVE) {
    throw new ApiError(409, 'An active account already exists with this email.');
  }

  // Block resend if OTP already verified — user should proceed to Step 3
  if (existing && existing.registrationOtpVerified) {
    throw new ApiError(400, 'Email already verified. Please complete your registration.');
  }

  // Allow re-sending OTP: reuse or create a minimal stub record
  let userStub = existing;
  if (!userStub) {
    // Create a placeholder so we can store the OTP against the email
    // password is a random value — user will set it after OTP verification
    userStub = new User({
      name: 'PENDING',
      email: normalizedEmail,
      password: crypto.randomBytes(16).toString('hex'),
      role: ROLES.ADMIN,
      status: STATUS.PENDING_APPROVAL,
      registrationOtpVerified: false,
    });
  }

  const { raw, hashed } = generateOtp();
  userStub.registrationOtp = hashed;
  userStub.registrationOtpExpiry = new Date(Date.now() + OTP_EXPIRY_MS);
  // NOTE: do NOT reset registrationOtpVerified here — only verifyRegistrationOtp sets it true
  await userStub.save();

  const { subject, html } = otpEmailTemplate(normalizedEmail, raw, OTP_EXPIRY_MINUTES);
  await emailService.sendEmail({ to: normalizedEmail, subject, html });

  await logAudit({
    entityType: 'User',
    entityId: userStub._id,
    action: 'OTP_SENT',
    note: `OTP sent to ${normalizedEmail}`,
  });

  return { message: `OTP sent to ${normalizedEmail}. Valid for ${OTP_EXPIRY_MINUTES} minutes.` };
};

// ─────────────────────────────────────────────────────────
// Step 2: Verify OTP
// ─────────────────────────────────────────────────────────
const verifyRegistrationOtp = async (email, otp) => {
  if (!email || !otp) throw new ApiError(400, 'Email and OTP are required.');

  const normalizedEmail = email.toLowerCase().trim();
  const hashed = crypto.createHash('sha256').update(String(otp)).digest('hex');

  const user = await User.findOne({ email: normalizedEmail })
    .select('+registrationOtp +registrationOtpExpiry');

  if (!user || user.registrationOtp !== hashed) {
    throw new ApiError(400, 'Invalid OTP.');
  }

  if (user.registrationOtpExpiry < new Date()) {
    throw new ApiError(400, 'OTP has expired. Please request a new one.');
  }

  user.registrationOtpVerified = true;
  user.registrationOtp = undefined;
  user.registrationOtpExpiry = undefined;
  await user.save();

  await logAudit({
    entityType: 'User',
    entityId: user._id,
    action: 'OTP_VERIFIED',
    note: `Email ${normalizedEmail} verified via OTP`,
  });

  return { message: 'Email verified successfully. You may now complete your registration.' };
};

// ─────────────────────────────────────────────────────────
// Step 3: Complete registration after OTP verification
// ─────────────────────────────────────────────────────────
const registerAdmin = async (payload) => {
  const {
    name,
    businessName,
    email,
    phone,
    password,
    confirmPassword,
    selectedPlan,
    negotiationPrice,
    negotiationReason,
    referralCode,
  } = payload;

  if (!name || !email || !phone || !password || !confirmPassword || !selectedPlan) {
    throw new ApiError(400, 'name, email, phone, password, confirmPassword and selectedPlan are required.');
  }

  if (password !== confirmPassword) {
    throw new ApiError(400, 'Password and confirmPassword do not match.');
  }

  if (!PLANS[selectedPlan]) {
    throw new ApiError(400, `Invalid selectedPlan. Must be one of: ${Object.keys(PLANS).join(', ')}`);
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Must have completed OTP verification first
  const existingStub = await User.findOne({ email: normalizedEmail });
  if (!existingStub || !existingStub.registrationOtpVerified) {
    throw new ApiError(400, 'Email OTP verification is required before completing registration.');
  }

  // Determine referral
  let salesAgentId = null;
  let registrationSource = 'DIRECT';
  let salesAgent = null;

  if (referralCode) {
    salesAgent = await User.findOne({ referralCode: referralCode.trim().toUpperCase(), role: ROLES.SALES_AGENT });
    if (salesAgent) {
      salesAgentId = salesAgent._id;
      registrationSource = 'REFERRAL';
    }
  }

  // Update the stub record with full registration data
  existingStub.name = name;
  existingStub.businessName = businessName || undefined;
  existingStub.phone = phone;
  existingStub.password = password; // pre-save hook will hash
  existingStub.role = ROLES.ADMIN;
  existingStub.planType = selectedPlan;
  existingStub.planPrice = PLANS[selectedPlan].price;
  existingStub.negotiationPrice = negotiationPrice || null;
  existingStub.negotiationReason = negotiationReason || null;
  existingStub.salesAgentId = salesAgentId;
  existingStub.referralCodeUsed = referralCode || null;
  existingStub.registrationSource = registrationSource;

  // Set approval flow based on registration source
  if (registrationSource === 'REFERRAL') {
    existingStub.status = STATUS.PENDING_NEGOTIATION;
    existingStub.approvalStatus = 'NEGOTIATING';
  } else {
    existingStub.status = STATUS.PENDING_APPROVAL;
    existingStub.approvalStatus = 'PENDING';
  }

  await existingStub.save();

  await logAudit({
    entityType: 'User',
    entityId: existingStub._id,
    action: 'REGISTRATION',
    performedBy: existingStub._id,
    note: `Registration completed. Source: ${registrationSource}`,
    metadata: { plan: selectedPlan, source: registrationSource },
  });

  // Notify sales agent if referred
  if (salesAgent) {
    const { subject, html } = salesAgentAssignedEmailTemplate(salesAgent, existingStub);
    await emailService.sendEmail({ to: salesAgent.email, subject, html });
  }

  return existingStub;
};

// ─────────────────────────────────────────────────────────
// Login — supports User + ShopOwner
// ─────────────────────────────────────────────────────────
const login = async (email, password) => {
  if (!email || !password) throw new ApiError(400, 'Email and password are required.');

  const normalizedEmail = email.toLowerCase().trim();

  // Try main User model first
  let user = await User.findOne({ email: normalizedEmail }).select('+password');
  let isShopOwner = false;

  if (!user) {
    // Try ShopOwner model
    const shopOwner = await ShopOwner.findOne({ email: normalizedEmail }).select('+password');
    if (shopOwner) {
      if (!(await shopOwner.comparePassword(password))) {
        throw new ApiError(401, 'Invalid email or password.');
      }
      if (shopOwner.status === 'DEACTIVATED') {
        throw new ApiError(403, 'Your account has been deactivated.');
      }
      const token = generateToken({ id: shopOwner._id, role: ROLES.SHOP_OWNER, isShopOwner: true });
      return { user: shopOwner.toSafeObject(), token, userType: 'SHOP_OWNER' };
    }
    throw new ApiError(401, 'Invalid email or password.');
  }

  if (!(await user.comparePassword(password))) {
    throw new ApiError(401, 'Invalid email or password.');
  }

   if (user.role === ROLES.ADMIN) {
    // Load sales agent details if the admin has a referral agent
    let salesAgent = null;
    if (user.salesAgentId) {
      salesAgent = await User.findById(user.salesAgentId).select('name phone');
    }

    const agentContact = salesAgent
      ? `your referral Sales Agent, ${salesAgent.name}${salesAgent.phone ? ` (${salesAgent.phone})` : ''}`
      : 'our support team';

    // Build a structured error payload for non-active statuses
    if (user.status === STATUS.DEACTIVATED) {
      throw new ApiError(
        403,
        'Your account has been deactivated. Please contact support for assistance.',
        [],
        null,
        {
          accountStatus: user.status,
          title: 'Account Deactivated',
        }
      );
    }

    if (user.status === STATUS.REJECTED) {
      const reason = user.rejectionReason
        ? `\n\nReason: ${user.rejectionReason}`
        : '';
      throw new ApiError(
        403,
        `Account Approval Declined\n\nYour account approval request has been declined.${reason}\n\nFor further assistance, please contact ${agentContact}.`,
        [],
        null,
        {
          accountStatus: user.status,
          title: 'Account Approval Declined',
          rejectionReason: user.rejectionReason || null,
          salesAgent: salesAgent ? { name: salesAgent.name, phone: salesAgent.phone } : null,
        }
      );
    }

    if (user.status === STATUS.PENDING_APPROVAL) {
      throw new ApiError(
        403,
        'Your account is currently under review by our team. You will receive a notification once a decision has been made. No action is required from you at this time.',
        [],
        null,
        {
          accountStatus: user.status,
          title: 'Account Under Review',
        }
      );
    }

    if (user.status === STATUS.PENDING_NEGOTIATION) {
      throw new ApiError(
        403,
        `Pricing Negotiation in Progress\n\nYour account is currently under pricing negotiation. ${agentContact.charAt(0).toUpperCase() + agentContact.slice(1)} has submitted your pricing request and is preparing a final offer for you.\n\nYou will be notified once the review is complete.`,
        [],
        null,
        {
          accountStatus: user.status,
          title: 'Pricing Negotiation in Progress',
          salesAgent: salesAgent ? { name: salesAgent.name, phone: salesAgent.phone } : null,
        }
      );
    }

    if (user.status === STATUS.NEGOTIATION_SUBMITTED) {
      throw new ApiError(
        403,
        `Awaiting Final Approval\n\nYour negotiated pricing has been forwarded to the Super Admin for final approval. Your account is currently under review.\n\nNo further action is required from you at this time. You will be notified once a decision has been made.`,
        [],
        null,
        {
          accountStatus: user.status,
          title: 'Awaiting Final Approval',
          salesAgent: salesAgent ? { name: salesAgent.name, phone: salesAgent.phone } : null,
        }
      );
    }

    if (user.status === STATUS.COUNTER_OFFER) {
      const requestedPrice = user.negotiatedPrice || user.negotiationPrice || null;
      const finalPrice     = user.counterOfferPrice;
      const superAdminMsg  = user.counterOfferMessage || null;

      throw new ApiError(
        403,
        `Pricing Update\n\nThe Super Admin has reviewed your pricing request but was unable to approve the requested amount.\n\nRequested Price: ${requestedPrice != null ? `$${requestedPrice}` : 'N/A'}\nFinal Approved Price: ${finalPrice != null ? `$${finalPrice}` : 'N/A'}${superAdminMsg ? `\nMessage from Super Admin: "${superAdminMsg}"` : ''}\n\nIf you wish to proceed with this pricing, please contact ${agentContact} to continue the approval process.`,
        [],
        null,
        {
          accountStatus:   user.status,
          title:           'Pricing Update',
          requestedPrice,
          counterOfferPrice: finalPrice,
          counterOfferMessage: superAdminMsg,
          salesAgent: salesAgent ? { name: salesAgent.name, phone: salesAgent.phone } : null,
        }
      );
    }

    if (user.status === STATUS.PRICE_REJECTED) {
      throw new ApiError(
        403,
        `Price Under Re-Negotiation\n\nYour pricing submission was reviewed but the requested price could not be approved. Your sales agent has been notified and is preparing a revised offer.${user.priceRejectionReason ? `\n\nReason: ${user.priceRejectionReason}` : ''}${user.superadminDesiredPrice ? `\nRequired Price: $${user.superadminDesiredPrice}` : ''}\n\nYou will be notified once a new pricing offer is submitted for review.`,
        [],
        null,
        {
          accountStatus:          user.status,
          title:                  'Price Under Re-Negotiation',
          priceRejectionReason:   user.priceRejectionReason || null,
          superadminDesiredPrice: user.superadminDesiredPrice || null,
          negotiationRound:       user.negotiationRound,
          salesAgent: salesAgent ? { name: salesAgent.name, phone: salesAgent.phone } : null,
        }
      );
    }

    if (user.status === STATUS.APPROVED) {
      throw new ApiError(
        403,
        'Your account has been approved. Please wait for the Software Owner to verify your email.',
        [],
        null,
        {
          accountStatus: user.status,
          title: 'Email Verification Required',
        }
      );
    }

    // ACTIVE but email not verified — edge case
    if (user.status === STATUS.ACTIVE && !user.emailVerified) {
      throw new ApiError(403, 'Your email address is not verified. Please check your inbox for the verification link.');
    }
  }

  const token = generateToken({ id: user._id, role: user.role });
  return { user: user.toSafeObject(), token, userType: user.role };
};

// ─────────────────────────────────────────────────────────
// Email verification (post-approval link)
// ─────────────────────────────────────────────────────────
const verifyEmail = async (rawToken) => {
  const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');

  const user = await User.findOne({
    verificationToken: hashedToken,
    verificationTokenExpiry: { $gt: Date.now() },
    status: STATUS.APPROVED,
  }).select('+verificationToken +verificationTokenExpiry');

  if (!user) throw new ApiError(400, 'Verification link is invalid or has expired.');

  user.emailVerified = true;
  user.status = STATUS.ACTIVE;
  user.approvalStatus = 'APPROVED';
  user.verificationToken = undefined;
  user.verificationTokenExpiry = undefined;
  await user.save();

  await commissionService.createCommissionStubForActivatedAdmin(user);

  await logAudit({
    entityType: 'User',
    entityId: user._id,
    action: 'ACCOUNT_ACTIVATED',
    note: 'Email verified — account activated',
  });

  return user;
};

// ─────────────────────────────────────────────────────────
// Validate referral code
// ─────────────────────────────────────────────────────────
const validateReferralCode = async (code) => {
  if (!code || !code.trim()) return { success: false, message: 'Referral code is required.' };

  const agent = await User.findOne({
    referralCode: code.trim().toUpperCase(),
    role: ROLES.SALES_AGENT,
   }).select('name referralCode status phone');

  if (!agent) return { success: false, message: 'Invalid referral code.' };

  return {
    success: true,
    salesAgent: { name: agent.name, referralCode: agent.referralCode, status: agent.status, phone: agent.phone },
  };
};

module.exports = {
  sendRegistrationOtp,
  verifyRegistrationOtp,
  registerAdmin,
  login,
  verifyEmail,
  validateReferralCode,
};