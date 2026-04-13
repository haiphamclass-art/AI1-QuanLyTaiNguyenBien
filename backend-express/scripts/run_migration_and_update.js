const { execSync } = require('child_process');
const path = require('path');

// Simple logger
const logger = {
    log: console.log,
    error: console.error
};

async function runMigrationAndUpdate() {
    try {
        logger.log('🚀 Bắt đầu chạy migration và seed dữ liệu...\n');

        // 1. Chạy migration
        logger.log('📋 Bước 1: Chạy migrations...');
        try {
            execSync('npx sequelize-cli db:migrate', {
                cwd: path.join(__dirname, '..'),
                stdio: 'inherit'
            });
            logger.log('✅ Migration thành công\n');
        } catch (error) {
            logger.log('⚠️  Migration có thể đã chạy trước đó hoặc có lỗi:', error.message);
        }

        // 2. Seed Natural Elements
        logger.log('📊 Bước 2: Seed Natural Elements...');
        const { updateNaturalElements } = require('./update_natural_elements');
        await updateNaturalElements();

        // 3. Seed ML Models (optional - comment out nếu không cần)
        logger.log('\n🤖 Bước 3: Seed ML Models...');
        try {
            const { seedMLModels } = require('./seed_ml_models');
            await seedMLModels();
        } catch (error) {
            logger.log('⚠️  ML Models seed có thể đã chạy hoặc có lỗi:', error.message);
        }

        logger.log('\n🎉 Hoàn thành tất cả các bước!');
        logger.log('\n📝 Các API endpoints đã sẵn sàng:');
        logger.log('- GET /api/express/nature-elements - Lấy danh sách natural elements');
        logger.log('- GET /api/express/ml-models - Lấy danh sách ML models');
        logger.log('- GET /api/express/predictions/chart/data - Chart API');

    } catch (error) {
        logger.error('❌ Lỗi khi chạy migration và seed:', error);
        process.exit(1);
    } finally {
        // Close database connection
        const sequelize = require('../src/config/db');
        await sequelize.close();
        logger.log('\n🔌 Đã đóng kết nối database');
        process.exit(0);
    }
}

// Chạy script
if (require.main === module) {
    runMigrationAndUpdate();
}

module.exports = { runMigrationAndUpdate };
