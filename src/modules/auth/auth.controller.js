const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const authService = require('./auth.service');

// POST /api/auth/register/send-otp  — Step 1
const sendRegistrationOtp = asyncHandler(async (req, res) => {
  const result = await authService.sendRegistrationOtp(req.body.email);
  res.status(200).json(new ApiResponse(200, result, result.message));
});

// POST /api/auth/register/verify-otp  — Step 2
const verifyRegistrationOtp = asyncHandler(async (req, res) => {
  const result = await authService.verifyRegistrationOtp(req.body.email, req.body.otp);
  res.status(200).json(new ApiResponse(200, result, result.message));
});

// POST /api/auth/register  — Step 3 (after OTP verified)
const register = asyncHandler(async (req, res) => {
  const user = await authService.registerAdmin(req.body);
  res.status(201).json(
    new ApiResponse(201, { id: user._id, status: user.status, approvalStatus: user.approvalStatus },
      user.registrationSource === 'REFERRAL'
        ? 'Registration submitted. Your Sales Agent will negotiate the price and submit for approval.'
        : 'Registration request submitted. Awaiting Super Admin approval.')
  );
});

// POST /api/auth/login
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const { user, token, userType } = await authService.login(email, password);
  res.status(200).json(new ApiResponse(200, { user, token, userType }, 'Login successful.'));
});

function renderResultPage(success, message) {
  return `
    <html>
      <body style="font-family: Arial, sans-serif; text-align:center; padding-top:80px;">
        <h2 style="color:${success ? '#16a34a' : '#dc2626'};">${success ? 'Verification Successful' : 'Verification Failed'}</h2>
        <p>${message}</p>
      </body>
    </html>
  `;
}

// GET /api/auth/verify-email/:token
const verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.params;
  try {
    const user = await authService.verifyEmail(token);
    res.status(200).send(renderResultPage(true, `Account for ${user.email} has been verified and activated.`));
  } catch (err) {
    res.status(err.statusCode || 400).send(renderResultPage(false, err.message));
  }
});

// GET /api/auth/me
const getMe = asyncHandler(async (req, res) => {
  res.status(200).json(new ApiResponse(200, req.user.toSafeObject(), 'Current user fetched.'));
});

// GET /api/auth/validate-referral/:code
const validateReferralCode = asyncHandler(async (req, res) => {
  const result = await authService.validateReferralCode(req.params.code);
  res.status(200).json(result);
});

module.exports = { sendRegistrationOtp, verifyRegistrationOtp, register, login, verifyEmail, getMe, validateReferralCode };
