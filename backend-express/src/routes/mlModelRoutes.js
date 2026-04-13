const express = require('express');
const router = express.Router();
const {
  getAllMLModels,
  getMLModelById,
  createMLModel,
  updateMLModel,
  deleteMLModel,
  toggleMLModelStatus,
  uploadModelFile,
  checkDuplicate,
  updateModelNatureElementFallback,
} = require('../controllers/mlModelController');
const { authenticate, authorize } = require('../middlewares/authMiddleware');
const { upload } = require('../middlewares/uploadModel');

/**
 * @swagger
 * tags:
 *   name: ML Models
 *   description: Machine Learning Model management endpoints
 */

/**
 * @swagger
 * /ml-models:
 *   get:
 *     summary: Get all ML models with optional filters
 *     tags: [ML Models]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: is_active
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *       - in: query
 *         name: area_type
 *         schema:
 *           type: string
 *           enum: [oyster, cobia]
 *         description: Filter by area type
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by model name
 *     responses:
 *       200:
 *         description: List of ML models retrieved successfully
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/', authenticate, getAllMLModels);

/**
 * @swagger
 * /ml-models/{id}:
 *   get:
 *     summary: Get a single ML model by ID
 *     tags: [ML Models]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ML Model ID
 *     responses:
 *       200:
 *         description: ML Model retrieved successfully
 *       404:
 *         description: ML Model not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/:id', authenticate, getMLModelById);

/**
 * @route POST /api/express/ml-models/check-duplicate
 * @desc Check for duplicate model names and file paths
 * @access Private
 */
router.post('/check-duplicate', authenticate, checkDuplicate);

/**
 * @swagger
 * /ml-models:
 *   post:
 *     summary: Create a new ML model (Admin only)
 *     tags: [ML Models]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 description: Model name
 *               description:
 *                 type: string
 *                 description: Model description
 *               model_file_path:
 *                 type: string
 *                 description: Path to model file
 *               area_type:
 *                 type: string
 *                 enum: [oyster, cobia]
 *                 description: Area type for this model
 *               is_active:
 *                 type: boolean
 *                 description: Active status
 *               natureElements:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     nature_element_id:
 *                       type: integer
 *                     is_required:
 *                       type: boolean
 *                     input_order:
 *                       type: integer
 *     responses:
 *       201:
 *         description: ML Model created successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       409:
 *         description: Model name already exists
 *       500:
 *         description: Internal server error
 */
router.post('/', authenticate, authorize(['admin']), createMLModel);

/**
 * @swagger
 * /ml-models/{id}:
 *   put:
 *     summary: Update an ML model (Admin only)
 *     tags: [ML Models]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ML Model ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               model_file_path:
 *                 type: string
 *               area_type:
 *                 type: string
 *                 enum: [oyster, cobia]
 *               is_active:
 *                 type: boolean
 *               natureElements:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     nature_element_id:
 *                       type: integer
 *                     is_required:
 *                       type: boolean
 *                     input_order:
 *                       type: integer
 *     responses:
 *       200:
 *         description: ML Model updated successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: ML Model not found
 *       409:
 *         description: Model name already exists
 *       500:
 *         description: Internal server error
 */
router.put('/:id', authenticate, authorize(['admin']), updateMLModel);

/**
 * @swagger
 * /ml-models/{id}:
 *   delete:
 *     summary: Delete an ML model (Admin only)
 *     tags: [ML Models]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ML Model ID
 *     responses:
 *       200:
 *         description: ML Model deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: ML Model not found
 *       500:
 *         description: Internal server error
 */
router.delete('/:id', authenticate, authorize(['admin']), deleteMLModel);

/**
 * @swagger
 * /ml-models/{id}/toggle-status:
 *   patch:
 *     summary: Toggle ML model active status (Admin only)
 *     tags: [ML Models]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ML Model ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - is_active
 *             properties:
 *               is_active:
 *                 type: boolean
 *                 description: New active status
 *     responses:
 *       200:
 *         description: ML Model status toggled successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: ML Model not found
 *       500:
 *         description: Internal server error
 */
router.patch('/:id/toggle-status', authenticate, authorize(['admin']), toggleMLModelStatus);

/**
 * @swagger
 * /ml-models/{id}/upload:
 *   post:
 *     summary: Upload ML model file (.pkl) (Admin only)
 *     tags: [ML Models]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ML Model ID
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: ML model file (.pkl)
 *     responses:
 *       200:
 *         description: Model file uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     name:
 *                       type: string
 *                     model_file_path:
 *                       type: string
 *                     uploaded_file:
 *                       type: string
 *       400:
 *         description: Bad request - No file or invalid file type
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: ML Model not found
 *       500:
 *         description: Internal server error
 */
router.post(
  '/:id/upload',
  authenticate,
  authorize(['admin']),
  upload.single('file'),
  uploadModelFile
);

/**
 * @swagger
 * /ml-models/nature-element/{id}:
 *   put:
 *     summary: Update fallback value for a model's nature element
 *     tags: [ML Models]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ModelNatureElement ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fallback_value:
 *                 type: number
 *                 description: Fallback value for this nature element in this model
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Fallback value updated successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: ModelNatureElement not found
 *       500:
 *         description: Internal server error
 */
router.put(
  '/nature-element/:id',
  authenticate,
  authorize(['admin']),
  updateModelNatureElementFallback
);

module.exports = router;

