/**
 * Script to seed ML Models and their associated Nature Elements
 * Based on existing Flask ML models configuration
 * 
 * Run: node scripts/seed_ml_models.js
 */

const { MLModel, NatureElement, ModelNatureElement } = require('../src/models');
const sequelize = require('../src/config/db');
const logger = require('../src/config/logger');

// ML Models configuration from Flask
const ML_MODELS = [
  // COBIA MODELS
  {
    name: 'Cobia Ridge Regression',
    description: 'Ridge regression model for Cobia (Rachycentron canadum) prediction',
    model_file_path: 'model/cobia/ridge_model.pkl',
    area_type: 'cobia',
    is_active: true,
    is_default: true, // System default model - cannot be edited or deleted
  },
  {
    name: 'Cobia Gradient Boosting',
    description: 'Gradient Boosting Regressor model for Cobia prediction',
    model_file_path: 'model/cobia/gbr_model.pkl',
    area_type: 'cobia',
    is_active: true,
    is_default: true,
  },
  {
    name: 'Cobia XGBoost',
    description: 'XGBoost model for Cobia prediction',
    model_file_path: 'model/cobia/xgboost_model.pkl',
    area_type: 'cobia',
    is_active: true,
    is_default: true,
  },
  {
    name: 'Cobia Support Vector Regression',
    description: 'SVR model for Cobia prediction',
    model_file_path: 'model/cobia/svr_model.pkl',
    area_type: 'cobia',
    is_active: true,
    is_default: true,
  },
  {
    name: 'Cobia Random Forest',
    description: 'Random Forest model for Cobia prediction',
    model_file_path: 'model/cobia/rf_model.pkl',
    area_type: 'cobia',
    is_active: true,
    is_default: true,
  },
  {
    name: 'Cobia LightGBM',
    description: 'LightGBM model for Cobia prediction',
    model_file_path: 'model/cobia/lightgbm_model.pkl',
    area_type: 'cobia',
    is_active: true,
    is_default: true,
  },
  {
    name: 'Cobia Stack Generalization (Default)',
    description: 'Stacking ensemble model for Cobia prediction - Default model used by the system',
    model_file_path: 'model/cobia/stack_gen_model.pkl',
    area_type: 'cobia',
    is_active: true,
    is_default: true,
  },

  // OYSTER MODELS
  {
    name: 'Oyster Ridge Regression',
    description: 'Ridge regression model for Oyster (Crassostrea gigas) prediction',
    model_file_path: 'model/oyster/ridge_model.pkl',
    area_type: 'oyster',
    is_active: true,
    is_default: true,
  },
  {
    name: 'Oyster Gradient Boosting',
    description: 'Gradient Boosting Regressor model for Oyster prediction',
    model_file_path: 'model/oyster/gbr_model.pkl',
    area_type: 'oyster',
    is_active: true,
    is_default: true,
  },
  {
    name: 'Oyster XGBoost',
    description: 'XGBoost model for Oyster prediction',
    model_file_path: 'model/oyster/xgboost_model.pkl',
    area_type: 'oyster',
    is_active: true,
    is_default: true,
  },
  {
    name: 'Oyster Support Vector Regression',
    description: 'SVR model for Oyster prediction',
    model_file_path: 'model/oyster/svr_model.pkl',
    area_type: 'oyster',
    is_active: true,
    is_default: true,
  },
  {
    name: 'Oyster Random Forest',
    description: 'Random Forest model for Oyster prediction',
    model_file_path: 'model/oyster/rf_model.pkl',
    area_type: 'oyster',
    is_active: true,
    is_default: true,
  },
  {
    name: 'Oyster LightGBM',
    description: 'LightGBM model for Oyster prediction',
    model_file_path: 'model/oyster/lightgbm_model.pkl',
    area_type: 'oyster',
    is_active: true,
    is_default: true,
  },
  {
    name: 'Oyster Stack Generalization (Default)',
    description: 'Stacking ensemble model for Oyster prediction - Default model used by the system',
    model_file_path: 'model/oyster/stack_gen_model.pkl',
    area_type: 'oyster',
    is_active: true,
    is_default: true,
  },
];

// Nature Elements expected names (must match database)
// These should already exist in diagnose_naturalelements table
const REQUIRED_NATURE_ELEMENTS = [
  'R_PO4',      // Phosphate
  'O2Sat',      // Oxygen Saturation
  'O2ml_L',     // Dissolved Oxygen
  'STheta',     // Seawater Density
  'Salnty',     // Salinity
  'R_DYNHT',    // Dynamic Height
  'T_degC',     // Temperature
  'R_Depth',    // Depth
  'Distance',   // Distance
  'Wind_Spd',   // Wind Speed
  'Wave_Ht',    // Wave Height
  'Wave_Prd',   // Wave Period
  'IntChl',     // Integrated Chlorophyll
  'Dry_T',      // Dry Temperature
];

async function seedMLModels() {
  try {
    logger.info('Starting ML Models seeding...');

    // Start transaction
    const transaction = await sequelize.transaction();

    try {
      // 1. Fetch all nature elements from database
      logger.info('Fetching nature elements from database...');
      const natureElements = await NatureElement.findAll({
        where: {
          name: REQUIRED_NATURE_ELEMENTS,
        },
        transaction,
      });

      logger.info(`Found ${natureElements.length} nature elements in database`);

      if (natureElements.length !== REQUIRED_NATURE_ELEMENTS.length) {
        const foundNames = natureElements.map((ne) => ne.name);
        const missingElements = REQUIRED_NATURE_ELEMENTS.filter(
          (name) => !foundNames.includes(name)
        );
        logger.warn(
          `Warning: Missing nature elements: ${missingElements.join(', ')}`
        );
        logger.warn('Please ensure all nature elements exist before seeding models');
      }

      // 2. Create or update ML Models
      logger.info('Creating/updating ML models...');
      let createdCount = 0;
      let updatedCount = 0;

      for (const modelData of ML_MODELS) {
        const [model, created] = await MLModel.findOrCreate({
          where: { name: modelData.name },
          defaults: modelData,
          transaction,
        });

        if (!created) {
          // Update if already exists
          await model.update(modelData, { transaction });
          updatedCount++;
          logger.info(`Updated: ${model.name}`);
        } else {
          createdCount++;
          logger.info(`Created: ${model.name}`);
        }

        // 3. Associate all required nature elements with this model
        // Delete existing associations first
        await ModelNatureElement.destroy({
          where: { model_id: model.id },
          transaction,
        });

        // Create new associations with input order
        const associations = natureElements.map((element, index) => ({
          model_id: model.id,
          nature_element_id: element.id,
          is_required: true, // All elements are required for these models
          input_order: index, // Order matters for ML models
        }));

        await ModelNatureElement.bulkCreate(associations, { transaction });
        logger.info(`  → Associated ${associations.length} nature elements`);
      }

      // Commit transaction
      await transaction.commit();

      logger.info('\n=== ML Models Seeding Summary ===');
      logger.info(`Total models processed: ${ML_MODELS.length}`);
      logger.info(`Created: ${createdCount}`);
      logger.info(`Updated: ${updatedCount}`);
      logger.info(`Nature elements per model: ${natureElements.length}`);
      logger.info('=================================\n');

      // Display final count
      const totalModels = await MLModel.count();
      logger.info(`Total ML models in database: ${totalModels}`);

      // Only exit if run directly
      if (require.main === module) {
        process.exit(0);
      }
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    logger.error('Error seeding ML models:', {
      message: error.message,
      stack: error.stack,
    });
    // Only exit if run directly
    if (require.main === module) {
      process.exit(1);
    } else {
      throw error;
    }
  }
}

// Run seeding only if executed directly
if (require.main === module) {
  seedMLModels();
}

module.exports = { seedMLModels };

