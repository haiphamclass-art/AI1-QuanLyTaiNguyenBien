const { Sequelize, DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Prediction = sequelize.define(
  'Prediction',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    area_id: { type: DataTypes.INTEGER, allowNull: false },
    prediction_text: { type: DataTypes.TEXT, allowNull: false },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    }
  },
  { timestamps: true, tableName: 'diagnose_predictions' }
);

Prediction.associate = (models) => {
  Prediction.belongsTo(models.Area, {
    foreignKey: 'area_id', // Column in the Prediction table
    // // Alias to access the associated Area
  });
  Prediction.belongsToMany(models.NatureElement, {
    through: models.PredictionNatureElement,
    foreignKey: 'prediction_id',
    otherKey: 'nature_element_id',
  });
  Prediction.belongsTo(models.User, {
    foreignKey: 'user_id',
  });
};

module.exports = Prediction;
