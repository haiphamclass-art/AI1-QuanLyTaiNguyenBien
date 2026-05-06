const AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME || 'auth_token';
const JWT_SECRET = process.env.JWT_SECRET || 'SECRET_KEY';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '10d';
const AUTH_COOKIE_MAX_AGE_MS = Number(process.env.AUTH_COOKIE_MAX_AGE_MS || 10 * 24 * 60 * 60 * 1000);

const isSecureRequest = (req) => {
  if (process.env.AUTH_COOKIE_SECURE === 'true') {
    return true;
  }

  if (process.env.AUTH_COOKIE_SECURE === 'false') {
    return false;
  }

  return req.secure || req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production';
};

const getCookieOptions = (req) => {
  const secure = isSecureRequest(req);

  return {
    httpOnly: true,
    secure,
    sameSite: process.env.AUTH_COOKIE_SAMESITE || 'lax',
    maxAge: AUTH_COOKIE_MAX_AGE_MS,
    path: process.env.AUTH_COOKIE_PATH || '/',
  };
};

const buildTokenPayload = (user) => ({
  id: user.id,
  name: user.username || user.name,
  username: user.username || user.name,
  role: user.role,
  province: user.province,
  district: user.district,
});

const buildUserResponse = (user) => ({
  id: user.id,
  username: user.username,
  email: user.email,
  role: user.role,
  status: user.status,
  address: user.address,
  phone: user.phone,
  province: user.province,
  district: user.district,
  login_name: user.login_name,
});

const setAuthCookie = (req, res, token) => {
  res.cookie(AUTH_COOKIE_NAME, token, getCookieOptions(req));
};

const clearAuthCookie = (req, res) => {
  res.clearCookie(AUTH_COOKIE_NAME, {
    ...getCookieOptions(req),
    maxAge: undefined,
  });
};

module.exports = {
  AUTH_COOKIE_NAME,
  JWT_SECRET,
  JWT_EXPIRES_IN,
  buildTokenPayload,
  buildUserResponse,
  setAuthCookie,
  clearAuthCookie,
};
