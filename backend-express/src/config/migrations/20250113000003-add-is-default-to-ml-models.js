'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('ml_models', 'is_default', {
      type: Sequelize.BOOLEAN,
      defaultValue: false,
      allowNull: false,
      comment: 'Indicates if this is a default/system model that cannot be edited or deleted'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('ml_models', 'is_default');
  }
};

