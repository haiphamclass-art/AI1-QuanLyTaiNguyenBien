const { NatureElement } = require('../src/models');
const sequelize = require('../src/config/db');

// Simple logger for script
const logger = {
    log: console.log,
    error: console.error
};

// Định nghĩa thông tin chi tiết cho các natural elements
// Fallback values từ Flask config.py DEFAULT_FALLBACK_VALUES
const naturalElementsData = {
    'R_PO4': {
        description: 'Reactive Phosphorus - Phospho phản ứng, một dạng phospho có thể được thực vật thủy sinh sử dụng trực tiếp',
        unit: 'mg/L',
        category: 'Nutrients',
        fallback_value: 0.5
    },
    'O2Sat': {
        description: 'Oxygen Saturation - Độ bão hòa oxy trong nước, tỷ lệ phần trăm oxy hòa tan so với khả năng hòa tan tối đa',
        unit: '%',
        category: 'Water Quality',
        fallback_value: 95.0
    },
    'O2ml_L': {
        description: 'Oxygen Concentration - Nồng độ oxy hòa tan trong nước, đo bằng ml oxy trên 1 lít nước',
        unit: 'ml/L',
        category: 'Water Quality',
        fallback_value: 5.0
    },
    'STheta': {
        description: 'Potential Temperature - Nhiệt độ tiềm năng, nhiệt độ nước sau khi điều chỉnh áp suất về mực nước biển',
        unit: '°C',
        category: 'Physical Properties',
        fallback_value: 22.0
    },
    'Salnty': {
        description: 'Salinity - Độ mặn của nước, tổng lượng muối hòa tan trong nước',
        unit: 'PSU (Practical Salinity Units)',
        category: 'Physical Properties',
        fallback_value: 30.0
    },
    'R_DYNHT': {
        description: 'Dynamic Height - Chiều cao động lực, đo sự chênh lệch mực nước do dòng chảy',
        unit: 'm',
        category: 'Physical Properties',
        fallback_value: 0
    },
    'T_degC': {
        description: 'Temperature - Nhiệt độ nước, ảnh hưởng đến tốc độ phản ứng sinh hóa và sự phát triển của sinh vật',
        unit: '°C',
        category: 'Physical Properties',
        fallback_value: 29.0
    },
    'R_Depth': {
        description: 'Depth - Độ sâu của nước, khoảng cách từ mặt nước đến đáy',
        unit: 'm',
        category: 'Physical Properties',
        fallback_value: 10
    },
    'Distance': {
        description: 'Distance from Shore - Khoảng cách từ bờ biển, ảnh hưởng đến điều kiện môi trường',
        unit: 'km',
        category: 'Location',
        fallback_value: -50
    },
    'Wind_Spd': {
        description: 'Wind Speed - Tốc độ gió, ảnh hưởng đến sóng và dòng chảy nước',
        unit: 'm/s',
        category: 'Atmospheric',
        fallback_value: 5.0
    },
    'Wave_Ht': {
        description: 'Wave Height - Chiều cao sóng, đo từ đáy đến đỉnh sóng',
        unit: 'm',
        category: 'Atmospheric',
        fallback_value: 0.8
    },
    'Wave_Prd': {
        description: 'Wave Period - Chu kỳ sóng, thời gian giữa hai đỉnh sóng liên tiếp',
        unit: 's',
        category: 'Atmospheric',
        fallback_value: 7.0
    },
    'IntChl': {
        description: 'Integrated Chlorophyll - Chlorophyll tích hợp, tổng lượng chlorophyll trong cột nước, chỉ thị mật độ tảo',
        unit: 'mg/m²',
        category: 'Biological',
        fallback_value: 0.2
    },
    'Dry_T': {
        description: 'Dry Temperature - Nhiệt độ khô, nhiệt độ không khí không có độ ẩm',
        unit: '°C',
        category: 'Atmospheric',
        fallback_value: 28
    }
};

async function updateNaturalElements() {
    try {
        logger.log('🚀 Bắt đầu cập nhật Natural Elements...\n');

        // Kết nối database
        await sequelize.authenticate();
        logger.log('✅ Kết nối database thành công');

        // Lấy tất cả natural elements hiện có
        const existingElements = await NatureElement.findAll();
        logger.log(`📊 Tìm thấy ${existingElements.length} natural elements trong database`);

        let updatedCount = 0;
        let addedCount = 0;

        // Cập nhật các elements hiện có
        for (const element of existingElements) {
            const elementData = naturalElementsData[element.name];

            if (elementData) {
                await element.update({
                    description: elementData.description,
                    unit: elementData.unit,
                    category: elementData.category,
                    fallback_value: elementData.fallback_value
                });

                logger.log(`✅ Cập nhật: ${element.name} - ${elementData.description.substring(0, 50)}... (fallback: ${elementData.fallback_value})`);
                updatedCount++;
            } else {
                logger.log(`⚠️  Không tìm thấy thông tin cho: ${element.name}`);
            }
        }

        // Thêm các elements mới nếu chưa có
        for (const [name, data] of Object.entries(naturalElementsData)) {
            const existingElement = existingElements.find(el => el.name === name);

            if (!existingElement) {
                await NatureElement.create({
                    name: name,
                    description: data.description,
                    unit: data.unit,
                    category: data.category,
                    fallback_value: data.fallback_value
                });

                logger.log(`➕ Thêm mới: ${name} - ${data.description.substring(0, 50)}... (fallback: ${data.fallback_value})`);
                addedCount++;
            }
        }

        logger.log('\n📈 Kết quả:');
        logger.log(`- Đã cập nhật: ${updatedCount} elements`);
        logger.log(`- Đã thêm mới: ${addedCount} elements`);
        logger.log(`- Tổng cộng: ${updatedCount + addedCount} elements được xử lý`);

        // Hiển thị danh sách tất cả elements sau khi cập nhật
        logger.log('\n📋 Danh sách Natural Elements sau khi cập nhật:');
        const allElements = await NatureElement.findAll({
            order: [['category', 'ASC'], ['name', 'ASC']]
        });

        allElements.forEach(element => {
            logger.log(`\n🔹 ${element.name} (${element.category})`);
            logger.log(`   Mô tả: ${element.description}`);
            logger.log(`   Đơn vị: ${element.unit}`);
            logger.log(`   Giá trị mặc định: ${element.fallback_value !== null ? element.fallback_value : 'Chưa có'}`);
        });

    } catch (error) {
        logger.error('❌ Lỗi khi cập nhật Natural Elements:', error);
        throw error;
    } finally {
        // Only close connection if running directly, not when imported
        if (require.main === module) {
            await sequelize.close();
            logger.log('\n🔌 Đã đóng kết nối database');
        }
    }
}

// Chạy script
if (require.main === module) {
    updateNaturalElements();
}

module.exports = { updateNaturalElements, naturalElementsData };
