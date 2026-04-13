const { Sequelize, DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const PredictionNatureElement = sequelize.define(
  'PredictionNatureElement',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    prediction_id: { type: DataTypes.INTEGER, allowNull: false },
    nature_element_id: { type: DataTypes.INTEGER, allowNull: false },
    value: { type: DataTypes.DOUBLE, allowNull: false },
  },
  { timestamps: false, tableName: 'diagnose_prediction_natureelements' }
);

PredictionNatureElement.associate = (models) => {
  PredictionNatureElement.belongsTo(models.NatureElement, {
    foreignKey: 'nature_element_id',
    as: 'NatureElement',
  });
  PredictionNatureElement.belongsTo(models.Prediction, {
    foreignKey: 'prediction_id',
    as: 'Prediction',
  });
};

module.exports = PredictionNatureElement;
