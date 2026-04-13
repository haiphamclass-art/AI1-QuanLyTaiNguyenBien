const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const logger = require('../config/logger');

const MLModel = sequelize.define(
  'MLModel',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: true,
      },
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    model_file_path: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    google_drive_file_id: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    google_drive_download_link: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    area_type: {
      type: DataTypes.ENUM('oyster', 'cobia'),
      allowNull: true,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    is_default: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Indicates if this is a default/system model that cannot be edited or deleted',
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
    tableName: 'ml_models',
    timestamps: true,
    underscored: true,
  }
);

MLModel.associate = (models) => {
  logger.debug('MLModel.associate', { models });

  // Many-to-Many with NatureElement
  MLModel.belongsToMany(models.NatureElement, {
    through: models.ModelNatureElement,
    foreignKey: 'model_id',
    otherKey: 'nature_element_id',
    as: 'natureElements',
  });
};

module.exports = MLModel;

