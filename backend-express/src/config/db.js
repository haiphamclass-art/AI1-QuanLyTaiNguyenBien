const { Sequelize } = require('sequelize');
require('dotenv').config();

const { DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT } = process.env;

// Create a Sequelize instance for the PostgreSQL database
const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASSWORD, {
  host: DB_HOST, // e.g., 'localhost'
  dialect: 'postgres', // Use PostgreSQL
  logging: false, // Disable logging (optional)
  port: DB_PORT,
});

async function ensureDbExtensions() {
  try {
    await sequelize.query('CREATE EXTENSION IF NOT EXISTS unaccent;');
    console.log('[DB] unaccent extension ready');
  } catch (err) {
    console.error('[DB] Failed to enable unaccent', err.message);
  }
}

ensureDbExtensions();   // runs once when this module is loaded

module.exports = sequelize;
