const { MLModel, NatureElement, ModelNatureElement } = require('../models');
const logger = require('../config/logger');
const FLASK_INTERNAL_HOST_HEADER = process.env.FLASK_INTERNAL_HOST_HEADER || 'localhost:5001';
const { Op } = require('sequelize');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const googleDriveService = require('../services/googleDriveService');

/**
 * Check for duplicate model names and file paths
 */
exports.checkDuplicate = async (req, res) => {
  try {
    const { name, area_type, exclude_id } = req.body;

    if (!name || !area_type) {
      return res.status(400).json({
        success: false,
        error: 'Model name and area_type are required',
      });
    }

    // Generate the filename that would be created
    const safeFileName = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

    const species = area_type;
    let algorithmName = safeFileName;
    const speciesPrefix = species + '_';
    if (safeFileName.startsWith(speciesPrefix)) {
      algorithmName = safeFileName.substring(speciesPrefix.length);
    }

    const generatedFileName = `${species}__${algorithmName}_model.pkl`;
    const flaskModelKey = `${species}_${algorithmName}`;

    // Check for duplicate name
    const whereClause = {
      name: name,
      area_type: area_type,
    };

    if (exclude_id) {
      whereClause.id = { [Op.ne]: exclude_id };
    }

    const duplicateName = await MLModel.findOne({ where: whereClause });

    // Check for duplicate file path
    const fileWhereClause = {
      model_file_path: generatedFileName,
    };

    if (exclude_id) {
      fileWhereClause.id = { [Op.ne]: exclude_id };
    }

    const duplicateFile = await MLModel.findOne({ where: fileWhereClause });

    // Prepare response
    const hasDuplicate = !!duplicateName || !!duplicateFile;
    const conflicts = [];

    if (duplicateName) {
      conflicts.push({
        type: 'name',
        message: `Model name "${name}" already exists for ${area_type}`,
        conflictWith: {
          id: duplicateName.id,
          name: duplicateName.name,
        },
      });
    }

    if (duplicateFile && (!duplicateName || duplicateFile.id !== duplicateName.id)) {
      conflicts.push({
        type: 'filename',
        message: `Another model "${duplicateFile.name}" will generate the same filename`,
        conflictWith: {
          id: duplicateFile.id,
          name: duplicateFile.name,
          fileName: generatedFileName,
        },
      });
    }

    return res.status(200).json({
      success: true,
      hasDuplicate,
      conflicts,
      generatedInfo: {
        fileName: generatedFileName,
        flaskModelKey: flaskModelKey,
        species: species,
        algorithm: algorithmName,
      },
    });
  } catch (error) {
    logger.error('Check Duplicate Error:', {
      message: error.message,
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      error: 'Failed to check for duplicates',
    });
  }
};

/**
 * Get all ML Models with optional filters
 */
exports.getAllMLModels = async (req, res) => {
  try {
    const { is_active, area_type, search, limit, offset } = req.query;

    const whereClause = {};
    if (is_active !== undefined) {
      whereClause.is_active = is_active === 'true';
    }
    if (area_type) {
      whereClause.area_type = area_type;
    }
    if (search) {
      whereClause.name = { [Op.iLike]: `%${search}%` };
    }

    const queryOptions = {
      where: whereClause,
      include: [
        {
          model: NatureElement,
          as: 'natureElements',
          through: {
            attributes: ['id', 'is_required', 'input_order', 'fallback_value'],
          },
          attributes: ['id', 'name', 'description', 'unit', 'category', 'fallback_value'],
        },
      ],
      order: [['createdAt', 'DESC']],
      distinct: true,
    };

    // Optional pagination - if limit/offset provided, use pagination
    if (limit !== undefined) {
      queryOptions.limit = parseInt(limit, 10);
    }
    if (offset !== undefined) {
      queryOptions.offset = parseInt(offset, 10);
    }

    // Use findAndCountAll for consistent total count
    const { count, rows } = await MLModel.findAndCountAll(queryOptions);

    // Debug log for first model's natureElements
    if (rows.length > 0 && rows[0].natureElements && rows[0].natureElements.length > 0) {
      const firstElement = rows[0].natureElements[0];
      logger.debug('Sample natureElement structure:', {
        id: firstElement.id,
        name: firstElement.name,
        ModelNatureElement: firstElement.ModelNatureElement,
      });
    }

    return res.status(200).json({
      success: true,
      data: rows,
      total: count,
      // Legacy support
      count: rows.length,
    });
  } catch (error) {
    logger.error('Get All ML Models Error:', {
      message: error.message,
      stack: error.stack,
    });
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch ML models',
    });
  }
};

/**
 * Get a single ML Model by ID
 */
exports.getMLModelById = async (req, res) => {
  try {
    const { id } = req.params;

    const model = await MLModel.findByPk(id, {
      include: [
        {
          model: NatureElement,
          as: 'natureElements',
          through: {
            attributes: ['is_required', 'input_order', 'id', 'fallback_value'],
          },
          attributes: ['id', 'name', 'description', 'unit', 'category', 'fallback_value'],
        },
      ],
    });

    if (!model) {
      return res.status(404).json({
        success: false,
        error: 'ML Model not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: model,
    });
  } catch (error) {
    logger.error('Get ML Model By ID Error:', {
      message: error.message,
      stack: error.stack,
      id: req.params.id,
    });
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch ML model',
    });
  }
};

/**
 * Create a new ML Model
 */
exports.createMLModel = async (req, res) => {
  try {
    const {
      name,
      description,
      model_file_path,
      area_type,
      is_active,
      natureElements, // Array of { nature_element_id, is_required, input_order }
    } = req.body;

    logger.info('Creating ML Model with data:', {
      name,
      area_type,
      natureElementsCount: natureElements?.length || 0,
      natureElements
    });

    // Validation
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Model name is required',
      });
    }

    // Check if model with same name exists
    const existingModel = await MLModel.findOne({ where: { name } });
    if (existingModel) {
      return res.status(409).json({
        success: false,
        error: 'Model with this name already exists',
      });
    }

    // Create model (path is null until file is uploaded)
    const newModel = await MLModel.create({
      name,
      description,
      model_file_path: null, // Always null on creation, set only during file upload
      area_type,
      is_active: is_active !== undefined ? is_active : true,
      is_default: false, // Custom models are never default
    });

    // Add nature elements if provided
    if (natureElements && Array.isArray(natureElements) && natureElements.length > 0) {
      const elementRecords = natureElements.map((element) => ({
        model_id: newModel.id,
        nature_element_id: element.nature_element_id,
        is_required: element.is_required !== undefined ? element.is_required : true,
        input_order: element.input_order || 0,
      }));

      logger.info('Creating ModelNatureElement associations:', { count: elementRecords.length, records: elementRecords });
      await ModelNatureElement.bulkCreate(elementRecords);
      logger.info('ModelNatureElement associations created successfully');
    } else {
      logger.warn('No nature elements provided for model');
    }

    // Fetch complete model with associations
    const completeModel = await MLModel.findByPk(newModel.id, {
      include: [
        {
          model: NatureElement,
          as: 'natureElements',
          through: {
            attributes: ['is_required', 'input_order', 'id', 'fallback_value'],
          },
          attributes: ['id', 'name', 'description', 'unit', 'category', 'fallback_value'],
        },
      ],
    });

    logger.info('ML Model created successfully:', { modelId: newModel.id, name });
    return res.status(201).json({
      success: true,
      data: completeModel,
      message: 'ML Model created successfully',
    });
  } catch (error) {
    logger.error('Create ML Model Error:', {
      message: error.message,
      stack: error.stack,
      body: req.body,
    });
    return res.status(500).json({
      success: false,
      error: 'Failed to create ML model',
    });
  }
};

/**
 * Update an ML Model
 */
exports.updateMLModel = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      model_file_path,
      area_type,
      is_active,
      natureElements, // Array of { nature_element_id, is_required, input_order }
    } = req.body;

    logger.info('Updating ML Model with data:', {
      id,
      name,
      area_type,
      natureElementsCount: natureElements?.length || 0,
      natureElements
    });

    const model = await MLModel.findByPk(id);
    if (!model) {
      return res.status(404).json({
        success: false,
        error: 'ML Model not found',
      });
    }

    // Check if this is a default model - cannot be edited
    if (model.is_default) {
      return res.status(403).json({
        success: false,
        error: 'Cannot edit default system models. You can only enable/disable them.',
      });
    }

    // Check for name conflict if name is being changed
    if (name && name !== model.name) {
      const existingModel = await MLModel.findOne({ where: { name } });
      if (existingModel) {
        return res.status(409).json({
          success: false,
          error: 'Model with this name already exists',
        });
      }
    }

    // Update model fields
    await model.update({
      name: name || model.name,
      description: description !== undefined ? description : model.description,
      model_file_path: model_file_path !== undefined ? model_file_path : model.model_file_path,
      area_type: area_type !== undefined ? area_type : model.area_type,
      is_active: is_active !== undefined ? is_active : model.is_active,
    });

    // Update nature elements if provided
    if (natureElements && Array.isArray(natureElements)) {
      // Delete existing associations
      logger.info('Deleting existing ModelNatureElement associations');
      await ModelNatureElement.destroy({ where: { model_id: id } });

      // Add new associations
      if (natureElements.length > 0) {
        const elementRecords = natureElements.map((element) => ({
          model_id: id,
          nature_element_id: element.nature_element_id,
          is_required: element.is_required !== undefined ? element.is_required : true,
          input_order: element.input_order || 0,
        }));

        logger.info('Creating new ModelNatureElement associations:', { count: elementRecords.length, records: elementRecords });
        await ModelNatureElement.bulkCreate(elementRecords);
        logger.info('ModelNatureElement associations updated successfully');
      } else {
        logger.warn('No nature elements to add in update');
      }
    } else {
      logger.warn('natureElements not provided or not an array');
    }

    // Fetch updated model with associations
    const updatedModel = await MLModel.findByPk(id, {
      include: [
        {
          model: NatureElement,
          as: 'natureElements',
          through: {
            attributes: ['is_required', 'input_order', 'id', 'fallback_value'],
          },
          attributes: ['id', 'name', 'description', 'unit', 'category', 'fallback_value'],
        },
      ],
    });

    logger.info('ML Model updated successfully:', { modelId: id });
    return res.status(200).json({
      success: true,
      data: updatedModel,
      message: 'ML Model updated successfully',
    });
  } catch (error) {
    logger.error('Update ML Model Error:', {
      message: error.message,
      stack: error.stack,
      id: req.params.id,
      body: req.body,
    });
    return res.status(500).json({
      success: false,
      error: 'Failed to update ML model',
    });
  }
};

/**
 * Delete an ML Model
 * Note: Only custom models (is_default = false) can be deleted
 */
exports.deleteMLModel = async (req, res) => {
  try {
    const { id } = req.params;

    const model = await MLModel.findByPk(id);
    if (!model) {
      return res.status(404).json({
        success: false,
        error: 'ML Model not found',
      });
    }

    // Check if this is a default model - cannot be deleted
    if (model.is_default) {
      return res.status(403).json({
        success: false,
        error: 'Cannot delete default system models. You can only disable them.',
      });
    }

    // Check if model has uploaded file - cannot be deleted

    // Delete associated records first

    // Check and delete Google Drive file if exists
    if (model.google_drive_file_id) {
      try {
        // Verify file exists on Drive first
        const fileExists = await googleDriveService.fileExists(model.google_drive_file_id);

        if (fileExists) {
          await googleDriveService.deleteFile(model.google_drive_file_id);
          logger.info('Deleted Google Drive file:', {
            fileId: model.google_drive_file_id,
            fileName: model.model_file_path,
          });
        } else {
          logger.warn('Google Drive file not found, skipping deletion:', {
            fileId: model.google_drive_file_id,
            fileName: model.model_file_path,
          });
        }

      } catch (error) {
        logger.error('Failed to delete Google Drive file:', {
          fileId: model.google_drive_file_id,
          error: error.message,
        });
      }
    }
    await ModelNatureElement.destroy({ where: { model_id: id } });
    // Delete the model
    await model.destroy();

    logger.info('ML Model deleted successfully:', { modelId: id, modelName: model.name });

    // Notify Flask to reload models (remove deleted model from memory)
    try {
      const flaskUrl = process.env.FLASK_API_URL || 'http://flask_backend:5001';
      const reloadUrl = `${flaskUrl}/api/reload_models`;
      const reloadSecret = process.env.FETCH_SECRET_KEY || 'your-very-secret-and-random-string-12345';

      await axios.post(
        reloadUrl,
        {},
        {
          headers: {
            'X-RELOAD-SECRET': reloadSecret,
            Host: FLASK_INTERNAL_HOST_HEADER,
          },
          timeout: 10000,
        }
      );
      logger.info('Flask models reloaded after deletion');
    } catch (flaskError) {
      logger.warn('Failed to notify Flask for model reload:', {
        error: flaskError.message,
      });
      // Don't fail the deletion if Flask reload fails
    }

    return res.status(200).json({
      success: true,
      message: 'ML Model deleted successfully',
    });
  } catch (error) {
    logger.error('Delete ML Model Error:', {
      message: error.message,
      stack: error.stack,
      id: req.params.id,
    });
    return res.status(500).json({
      success: false,
      error: 'Failed to delete ML model',
    });
  }
};

/**
 * Toggle ML Model active status
 */
exports.toggleMLModelStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;

    if (is_active === undefined) {
      return res.status(400).json({
        success: false,
        error: 'is_active field is required',
      });
    }

    const model = await MLModel.findByPk(id);
    if (!model) {
      return res.status(404).json({
        success: false,
        error: 'ML Model not found',
      });
    }

    await model.update({ is_active });

    logger.info('ML Model status toggled:', { modelId: id, is_active });
    return res.status(200).json({
      success: true,
      data: model,
      message: `ML Model ${is_active ? 'activated' : 'deactivated'} successfully`,
    });
  } catch (error) {
    logger.error('Toggle ML Model Status Error:', {
      message: error.message,
      stack: error.stack,
      id: req.params.id,
    });
    return res.status(500).json({
      success: false,
      error: 'Failed to toggle ML model status',
    });
  }
};

/**
 * Upload ML Model file (.pkl) to Google Drive
 */
exports.uploadModelFile = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded',
      });
    }

    // Validate file extension
    if (!req.file.originalname.endsWith('.pkl')) {
      // Remove uploaded file
      await fs.unlink(req.file.path);
      return res.status(400).json({
        success: false,
        error: 'Only .pkl files are allowed',
      });
    }

    const model = await MLModel.findByPk(id);
    if (!model) {
      // Remove uploaded file
      await fs.unlink(req.file.path);
      return res.status(404).json({
        success: false,
        error: 'ML Model not found',
      });
    }

    // Generate filename for Google Drive
    const safeFileName = model.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

    // Remove species prefix from safeFileName if it's already there
    const species = model.area_type || 'general';
    let algorithmName = safeFileName;
    const speciesPrefix = species + '_';
    if (safeFileName.startsWith(speciesPrefix)) {
      // Remove duplicate species prefix
      algorithmName = safeFileName.substring(speciesPrefix.length);
    }

    // Format: {species}__{algorithm}_model.pkl
    // Example: cobia__ridge_regression_model.pkl (not cobia__cobia_ridge_regression_model.pkl)
    // This format allows Flask to auto-discover without folder structure
    const driveFileName = `${species}__${algorithmName}_model.pkl`;

    // Check for potential duplicate model names
    // Flask will use key: species_algorithm (e.g., cobia_ridge_regression)
    const flaskModelKey = `${species}_${algorithmName}`;

    logger.info('Generated Drive filename:', {
      species,
      algorithmName,
      driveFileName,
      flaskModelKey,
      modelName: model.name,
    });

    logger.info('Flask will register this as:', flaskModelKey);

    // Delete old file from Google Drive if exists
    if (model.google_drive_file_id) {
      try {
        // Verify file exists before deleting
        const fileExists = await googleDriveService.fileExists(model.google_drive_file_id);

        if (fileExists) {
          await googleDriveService.deleteFile(model.google_drive_file_id);
          logger.info('Deleted old model file from Google Drive:', {
            fileId: model.google_drive_file_id,
            fileName: model.model_file_path,
          });
        } else {
          logger.warn('Old file not found on Google Drive, skipping deletion:', {
            fileId: model.google_drive_file_id,
            fileName: model.model_file_path,
          });
        }
      } catch (deleteError) {
        logger.warn('Could not delete old file from Google Drive:', deleteError.message);
        // Continue with upload even if delete fails
      }
    }

    // Upload to Google Drive
    logger.info('Uploading model file to Google Drive:', {
      modelId: id,
      fileName: driveFileName,
    });

    const driveFile = await googleDriveService.uploadFile(
      req.file.path,
      driveFileName,
      'application/octet-stream'
    );

    // Update model in database
    await model.update({
      model_file_path: driveFileName,
      google_drive_file_id: driveFile.fileId,
      google_drive_download_link: driveFile.downloadLink,
    });

    // Clean up local uploaded file
    await fs.unlink(req.file.path);

    logger.info('Model file uploaded to Google Drive successfully:', {
      modelId: id,
      fileId: driveFile.fileId,
      fileName: driveFile.fileName,
    });

    // Notify Flask to download and reload models
    try {
      const flaskUrl = process.env.FLASK_API_URL || 'http://flask_backend:5001';
      const reloadUrl = `${flaskUrl}/api/sync_models`;
      const reloadSecret = process.env.FETCH_SECRET_KEY || 'your-very-secret-and-random-string-12345';

      await axios.post(
        reloadUrl,
        {
          model_id: id,
          file_id: driveFile.fileId,
          file_name: driveFileName,
          download_link: driveFile.downloadLink,
        },
        {
          headers: {
            'X-RELOAD-SECRET': reloadSecret,
            Host: FLASK_INTERNAL_HOST_HEADER,
          },
          timeout: 30000, // 30 seconds for download + reload
        }
      );
      logger.info('Flask models synced successfully');
    } catch (flaskError) {
      logger.warn('Failed to notify Flask for model sync:', {
        error: flaskError.message,
      });
      // Don't fail the request if Flask sync fails
    }

    return res.status(200).json({
      success: true,
      data: {
        model_id: model.id,
        file_id: driveFile.fileId,
        file_name: driveFileName,
        download_link: driveFile.downloadLink,
        flask_model_key: flaskModelKey,
      },
      message: 'Model file uploaded successfully',
    });
  } catch (error) {
    // Clean up uploaded file on error
    if (req.file && req.file.path) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        logger.error('Failed to clean up uploaded file:', unlinkError);
      }
    }

    logger.error('Upload Model File Error:', {
      message: error.message,
      stack: error.stack,
      id: req.params.id,
    });
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to upload model file',
    });
  }
};

/**
 * Update fallback value for a ModelNatureElement
 */
exports.updateModelNatureElementFallback = async (req, res) => {
  try {
    const { id } = req.params; // ModelNatureElement ID
    const { fallback_value } = req.body;

    logger.info('Updating fallback value for ModelNatureElement:', { id, fallback_value });

    // Find the ModelNatureElement
    const modelNatureElement = await ModelNatureElement.findByPk(id);

    if (!modelNatureElement) {
      return res.status(404).json({
        success: false,
        error: 'ModelNatureElement not found',
      });
    }

    // Update fallback_value
    await modelNatureElement.update({
      fallback_value: fallback_value !== null && fallback_value !== undefined ? fallback_value : null,
    });

    logger.info('Fallback value updated successfully');

    return res.status(200).json({
      success: true,
      message: 'Fallback value updated successfully',
      data: modelNatureElement,
    });
  } catch (error) {
    logger.error('Update Model Nature Element Fallback Error:', {
      message: error.message,
      stack: error.stack,
      id: req.params.id,
    });
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to update fallback value',
    });
  }
};
