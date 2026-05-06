const { NatureElement } = require('../src/models');
const sequelize = require('../src/config/db');
const { FIELD_METADATA } = require('../src/config/predictionFeatures');

const logger = {
  log: console.log,
  error: console.error,
};

const naturalElementsData = Object.fromEntries(
  Object.entries(FIELD_METADATA).map(([name, data]) => [
    name,
    {
      description: data.description || name,
      unit: data.unit || '',
      category: data.category || 'Water Quality',
      fallback_value: data.fallback_value,
    },
  ])
);

async function updateNaturalElements() {
  try {
    logger.log('Starting NatureElement update...');
    await sequelize.authenticate();

    let updatedCount = 0;
    let addedCount = 0;

    for (const [name, data] of Object.entries(naturalElementsData)) {
      const [element, created] = await NatureElement.findOrCreate({
        where: { name },
        defaults: {
          name,
          description: data.description,
          unit: data.unit,
          category: data.category,
          fallback_value: data.fallback_value,
        },
      });

      if (created) {
        addedCount += 1;
        logger.log(`Added: ${name}`);
      } else {
        await element.update({
          description: data.description,
          unit: data.unit,
          category: data.category,
          fallback_value: data.fallback_value,
        });
        updatedCount += 1;
        logger.log(`Updated: ${name}`);
      }
    }

    logger.log(`Done. Updated: ${updatedCount}, added: ${addedCount}`);
  } catch (error) {
    logger.error('Failed to update NatureElements:', error);
    throw error;
  } finally {
    if (require.main === module) {
      await sequelize.close();
    }
  }
}

if (require.main === module) {
  updateNaturalElements();
}

module.exports = { updateNaturalElements, naturalElementsData };
