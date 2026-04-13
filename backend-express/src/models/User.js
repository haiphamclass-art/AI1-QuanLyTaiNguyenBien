const { Sequelize, DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const User = sequelize.define(
  'Users',
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    username: { type: DataTypes.STRING, unique: true, allowNull: false },
    login_name: { type: DataTypes.STRING, unique: true, allowNull: true },
    password: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, unique: true, allowNull: false },
    province: { type: DataTypes.UUID, allowNull: true },
    district: { type: DataTypes.UUID, allowNull: true },
    address: { type: DataTypes.STRING, allowNull: true },
    phone: { type: DataTypes.STRING, allowNull: true },
    role: {
      type: DataTypes.ENUM('expert', 'admin', 'manager'),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('active', 'inactive'),
      allowNull: false,
      defaultValue: 'active'
    },
  },
  { timestamps: false, tableName: 'users' }
);

module.exports = User;
