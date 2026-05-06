const express = require('express');
require('dotenv').config();
const bodyParser = require('body-parser');
const swaggerUi = require('swagger-ui-express');
const swaggerSpecs = require('./src/config/swagger.js');
const authRoutes = require('./src/routes/authRoutes.js');
const predictionRoutes = require('./src/routes/predictionRoutes.js');
const areaRoutes = require('./src/routes/areaRoutes.js');
const emailRoutes = require('./src/routes/emailRoutes.js');
const natureElementRoutes = require('./src/routes/natureElementRoutes.js');
const swaggerRoutes = require('./src/routes/swaggerRoutes.js');
const dbConfig = require('./src/config/config.js').development;
const jobRoutes = require('./src/routes/jobRoutes.js');
const mlModelRoutes = require('./src/routes/mlModelRoutes.js');
const googleAuthRoutes = require('./src/routes/googleAuthRoutes.js');
const sequelize = require('./src/config/db.js');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const requestLogger = require('./src/middlewares/requestLogger');
const { swaggerAccess } = require('./src/middlewares/swaggerAccessMiddleware');
const cron = require('node-cron');
const logger = require('./src/config/logger');
const { runMigrations } = require('./src/config/runMigrations');
const { populateLoginName } = require('./scripts/populate_login_name');
const stationZoneRoutes = require("./src/routes/stationZoneRoutes");
const { BACKEND_BASE_URL, PORT } = require('./src/config/publicUrls');

const app = express();
app.set('trust proxy', 1);

const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(requestLogger);
app.use("/api/express/station-zones", stationZoneRoutes);
// Init pg-boss for background jobs
const PgBoss = require('pg-boss');
const DB_USER = dbConfig.username || process.env.DB_USER || 'postgres';
const DB_PASSWORD = dbConfig.password || process.env.DB_PASSWORD || 'admin';
const DB_HOST = dbConfig.host || process.env.DB_HOST || 'localhost';
const DB_PORT = dbConfig.port || process.env.DB_PORT || 5432;
const DB_NAME = dbConfig.database || process.env.DB_NAME || 'ocean';
const DATABASE_URL = process.env.DATABASE_URL || `postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;
console.log(DATABASE_URL);
const boss = new PgBoss({
  connectionString: DATABASE_URL,
  schema: process.env.PGBOSS_SCHEMA || 'pgboss',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  // Tắt archive - job sẽ ở lại bảng job mãi mãi
});
(async () => {
  try {
    logger.info('Starting PgBoss...', {
      schema: process.env.PGBOSS_SCHEMA || 'pgboss',
      database: DB_NAME,
      host: DB_HOST
    });

    await boss.start();

    // Check if schema exists
    const sequelize = require('./src/config/db.js');
    const { QueryTypes } = require('sequelize');
    try {
      const schemaName = process.env.PGBOSS_SCHEMA || 'pgboss';
      const results = await sequelize.query(`
        SELECT schema_name 
        FROM information_schema.schemata 
        WHERE schema_name = :schemaName
      `, {
        replacements: { schemaName },
        type: QueryTypes.SELECT
      });

      if (results && results.length > 0) {
        logger.info(`Schema '${schemaName}' exists`);
      } else {
        logger.warn(`Schema '${schemaName}' not found in database`);
      }

      // Check job table
      const jobTable = await sequelize.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = :schemaName AND table_name = 'job'
      `, {
        replacements: { schemaName },
        type: QueryTypes.SELECT
      });

      if (jobTable && jobTable.length > 0) {
        logger.info(`Job table exists in schema '${schemaName}'`);
      } else {
        logger.warn(`Job table not found in schema '${schemaName}'`);
      }
    } catch (schemaError) {
      logger.error('Error checking schema', {
        message: schemaError.message,
        stack: schemaError.stack
      });
    }

    logger.info('PgBoss started successfully');
    app.set('boss', boss);
    require('./src/workers/importBoss')(boss);
    logger.info('Job workers registered');
  } catch (e) {
    logger.error('PgBoss start failed', {
      message: e.message,
      stack: e.stack
    });
  }
})();
const FLASK_API_URL = process.env.FLASK_API_URL;
const SECRET_KEY = process.env.FETCH_SECRET_KEY;
const axios = require('axios');
const TRIGGER_URL = `${FLASK_API_URL}/trigger_fetch`;

const triggerDataFetch = async () => {
  logger.info('Cron job triggered: Calling Flask API to fetch data...');
  if (!FLASK_API_URL || !SECRET_KEY) {
    logger.error('FLASK_API_URL or FETCH_SECRET_KEY is not defined in .env file.');
    return;
  }
  try {
    const response = await axios.post(TRIGGER_URL, {}, {
      headers: { 'X-FETCH-SECRET': SECRET_KEY },
      timeout: 10000,
    });
    logger.info('Request accepted by Flask server', { message: response.data.message });
  } catch (error) {
    logger.error('Error during cron job execution', { message: error.message });
  }
};

cron.schedule('0 0 * * *', triggerDataFetch, {
  scheduled: true,
  timezone: 'Asia/Ho_Chi_Minh',
});

app.get('/api/express/doc-specs', swaggerAccess, (req, res) => {
  res.json(swaggerSpecs);
});

// Swagger Documentation
app.use('/api/express/docs', swaggerAccess, swaggerUi.serve, swaggerUi.setup(swaggerSpecs, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Aquaculture Prediction System API',
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    docExpansion: 'none',
    filter: true,
    showRequestHeaders: true,
    tryItOutEnabled: true
  }
}));

// API Routes
app.use('/api/express/auth', authRoutes);
app.use('/api/express/predictions', predictionRoutes);
app.use('/api/express/areas', areaRoutes);
app.use('/api/express/emails', emailRoutes);
app.use('/api/express/nature-elements', natureElementRoutes);
app.use('/api/express', swaggerRoutes);
app.use('/api/express/jobs', jobRoutes);
app.use('/api/express/ml-models', mlModelRoutes);
app.use('/api/express/google', googleAuthRoutes);


// Chạy migrations và seeders khi khởi động server - ĐÃ TẮT
// (async () => {
//   try {
//     await runMigrations();

(async () => {
  await populateLoginName();
})();
//     sequelize.sync().then(() => {
//       app.listen(PORT, () => {
//         logger.info(`Server running on ${BACKEND_BASE_URL}`);
//         logger.info(`API Documentation available at ${BACKEND_BASE_URL}/docs`);
//       });
//     });
//   } catch (error) {
//     logger.error('Failed to run migrations:', error);
//     process.exit(1);
//   }
// })();

// Khởi động server với sync alter (tự động cập nhật schema theo model)
sequelize.sync({ alter: true }).then(() => {
  app.listen(PORT, () => {
    logger.info(`🚀 Server running on ${BACKEND_BASE_URL}`);
    logger.info(`📚 API Documentation available at ${BACKEND_BASE_URL}/docs`);
  });
});
