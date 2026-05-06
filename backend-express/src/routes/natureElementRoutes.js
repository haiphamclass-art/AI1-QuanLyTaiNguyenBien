const express = require('express');
const {
    getAllNaturalElements,
    getNaturalElementById,
    createNaturalElement,
    updateNaturalElement,
    deleteNaturalElement,
    getNaturalElementsByCategory,
    getCategories,
    bulkUpdateNaturalElements,
} = require('../controllers/natureElementController');
const { authenticate, authorize } = require('../middlewares/authMiddleware');

const router = express.Router();

/**
 * @swagger
 * /nature-elements:
 *   get:
 *     summary: Get all natural elements (Admin/Manager/Expert only)
 *     tags: [Nature Elements]
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
 *         description: Number of elements per page
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by category
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name or description
 *     responses:
 *       200:
 *         description: List of natural elements
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
     *                 elements:
     *                   type: array
     *                   items:
     *                     type: object
     *                     properties:
     *                       id:
     *                         type: integer
     *                         description: Natural element ID
     *                         example: 1
     *                       name:
     *                         type: string
     *                         description: Element name
     *                         example: "Water Temperature"
     *                       description:
     *                         type: string
     *                         description: Element description
     *                         example: "Temperature of water in the aquaculture area"
     *                       unit:
     *                         type: string
     *                         description: Measurement unit
     *                         example: "Â°C"
     *                       category:
     *                         type: string
     *                         description: Element category
     *                         example: "temperature"
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *       500:
 *         description: Server error
 */
router.get('/', getAllNaturalElements);

/**
 * @swagger
 * /nature-elements/categories:
 *   get:
 *     summary: Get all categories of natural elements (Admin/Manager/Expert only)
 *     tags: [Nature Elements]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: List of categories
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   category:
 *                     type: string
 *                     example: "temperature"
 *                   count:
 *                     type: integer
 *                     example: 15
 *       500:
 *         description: Server error
 */
router.get('/categories', getCategories);

/**
 * @swagger
 * /nature-elements/category/{category}:
 *   get:
 *     summary: Get natural elements by category (Admin/Manager/Expert only)
 *     tags: [Nature Elements]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: category
 *         required: true
 *         schema:
 *           type: string
 *         description: Category name (e.g., temperature, salinity, ph)
 *     responses:
 *       200:
 *         description: List of natural elements in the category
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/NatureElement'
 *       404:
 *         description: Category not found
 *       500:
 *         description: Server error
 */
router.get('/category/:category', getNaturalElementsByCategory);

/**
 * @swagger
 * /nature-elements/{id}:
 *   get:
 *     summary: Get natural element by ID (Admin/Manager/Expert only)
 *     tags: [Nature Elements]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Natural element ID
 *     responses:
 *       200:
 *         description: Natural element details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NatureElement'
 *       404:
 *         description: Natural element not found
 *       500:
 *         description: Server error
 */
router.get('/:id', getNaturalElementById);

/**
 * @swagger
 * /nature-elements:
 *   post:
 *     summary: Create new natural element (Admin only)
 *     tags: [Nature Elements]
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
 *               - category
 *               - unit
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Water Temperature"
 *               category:
 *                 type: string
 *                 example: "temperature"
 *               unit:
 *                 type: string
 *                 example: "Â°C"
 *               description:
 *                 type: string
 *                 example: "Temperature of water in the aquaculture area"
 *               min_value:
 *                 type: number
 *                 format: float
 *                 example: 0
 *               max_value:
 *                 type: number
 *                 format: float
 *                 example: 40
 *               optimal_min:
 *                 type: number
 *                 format: float
 *                 example: 20
 *               optimal_max:
 *                 type: number
 *                 format: float
 *                 example: 30
 *     responses:
 *       201:
 *         description: Natural element created successfully
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
    '/',
    authenticate,
    authorize(['admin']),
    createNaturalElement
);

/**
 * @swagger
 * /nature-elements/{id}:
 *   put:
 *     summary: Update natural element by ID (Admin only)
 *     tags: [Nature Elements]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Natural element ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               category:
 *                 type: string
 *               unit:
 *                 type: string
 *               description:
 *                 type: string
 *               min_value:
 *                 type: number
 *                 format: float
 *               max_value:
 *                 type: number
 *                 format: float
 *               optimal_min:
 *                 type: number
 *                 format: float
 *               optimal_max:
 *                 type: number
 *                 format: float
 *     responses:
 *       200:
 *         description: Natural element updated successfully
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
 *         description: Natural element not found
 */
router.put(
    '/:id',
    authenticate,
    authorize(['admin']),
    updateNaturalElement
);

/**
 * @swagger
 * /nature-elements/{id}:
 *   delete:
 *     summary: Delete natural element by ID (Admin only)
 *     tags: [Nature Elements]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Natural element ID
 *     responses:
 *       200:
 *         description: Natural element deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Success'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Natural element not found
 */
router.delete(
    '/:id',
    authenticate,
    authorize(['admin']),
    deleteNaturalElement
);

/**
 * @swagger
 * /nature-elements/bulk-update:
 *   post:
 *     summary: Bulk update natural elements (Admin only)
 *     tags: [Nature Elements]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - elements
 *             properties:
 *               elements:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - id
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     name:
 *                       type: string
 *                       example: "Updated Water Temperature"
 *                     category:
 *                       type: string
 *                       example: "temperature"
 *                     unit:
 *                       type: string
 *                       example: "Â°C"
 *                     description:
 *                       type: string
 *                       example: "Updated description"
 *                     min_value:
 *                       type: number
 *                       format: float
 *                       example: 0
 *                     max_value:
 *                       type: number
 *                       format: float
 *                       example: 40
 *                     optimal_min:
 *                       type: number
 *                       format: float
 *                       example: 20
 *                     optimal_max:
 *                       type: number
 *                       format: float
 *                       example: 30
 *     responses:
 *       200:
 *         description: Natural elements updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Bulk update completed"
 *                 updated_count:
 *                   type: integer
 *                   example: 5
 *                 failed_count:
 *                   type: integer
 *                   example: 0
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.post(
    '/bulk-update',
    authenticate,
    authorize(['admin']),
    bulkUpdateNaturalElements
);

module.exports = router;
