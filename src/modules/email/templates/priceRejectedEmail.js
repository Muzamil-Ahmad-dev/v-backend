/**
 * Email to Sales Agent when Superadmin rejects a negotiated price.
 * Tells the agent the reason, the superadmin's desired price, and asks them to re-negotiate.
 */
const priceRejectedEmailTemplate = (registration, superadminDesiredPrice, priceRejectionReason, negotiationRound) => {
  const subject = `Action Required — Price Rejected for ${registration.businessName || registration.name} (Round ${negotiationRound})`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
      <div style="background: #111827; padding: 24px 32px;">
        <h1 style="color: #ffffff; margin: 0; font-size: 22px;">OKIEE</h1>
      </div>
      <div style="padding: 32px;">
        <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 12px 16px; margin-bottom: 20px;">
          <p style="color: #b91c1c; margin: 0; font-weight: bold;">⚠ Price Rejected — Re-Negotiation Required (Round ${negotiationRound})</p>
        </div>
        <p style="color: #374151;">The Super Admin has reviewed your submitted price for the following registration and requires a revised price.</p>
        <table style="width:100%; border-collapse: collapse; margin: 16px 0; background: #f9fafb; border-radius: 6px; overflow: hidden;">
          <tr style="background: #f3f4f6;"><td style="padding:10px 12px;"><strong>Customer Name</strong></td><td style="padding:10px 12px;">${registration.name}</td></tr>
          <tr><td style="padding:10px 12px;"><strong>Business</strong></td><td style="padding:10px 12px;">${registration.businessName || '-'}</td></tr>
          <tr style="background: #f3f4f6;"><td style="padding:10px 12px;"><strong>Plan</strong></td><td style="padding:10px 12px;">${registration.planType}</td></tr>
          <tr><td style="padding:10px 12px;"><strong>Standard Price</strong></td><td style="padding:10px 12px;">PKR ${registration.planPrice}</td></tr>
          <tr style="background: #f3f4f6;"><td style="padding:10px 12px;"><strong>Your Submitted Price</strong></td><td style="padding:10px 12px; color: #dc2626;">PKR ${registration.negotiatedPrice}</td></tr>
          <tr><td style="padding:10px 12px;"><strong>Super Admin Wants</strong></td><td style="padding:10px 12px; color: #16a34a; font-weight: bold;">PKR ${superadminDesiredPrice || 'Not specified'}</td></tr>
        </table>
        <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 12px 16px; margin-bottom: 20px;">
          <p style="color: #92400e; margin: 0;"><strong>Rejection Reason:</strong> ${priceRejectionReason || 'No specific reason provided.'}</p>
        </div>
        <p style="color: #6b7280;">Please contact the customer to discuss a revised price and re-submit through your dashboard.</p>
      </div>
    </div>
  `;

  return { subject, html };
};

module.exports = priceRejectedEmailTemplate;
