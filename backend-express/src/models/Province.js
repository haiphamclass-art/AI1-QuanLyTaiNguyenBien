const { Sequelize, DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Province = sequelize.define(
  'Province',
  {
    id: { type: DataTypes.UUID, defaultValue:DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    central_meridian: { type: DataTypes.DOUBLE, allowNull: true, comment: 'Kinh tuyến trục VN2000 (độ)' },
  },
  { timestamps: false, tableName: 'provinces' }
);

module.exports = Province;
