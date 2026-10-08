const nodemailer = require('nodemailer');
const logger = require('../../utils/logger');

let transporter = null;

const getTransporter = () => {
  if (transporter) return transporter;

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    logger.warn('SMTP not configured — emails will be logged to console instead of sent.');
    return null;
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return transporter;
};

const sendEmail = async ({ to, subject, html }) => {
  const t = getTransporter();

  if (!t) {
    logger.info('--- EMAIL (console fallback — SMTP not configured) ---');
    logger.info(`To: ${to}`);
    logger.info(`Subject: ${subject}`);
    logger.info(html);
    logger.info('--- END EMAIL ---');
    return { delivered: false, fallback: true };
  }

  await t.sendMail({
    from: `"${process.env.SMTP_FROM_NAME || 'OKIEE'}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
    to,
    subject,
    html,
  });

  return { delivered: true, fallback: false };
};

module.exports = { sendEmail };
