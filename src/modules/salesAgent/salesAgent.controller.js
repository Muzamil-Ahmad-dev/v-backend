const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const salesAgentService = require('./salesAgent.service');

const getReferrals = asyncHandler(async (req, res) => {
  const referrals = await salesAgentService.getReferrals(req.user._id);
  res.status(200).json(new ApiResponse(200, referrals, 'Referrals fetched.'));
});

const getReferralStats = asyncHandler(async (req, res) => {
  const stats = await salesAgentService.getReferralStats(req.user._id);
  res.status(200).json(new ApiResponse(200, stats, 'Referral stats fetched.'));
});

const updateNegotiatedPrice = asyncHandler(async (req, res) => {
  const registration = await salesAgentService.updateNegotiatedPrice(
    req.user._id,
    req.params.id,
    { negotiatedPrice: req.body.negotiatedPrice, note: req.body.note }
  );
  res.status(200).json(new ApiResponse(200, registration, 'Negotiated price updated.'));
});

const submitToSuperAdmin = asyncHandler(async (req, res) => {
  const registration = await salesAgentService.submitToSuperAdmin(req.user._id, req.params.id);
  res.status(200).json(new ApiResponse(200, registration, 'Registration submitted to Super Admin for approval.'));
});

const getCommissions = asyncHandler(async (req, res) => {
  const commissions = await salesAgentService.getCommissions(req.user._id);
  res.status(200).json(new ApiResponse(200, commissions, 'Commissions fetched.'));
});

/**
 * GET /api/sales-agent/me/status-message
 * Returns the status banner message for the currently authenticated admin user.
 * Called by the admin frontend on login to show the appropriate banner.
 */
const getMyStatusMessage = asyncHandler(async (req, res) => {
  const message = await salesAgentService.getMyStatusMessage(req.user._id);
  res.status(200).json(new ApiResponse(200, message, 'Status message fetched.'));
});

module.exports = {
  getReferrals,
  getReferralStats,
  updateNegotiatedPrice,
  submitToSuperAdmin,
  getCommissions,
  getMyStatusMessage,
};
