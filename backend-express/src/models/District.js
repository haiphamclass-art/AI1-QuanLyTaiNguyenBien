const { Sequelize, DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const District = sequelize.define(
  'District',
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    province_id: {
      type: DataTypes.UUID,
      allowNull: false
    }
  },
  {
    tableName: 'districts',
    timestamps: false // Đổi thành true nếu bạn có cột createdAt/updatedAt
  }
);

// Define associations externally
District.associate = (models) => {
  District.belongsTo(models.Province, {
    foreignKey: 'province_id',
    targetKey: 'id',
    as: 'province'
  });
};

module.exports = District;
