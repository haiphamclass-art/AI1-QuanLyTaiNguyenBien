const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Define log format
const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
);

// Define logger format (for development)
const loggerFormat = winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        let msg = `${timestamp} [${level}]: ${message}`;
        if (Object.keys(meta).length > 0 && meta.stack) {
            msg += `\n${meta.stack}`;
        } else if (Object.keys(meta).length > 0) {
            msg += ` ${JSON.stringify(meta)}`;
        }
        return msg;
    })
);

// Create logger
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: logFormat,
    defaultMeta: { service: 'backend-express' },
    transports: [
        // Write all logs to app.log with daily rotation and 20MB max size
        new DailyRotateFile({
            filename: path.join(logsDir, 'app-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            maxSize: '20m', // 20MB
            maxFiles: '14d', // Keep logs for 14 days
            zippedArchive: true,
            format: logFormat
        }),
        // Write errors to error.log
        new DailyRotateFile({
            filename: path.join(logsDir, 'error-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            level: 'error',
            maxSize: '20m', // 20MB
            maxFiles: '14d', // Keep logs for 14 days
            zippedArchive: true,
            format: logFormat
        })
    ]
});

// Add logger transport in development
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: loggerFormat
    }));
}

module.exports = logger;
