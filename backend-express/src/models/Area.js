const { Sequelize, DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const logger = require('../config/logger');

const Area = sequelize.define(
  'Area',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    latitude: { type: DataTypes.DOUBLE, allowNull: false },
    longitude: { type: DataTypes.DOUBLE, allowNull: false },
    area: { type: DataTypes.DOUBLE, allowNull: false },
    province: { type: DataTypes.UUID, allowNull: true },
    district: { type: DataTypes.UUID, allowNull: true },
    area_type: { type: DataTypes.ENUM('oyster', 'cobia'), allowNull: false },
  },
  { timestamps: false, tableName: 'diagnose_areas' }
);

Area.associate = (models) => {
  logger.debug('Area.associate', { models });

  Area.belongsTo(models.Province, {
    foreignKey: 'province',
    targetKey: 'id',
  });
  Area.belongsTo(models.District, {
    foreignKey: 'district',
    targetKey: 'id',
  });
  Area.hasMany(models.Email, {
    foreignKey: 'area_id',
    as: 'emailSubscriptions',
  });
  Area.hasMany(models.Prediction, {
    foreignKey: 'area_id',
    as: 'predictions'
  });
};

module.exports = Area;
