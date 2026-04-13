const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const logger = require('../config/logger');

const ModelNatureElement = sequelize.define(
  'ModelNatureElement',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    model_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'ml_models',
        key: 'id',
      },
    },
    nature_element_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'nature_elements',
        key: 'id',
      },
    },
    is_required: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    input_order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    fallback_value: {
      type: DataTypes.FLOAT,
      allowNull: true,
      defaultValue: null,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at',
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'updated_at',
    },
  },
  {
    tableName: 'model_nature_elements',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ['model_id', 'nature_element_id'],
        name: 'unique_model_nature_element',
      },
    ],
  }
);

ModelNatureElement.associate = (models) => {
  logger.debug('ModelNatureElement.associate', { models });

  ModelNatureElement.belongsTo(models.MLModel, {
    foreignKey: 'model_id',
    as: 'model',
  });

  ModelNatureElement.belongsTo(models.NatureElement, {
    foreignKey: 'nature_element_id',
    as: 'natureElement',
  });
};

module.exports = ModelNatureElement;

