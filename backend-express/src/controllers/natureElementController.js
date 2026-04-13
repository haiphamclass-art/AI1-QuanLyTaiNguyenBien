const { NatureElement } = require('../models');
const { Op } = require('sequelize');

// Get all natural elements
exports.getAllNaturalElements = async (req, res) => {
    try {
        const { category, search, limit, offset } = req.query;

        let whereClause = {};

        // Filter by category
        if (category) {
            whereClause.category = category;
        }

        // Search by name or description
        if (search) {
            whereClause[Op.or] = [
                { name: { [Op.iLike]: `%${search}%` } },
                { description: { [Op.iLike]: `%${search}%` } }
            ];
        }

        const options = {
            where: whereClause,
            order: [['category', 'ASC'], ['name', 'ASC']],
        };

        if (limit) {
            options.limit = parseInt(limit, 10);
        }
        if (offset) {
            options.offset = parseInt(offset, 10);
        }

        const elements = await NatureElement.findAll(options);
        const total = await NatureElement.count({ where: whereClause });

        // Get unique categories for filter options
        const categories = await NatureElement.findAll({
            attributes: ['category'],
            group: ['category'],
            order: [['category', 'ASC']]
        });

        res.status(200).json({
            success: true,
            data: {
                elements,
                total,
                categories: categories.map(c => c.category).filter(Boolean)
            }
        });
    } catch (error) {
        logger.error('Get All Natural Elements Error:', error);
        res.status(500).json({ error: error.message });
    }
};

// Get natural element by ID
exports.getNaturalElementById = async (req, res) => {
    try {
        const { id } = req.params;

        const element = await NatureElement.findByPk(id);

        if (!element) {
            return res.status(404).json({ error: 'Natural element not found' });
        }

        res.status(200).json({
            success: true,
            data: element
        });
    } catch (error) {
        logger.error('Get Natural Element Error:', error);
        res.status(500).json({ error: error.message });
    }
};

// Create new natural element
exports.createNaturalElement = async (req, res) => {
    try {
        const { name, description, unit, category } = req.body;

        // Validate required fields
        if (!name) {
            return res.status(400).json({ error: 'Name is required' });
        }

        // Check if element already exists
        const existingElement = await NatureElement.findOne({
            where: { name }
        });

        if (existingElement) {
            return res.status(400).json({ error: 'Natural element with this name already exists' });
        }

        const element = await NatureElement.create({
            name,
            description,
            unit,
            category
        });

        res.status(201).json({
            success: true,
            data: element
        });
    } catch (error) {
        logger.error('Create Natural Element Error:', error);
        res.status(500).json({ error: error.message });
    }
};

// Update natural element
exports.updateNaturalElement = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, unit, category } = req.body;

        const element = await NatureElement.findByPk(id);

        if (!element) {
            return res.status(404).json({ error: 'Natural element not found' });
        }

        // Check if name is being changed and if it conflicts
        if (name && name !== element.name) {
            const existingElement = await NatureElement.findOne({
                where: { name, id: { [Op.ne]: id } }
            });

            if (existingElement) {
                return res.status(400).json({ error: 'Natural element with this name already exists' });
            }
        }

        // Update fields
        if (name) element.name = name;
        if (description !== undefined) element.description = description;
        if (unit !== undefined) element.unit = unit;
        if (category !== undefined) element.category = category;

        await element.save();

        res.status(200).json({
            success: true,
            data: element
        });
    } catch (error) {
        logger.error('Update Natural Element Error:', error);
        res.status(500).json({ error: error.message });
    }
};

// Delete natural element
exports.deleteNaturalElement = async (req, res) => {
    try {
        const { id } = req.params;

        const element = await NatureElement.findByPk(id);

        if (!element) {
            return res.status(404).json({ 
                success: false,
                error: 'Natural element not found' 
            });
        }

        // Check if element is being used in any ML models
        const { ModelNatureElement } = require('../models');
        const usageCount = await ModelNatureElement.count({
            where: { nature_element_id: id }
        });

        if (usageCount > 0) {
            return res.status(403).json({
                success: false,
                error: `Cannot delete this element. It is currently used in ${usageCount} model(s).`,
                usageCount
            });
        }

        await element.destroy();

        res.status(200).json({
            success: true,
            message: 'Natural element deleted successfully'
        });
    } catch (error) {
        logger.error('Delete Natural Element Error:', error);
        res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
};

// Get natural elements by category
exports.getNaturalElementsByCategory = async (req, res) => {
    try {
        const { category } = req.params;

        const elements = await NatureElement.findAll({
            where: { category },
            order: [['name', 'ASC']]
        });

        res.status(200).json({
            success: true,
            data: elements
        });
    } catch (error) {
        logger.error('Get Natural Elements By Category Error:', error);
        res.status(500).json({ error: error.message });
    }
};

// Get categories
exports.getCategories = async (req, res) => {
    try {
        const categories = await NatureElement.findAll({
            attributes: ['category'],
            group: ['category'],
            order: [['category', 'ASC']]
        });

        res.status(200).json({
            success: true,
            data: categories.map(c => c.category).filter(Boolean)
        });
    } catch (error) {
        logger.error('Get Categories Error:', error);
        res.status(500).json({ error: error.message });
    }
};

// Bulk update natural elements (for script usage)
exports.bulkUpdateNaturalElements = async (req, res) => {
    try {
        const { elements } = req.body;

        if (!Array.isArray(elements)) {
            return res.status(400).json({ error: 'Elements must be an array' });
        }

        const results = [];

        for (const elementData of elements) {
            const { name, description, unit, category } = elementData;

            if (!name) {
                results.push({ name: 'unknown', error: 'Name is required' });
                continue;
            }

            try {
                const [element, created] = await NatureElement.findOrCreate({
                    where: { name },
                    defaults: { name, description, unit, category }
                });

                if (!created) {
                    await element.update({ description, unit, category });
                }

                results.push({ name, status: created ? 'created' : 'updated' });
            } catch (error) {
                results.push({ name, error: error.message });
            }
        }

        res.status(200).json({
            success: true,
            data: results
        });
    } catch (error) {
        logger.error('Bulk Update Natural Elements Error:', error);
        res.status(500).json({ error: error.message });
    }
};
