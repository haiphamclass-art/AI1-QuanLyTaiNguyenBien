const jwt = require('jsonwebtoken');
const logger = require('../config/logger');

const authenticate = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const decoded = jwt.verify(token, 'SECRET_KEY');
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
