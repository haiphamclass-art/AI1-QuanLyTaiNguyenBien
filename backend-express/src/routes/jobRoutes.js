const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middlewares/authMiddleware');
const sequelize = require('../config/db');
const { User, Job } = require('../models');
const { Op } = require('sequelize');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const logger = require('../config/logger');

// Enqueue CSV import job
router.post('/import/csv', upload.single('file'), async (req, res) => {
    try {
        const boss = req.app.get('boss');
        if (!boss) {
            logger.error('[API] Boss not available');
            return res.status(500).json({ error: 'job_queue_not_ready' });
        }
        if (!req.file) return res.status(400).json({ error: 'CSV file is required (field: file)' });
        const { userId, areaId, modelName, areaName } = req.body || {};
        if (!userId || !areaId || !modelName) return res.status(400).json({ error: 'userId, areaId, modelName are required' });

        const fs = require('fs');
        const pathModule = require('path');

        // Lưu vào thư mục imports/ thay vì uploads/
        const importsDir = pathModule.join(process.cwd(), 'imports');
        if (!fs.existsSync(importsDir)) fs.mkdirSync(importsDir, { recursive: true });

        // Tạo tên file unique với timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const ext = pathModule.extname(req.file.originalname);
        const baseName = pathModule.basename(req.file.originalname, ext);
        const fileName = `${baseName}_${timestamp}${ext}`;
        const filePath = pathModule.join(importsDir, fileName);
        fs.writeFileSync(filePath, req.file.buffer);

        const description = areaName ? `Import CSV: ${areaName}` : `Import CSV: ${req.file.originalname}`;

        const jobId = await boss.send('csv-import', {
            path: filePath,
            originalname: req.file.originalname,
            savedFilename: fileName,
            description,
            userId,
            areaId,
            areaName,
            modelName
        }, { retryLimit: 0 });

        if (!jobId) {
            logger.error('[API] Failed to get jobId from boss.send()', { returned: jobId });
            return res.status(500).json({ error: 'failed_to_get_job_id' });
        }
        logger.info('[API] CSV import job enqueued', { jobId, file: req.file.originalname, savedAs: fileName });
        return res.json({ jobId, description });
    } catch (e) {
        logger.error('[API] Failed to enqueue CSV import job', { error: e.message, stack: e.stack });
        return res.status(500).json({ error: 'failed_to_queue' });
    }
});

// Enqueue XLSX import job
router.post('/import/xlsx', upload.single('file'), async (req, res) => {
    try {
        const boss = req.app.get('boss');
        if (!boss) {
            logger.error('[API] Boss not available');
            return res.status(500).json({ error: 'job_queue_not_ready' });
        }
        if (!req.file) return res.status(400).json({ error: 'XLSX file is required (field: file)' });
        const { userId, areaId, modelName, areaName, template } = req.body || {};
        if (!userId || !areaId || !modelName) return res.status(400).json({ error: 'userId, areaId, modelName are required' });

        const fs = require('fs');
        const pathModule = require('path');

        // Lưu vào thư mục imports/ thay vì uploads/
        const importsDir = pathModule.join(process.cwd(), 'imports');
        if (!fs.existsSync(importsDir)) fs.mkdirSync(importsDir, { recursive: true });

        // Tạo tên file unique với timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const ext = pathModule.extname(req.file.originalname);
        const baseName = pathModule.basename(req.file.originalname, ext);
        const fileName = `${baseName}_${timestamp}${ext}`;
        const filePath = pathModule.join(importsDir, fileName);
        fs.writeFileSync(filePath, req.file.buffer);

        const description = areaName ? `Import Excel: ${areaName}` : `Import Excel: ${req.file.originalname}`;

        const jobId = await boss.send('xlsx-import', {
            path: filePath,
            originalname: req.file.originalname,
            savedFilename: fileName,
            description,
            userId,
            areaId,
            areaName,
            modelName,
            template
        }, { retryLimit: 0 });

        if (!jobId) {
            logger.error('[API] Failed to get jobId from boss.send()', { returned: jobId });
            return res.status(500).json({ error: 'failed_to_get_job_id' });
        }
        logger.info('[API] XLSX import job enqueued', { jobId, file: req.file.originalname, savedAs: fileName });
        return res.json({ jobId, description });
    } catch (e) {
        logger.error('[API] Failed to enqueue XLSX import job', { error: e.message, stack: e.stack });
        return res.status(500).json({ error: 'failed_to_queue' });
    }
});

// Enqueue prediction export job
router.post('/export/predictions', authenticate, authorize(['admin', 'manager']), async (req, res) => {
    try {
        const boss = req.app.get('boss');
        if (!boss) {
            logger.error('[API] Boss not available');
            return res.status(500).json({ error: 'job_queue_not_ready' });
        }

        const { areaId, areaName, predictionResult, areaType, province, provinceName, district, districtName, startDate, endDate } = req.body || {};

        const filters = {};
        if (areaId) filters.areaId = areaId;
        if (predictionResult !== undefined && predictionResult !== '') filters.predictionResult = predictionResult;
        if (areaType) filters.areaType = areaType;
        if (province) filters.province = province;
        if (district) filters.district = district;
        if (startDate) filters.startDate = startDate;
        if (endDate) filters.endDate = endDate;

        // Build description for user to identify the export
        const descParts = [];
        if (areaName) descParts.push(`Khu vực: ${areaName}`);
        if (areaType) descParts.push(`Loại: ${areaType === 'oyster' ? 'Hàu' : areaType === 'cobia' ? 'Cá giò' : areaType}`);
        if (predictionResult !== undefined && predictionResult !== '') {
            const resultText = predictionResult == 1 ? 'Tốt' : predictionResult == 0 ? 'Trung bình' : predictionResult == -1 ? 'Kém' : predictionResult;
            descParts.push(`Kết quả: ${resultText}`);
        }
        if (provinceName) descParts.push(`Tỉnh: ${provinceName}`);
        if (districtName) descParts.push(`Huyện: ${districtName}`);
        if (startDate && endDate) {
            descParts.push(`Từ ${startDate} đến ${endDate}`);
        } else if (startDate) {
            descParts.push(`Từ ${startDate}`);
        } else if (endDate) {
            descParts.push(`Đến ${endDate}`);
        }

        const description = descParts.length > 0 ? descParts.join(' | ') : 'Tất cả dữ liệu';
        const createdAtVN = new Date().toLocaleString('vi-VN');

        const jobId = await boss.send('prediction-export', {
            filters,
            description,
            createdAtVN,
            userId: req.user.id,
            username: req.user.username
        }, { retryLimit: 0 });

        if (!jobId) {
            logger.error('[API] Failed to get jobId from boss.send()', { returned: jobId });
            return res.status(500).json({ error: 'failed_to_get_job_id' });
        }

        logger.info('[API] Prediction export job enqueued', { jobId, filters, description, userId: req.user.id });
        return res.json({ jobId, description, message: 'Export job queued successfully' });
    } catch (e) {
        logger.error('[API] Failed to enqueue prediction export job', { error: e.message, stack: e.stack });
        return res.status(500).json({ error: 'failed_to_queue' });
    }
});

// Download file from any job (export or import)
router.get('/:jobId/download', authenticate, authorize(['admin', 'manager', 'expert']), async (req, res) => {
    try {
        const { jobId } = req.params;
        const pathModule = require('path');
        const fs = require('fs');

        // Get job info from our jobs table
        const job = await Job.findByPk(jobId);

        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }

        if (job.state !== 'completed') {
            return res.status(400).json({ error: 'Job not completed yet', state: job.state });
        }

        // Check permission: admin can download all, others can only download their own
        const isAdmin = req.user.role === 'admin';
        if (!isAdmin && job.user_id && Number(job.user_id) !== Number(req.user.id)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Get file path from job output or data
        const output = job.output || {};
        const data = job.data || {};

        let filePath = output.filePath || data.path;

        if (!filePath) {
            return res.status(404).json({ error: 'File not found in job' });
        }

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found on disk' });
        }

        // Lấy filename từ đường dẫn file thực tế (đảm bảo đúng extension)
        const actualFilename = pathModule.basename(filePath);

        // Ưu tiên: savedFilename > filename từ output > tên file thực tế
        let filename = data.savedFilename || output.filename || actualFilename;

        // Đảm bảo filename có extension từ file thực tế
        const actualExt = pathModule.extname(filePath).toLowerCase();
        const filenameExt = pathModule.extname(filename).toLowerCase();

        if (!filenameExt && actualExt) {
            filename = filename + actualExt;
        }

        // Determine content type based on actual file extension
        let contentType = 'application/octet-stream';
        if (actualExt === '.xlsx') {
            contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        } else if (actualExt === '.xls') {
            contentType = 'application/vnd.ms-excel';
        } else if (actualExt === '.csv') {
            contentType = 'text/csv';
        }

        logger.info('[API] Preparing download', { jobId, filePath, filename, actualExt, contentType });

        // Set headers and send file
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);

        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);

        logger.info('[API] Job file downloaded', { jobId, jobName: job.name, filename, userId: req.user.id });
    } catch (e) {
        logger.error('[API] Failed to download job file', { error: e.message, stack: e.stack });
        return res.status(500).json({ error: 'failed_to_download' });
    }
});

// Download exported file (legacy route - redirect to new route)
router.get('/export/:jobId/download', authenticate, authorize(['admin', 'manager', 'expert']), async (req, res) => {
    // Redirect to the unified download route
    res.redirect(`/api/express/jobs/${req.params.jobId}/download`);
});

router.get('/', authenticate, authorize(['admin', 'manager', 'expert']), async (req, res) => {
    try {
        const { name, state, limit = 50, offset = 0 } = req.query;
        const isAdmin = req.user?.role === 'admin';

        // Build where clause for our jobs table
        const where = {};

        if (name) {
            where.name = name;
        }
        if (state) {
            where.state = state;
        }
        // Non-admin users can only see their own jobs
        if (!isAdmin) {
            where.user_id = req.user?.id;
        }

        const { count, rows } = await Job.findAndCountAll({
            where,
            include: [{
                model: User,
                as: 'User',
                attributes: ['id', 'username', 'email'],
            }],
            order: [['created_on', 'DESC']],
            limit: Number(limit),
            offset: Number(offset),
        });

        // Map to expected format for frontend
        const jobs = rows.map(job => ({
            id: job.id,
            name: job.name,
            state: job.state,
            data: job.data,
            output: job.output,
            error: job.error,
            createdon: job.created_on,
            startedon: job.started_on,
            completedon: job.completed_on,
            creator: job.User ? {
                id: job.User.id,
                username: job.User.username,
                email: job.User.email,
            } : null,
        }));

        res.json({ jobs, total: count });
    } catch (e) {
        logger.error('[API] Failed to list jobs', { error: e.message, stack: e.stack });
        res.status(500).json({ error: 'failed_to_list_jobs' });
    }
});

module.exports = router;




