const logger = require('../config/logger');

const formatDuration = (hrtime) => {
  const [seconds, nanoseconds] = hrtime;
  const durationMs = seconds * 1000 + nanoseconds / 1e6;
  return Number(durationMs.toFixed(2));
};

const buildMessage = ({ status, method, url, durationMs }) =>
  `${status} ${method} ${url} +${durationMs}ms`;

const logByStatus = ({ status, message, meta }) => {
  if (status >= 500) {
    logger.error(`[HTTP] ${message}`, meta);
  } else if (status >= 400) {
    logger.error(`[HTTP] ${message}`, meta);
  } else if (status >= 300) {
    logger.info(`[HTTP] ${message}`, { ...meta, level: 'redirect' });
  } else {
    logger.info(`[HTTP] ${message}`, { ...meta, level: 'success' });
  }
};

module.exports = function requestLogger(req, res, next) {
  const start = process.hrtime();
  const { method, originalUrl } = req;

  const baseMeta = {
    ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
    user_agent: req.headers['user-agent'],
  };

  res.on('finish', () => {
    const durationMs = formatDuration(process.hrtime(start));
    const status = res.statusCode;
    const message = buildMessage({ status, method, url: originalUrl, durationMs });
    const meta = {
      ...baseMeta,
      status,
      method,
      url: originalUrl,
      duration_ms: durationMs,
      content_length: res.get('content-length') || 0,
    };
    logByStatus({ status, message, meta });
  });

  res.on('error', (error) => {
    const durationMs = formatDuration(process.hrtime(start));
    const status = res.statusCode || 500;
    const message = buildMessage({ status, method, url: originalUrl, durationMs });
    logger.error(`[HTTP] ${message}`, {
      ...baseMeta,
      status,
      method,
      url: originalUrl,
      duration_ms: durationMs,
      error: error.message,
      stack: error.stack,
    });
  });

  next();
};

