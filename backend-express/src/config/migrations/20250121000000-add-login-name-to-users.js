'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Thêm cột login_name vào bảng users
    await queryInterface.addColumn('users', 'login_name', {
      type: Sequelize.STRING,
      allowNull: true,
      unique: true,
      after: 'username' // Đặt sau cột username (chỉ hoạt động với MySQL/MariaDB)
    });

    console.log('Column login_name has been added to users table');
  },

  down: async (queryInterface, Sequelize) => {
    // Xóa cột login_name nếu rollback
    await queryInterface.removeColumn('users', 'login_name');
    console.log('Column login_name has been removed from users table');
  }
};

