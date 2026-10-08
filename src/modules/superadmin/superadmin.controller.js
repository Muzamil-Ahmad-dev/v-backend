const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/ApiResponse');
const superadminService = require('./superadmin.service');

const listRegistrations = asyncHandler(async (req, res) => {
  const registrations = await superadminService.listRegistrations(req.query.status);
  res.status(200).json(new ApiResponse(200, registrations, 'Registrations fetched.'));
});

const getRegistration = asyncHandler(async (req, res) => {
  const registration = await superadminService.getRegistration(req.params.id);
  res.status(200).json(new ApiResponse(200, registration, 'Registration fetched.'));
});

const approveRegistration = asyncHandler(async (req, res) => {
  const registration = await superadminService.approveRegistration(
    req.params.id,
    req.user._id,
    req.body.finalPrice
  );
  res.status(200).json(new ApiResponse(200, registration, 'Registration approved.'));
});

/**
 * PATCH /api/superadmin/registrations/:id/reject-price
 * Body: { priceRejectionReason, superadminDesiredPrice }
 *
 * Rejects the negotiated price and sends the registration back to the sales agent.
 * This is NOT a hard rejection — the sales agent can re-negotiate and re-submit.
 */
const rejectPrice = asyncHandler(async (req, res) => {
  const registration = await superadminService.rejectPrice(
    req.params.id,
    req.user._id,
    {
      priceRejectionReason:   req.body.priceRejectionReason,
      superadminDesiredPrice: req.body.superadminDesiredPrice,
    }
  );
  res.status(200).json(new ApiResponse(200, registration, 'Price rejected. Sales agent has been notified to re-negotiate.'));
});

/**
 * PATCH /api/superadmin/registrations/:id/counter-offer
 * Body: { counterOfferPrice, counterOfferMessage }
 *
 * Sends the admin a final counter-offer price. The admin sees this on their next
 * login attempt and must contact their sales agent to proceed at the offered price.
 * This is NOT a rejection — the admin can still accept by going through the sales agent.
 */
const sendCounterOffer = asyncHandler(async (req, res) => {
  const registration = await superadminService.sendCounterOffer(
    req.params.id,
    req.user._id,
    {
      counterOfferPrice:   req.body.counterOfferPrice,
      counterOfferMessage: req.body.counterOfferMessage,
    }
  );
  res.status(200).json(new ApiResponse(200, registration, 'Counter-offer sent to admin. Sales agent has been notified.'));
});

/**
 * PATCH /api/superadmin/registrations/:id/reject
 * Body: { rejectionReason }
 *
 * Hard / permanent rejection. Use when the customer is not suitable regardless of price.
 */
const rejectRegistration = asyncHandler(async (req, res) => {
  const registration = await superadminService.rejectRegistration(
    req.params.id,
    req.user._id,
    req.body.rejectionReason
  );
  res.status(200).json(new ApiResponse(200, registration, 'Registration permanently rejected.'));
});

/**
 * GET /api/superadmin/negotiation-activity?salesAgentId=&status=
 *
 * Full negotiation history for all referred registrations.
 * Shows original price, each submitted price, rejection reasons, round count, and audit trail.
 */
const getNegotiationActivity = asyncHandler(async (req, res) => {
  const activity = await superadminService.getNegotiationActivity(req.query);
  res.status(200).json(new ApiResponse(200, activity, 'Negotiation activity fetched.'));
});

/**
 * GET /api/superadmin/admin-status-message/:adminId
 *
 * Returns the structured status banner message for a specific admin user.
 * Can be called by superadmin to preview what an admin sees on their login screen.
 */
const getAdminStatusMessage = asyncHandler(async (req, res) => {
  const message = await superadminService.getAdminStatusMessage(req.params.adminId);
  res.status(200).json(new ApiResponse(200, message, 'Admin status message fetched.'));
});

const listUsers = asyncHandler(async (req, res) => {
  const users = await superadminService.listUsers(req.query);
  res.status(200).json(new ApiResponse(200, users, 'Users fetched.'));
});

const toggleAdminStatus = asyncHandler(async (req, res) => {
  const user = await superadminService.toggleAdminStatus(req.params.id, req.body.action);
  res.status(200).json(new ApiResponse(200, user, `User ${req.body.action}d.`));
});

const createSalesAgent = asyncHandler(async (req, res) => {
  const agent = await superadminService.createSalesAgent(req.body);
  res.status(201).json(new ApiResponse(201, agent, 'Sales agent created.'));
});

const listSalesAgents = asyncHandler(async (req, res) => {
  const agents = await superadminService.listSalesAgents();
  res.status(200).json(new ApiResponse(200, agents, 'Sales agents fetched.'));
});

const listCommissions = asyncHandler(async (req, res) => {
  const commissions = await superadminService.listCommissions(req.query);
  res.status(200).json(new ApiResponse(200, commissions, 'Commissions fetched.'));
});

const getCommissionByAdmin = asyncHandler(async (req, res) => {
  const commission = await superadminService.getCommissionByAdmin(req.params.adminId);
  res.status(200).json(new ApiResponse(200, commission, 'Commission fetched.'));
});

const setCommission = asyncHandler(async (req, res) => {
  const commission = await superadminService.setCommission(req.params.id, req.body);
  res.status(200).json(new ApiResponse(200, commission, 'Commission updated.'));
});

const getAnalytics = asyncHandler(async (req, res) => {
  const analytics = await superadminService.getAnalytics();
  res.status(200).json(new ApiResponse(200, analytics, 'Analytics fetched.'));
});

const listAllBranches = asyncHandler(async (req, res) => {
  const branches = await superadminService.listAllBranches(req.query);
  res.status(200).json(new ApiResponse(200, branches, 'Branches fetched.'));
});

const getAuditLogs = asyncHandler(async (req, res) => {
  const result = await superadminService.getAuditLogs(req.query);
  res.status(200).json(new ApiResponse(200, result, 'Audit logs fetched.'));
});

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
  toggleAdminStatus,
  createSalesAgent,
  listSalesAgents,
  listCommissions,
  getCommissionByAdmin,
  setCommission,
  getAnalytics,
  listAllBranches,
  getAuditLogs,
};
