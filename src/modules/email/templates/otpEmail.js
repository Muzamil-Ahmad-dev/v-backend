/**
 * OTP email sent to the registering user's email address during Step 2 of registration.
 */
const otpEmailTemplate = (email, otp, expiryMinutes) => {
  const subject = 'OKIEE — Your Email Verification OTP';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
      <div style="background: #111827; padding: 24px 32px;">
        <h1 style="color: #ffffff; margin: 0; font-size: 22px;">OKIEE</h1>
      </div>
      <div style="padding: 32px;">
        <h2 style="margin: 0 0 8px; color: #111827;">Verify Your Email Address</h2>
        <p style="color: #6b7280; margin: 0 0 24px;">Use the one-time password below to verify <strong>${email}</strong>. It expires in ${expiryMinutes} minutes.</p>
        <div style="background: #f3f4f6; border-radius: 8px; padding: 24px; text-align: center; margin-bottom: 24px;">
          <span style="font-size: 40px; font-weight: 700; letter-spacing: 12px; color: #111827;">${otp}</span>
        </div>
        <p style="color: #9ca3af; font-size: 13px; margin: 0;">If you did not request this, please ignore this email. Do not share this OTP with anyone.</p>
      </div>
    </div>
  `;

  return { subject, html };
};

module.exports = otpEmailTemplate;
