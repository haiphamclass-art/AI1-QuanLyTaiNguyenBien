const { Sequelize, DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Email = sequelize.define(
  'Email',
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isEmail: true,
      },
    },
    area_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    unsubscribe_token: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    timestamps: true,
    tableName: 'email_subscriptions',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

Email.associate = (models) => {
  Email.belongsTo(models.Area, {
    foreignKey: 'area_id',
    targetKey: 'id',
    as: 'area',
  });
};

module.exports = Email;
