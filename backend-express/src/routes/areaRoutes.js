const express = require('express');
const { authenticate, authorize } = require('../middlewares/authMiddleware');
const {
    getAllAreas,
    getAllAreasNoPagination,
    getAreaById,
    getPublicMapAreas,
    getPublicMapAreaById,
    createArea,
    updateArea,
    deleteArea,
    getAreaStats,
    getAreaStatsByType,
    getAreaStatsCombined,
} = require('../controllers/areaController');
const { Province, Area, District } = require('../models/index.js');
const multer = require('multer');
const logger = require('../config/logger');
const fs = require('fs');
const path = require('path');
const { applyAreaScope, AreaScopeError } = require('../utils/areaScope');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const router = express.Router();

/**
 * @swagger
 * /areas:
 *   get:
 *     summary: Get all areas (Admin/Manager/Expert only)
 *     tags: [Areas]
 *     security:
 *       - cookieAuth: []
 *     description: Scope is derived from the authenticated cookie token. Query role/province/district do not grant access.
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
 *         description: Number of areas per page
 *       - in: query
 *         name: area_type
 *         schema:
 *           type: string
 *           enum: [oyster, shrimp, fish]
     *         description: Filter by area type
     *     responses:
     *       200:
     *         description: List of areas
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
     *                       id:
     *                         type: integer
     *                         description: Area ID
     *                         example: 1
     *                       name:
     *                         type: string
     *                         description: Area name
     *                         example: "Khu vá»±c nuÃ´i tÃ´m A"
     *                       latitude:
     *                         type: number
     *                         format: double
     *                         description: Latitude coordinate
     *                         example: 10.762622
     *                       longitude:
     *                         type: number
     *                         format: double
     *                         description: Longitude coordinate
     *                         example: 106.660172
     *                       area:
     *                         type: number
     *                         format: double
     *                         description: Area size in square meters
     *                         example: 1000.5
     *                       province:
     *                         type: string
     *                         format: uuid
     *                         description: Province ID
     *                         example: "123e4567-e89b-12d3-a456-426614174000"
     *                       district:
     *                         type: string
     *                         format: uuid
     *                         description: District ID
     *                         example: "123e4567-e89b-12d3-a456-426614174001"
     *                       area_type:
     *                         type: string
     *                         enum: [oyster, cobia]
     *                         description: Type of aquaculture area
     *                         example: "oyster"
     *                 total:
     *                   type: integer
     *                   description: Total number of areas
     *                   example: 25
     *             examples:
     *               success:
     *                 summary: Successful response
     *                 value:
     *                   areas:
     *                     - id: 1
     *                       name: "Khu vá»±c nuÃ´i hÃ u A"
     *                       latitude: 10.762622
     *                       longitude: 106.660172
     *                       area: 1000.5
     *                       province: "123e4567-e89b-12d3-a456-426614174000"
     *                       district: "123e4567-e89b-12d3-a456-426614174001"
     *                       area_type: "oyster"
     *                     - id: 2
     *                       name: "Khu vá»±c nuÃ´i cÃ¡ cobia B"
     *                       latitude: 10.800000
     *                       longitude: 106.700000
     *                       area: 1500.0
     *                       province: "123e4567-e89b-12d3-a456-426614174000"
     *                       district: "123e4567-e89b-12d3-a456-426614174002"
     *                       area_type: "cobia"
     *                   total: 25
     *       500:
     *         description: Server error
 */
router.get('/', authenticate, authorize(['admin', 'manager', 'expert']), getAllAreas);
/**
 * @swagger
 * /areas/all:
 *   get:
 *     summary: Get all areas without pagination (Admin/Manager/Expert only)
 *     tags: [Areas]
 *     security:
 *       - cookieAuth: []
 *     description: Scope is derived from the authenticated cookie token. Query role/province/district do not grant access.
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by area name
 *       - in: query
 *         name: area_type
 *         schema:
 *           type: string
 *           enum: [oyster, shrimp, fish]
 *         description: Filter by area type
 *     responses:
 *       200:
 *         description: List of all areas
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
 *                       id:
 *                         type: integer
 *                         example: 1
 *                       name:
 *                         type: string
 *                         example: "Khu vá»±c nuÃ´i tÃ´m A"
 *                       latitude:
 *                         type: number
 *                         example: 10.762622
 *                       longitude:
 *                         type: number
 *                         example: 106.660172
 *                       area_type:
 *                         type: string
 *                         enum: [oyster, shrimp, fish]
 *                         example: "shrimp"
 *                       Province:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           name:
 *                             type: string
 *                       District:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           name:
 *                             type: string
 *       500:
 *         description: Server error
 */
router.get('/all', authenticate, authorize(['admin', 'manager', 'expert']), getAllAreasNoPagination);

router.get('/public/all', getPublicMapAreas);
router.get('/public/area/:id', getPublicMapAreaById);
router.get('/public/provinces', async (req, res) => {
    try {
        const provinces = await Province.findAll({
            attributes: ['id', 'name', 'central_meridian'],
            order: [['name', 'ASC']],
        });
        return res.status(200).json(provinces);
    } catch (error) {
        logger.error('Get Public Provinces Error:', error);
        return res.status(500).json({ error: 'Failed to fetch public provinces.' });
    }
});
router.get('/public/districts', async (req, res) => {
    try {
        const districts = await District.findAll({
            attributes: ['id', 'name', 'province_id'],
            order: [['name', 'ASC']],
        });
        return res.status(200).json(districts);
    } catch (error) {
        logger.error('Get Public Districts Error:', error);
        return res.status(500).json({ error: 'Failed to fetch public districts.' });
    }
});

/**
 * @swagger
 * /areas/stats/summary:
 *   get:
 *     summary: Get area statistics (total and distribution by province)
 *     tags: [Areas]
 *     security:
 *       - cookieAuth: []
 *     description: Scope is derived from the authenticated cookie token. Query role/province/district do not grant access.
 *     responses:
 *       200:
 *         description: Area stats summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalAreas:
 *                   type: integer
 *                 byProvince:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       provinceId:
 *                         type: integer
 *                       provinceName:
 *                         type: string
 *                       count:
 *                         type: integer
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.get(
    '/stats/summary',
    authenticate,
    authorize(['admin', 'manager']),
    getAreaStats
);

/**
 * @swagger
 * /areas/stats/by-type:
 *   get:
 *     summary: Get area statistics by type (oyster/cobia)
 *     tags: [Areas]
 *     security:
 *       - cookieAuth: []
 *     description: Scope is derived from the authenticated cookie token. Query role/province/district do not grant access.
 *     responses:
 *       200:
 *         description: Area stats by type
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: integer
 *                 byType:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       type:
 *                         type: string
 *                       name:
 *                         type: string
 *                       count:
 *                         type: integer
 */
router.get(
    '/stats/by-type',
    authenticate,
    authorize(['admin', 'manager']),
    getAreaStatsByType
);

/**
 * @swagger
 * /areas/stats/combined:
 *   get:
 *     summary: Get combined area statistics (by type, by province, and by type per province)
 *     tags: [Areas]
 *     security:
 *       - cookieAuth: []
 *     description: Scope is derived from the authenticated cookie token. Query role/province/district do not grant access.
 *     responses:
 *       200:
 *         description: Combined area statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalAreas:
 *                   type: integer
 *                 byType:
 *                   type: array
 *                 byProvince:
 *                   type: array
 *                 byTypePerProvince:
 *                   type: array
 */
router.get(
    '/stats/combined',
    authenticate,
    authorize(['admin', 'manager']),
    getAreaStatsCombined
);

/**
 * @swagger
 * /areas/area/{id}:
 *   get:
 *     summary: Get area by ID (Admin/Manager/Expert only)
 *     tags: [Areas]
 *     security:
 *       - cookieAuth: []
 *     description: The current area object must be within the authenticated user's scope.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Area ID
     *     responses:
     *       200:
     *         description: Area details
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 id:
     *                   type: integer
     *                   description: Area ID
     *                   example: 1
     *                 name:
     *                   type: string
     *                   description: Area name
     *                   example: "Khu vá»±c nuÃ´i hÃ u A"
     *                 latitude:
     *                   type: number
     *                   format: double
     *                   description: Latitude coordinate
     *                   example: 10.762622
     *                 longitude:
     *                   type: number
     *                   format: double
     *                   description: Longitude coordinate
     *                   example: 106.660172
     *                 area:
     *                   type: number
     *                   format: double
     *                   description: Area size in square meters
     *                   example: 1000.5
     *                 province:
     *                   type: string
     *                   format: uuid
     *                   description: Province ID
     *                   example: "123e4567-e89b-12d3-a456-426614174000"
     *                 district:
     *                   type: string
     *                   format: uuid
     *                   description: District ID
     *                   example: "123e4567-e89b-12d3-a456-426614174001"
     *                 area_type:
     *                   type: string
     *                   enum: [oyster, cobia]
     *                   description: Type of aquaculture area
     *                   example: "oyster"
     *             examples:
     *               success:
     *                 summary: Successful response
     *                 value:
     *                   id: 1
     *                   name: "Khu vá»±c nuÃ´i hÃ u A"
     *                   latitude: 10.762622
     *                   longitude: 106.660172
     *                   area: 1000.5
     *                   province: "123e4567-e89b-12d3-a456-426614174000"
     *                   district: "123e4567-e89b-12d3-a456-426614174001"
     *                   area_type: "oyster"
     *       404:
     *         description: Area not found
     *       500:
     *         description: Server error
 */
router.get('/area/:id', authenticate, authorize(['admin', 'manager', 'expert']), getAreaById);

/**
 * @swagger
 * /areas/provinces:
 *   get:
 *     summary: Get provinces in current scope
 *     tags: [Areas]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: List of provinces
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   name:
 *                     type: string
 *       500:
 *         description: Server error
 */
router.get('/provinces', authenticate, authorize(['admin', 'manager', 'expert']), async (req, res) => {
    const where = req.user?.role === 'admin' || !req.user?.province ? {} : { id: req.user.province };
    return res.status(200).json(await Province.findAll({ where }));
});

/**
 * @swagger
 * /areas/districts:
 *   get:
 *     summary: Get districts in current scope
 *     tags: [Areas]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: List of districts
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   name:
 *                     type: string
 *                   province_id:
 *                     type: integer
 *       500:
 *         description: Server error
 */
router.get('/districts', authenticate, authorize(['admin', 'manager', 'expert']), async (req, res) => {
    let where = {};
    if (req.user?.role !== 'admin') {
        if (req.user?.district) {
            where.id = req.user.district;
        } else if (req.user?.province) {
            where.province_id = req.user.province;
        } else {
            return res.status(403).json({ error: 'User is not assigned to a province or district.' });
        }
    }

    return res.status(200).json(await District.findAll({ where }));
});

/**
 * @swagger
 * /areas/district/{id}:
 *   get:
 *     summary: Get areas by district ID within current scope
 *     tags: [Areas]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: District ID
 *     responses:
 *       200:
 *         description: List of areas in the district
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Area'
 *       500:
 *         description: Server error
 */
router.get('/district/:id', authenticate, authorize(['admin', 'manager', 'expert']), async (req, res) => {
    const districtId = req.params.id;
    try {
        const scopedWhere = applyAreaScope({ district: districtId }, req.user);
        if (String(scopedWhere.district) !== String(districtId)) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        const areas = await Area.findAll({ where: scopedWhere });
        return res.status(200).json(areas);
    } catch (error) {
        if (error instanceof AreaScopeError) {
            return res.status(error.status).json({ error: error.message });
        }
        return res.status(500).json({ error: 'Error fetching areas by region ID' });
    }
});

/**
 * @swagger
 * /areas/province/{id}:
 *   get:
 *     summary: Get areas by province ID within current scope
 *     tags: [Areas]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Province ID
 *     responses:
 *       200:
 *         description: List of areas in the province
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Area'
 *       500:
 *         description: Server error
 */
router.get('/province/:id', authenticate, authorize(['admin', 'manager', 'expert']), async (req, res) => {
    const provinceId = req.params.id;
    try {
        if (req.user?.role !== 'admin' && req.user?.province && String(req.user.province) !== String(provinceId)) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        const scopedWhere = applyAreaScope({ province: provinceId }, req.user);
        if (scopedWhere.province && String(scopedWhere.province) !== String(provinceId)) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        const areas = await Area.findAll({ where: scopedWhere });
        return res.status(200).json(areas);
    } catch (error) {
        if (error instanceof AreaScopeError) {
            return res.status(error.status).json({ error: error.message });
        }
        return res.status(500).json({ error: 'Error fetching areas by region ID' });
    }
});

/**
 * @swagger
 * /areas:
 *   post:
 *     summary: Create new area
 *     tags: [Areas]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - latitude
 *               - longitude
 *               - province
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Khu vá»±c nuÃ´i tÃ´m A"
 *               latitude:
 *                 type: number
 *                 format: float
 *                 example: 10.762622
 *               longitude:
 *                 type: number
 *                 format: float
 *                 example: 106.660172
 *               province:
 *                 type: integer
 *                 example: 1
 *               district:
 *                 type: integer
 *                 example: 1
 *               area_type:
 *                 type: string
 *                 enum: [oyster, shrimp, fish]
 *                 example: "shrimp"
 *     responses:
 *       201:
 *         description: Area created successfully
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
router.post('/', authenticate, authorize(['admin', 'manager']), createArea);

/**
 * @swagger
 * /areas/{id}:
 *   put:
 *     summary: Update area by ID
 *     tags: [Areas]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Area ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               latitude:
 *                 type: number
 *                 format: float
 *               longitude:
 *                 type: number
 *                 format: float
 *               province:
 *                 type: integer
 *               district:
 *                 type: integer
 *               area_type:
 *                 type: string
 *                 enum: [oyster, shrimp, fish]
 *     responses:
 *       200:
 *         description: Area updated successfully
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
 *       404:
 *         description: Area not found
 */
router.put('/:id', authenticate, authorize(['admin', 'manager']), updateArea);

/**
 * @swagger
 * /areas/{id}:
 *   delete:
 *     summary: Delete area by ID
 *     tags: [Areas]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Area ID
 *     responses:
 *       200:
 *         description: Area deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Area not found
 */
router.delete('/:id', authenticate, authorize(['admin', 'manager']), deleteArea);

router.post('/import-excel', authenticate, authorize(['admin', 'manager']), upload.single('file'), async (req, res) => {
    const boss = req.app.get('boss');
    if (!boss) {
        logger.error('[API] Boss not available for area import');
        return res.status(500).json({ error: 'job_queue_not_ready' });
    }

    if (!req.file) {
        return res.status(400).json({ error: 'excel_file_required' });
    }

    const { provinceId, districtId, area, area_type } = req.body || {};
    if (!provinceId || !districtId) {
        return res.status(400).json({ error: 'province_and_district_required' });
    }

    let filePath;
    try {
        const scopedWhere = applyAreaScope({ province: provinceId, district: districtId }, req.user);
        if (
            String(scopedWhere.province) !== String(provinceId)
            || String(scopedWhere.district) !== String(districtId)
        ) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const district = await District.findOne({ where: { id: districtId } });
        if (!district) {
            return res.status(400).json({ error: 'district_not_found' });
        }
        if (String(district.province_id) !== String(provinceId)) {
            return res.status(400).json({ error: 'district_not_in_province' });
        }

        const uploadsDir = path.join(process.cwd(), 'uploads');
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }

        const fileName = `${Date.now()}-${req.file.originalname}`;
        filePath = path.join(uploadsDir, fileName);
        fs.writeFileSync(filePath, req.file.buffer);

        const jobData = {
            path: filePath,
            originalname: req.file.originalname,
            provinceId,
            districtId,
            area: area ? parseFloat(area) : null,
            area_type: area_type || 'oyster',
            userId: req.user?.id || null,
        };

        logger.info('[API] Enqueueing area import job', {
            jobData,
            fileSize: req.file.size,
        });

        const jobId = await boss.send('area-xlsx-import', jobData, { retryLimit: 0 });

        if (!jobId) {
            logger.error('[API] Failed to get jobId from boss.send() for area import', { jobData });
            return res.status(500).json({ error: 'failed_to_get_job_id' });
        }

        logger.info('[API] Area import job enqueued successfully', { jobId });
        return res.json({
            jobId,
            message: 'ÄÃ£ táº¡o job import khu vá»±c. Vui lÃ²ng theo dÃµi tiáº¿n trÃ¬nh táº¡i trang Jobs.',
            redirect: '/jobs',
        });
    } catch (error) {
        logger.error('[API] Failed to enqueue area import job', {
            message: error.message,
            stack: error.stack,
        });

        if (filePath && fs.existsSync(filePath)) {
            try {
                fs.unlinkSync(filePath);
            } catch (cleanupError) {
                logger.warn('[API] Failed to cleanup temp file after area import enqueue failure', {
                    error: cleanupError.message,
                    filePath,
                });
            }
        }

        return res.status(500).json({ error: 'failed_to_queue_area_import' });
    }
});

module.exports = router;
