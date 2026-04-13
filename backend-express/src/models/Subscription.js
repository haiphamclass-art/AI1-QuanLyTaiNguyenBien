module.exports = (sequelize, DataTypes) => {
    const Subscription = sequelize.define('Subscription', {
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isEmail: true,
        },
      },
      subscribedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
    });
  
    Subscription.associate = (models) => {
      Subscription.belongsTo(models.Area, {
        foreignKey: 'areaId',
        as: 'area',
        onDelete: 'CASCADE',
      });
    };
  
    return Subscription;
  };