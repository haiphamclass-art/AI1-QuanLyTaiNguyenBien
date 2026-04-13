'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('ml_models', 'google_drive_file_id', {
      type: Sequelize.STRING(255),
      allowNull: true,
      comment: 'Google Drive file ID',
    });

    await queryInterface.addColumn('ml_models', 'google_drive_download_link', {
      type: Sequelize.STRING(500),
      allowNull: true,
      comment: 'Google Drive direct download link',
    });

    // Add index for quick lookup
    await queryInterface.addIndex('ml_models', ['google_drive_file_id']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('ml_models', 'google_drive_download_link');
    await queryInterface.removeColumn('ml_models', 'google_drive_file_id');
  },
};


