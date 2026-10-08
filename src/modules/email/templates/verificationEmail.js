// Builds the verification email sent to the FIXED inbox (never to the registrant).
const verificationEmailTemplate = (user, verifyLink) => {
  const subject = `Admin Account Verification Required — ${user.businessName || user.name}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto;">
      <h2>OKIEE — Admin Account Verification</h2>
      <p>A new Admin account has been approved and is awaiting email verification.</p>
      <table style="width:100%; border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding:4px 0;"><strong>Name:</strong></td><td>${user.name}</td></tr>
        <tr><td style="padding:4px 0;"><strong>Business:</strong></td><td>${user.businessName || '-'}</td></tr>
        <tr><td style="padding:4px 0;"><strong>Email:</strong></td><td>${user.email}</td></tr>
        <tr><td style="padding:4px 0;"><strong>Phone:</strong></td><td>${user.phone || '-'}</td></tr>
        <tr><td style="padding:4px 0;"><strong>Plan:</strong></td><td>${user.planType}</td></tr>
        <tr><td style="padding:4px 0;"><strong>Final Price:</strong></td><td>PKR ${user.finalPrice}</td></tr>
      </table>
      <p>Click the button below to verify and activate this account:</p>
      <p>
        <a href="${verifyLink}" style="background:#111827;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;">
          Verify Account
        </a>
      </p>
      <p style="color:#666; font-size: 12px;">This link expires in 24 hours. If the button doesn't work, copy this URL:<br/>${verifyLink}</p>
    </div>
  `;

  return { subject, html };
};

module.exports = verificationEmailTemplate;
