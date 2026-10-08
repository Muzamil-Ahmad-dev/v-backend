module.exports = {
  PENDING_APPROVAL:       'PENDING_APPROVAL',
  PENDING_NEGOTIATION:    'PENDING_NEGOTIATION',   // Assigned to sales agent, awaiting price
  NEGOTIATION_SUBMITTED:  'NEGOTIATION_SUBMITTED', // Sales agent submitted final price to superadmin
  PRICE_REJECTED:         'PRICE_REJECTED',        // Superadmin rejected price — sales agent must re-negotiate
  COUNTER_OFFER:          'COUNTER_OFFER',         // Superadmin sent a counter-offer / final approved price to admin
  APPROVED:               'APPROVED',
  REJECTED:               'REJECTED',              // Hard / permanent rejection
  ACTIVE:                 'ACTIVE',
  DEACTIVATED:            'DEACTIVATED',
};
