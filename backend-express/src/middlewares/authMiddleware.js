const jwt = require('jsonwebtoken');
const logger = require('../config/logger');
const { AUTH_COOKIE_NAME, JWT_SECRET } = require('../config/auth');

const authenticate = (req, res, next) => {
  const token = req.cookies?.[AUTH_COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

const authorize = (roles) => (req, res, next) => {

  try {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    logger.debug('Authorization check passed', { userId: req.user?.id, role: req.user?.role, allowedRoles: roles });

    next();
  } catch (e) {
    return res.status(500).json(e.error)
  }
};

module.exports = { authenticate, authorize };
