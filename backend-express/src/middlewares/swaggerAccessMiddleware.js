const { authenticate, authorize } = require('./authMiddleware');

const SWAGGER_MODE = (
  process.env.SWAGGER_MODE ||
  (process.env.NODE_ENV === 'production' ? 'admin' : 'public')
)
  .trim()
  .toLowerCase();

const swaggerAccess = (req, res, next) => {
  if (SWAGGER_MODE === 'disabled') {
    return res.status(404).json({ error: 'Not found' });
  }

  if (SWAGGER_MODE === 'public') {
    return next();
  }

  return authenticate(req, res, () => authorize(['admin'])(req, res, next));
};

module.exports = {
  SWAGGER_MODE,
  swaggerAccess,
};
