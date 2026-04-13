const Sequelize = require('sequelize');
const sequelize = require('../config/db');

// Import models
const User = require('./User');
const Area = require('./Area');
const Prediction = require('./Prediction');
const NatureElement = require('./NatureElement');
const PredictionNatureElement = require('./PredictionNatureElement');
const Province = require('./Province');
const District = require('./District');
const Email = require('./Email');
const Otp = require('./Otp');
const Job = require('./Job');
const MLModel = require('./MLModel');
const ModelNatureElement = require('./ModelNatureElement');

// Initialize models
const models = {
  User,
  Area,
  Prediction,
  NatureElement,
  PredictionNatureElement,
  Province,
  District,
  Email,
  Otp,
  Job,
  MLModel,
  ModelNatureElement,
};

// Dynamically associate models after all are initialized
Object.values(models).forEach((model) => {
  if (model.associate) {
    model.associate(models);
  }
});

module.exports = {
  ...models,
  sequelize,
};
