const normalizeUrl = (value) => {
  if (!value) {
    return '';
  }

  return value.trim().replace(/\/+$/, '');
};

const APP_ENV = (process.env.APP_ENV || process.env.NODE_ENV || 'development')
  .trim()
  .toLowerCase();
const PORT = Number(process.env.PORT) || 5000;
const LOCAL_BACKEND_URL = `http://localhost:${PORT}/api/express`;
const LOCAL_FRONTEND_URL = 'http://localhost:5173';
const BACKEND_BASE_URL = normalizeUrl(process.env.BACKEND_URL) || LOCAL_BACKEND_URL;
const FRONTEND_BASE_URL = normalizeUrl(process.env.FRONTEND_URL) || LOCAL_FRONTEND_URL;
const GOOGLE_REDIRECT_URI =
  normalizeUrl(process.env.GOOGLE_REDIRECT_URI) || `${BACKEND_BASE_URL}/google/callback`;

const getEnvironmentLabel = () => {
  switch (APP_ENV) {
    case 'production':
      return 'Production';
    case 'staging':
      return 'Staging';
    case 'development':
      return 'Development';
    default:
      return 'Current environment';
  }
};

const swaggerServers = [];

if (APP_ENV === 'development') {
  swaggerServers.push({
    url: LOCAL_BACKEND_URL,
    description: 'Development server',
  });
}

swaggerServers.push({
  url: BACKEND_BASE_URL,
  description: `${getEnvironmentLabel()} server`,
});

const SWAGGER_SERVERS = swaggerServers.filter(
  (server, index, servers) =>
    servers.findIndex((entry) => entry.url === server.url) === index
);

module.exports = {
  APP_ENV,
  PORT,
  BACKEND_BASE_URL,
  FRONTEND_BASE_URL,
  GOOGLE_REDIRECT_URI,
  SWAGGER_SERVERS,
};
