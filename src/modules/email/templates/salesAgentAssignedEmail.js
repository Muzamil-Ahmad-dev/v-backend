/**
 * Notification to Sales Agent when a referral registration is assigned to them.
 */
const salesAgentAssignedEmailTemplate = (salesAgent, registration) => {
  const subject = `New Referral Assigned — ${registration.businessName || registration.name}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
      <div style="background: #111827; padding: 24px 32px;">
        <h1 style="color: #ffffff; margin: 0; font-size: 22px;">OKIEE</h1>
      </div>
      <div style="padding: 32px;">
        <h2 style="color: #111827; margin: 0 0 8px;">New Referral Assigned to You</h2>
        <p style="color: #6b7280;">Hi <strong>${salesAgent.name}</strong>, a new registration has been assigned to you for price negotiation.</p>
        <table style="width:100%; border-collapse: collapse; margin: 16px 0; background: #f9fafb; border-radius: 6px; overflow: hidden;">
          <tr style="background: #f3f4f6;"><td style="padding:10px 12px;"><strong>Customer</strong></td><td style="padding:10px 12px;">${registration.name}</td></tr>
          <tr><td style="padding:10px 12px;"><strong>Business</strong></td><td style="padding:10px 12px;">${registration.businessName || '-'}</td></tr>
          <tr style="background: #f3f4f6;"><td style="padding:10px 12px;"><strong>Plan</strong></td><td style="padding:10px 12px;">${registration.planType}</td></tr>
          <tr><td style="padding:10px 12px;"><strong>Standard Price</strong></td><td style="padding:10px 12px;">PKR ${registration.planPrice}</td></tr>
        </table>
        <p style="color: #6b7280;">Please log in to negotiate the price and submit for Super Admin approval once finalized.</p>
      </div>
    </div>
  `;

  return { subject, html };
};

module.exports = salesAgentAssignedEmailTemplate;
