/**
 * Notification to Super Admin when Sales Agent submits final negotiated price.
 */
const negotiationSubmittedEmailTemplate = (registration, salesAgent) => {
  const subject = `Action Required — Sales Agent Submitted Final Price for ${registration.businessName || registration.name}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
      <div style="background: #111827; padding: 24px 32px;">
        <h1 style="color: #ffffff; margin: 0; font-size: 22px;">OKIEE</h1>
      </div>
      <div style="padding: 32px;">
        <h2 style="color: #111827; margin: 0 0 8px;">New Registration Awaiting Your Approval</h2>
        <p style="color: #6b7280;">Sales Agent <strong>${salesAgent.name}</strong> has finalized the price negotiation and submitted the following registration for your approval.</p>
        <table style="width:100%; border-collapse: collapse; margin: 16px 0; background: #f9fafb; border-radius: 6px; overflow: hidden;">
          <tr style="background: #f3f4f6;"><td style="padding:10px 12px;"><strong>Customer Name</strong></td><td style="padding:10px 12px;">${registration.name}</td></tr>
          <tr><td style="padding:10px 12px;"><strong>Business</strong></td><td style="padding:10px 12px;">${registration.businessName || '-'}</td></tr>
          <tr style="background: #f3f4f6;"><td style="padding:10px 12px;"><strong>Email</strong></td><td style="padding:10px 12px;">${registration.email}</td></tr>
          <tr><td style="padding:10px 12px;"><strong>Plan</strong></td><td style="padding:10px 12px;">${registration.planType}</td></tr>
          <tr style="background: #f3f4f6;"><td style="padding:10px 12px;"><strong>Standard Price</strong></td><td style="padding:10px 12px;">PKR ${registration.planPrice}</td></tr>
          <tr><td style="padding:10px 12px;"><strong>Negotiated Price</strong></td><td style="padding:10px 12px; color: #16a34a; font-weight: bold;">PKR ${registration.negotiatedPrice}</td></tr>
          <tr style="background: #f3f4f6;"><td style="padding:10px 12px;"><strong>Sales Agent</strong></td><td style="padding:10px 12px;">${salesAgent.name} (${salesAgent.email})</td></tr>
        </table>
        <p style="color: #6b7280;">Please log in to your dashboard to approve or reject this registration.</p>
      </div>
    </div>
  `;

  return { subject, html };
};

module.exports = negotiationSubmittedEmailTemplate;
