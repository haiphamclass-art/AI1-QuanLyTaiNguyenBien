const express = require('express');
const {
  createPrediction,
  getLatestPrediction,
  getPredictionHistory,
  getPredictionDetails,
  getPredictionsByUser,
  getAllPredictionsWithFilters,
  createBatchPrediction,
  getPredictionChartData,
  getAllPredictionChartData,
  createBatchPredictionFromExcel2,
  getLatestPredictionStats,
  exportPredictionsToExcel,
  getPredictionComparison,
  getConsecutivePoorAreas,
  getPredictionTrendByBatch,
  getPredictionStatsByAreaType,
  deletePredictions,
} = require('../controllers/predictionController');
const { authenticate, authorize } = require('../middlewares/authMiddleware');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const logger = require('../config/logger');

const router = express.Router();

/**
 * @swagger
 * /predictions/batch:
 *   post:
 *     summary: Create batch predictions
 *     tags: [Predictions]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - predictions
 *             properties:
 *               predictions:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - area_id
 *                     - prediction_data
 *                   properties:
 *                     area_id:
 *                       type: integer
 *                       example: 1
 *                     prediction_data:
 *                       type: object
 *                       example: {"temperature": 25, "salinity": 30, "ph": 7.5}
 *     responses:
 *       201:
 *         description: Batch predictions created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.post(
  '/batch',
  authenticate,
  authorize(['expert']),
  createBatchPrediction
);

/**
 * @swagger
 * /predictions/batch-delete:
 *   delete:
 *     summary: Delete multiple predictions by IDs
 *     tags: [Predictions]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - predictionIds
 *             properties:
 *               predictionIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 example: [1, 2, 3, 4, 5]
 *                 description: Array of prediction IDs to delete
 *     responses:
 *       200:
 *         description: Predictions deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Successfully deleted 5 prediction(s)"
 *                 deletedCount:
 *                   type: integer
 *                   example: 5
 *                 requestedCount:
 *                   type: integer
 *                   example: 5
 *       400:
 *         description: Bad request - Invalid input
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - No permission to delete these predictions
 *       404:
 *         description: No predictions found with provided IDs
 */
router.delete(
  '/batch-delete',
  authenticate,
  authorize(['admin', 'manager']),
  deletePredictions
);

/**
 * @swagger
 * /predictions/excel:
 *   post:
 *     summary: Upload Excel file for batch predictions
 *     tags: [Predictions]
 *     security:
 *       - cookieAuth: []
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
 *                 description: Excel file containing prediction data
 *     responses:
 *       201:
 *         description: Excel file processed and predictions created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Excel file processed successfully"
 *                 predictions_created:
 *                   type: integer
 *                   example: 10
 *       400:
 *         description: Bad request or invalid file format
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
// Replace legacy excel import with job enqueue (xlsx-import)
router.post('/excel', authenticate, authorize(['expert']), upload.single('file'), async (req, res) => {
  try {
    const boss = req.app.get('boss');
    if (!boss) {
      logger.error('[API] Boss not available');
      return res.status(500).json({ error: 'job_queue_not_ready' });
    }

    if (!req.file) return res.status(400).json({ error: 'XLSX file is required (field: file)' });
    const callerId = req.user?.id;
    const { areaId, modelName } = req.body || {};
    if (!callerId || !areaId || !modelName) return res.status(400).json({ error: 'userId (from token), areaId, modelName are required' });
    const fs = require('fs'); const path = require('path');
    const uploadsDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    const fileName = `${Date.now()}-${req.file.originalname}`;
    const filePath = path.join(uploadsDir, fileName);
    fs.writeFileSync(filePath, req.file.buffer);

    const jobData = { path: filePath, originalname: req.file.originalname, userId: callerId, areaId, modelName };
    logger.info('[API] Enqueueing Excel import job (MÃ¡ÂºÂ«u 1)', { userId: callerId, areaId, modelName, file: req.file.originalname, size: req.file.size });
    logger.debug('[API] Job data', jobData);

    const jobId = await boss.send('xlsx-import', jobData, { retryLimit: 0 });

    if (!jobId) {
      logger.error('[API] Failed to get jobId from boss.send()', { returned: jobId });
      return res.status(500).json({ error: 'failed_to_get_job_id' });
    }

    logger.info('[API] Excel import job enqueued successfully', { jobId, file: req.file.originalname });
    return res.json({
      jobId,
      message: 'Vui lòng đợi trong khi hệ thống đang xử lý và tạo dự đoán mới. Bạn có thể theo dõi tiến trình tại trang Jobs.',
      redirect: '/jobs'
    });
  } catch (e) {
    logger.error('[API] Failed to enqueue Excel import job', { error: e.message, stack: e.stack });
    return res.status(500).json({ error: 'failed_to_queue', message: e.message });
  }
});

// Excel2 template import via job
router.post('/excel2', authenticate, authorize(['expert']), upload.single('file'), async (req, res) => {
  try {
    const boss = req.app.get('boss');
    if (!boss) {
      logger.error('[API] Boss not available');
      return res.status(500).json({ error: 'job_queue_not_ready' });
    }

    if (!req.file) return res.status(400).json({ error: 'XLSX file is required (field: file)' });
    const callerId = req.user?.id;
    const { modelName } = req.body || {};
    if (!callerId) return res.status(400).json({ error: 'userId (from token) is required' });
    const fs = require('fs'); const path = require('path');
    const uploadsDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    const fileName = `${Date.now()}-${req.file.originalname}`;
    const filePath = path.join(uploadsDir, fileName);
    fs.writeFileSync(filePath, req.file.buffer);

    const jobData = { path: filePath, originalname: req.file.originalname, userId: callerId, modelName, template: 'excel2' };
    logger.info('[API] Enqueueing Excel import job (MÃ¡ÂºÂ«u 2)', { userId: callerId, modelName, file: req.file.originalname, size: req.file.size });
    logger.debug('[API] Job data', jobData);

    const jobId = await boss.send('xlsx-import', jobData, { retryLimit: 0 });

    if (!jobId) {
      logger.error('[API] Failed to get jobId from boss.send()', { returned: jobId });
      return res.status(500).json({ error: 'failed_to_get_job_id' });
    }

    logger.info('[API] Excel import job (MÃ¡ÂºÂ«u 2) enqueued successfully', { jobId, file: req.file.originalname });
    return res.json({
      jobId,
      message: 'Vui lòng đợi trong khi hệ thống đang xử lý và tạo dự đoán mới. Bạn có thể theo dõi tiến trình tại trang Jobs.',
      redirect: '/jobs'
    });
  } catch (e) {
    logger.error('[API] Failed to enqueue Excel import job (MÃ¡ÂºÂ«u 2)', { error: e.message, stack: e.stack });
    return res.status(500).json({ error: 'failed_to_queue', message: e.message });
  }
});

// New CSV import via job (csv-import)
router.post('/csv', authenticate, authorize(['expert']), upload.single('file'), async (req, res) => {
  try {
    const boss = req.app.get('boss');
    if (!boss) {
      logger.error('[API] Boss not available');
      return res.status(500).json({ error: 'job_queue_not_ready' });
    }

    if (!req.file) return res.status(400).json({ error: 'CSV file is required (field: file)' });
    const callerId = req.user?.id;
    const { areaId, modelName } = req.body || {};
    if (!callerId || !areaId || !modelName) return res.status(400).json({ error: 'userId (from token), areaId, modelName are required' });
    const fs = require('fs'); const path = require('path');
    const uploadsDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    const fileName = `${Date.now()}-${req.file.originalname}`;
    const filePath = path.join(uploadsDir, fileName);
    fs.writeFileSync(filePath, req.file.buffer);

    const jobData = { path: filePath, originalname: req.file.originalname, userId: callerId, areaId, modelName };
    logger.info('[API] Enqueueing CSV import job', { userId: callerId, areaId, modelName, file: req.file.originalname, size: req.file.size });
    logger.debug('[API] Job data', jobData);

    const jobId = await boss.send('csv-import', jobData, { retryLimit: 0 });

    if (!jobId) {
      logger.error('[API] Failed to get jobId from boss.send()', { returned: jobId });
      return res.status(500).json({ error: 'failed_to_get_job_id' });
    }

    logger.info('[API] CSV import job enqueued successfully', { jobId, file: req.file.originalname });
    return res.json({
      jobId,
      message: 'Vui lòng đợi trong khi hệ thống đang xử lý và tạo dự đoán mới. Bạn có thể theo dõi tiến trình tại trang Jobs.',
      redirect: '/jobs'
    });
  } catch (e) {
    logger.error('[API] Failed to enqueue CSV import job', { error: e.message, stack: e.stack });
    return res.status(500).json({ error: 'failed_to_queue', message: e.message });
  }
});

/**
 * @swagger
 * /predictions:
 *   post:
 *     summary: Create single prediction
 *     tags: [Predictions]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - area_id
 *               - prediction_data
 *             properties:
 *               area_id:
 *                 type: integer
 *                 example: 1
 *               prediction_data:
 *                 type: object
 *                 example: {"temperature": 25, "salinity": 30, "ph": 7.5}
 *               user_id:
 *                 type: integer
 *                 example: 1
 *     responses:
 *       201:
 *         description: Prediction created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       400:
 *         description: Bad request
 *       500:
 *         description: Server error
 */
router.post(
  '/',
  authenticate,
  authorize(['expert']),
  createPrediction
);

/**
 * @swagger
 * /predictions/admin/export-excel:
 *   get:
 *     summary: Export predictions to Excel (Admin/Manager only)
 *     tags: [Predictions]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: areaId
 *         schema:
 *           type: integer
 *         description: Filter by area ID
 *       - in: query
 *         name: userId
 *         schema:
 *           type: integer
 *         description: Filter by user ID
 *       - in: query
 *         name: predictionResult
 *         schema:
 *           type: integer
 *           enum: [-1, 0, 1]
 *         description: Filter by prediction result (-1=Poor, 0=Average, 1=Good)
 *       - in: query
 *         name: areaType
 *         schema:
 *           type: string
 *           enum: [oyster, cobia]
 *         description: Filter by area type
 *       - in: query
 *         name: province
 *         schema:
 *           type: string
 *         description: Filter by province UUID
 *       - in: query
 *         name: district
 *         schema:
 *           type: string
 *         description: Filter by district UUID
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by start date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by end date
 *     responses:
 *       200:
 *         description: Excel file download
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 *       403:
 *         description: Forbidden
 *       404:
 *         description: No predictions found
 *       500:
 *         description: Server error
 */
router.get(
  '/admin/export-excel',
  authenticate,
  authorize(['admin', 'manager']),
  exportPredictionsToExcel
);

/**
 * @swagger
 * /predictions/admin:
 *   get:
 *     summary: Get all predictions with filters (Admin/Manager only)
 *     tags: [Predictions]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of predictions per page
 *       - in: query
 *         name: area_id
 *         schema:
 *           type: integer
 *         description: Filter by area ID
 *       - in: query
 *         name: user_id
 *         schema:
 *           type: integer
 *         description: Filter by user ID
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by start date
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by end date
     *     responses:
     *       200:
     *         description: List of predictions with filters
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 rows:
     *                   type: array
     *                   description: Array of prediction objects
     *                   items:
     *                     type: object
     *                     properties:
     *                       id:
     *                         type: integer
     *                         description: Prediction ID
     *                         example: 1
     *                       user_id:
     *                         type: integer
     *                         description: User ID who made the prediction
     *                         example: 1
     *                       area_id:
     *                         type: integer
     *                         description: Area ID for the prediction
     *                         example: 1
     *                       prediction_text:
     *                         type: string
     *                         description: Prediction result text
     *                         example: "Good conditions for aquaculture"
     *                       createdAt:
     *                         type: string
     *                         format: date-time
     *                         description: Creation timestamp
     *                         example: "2024-01-01T00:00:00Z"
     *                       updatedAt:
     *                         type: string
     *                         format: date-time
     *                         description: Last update timestamp
     *                         example: "2024-01-01T00:00:00Z"
     *                       Area:
     *                         type: object
     *                         description: Associated area information
     *                         properties:
     *                           id:
     *                             type: integer
     *                             example: 1
     *                           name:
     *                             type: string
     *                             example: "Khu vÃ¡Â»Â±c nuÃƒÂ´i hÃƒÂ u A"
     *                 count:
     *                   type: integer
     *                   description: Total number of predictions
     *                   example: 15
     *             examples:
     *               success:
     *                 summary: Successful response
     *                 value:
     *                   rows:
     *                     - id: 1
     *                       area_id: 1
     *                       user_id: 1
     *                       prediction_text: "Good conditions for oyster farming. Water quality parameters are within optimal ranges."
     *                       createdAt: "2024-01-01T00:00:00Z"
     *                       updatedAt: "2024-01-01T00:00:00Z"
     *                       Area:
     *                         id: 1
     *                         name: "Khu vÃ¡Â»Â±c nuÃƒÂ´i hÃƒÂ u A"
     *                     - id: 2
     *                       area_id: 2
     *                       user_id: 1
     *                       prediction_text: "Moderate conditions for cobia farming. Monitor water temperature closely."
     *                       createdAt: "2024-01-01T00:00:00Z"
     *                       updatedAt: "2024-01-01T00:00:00Z"
     *                       Area:
     *                         id: 2
     *                         name: "Khu vÃ¡Â»Â±c nuÃƒÂ´i cÃƒÂ¡ cobia B"
     *                   count: 15
     *       401:
     *         description: Unauthorized
     *       403:
     *         description: Forbidden
 */
router.get(
  '/admin',
  authenticate,
  getAllPredictionsWithFilters
);

/**
 * @swagger
 * /predictions/{areaId}/latest:
 *   get:
 *     summary: Get latest prediction for an area (Public)
 *     tags: [Predictions]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: areaId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Area ID
 *     responses:
 *       200:
 *         description: Latest prediction for the area
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Prediction'
 *       404:
 *         description: No prediction found for the area
 *       500:
 *         description: Server error
 */
router.get('/:areaId/latest', getLatestPrediction);

/**
 * @swagger
 * /predictions/{areaId}/history:
 *   get:
 *     summary: Get prediction history for an area (Public)
 *     tags: [Predictions]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: areaId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Area ID
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of historical predictions to return
 *     responses:
 *       200:
 *         description: Prediction history for the area
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Prediction'
 *       404:
 *         description: Area not found
 *       500:
 *         description: Server error
 */
router.get('/:areaId/history', getPredictionHistory);

/**
 * @swagger
 * /predictions/{predictionId}:
 *   get:
 *     summary: Get prediction details by ID
 *     tags: [Predictions]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: predictionId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Prediction ID
 *     responses:
 *       200:
 *         description: Prediction details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Prediction'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Prediction not found
 */
router.get(
  '/:predictionId',
  authenticate,
  authorize(['expert', 'admin', 'manager']),
  getPredictionDetails
);

/**
 * @swagger
 * /predictions/user/{userId}:
 *   get:
 *     summary: Get predictions by user ID (Expert only)
 *     tags: [Predictions]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of predictions per page
 *     responses:
 *       200:
 *         description: Predictions created by the user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 predictions:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Prediction'
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: User not found
 */
router.get(
  '/user/:userId',
  authenticate,
  authorize(['expert']),
  getPredictionsByUser
);

/**
 * @swagger
 * /predictions/chart/data:
 *   get:
 *     summary: Get prediction data for charts
 *     tags: [Predictions]
 *     parameters:
 *       - in: query
 *         name: area_id
 *         schema:
 *           type: integer
 *         description: Filter by area ID
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 30
 *         description: Number of days to include in chart data
 *     responses:
 *       200:
 *         description: Chart data for predictions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 labels:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["2024-01-01", "2024-01-02", "2024-01-03"]
 *                 datasets:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       label:
 *                         type: string
 *                       data:
 *                         type: array
 *                         items:
 *                           type: number
 *       500:
 *         description: Server error
 */
router.get(
  '/chart/data',
  getPredictionChartData
);

/**
 * @swagger
 * /predictions/chart/all:
 *   get:
 *     summary: Get all prediction data for charts (all areas)
 *     tags: [Predictions]
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 30
 *         description: Number of days to include in chart data
 *     responses:
 *       200:
 *         description: Chart data for all predictions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 areas:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       area_id:
 *                         type: integer
 *                       area_name:
 *                         type: string
 *                       data:
 *                         type: object
 *                         properties:
 *                           labels:
 *                             type: array
 *                             items:
 *                               type: string
 *                           datasets:
 *                             type: array
 *                             items:
 *                               type: object
 *       500:
 *         description: Server error
 */
router.get(
  '/chart/all',
  getAllPredictionChartData
);

/**
 * @swagger
 * /predictions/stats/latest-ratio:
 *   get:
 *     summary: TÃ¡Â»Â· lÃ¡Â»â€¡ kÃ¡ÂºÂ¿t quÃ¡ÂºÂ£ dÃ¡Â»Â± Ã„â€˜oÃƒÂ¡n mÃ¡Â»â€ºi nhÃ¡ÂºÂ¥t cÃ¡Â»Â§a mÃ¡Â»â€”i vÃƒÂ¹ng (TÃ¡Â»â€˜t/TB/KÃƒÂ©m)
 *     tags: [Predictions]
 *     parameters:
 *       - in: query
 *         name: beforeDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Xem thÃ¡Â»â€˜ng kÃƒÂª tÃ¡ÂºÂ¡i thÃ¡Â»Âi Ã„â€˜iÃ¡Â»Æ’m cÃ¡Â»Â¥ thÃ¡Â»Æ’ (YYYY-MM-DD)
 *         example: "2025-06-30"
 *     responses:
 *       200:
 *         description: ThÃ¡Â»â€˜ng kÃƒÂª tÃ¡Â»Â· lÃ¡Â»â€¡ dÃ¡Â»Â± Ã„â€˜oÃƒÂ¡n mÃ¡Â»â€ºi nhÃ¡ÂºÂ¥t
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 good:
 *                   type: integer
 *                   description: SÃ¡Â»â€˜ vÃƒÂ¹ng cÃƒÂ³ kÃ¡ÂºÂ¿t quÃ¡ÂºÂ£ TÃ¡Â»â€˜t
 *                 average:
 *                   type: integer
 *                   description: SÃ¡Â»â€˜ vÃƒÂ¹ng cÃƒÂ³ kÃ¡ÂºÂ¿t quÃ¡ÂºÂ£ Trung bÃƒÂ¬nh
 *                 poor:
 *                   type: integer
 *                   description: SÃ¡Â»â€˜ vÃƒÂ¹ng cÃƒÂ³ kÃ¡ÂºÂ¿t quÃ¡ÂºÂ£ KÃƒÂ©m
 *                 totalAreas:
 *                   type: integer
 *                   description: TÃ¡Â»â€¢ng sÃ¡Â»â€˜ vÃƒÂ¹ng cÃƒÂ³ dÃ¡Â»Â± Ã„â€˜oÃƒÂ¡n
 *             example:
 *               good: 15
 *               average: 8
 *               poor: 3
 *               totalAreas: 26
 *       500:
 *         description: Server error
 */
router.get(
  '/stats/latest-ratio',
  getLatestPredictionStats
);

/**
 * @swagger
 * /predictions/stats/comparison:
 *   get:
 *     summary: So sÃƒÂ¡nh kÃ¡ÂºÂ¿t quÃ¡ÂºÂ£ Ã„â€˜Ã¡Â»Â£t dÃ¡Â»Â± Ã„â€˜oÃƒÂ¡n mÃ¡Â»â€ºi nhÃ¡ÂºÂ¥t vÃ¡Â»â€ºi Ã„â€˜Ã¡Â»Â£t trÃ†Â°Ã¡Â»â€ºc
 *     tags: [Predictions]
 *     security:
 *       - cookieAuth: []
 *     description: |
 *       So sÃƒÂ¡nh kÃ¡ÂºÂ¿t quÃ¡ÂºÂ£ dÃ¡Â»Â± Ã„â€˜oÃƒÂ¡n giÃ¡Â»Â¯a Ã„â€˜Ã¡Â»Â£t mÃ¡Â»â€ºi nhÃ¡ÂºÂ¥t vÃƒÂ  Ã„â€˜Ã¡Â»Â£t trÃ†Â°Ã¡Â»â€ºc Ã„â€˜ÃƒÂ³ cÃ¡Â»Â§a mÃ¡Â»â€”i vÃƒÂ¹ng.
 *       - Ã„ÂÃ¡Â»Â£t mÃ¡Â»â€ºi nhÃ¡ÂºÂ¥t = prediction mÃ¡Â»â€ºi nhÃ¡ÂºÂ¥t cÃ¡Â»Â§a mÃ¡Â»â€”i area
 *       - Ã„ÂÃ¡Â»Â£t trÃ†Â°Ã¡Â»â€ºc = prediction mÃ¡Â»â€ºi nhÃ¡ÂºÂ¥t - 1 cÃ¡Â»Â§a mÃ¡Â»â€”i area
 *     parameters:
 *       - in: query
 *         name: beforeDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Xem so sÃƒÂ¡nh tÃ¡ÂºÂ¡i thÃ¡Â»Âi Ã„â€˜iÃ¡Â»Æ’m cÃ¡Â»Â¥ thÃ¡Â»Æ’
 *         example: "2025-06-30"
 *     responses:
 *       200:
 *         description: KÃ¡ÂºÂ¿t quÃ¡ÂºÂ£ so sÃƒÂ¡nh giÃ¡Â»Â¯a 2 Ã„â€˜Ã¡Â»Â£t
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               current:
 *                 good: 15
 *                 average: 8
 *                 poor: 3
 *                 total: 26
 *               previous:
 *                 good: 12
 *                 average: 10
 *                 poor: 4
 *                 total: 26
 *               changes:
 *                 improved: 5
 *                 unchanged: 18
 *                 worsened: 2
 *                 newAreas: 1
 *               details:
 *                 improved:
 *                   - areaId: 5
 *                     areaName: "VÃƒÂ¹ng nuÃƒÂ´i hÃƒÂ u A"
 *                     areaType: "oyster"
 *                     province: "Ninh BÃƒÂ¬nh"
 *                     district: "Kim SÃ†Â¡n"
 *                     from: -1
 *                     to: 0
 *                     fromText: "KÃƒÂ©m"
 *                     toText: "Trung bÃƒÂ¬nh"
 *                 worsened:
 *                   - areaId: 12
 *                     areaName: "VÃƒÂ¹ng nuÃƒÂ´i cÃƒÂ¡ B"
 *                     areaType: "cobia"
 *                     province: "QuÃ¡ÂºÂ£ng Ninh"
 *                     from: 1
 *                     to: 0
 *                     fromText: "TÃ¡Â»â€˜t"
 *                     toText: "Trung bÃƒÂ¬nh"
 */
router.get(
  '/stats/comparison',
  authenticate,
  authorize(['admin', 'manager']),
  getPredictionComparison
);

/**
 * @swagger
 * /predictions/stats/consecutive-poor:
 *   get:
 *     summary: CÃ¡ÂºÂ£nh bÃƒÂ¡o vÃƒÂ¹ng cÃƒÂ³ kÃ¡ÂºÂ¿t quÃ¡ÂºÂ£ KÃƒâ€°M liÃƒÂªn tiÃ¡ÂºÂ¿p
 *     tags: [Predictions]
 *     security:
 *       - cookieAuth: []
 *     description: |
 *       Danh sÃƒÂ¡ch cÃƒÂ¡c vÃƒÂ¹ng cÃƒÂ³ kÃ¡ÂºÂ¿t quÃ¡ÂºÂ£ KÃƒÂ©m liÃƒÂªn tiÃ¡ÂºÂ¿p nhiÃ¡Â»Âu Ã„â€˜Ã¡Â»Â£t.
 *       DÃƒÂ¹ng Ã„â€˜Ã¡Â»Æ’ cÃ¡ÂºÂ£nh bÃƒÂ¡o cÃƒÂ¡c vÃƒÂ¹ng cÃ¡ÂºÂ§n Ã„â€˜Ã†Â°Ã¡Â»Â£c chÃƒÂº ÃƒÂ½ Ã„â€˜Ã¡ÂºÂ·c biÃ¡Â»â€¡t.
 *     parameters:
 *       - in: query
 *         name: minConsecutive
 *         schema:
 *           type: integer
 *           default: 2
 *         description: SÃ¡Â»â€˜ Ã„â€˜Ã¡Â»Â£t xÃ¡ÂºÂ¥u liÃƒÂªn tiÃ¡ÂºÂ¿p tÃ¡Â»â€˜i thiÃ¡Â»Æ’u Ã„â€˜Ã¡Â»Æ’ cÃ¡ÂºÂ£nh bÃƒÂ¡o
 *         example: 2
 *       - in: query
 *         name: beforeDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Xem cÃ¡ÂºÂ£nh bÃƒÂ¡o tÃ¡ÂºÂ¡i thÃ¡Â»Âi Ã„â€˜iÃ¡Â»Æ’m cÃ¡Â»Â¥ thÃ¡Â»Æ’
 *     responses:
 *       200:
 *         description: Danh sÃƒÂ¡ch vÃƒÂ¹ng xÃ¡ÂºÂ¥u liÃƒÂªn tiÃ¡ÂºÂ¿p
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               total: 3
 *               minConsecutive: 2
 *               areas:
 *                 - areaId: 7
 *                   areaName: "VÃƒÂ¹ng nuÃƒÂ´i hÃƒÂ u C"
 *                   areaType: "oyster"
 *                   areaTypeName: "HÃƒÂ u"
 *                   province: "Ninh BÃƒÂ¬nh"
 *                   district: "Kim SÃ†Â¡n"
 *                   consecutiveCount: 4
 *                   lastPredictionDate: "2025-12-01T10:30:00.000Z"
 *                   predictions:
 *                     - id: 123
 *                       date: "2025-12-01T10:30:00.000Z"
 *                       result: -1
 *                     - id: 119
 *                       date: "2025-09-15T08:00:00.000Z"
 *                       result: -1
 *                 - areaId: 15
 *                   areaName: "VÃƒÂ¹ng nuÃƒÂ´i cÃƒÂ¡ D"
 *                   areaType: "cobia"
 *                   areaTypeName: "CÃƒÂ¡ giÃƒÂ²"
 *                   province: "QuÃ¡ÂºÂ£ng Ninh"
 *                   consecutiveCount: 2
 *                   lastPredictionDate: "2025-11-20T14:00:00.000Z"
 */
router.get(
  '/stats/consecutive-poor',
  authenticate,
  authorize(['admin', 'manager']),
  getConsecutivePoorAreas
);

/**
 * @swagger
 * /predictions/stats/trend-by-batch:
 *   get:
 *     summary: Xu hÃ†Â°Ã¡Â»â€ºng kÃ¡ÂºÂ¿t quÃ¡ÂºÂ£ theo chu kÃ¡Â»Â³ thÃ¡Â»Âi gian
 *     tags: [Predictions]
 *     security:
 *       - cookieAuth: []
 *     description: |
 *       ThÃ¡Â»â€˜ng kÃƒÂª xu hÃ†Â°Ã¡Â»â€ºng kÃ¡ÂºÂ¿t quÃ¡ÂºÂ£ dÃ¡Â»Â± Ã„â€˜oÃƒÂ¡n theo chu kÃ¡Â»Â³ (ngÃƒÂ y/tuÃ¡ÂºÂ§n/thÃƒÂ¡ng/quÃƒÂ½).
 *       
 *       **Logic:**
 *       - TÃ¡ÂºÂ¡o TÃ¡ÂºÂ¤T CÃ¡ÂºÂ¢ cÃƒÂ¡c Ã„â€˜iÃ¡Â»Æ’m trong khoÃ¡ÂºÂ£ng thÃ¡Â»Âi gian (vd: 30 ngÃƒÂ y gÃ¡ÂºÂ§n nhÃ¡ÂºÂ¥t)
 *       - NÃ¡ÂºÂ¿u cÃƒÂ³ nhiÃ¡Â»Âu dÃ¡Â»Â± Ã„â€˜oÃƒÂ¡n trong 1 chu kÃ¡Â»Â³ Ã¢â€ â€™ lÃ¡ÂºÂ¥y mÃ¡Â»â€ºi nhÃ¡ÂºÂ¥t
 *       - NÃ¡ÂºÂ¿u khÃƒÂ´ng cÃƒÂ³ dÃ¡Â»Â± Ã„â€˜oÃƒÂ¡n trong chu kÃ¡Â»Â³ Ã¢â€ â€™ lÃ¡ÂºÂ¥y cÃ¡Â»Â§a chu kÃ¡Â»Â³ gÃ¡ÂºÂ§n nhÃ¡ÂºÂ¥t trÃ†Â°Ã¡Â»â€ºc Ã„â€˜ÃƒÂ³ (carry forward)
 *       
 *       **VÃƒÂ­ dÃ¡Â»Â¥ vÃ¡Â»â€ºi period=day, limit=7:**
 *       TÃ¡ÂºÂ¡o 7 Ã„â€˜iÃ¡Â»Æ’m tÃ¡Â»Â« 7 ngÃƒÂ y trÃ†Â°Ã¡Â»â€ºc Ã„â€˜Ã¡ÂºÂ¿n hÃƒÂ´m nay
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [day, week, month, quarter]
 *           default: month
 *         description: |
 *           LoÃ¡ÂºÂ¡i chu kÃ¡Â»Â³:
 *           - day: Theo ngÃƒÂ y (vd: 30 ngÃƒÂ y gÃ¡ÂºÂ§n nhÃ¡ÂºÂ¥t)
 *           - week: Theo tuÃ¡ÂºÂ§n (vd: 10 tuÃ¡ÂºÂ§n gÃ¡ÂºÂ§n nhÃ¡ÂºÂ¥t)
 *           - month: Theo thÃƒÂ¡ng (vd: 12 thÃƒÂ¡ng gÃ¡ÂºÂ§n nhÃ¡ÂºÂ¥t)
 *           - quarter: Theo quÃƒÂ½ (vd: 4 quÃƒÂ½ gÃ¡ÂºÂ§n nhÃ¡ÂºÂ¥t)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 12
 *         description: SÃ¡Â»â€˜ chu kÃ¡Â»Â³ cÃ¡ÂºÂ§n lÃ¡ÂºÂ¥y
 *         example: 12
 *       - in: query
 *         name: beforeDate
 *         schema:
 *           type: string
 *           format: date
 *         description: NgÃƒÂ y kÃ¡ÂºÂ¿t thÃƒÂºc (mÃ¡ÂºÂ·c Ã„â€˜Ã¡Â»â€¹nh lÃƒÂ  hÃƒÂ´m nay)
 *         example: "2025-12-06"
 *     responses:
 *       200:
 *         description: DÃ¡Â»Â¯ liÃ¡Â»â€¡u xu hÃ†Â°Ã¡Â»â€ºng theo chu kÃ¡Â»Â³
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             examples:
 *               byDay:
 *                 summary: VÃƒÂ­ dÃ¡Â»Â¥ theo ngÃƒÂ y (period=day, limit=7)
 *                 value:
 *                   totalPeriods: 7
 *                   period: "day"
 *                   startDate: "2025-11-30"
 *                   endDate: "2025-12-06"
 *                   trend:
 *                     - periodKey: "2025-11-30"
 *                       label: "30/11"
 *                       good: 10
 *                       average: 5
 *                       poor: 2
 *                       total: 17
 *                       goodPercent: 58.8
 *                       averagePercent: 29.4
 *                       poorPercent: 11.8
 *                     - periodKey: "2025-12-01"
 *                       label: "01/12"
 *                       good: 10
 *                       average: 5
 *                       poor: 2
 *                       total: 17
 *                       goodPercent: 58.8
 *                       averagePercent: 29.4
 *                       poorPercent: 11.8
 *                     - periodKey: "2025-12-06"
 *                       label: "06/12"
 *                       good: 13
 *                       average: 3
 *                       poor: 1
 *                       total: 17
 *                       goodPercent: 76.5
 *                       averagePercent: 17.6
 *                       poorPercent: 5.9
 *               byMonth:
 *                 summary: VÃƒÂ­ dÃ¡Â»Â¥ theo thÃƒÂ¡ng (period=month, limit=6)
 *                 value:
 *                   totalPeriods: 6
 *                   period: "month"
 *                   startDate: "2025-07-01"
 *                   endDate: "2025-12-06"
 *                   trend:
 *                     - periodKey: "2025-07"
 *                       label: "07/2025"
 *                       good: 8
 *                       average: 6
 *                       poor: 3
 *                       total: 17
 *                       goodPercent: 47.1
 *                       averagePercent: 35.3
 *                       poorPercent: 17.6
 *                     - periodKey: "2025-12"
 *                       label: "12/2025"
 *                       good: 13
 *                       average: 3
 *                       poor: 1
 *                       total: 17
 *                       goodPercent: 76.5
 *                       averagePercent: 17.6
 *                       poorPercent: 5.9
 *               byQuarter:
 *                 summary: VÃƒÂ­ dÃ¡Â»Â¥ theo quÃƒÂ½ (period=quarter, limit=4)
 *                 value:
 *                   totalPeriods: 4
 *                   period: "quarter"
 *                   startDate: "2025-01-01"
 *                   endDate: "2025-12-06"
 *                   trend:
 *                     - periodKey: "2025-Q1"
 *                       label: "Q1/2025"
 *                       good: 5
 *                       average: 8
 *                       poor: 4
 *                       total: 17
 *                       goodPercent: 29.4
 *                       averagePercent: 47.1
 *                       poorPercent: 23.5
 *                     - periodKey: "2025-Q4"
 *                       label: "Q4/2025"
 *                       good: 13
 *                       average: 3
 *                       poor: 1
 *                       total: 17
 *                       goodPercent: 76.5
 *                       averagePercent: 17.6
 *                       poorPercent: 5.9
 */
router.get(
  '/stats/trend-by-batch',
  authenticate,
  authorize(['admin', 'manager']),
  getPredictionTrendByBatch
);

/**
 * @swagger
 * /predictions/stats/by-area-type:
 *   get:
 *     summary: ThÃ¡Â»â€˜ng kÃƒÂª dÃ¡Â»Â± Ã„â€˜oÃƒÂ¡n theo loÃ¡ÂºÂ¡i vÃƒÂ¹ng (HÃƒÂ u/CÃƒÂ¡ giÃƒÂ²)
 *     tags: [Predictions]
 *     security:
 *       - cookieAuth: []
 *     description: |
 *       ThÃ¡Â»â€˜ng kÃƒÂª kÃ¡ÂºÂ¿t quÃ¡ÂºÂ£ dÃ¡Â»Â± Ã„â€˜oÃƒÂ¡n phÃƒÂ¢n theo loÃ¡ÂºÂ¡i vÃƒÂ¹ng nuÃƒÂ´i trÃ¡Â»â€œng.
 *       Bao gÃ¡Â»â€œm so sÃƒÂ¡nh vÃ¡Â»â€ºi Ã„â€˜Ã¡Â»Â£t trÃ†Â°Ã¡Â»â€ºc Ã„â€˜Ã¡Â»Æ’ thÃ¡ÂºÂ¥y xu hÃ†Â°Ã¡Â»â€ºng thay Ã„â€˜Ã¡Â»â€¢i.
 *     parameters:
 *       - in: query
 *         name: beforeDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Xem thÃ¡Â»â€˜ng kÃƒÂª tÃ¡ÂºÂ¡i thÃ¡Â»Âi Ã„â€˜iÃ¡Â»Æ’m cÃ¡Â»Â¥ thÃ¡Â»Æ’
 *     responses:
 *       200:
 *         description: ThÃ¡Â»â€˜ng kÃƒÂª theo loÃ¡ÂºÂ¡i vÃƒÂ¹ng vÃ¡Â»â€ºi so sÃƒÂ¡nh Ã„â€˜Ã¡Â»Â£t trÃ†Â°Ã¡Â»â€ºc
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               byAreaType:
 *                 - type: "oyster"
 *                   name: "HÃƒÂ u"
 *                   current:
 *                     good: 10
 *                     average: 5
 *                     poor: 2
 *                     total: 17
 *                   previous:
 *                     good: 8
 *                     average: 6
 *                     poor: 3
 *                     total: 17
 *                   changes:
 *                     improved: 4
 *                     unchanged: 11
 *                     worsened: 2
 *                 - type: "cobia"
 *                   name: "CÃƒÂ¡ giÃƒÂ²"
 *                   current:
 *                     good: 5
 *                     average: 3
 *                     poor: 1
 *                     total: 9
 *                   previous:
 *                     good: 4
 *                     average: 4
 *                     poor: 1
 *                     total: 9
 *                   changes:
 *                     improved: 2
 *                     unchanged: 6
 *                     worsened: 1
 */
router.get(
  '/stats/by-area-type',
  authenticate,
  authorize(['admin', 'manager']),
  getPredictionStatsByAreaType
);

module.exports = router;

