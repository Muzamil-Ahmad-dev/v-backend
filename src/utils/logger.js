const COLORS = { info: '\x1b[36m', warn: '\x1b[33m', error: '\x1b[31m' };
const RESET = '\x1b[0m';

const log = (level, message, meta) => {
  const timestamp = new Date().toISOString();
  const color = COLORS[level] || '';
  const prefix = `${color}[${timestamp}] [${level.toUpperCase()}]${RESET}`;
  if (meta !== undefined) {
    // eslint-disable-next-line no-console
    console.log(prefix, message, meta);
  } else {
    // eslint-disable-next-line no-console
    console.log(prefix, message);
  }
};

module.exports = {
  info: (msg, meta) => log('info', msg, meta),
  warn: (msg, meta) => log('warn', msg, meta),
  error: (msg, meta) => log('error', msg, meta),
};
