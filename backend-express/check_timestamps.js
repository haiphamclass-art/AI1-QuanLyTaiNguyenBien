const { Prediction } = require('./src/models');

// Script để kiểm tra timestamps trong database
async function checkTimestamps() {
    try {
        logger.log('Checking timestamps in database...');

        // Lấy 5 prediction mới nhất
        const recentPredictions = await Prediction.findAll({
            order: [['id', 'DESC']],
            limit: 5,
            attributes: ['id', 'user_id', 'area_id', 'prediction_text', 'createdAt', 'updatedAt']
        });

        logger.log(`\nFound ${recentPredictions.length} recent predictions:`);

        recentPredictions.forEach((prediction, index) => {
            logger.log(`\n${index + 1}. Prediction ID: ${prediction.id}`);
            logger.log(`   User ID: ${prediction.user_id}`);
            logger.log(`   Area ID: ${prediction.area_id}`);
            logger.log(`   Prediction Text: ${prediction.prediction_text}`);
            logger.log(`   Created At: ${prediction.createdAt}`);
            logger.log(`   Updated At: ${prediction.updatedAt}`);

            if (prediction.createdAt) {
                logger.log('   ✅ Has timestamp');
            } else {
                logger.log('   ❌ Missing timestamp');
            }
        });

        // Kiểm tra cấu trúc bảng
        logger.log('\n📋 Table structure check:');
        const tableInfo = await Prediction.sequelize.query(
            "SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'diagnose_predictions' ORDER BY ordinal_position",
            { type: Prediction.sequelize.QueryTypes.SELECT }
        );

        tableInfo.forEach(column => {
            logger.log(`   ${column.column_name}: ${column.data_type} (nullable: ${column.is_nullable}, default: ${column.column_default})`);
        });

    } catch (error) {
        logger.error('Error checking timestamps:', error);
    } finally {
        process.exit(0);
    }
}

checkTimestamps();
