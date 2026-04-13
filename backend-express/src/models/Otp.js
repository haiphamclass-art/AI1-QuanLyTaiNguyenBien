const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Otp = sequelize.define(
  'Otp',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    area_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    otp_code: {
      type: DataTypes.STRING(6),
      allowNull: false,
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    is_used: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    tableName: 'otps',
    timestamps: true,
    underscored: true,
  }
);

module.exports = Otp;
