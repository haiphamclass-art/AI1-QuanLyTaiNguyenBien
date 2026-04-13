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
 *       - bearerAuth: []
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
 *       - bearerAuth: []
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
 *       - bearerAuth: []
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
    logger.info('[API] Enqueueing Excel import job (Mẫu 1)', { userId: callerId, areaId, modelName, file: req.file.originalname, size: req.file.size });
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
    logger.info('[API] Enqueueing Excel import job (Mẫu 2)', { userId: callerId, modelName, file: req.file.originalname, size: req.file.size });
    logger.debug('[API] Job data', jobData);

    const jobId = await boss.send('xlsx-import', jobData, { retryLimit: 0 });

    if (!jobId) {
      logger.error('[API] Failed to get jobId from boss.send()', { returned: jobId });
      return res.status(500).json({ error: 'failed_to_get_job_id' });
    }

    logger.info('[API] Excel import job (Mẫu 2) enqueued successfully', { jobId, file: req.file.originalname });
    return res.json({
      jobId,
      message: 'Vui lòng đợi trong khi hệ thống đang xử lý và tạo dự đoán mới. Bạn có thể theo dõi tiến trình tại trang Jobs.',
      redirect: '/jobs'
    });
  } catch (e) {
    logger.error('[API] Failed to enqueue Excel import job (Mẫu 2)', { error: e.message, stack: e.stack });
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
 *       - bearerAuth: []
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
 *       - bearerAuth: []
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
     *                             example: "Khu vực nuôi hàu A"
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
     *                         name: "Khu vực nuôi hàu A"
     *                     - id: 2
     *                       area_id: 2
     *                       user_id: 1
     *                       prediction_text: "Moderate conditions for cobia farming. Monitor water temperature closely."
     *                       createdAt: "2024-01-01T00:00:00Z"
     *                       updatedAt: "2024-01-01T00:00:00Z"
     *                       Area:
     *                         id: 2
     *                         name: "Khu vực nuôi cá cobia B"
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
 *       - bearerAuth: []
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
 *       - bearerAuth: []
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
 *     summary: Tỷ lệ kết quả dự đoán mới nhất của mỗi vùng (Tốt/TB/Kém)
 *     tags: [Predictions]
 *     parameters:
 *       - in: query
 *         name: beforeDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Xem thống kê tại thời điểm cụ thể (YYYY-MM-DD)
 *         example: "2025-06-30"
 *     responses:
 *       200:
 *         description: Thống kê tỷ lệ dự đoán mới nhất
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 good:
 *                   type: integer
 *                   description: Số vùng có kết quả Tốt
 *                 average:
 *                   type: integer
 *                   description: Số vùng có kết quả Trung bình
 *                 poor:
 *                   type: integer
 *                   description: Số vùng có kết quả Kém
 *                 totalAreas:
 *                   type: integer
 *                   description: Tổng số vùng có dự đoán
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
 *     summary: So sánh kết quả đợt dự đoán mới nhất với đợt trước
 *     tags: [Predictions]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       So sánh kết quả dự đoán giữa đợt mới nhất và đợt trước đó của mỗi vùng.
 *       - Đợt mới nhất = prediction mới nhất của mỗi area
 *       - Đợt trước = prediction mới nhất - 1 của mỗi area
 *     parameters:
 *       - in: query
 *         name: beforeDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Xem so sánh tại thời điểm cụ thể
 *         example: "2025-06-30"
 *     responses:
 *       200:
 *         description: Kết quả so sánh giữa 2 đợt
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
 *                     areaName: "Vùng nuôi hàu A"
 *                     areaType: "oyster"
 *                     province: "Ninh Bình"
 *                     district: "Kim Sơn"
 *                     from: -1
 *                     to: 0
 *                     fromText: "Kém"
 *                     toText: "Trung bình"
 *                 worsened:
 *                   - areaId: 12
 *                     areaName: "Vùng nuôi cá B"
 *                     areaType: "cobia"
 *                     province: "Quảng Ninh"
 *                     from: 1
 *                     to: 0
 *                     fromText: "Tốt"
 *                     toText: "Trung bình"
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
 *     summary: Cảnh báo vùng có kết quả KÉM liên tiếp
 *     tags: [Predictions]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       Danh sách các vùng có kết quả Kém liên tiếp nhiều đợt.
 *       Dùng để cảnh báo các vùng cần được chú ý đặc biệt.
 *     parameters:
 *       - in: query
 *         name: minConsecutive
 *         schema:
 *           type: integer
 *           default: 2
 *         description: Số đợt xấu liên tiếp tối thiểu để cảnh báo
 *         example: 2
 *       - in: query
 *         name: beforeDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Xem cảnh báo tại thời điểm cụ thể
 *     responses:
 *       200:
 *         description: Danh sách vùng xấu liên tiếp
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               total: 3
 *               minConsecutive: 2
 *               areas:
 *                 - areaId: 7
 *                   areaName: "Vùng nuôi hàu C"
 *                   areaType: "oyster"
 *                   areaTypeName: "Hàu"
 *                   province: "Ninh Bình"
 *                   district: "Kim Sơn"
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
 *                   areaName: "Vùng nuôi cá D"
 *                   areaType: "cobia"
 *                   areaTypeName: "Cá giò"
 *                   province: "Quảng Ninh"
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
 *     summary: Xu hướng kết quả theo chu kỳ thời gian
 *     tags: [Predictions]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       Thống kê xu hướng kết quả dự đoán theo chu kỳ (ngày/tuần/tháng/quý).
 *       
 *       **Logic:**
 *       - Tạo TẤT CẢ các điểm trong khoảng thời gian (vd: 30 ngày gần nhất)
 *       - Nếu có nhiều dự đoán trong 1 chu kỳ → lấy mới nhất
 *       - Nếu không có dự đoán trong chu kỳ → lấy của chu kỳ gần nhất trước đó (carry forward)
 *       
 *       **Ví dụ với period=day, limit=7:**
 *       Tạo 7 điểm từ 7 ngày trước đến hôm nay
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [day, week, month, quarter]
 *           default: month
 *         description: |
 *           Loại chu kỳ:
 *           - day: Theo ngày (vd: 30 ngày gần nhất)
 *           - week: Theo tuần (vd: 10 tuần gần nhất)
 *           - month: Theo tháng (vd: 12 tháng gần nhất)
 *           - quarter: Theo quý (vd: 4 quý gần nhất)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 12
 *         description: Số chu kỳ cần lấy
 *         example: 12
 *       - in: query
 *         name: beforeDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Ngày kết thúc (mặc định là hôm nay)
 *         example: "2025-12-06"
 *     responses:
 *       200:
 *         description: Dữ liệu xu hướng theo chu kỳ
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             examples:
 *               byDay:
 *                 summary: Ví dụ theo ngày (period=day, limit=7)
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
 *                 summary: Ví dụ theo tháng (period=month, limit=6)
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
 *                 summary: Ví dụ theo quý (period=quarter, limit=4)
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
 *     summary: Thống kê dự đoán theo loại vùng (Hàu/Cá giò)
 *     tags: [Predictions]
 *     security:
 *       - bearerAuth: []
 *     description: |
 *       Thống kê kết quả dự đoán phân theo loại vùng nuôi trồng.
 *       Bao gồm so sánh với đợt trước để thấy xu hướng thay đổi.
 *     parameters:
 *       - in: query
 *         name: beforeDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Xem thống kê tại thời điểm cụ thể
 *     responses:
 *       200:
 *         description: Thống kê theo loại vùng với so sánh đợt trước
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *             example:
 *               byAreaType:
 *                 - type: "oyster"
 *                   name: "Hàu"
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
 *                   name: "Cá giò"
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
