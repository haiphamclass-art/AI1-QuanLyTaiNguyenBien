const express = require('express');
const swaggerSpecs = require('../config/swagger.js');
const router = express.Router();

/**
 * @swagger
 * /api/express/swagger:
 *   get:
 *     summary: Get Swagger API documentation
 *     description: Returns the complete Swagger API specification in JSON format
 *     tags: [API Documentation]
 *     responses:
 *       200:
 *         description: Swagger API specification
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               description: Complete OpenAPI 3.0 specification
 *       500:
 *         description: Internal server error
 */
router.get('/swagger', (req, res) => {
    try {
        res.json({
            success: true,
            data: swaggerSpecs,
            message: 'Swagger API documentation retrieved successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve Swagger documentation',
            message: error.message
        });
    }
});

module.exports = router;
