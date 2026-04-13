module.exports = (boss) => {
    const fs = require('fs');
    const path = require('path');
    const xlsx = require('xlsx');
    const predictionController = require('../controllers/predictionController');
    const logger = require('../config/logger');
    const { Area, Province, Job } = require('../models');
    const proj4 = require('proj4');

    // Logger helper with job context
    const jobLogger = {
        info: (msg, ...args) => logger.info(`[JOB] ${msg}`, ...args),
        error: (msg, ...args) => logger.error(`[JOB] ${msg}`, ...args),
        warn: (msg, ...args) => logger.warn(`[JOB] ${msg}`, ...args),
        progress: (jobId, stage, details) => logger.info(`[JOB] PROGRESS [${jobId}] ${stage}`, details),
    };

    // ============================================
    // Job Sync Helper - Sync to our jobs table
    // ============================================
    const syncJob = {
        // Create or update job when started
        async start(jobId, name, data) {
            try {
                const userId = data?.userId ? parseInt(data.userId, 10) : null;
                await Job.upsert({
                    id: jobId,
                    name: name,
                    state: 'active',
                    data: data,
                    user_id: userId,
                    started_on: new Date(),
                });
                jobLogger.info(`[SYNC] Job started: ${jobId}`);
            } catch (error) {
                jobLogger.error(`[SYNC] Failed to sync job start: ${jobId}`, { error: error.message });
            }
        },

        // Update job when completed
        async complete(jobId, output) {
            try {
                await Job.update({
                    state: 'completed',
                    output: output,
                    completed_on: new Date(),
                }, { where: { id: jobId } });
                jobLogger.info(`[SYNC] Job completed: ${jobId}`);
            } catch (error) {
                jobLogger.error(`[SYNC] Failed to sync job complete: ${jobId}`, { error: error.message });
            }
        },

        // Update job when failed
        async fail(jobId, errorMessage) {
            try {
                await Job.update({
                    state: 'failed',
                    error: errorMessage,
                    completed_on: new Date(),
                }, { where: { id: jobId } });
                jobLogger.info(`[SYNC] Job failed: ${jobId}`);
            } catch (error) {
                jobLogger.error(`[SYNC] Failed to sync job fail: ${jobId}`, { error: error.message });
            }
        },
    };

    // Global error handlers for pg-boss
    boss.on('error', (error) => {
        jobLogger.error('PgBoss error event', { error: error.message, stack: error.stack });
    });

    boss.on('failed', async ({ id, name, data, failedReason }) => {
        jobLogger.error(`Job Failed [${id}]`, {
            jobName: name,
            failedReason: failedReason,
            data: data
        });
        // Sync failed status to our table
        await syncJob.fail(id, failedReason || 'Unknown error');
    });

    // helper to call controller handler
    const callController = (handler, reqInit) => new Promise((resolve, reject) => {
        const req = { ...reqInit };
        const res = {
            status(code) { this.statusCode = code; return this; },
            json(data) {
                const status = this.statusCode || 200;
                // If status is error (>= 400), reject the promise to mark job as failed
                if (status >= 400) {
                    const error = new Error(data?.error || `Controller returned status ${status}`);
                    error.statusCode = status;
                    error.data = data;
                    reject(error);
                } else {
                    resolve({ status, data });
                }
            },
        };
        Promise.resolve(handler(req, res)).catch(reject);
    });

    const getVN2000Proj4 = (lon0) => `+proj=tmerc +lat_0=0 +lon_0=${lon0} +k=0.9999 +x_0=500000 +y_0=0 +ellps=WGS84 +towgs84=-191.904,-39.303,-111.450,0,0,0,0 +units=m +no_defs`;
    const isWithinVietnam = (lat, lon) => Number.isFinite(lat) && Number.isFinite(lon) && lat >= 8 && lat <= 24 && lon >= 102 && lon <= 110;

    const convertVN2000ToWGS84 = (x, y, centralMeridian = null) => {
        // Validate input
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            jobLogger.warn('Invalid VN2000 coordinates', { x, y });
            return null;
        }

        // Thử cả [x, y] và [y, x] vì có thể thứ tự bị ngược
        const tryConvert = (coords, order) => {
            const zones = centralMeridian ? [centralMeridian] : [105, 107, 109];
            for (const zone of zones) {
                try {
                    const [lon, lat] = proj4(getVN2000Proj4(zone), 'EPSG:4326', coords);
                    if (Number.isFinite(lat) && Number.isFinite(lon) && isWithinVietnam(lat, lon)) {
                        jobLogger.info(`Conversion successful with order ${order}`, { x, y, lat, lon, zone, order });
                        return { lat, lon, zone };
                    } else {
                        jobLogger.warn(`Zone ${zone} conversion out of bounds (order ${order})`, { x, y, lat, lon, zone, order });
                    }
                } catch (error) {
                    jobLogger.warn(`Zone ${zone} conversion error (order ${order})`, { x, y, zone, order, error: error.message });
                }
            }
            // Nếu có central_meridian nhưng không thành công, thử các zone khác
            if (centralMeridian) {
                const fallbackZones = [105, 107, 109].filter(z => z !== centralMeridian);
                for (const zone of fallbackZones) {
                    try {
                        const [lon, lat] = proj4(getVN2000Proj4(zone), 'EPSG:4326', coords);
                        if (Number.isFinite(lat) && Number.isFinite(lon) && isWithinVietnam(lat, lon)) {
                            jobLogger.info(`Conversion successful with fallback zone (order ${order})`, { x, y, lat, lon, zone, order });
                            return { lat, lon, zone };
                        }
                    } catch (error) {
                        // ignore
                    }
                }
            }
            return null;
        };

        // Thử [x, y] trước (thứ tự chuẩn)
        let result = tryConvert([x, y], '[x, y]');
        if (result) return result;

        // Nếu không thành công, thử [y, x] (đảo ngược)
        jobLogger.warn('Trying reversed order [y, x]', { x, y, centralMeridian });
        result = tryConvert([y, x], '[y, x]');
        if (result) return result;

        jobLogger.warn('All conversion attempts failed for both orders', { x, y, centralMeridian });
        return null;
    };

    const parseNumber = (value) => {
        if (value == null) return null;
        const raw = String(value).trim().replace(',', '.');
        if (!raw) return null;
        const num = Number(raw);
        return Number.isFinite(num) ? num : null;
    };

    // CSV import: parse CSV to JSON rows and call batch API
    boss.work('csv-import', async (job) => {
        const jobId = job.id;
        const { path: filePath, userId, areaId, modelName, originalname, savedFilename, description } = job.data || {};

        // Sync job start to our table
        await syncJob.start(jobId, 'csv-import', job.data);

        try {
            jobLogger.info(`CSV Import Job Started [${jobId}]`, { file: originalname || filePath, userId, areaId, modelName });

            if (!filePath || !fs.existsSync(filePath)) {
                const error = new Error('file_not_found');
                jobLogger.error(`CSV Import Job Failed [${jobId}]: File not found`, { filePath });
                throw error;
            }

            jobLogger.progress(jobId, 'Reading file', { filePath });
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);

            if (lines.length < 2) {
                jobLogger.error(`CSV Import Job Failed [${jobId}]: Empty CSV or insufficient rows`, { lines: lines.length });
                throw new Error('empty_csv');
            }

            jobLogger.progress(jobId, 'Parsing CSV', { totalRows: lines.length - 1 });
            const headers = lines[0].split(',').map(h => h.trim());
            const data = lines.slice(1).map((line, idx) => {
                const cells = line.split(',');
                const obj = {};
                headers.forEach((h, i) => { if (cells[i] != null && cells[i] !== '') obj[h] = isNaN(cells[i]) ? cells[i] : Number(cells[i]); });
                if ((idx + 1) % 100 === 0) {
                    jobLogger.progress(jobId, 'Parsing rows', { processed: idx + 1, total: lines.length - 1 });
                }
                return obj;
            });

            jobLogger.progress(jobId, 'Creating predictions', { records: data.length, userId, areaId, modelName });
            const reqInit = { body: { userId, areaId, modelName, data } };
            const result = await callController(predictionController.createBatchPrediction, reqInit);

            // Output với thông tin file để cho phép tải xuống
            const output = {
                ...result.data,
                filePath,
                filename: savedFilename || originalname,
                originalname,
                recordCount: data.length,
            };

            jobLogger.info(`CSV Import Job Completed [${jobId}]`, {
                recordsProcessed: data.length,
                result: output
            });

            // Sync job complete to our table (KHÔNG xóa file)
            await syncJob.complete(jobId, output);

            return output;
        } catch (error) {
            // Log error with detailed information
            const errorDetails = {
                error: error.message,
                stack: error.stack,
                file: originalname || filePath,
                jobId: jobId,
                statusCode: error.statusCode || 'unknown',
                errorData: error.data || null
            };

            if (error.statusCode >= 400) {
                jobLogger.error(`CSV Import Job Failed [${jobId}]: Controller returned error status ${error.statusCode}`, errorDetails);
            } else {
                jobLogger.error(`CSV Import Job Failed [${jobId}]`, errorDetails);
            }

            // Sync job fail to our table
            await syncJob.fail(jobId, error.message);

            // Re-throw to ensure pg-boss marks job as failed
            throw error;
        }
        // KHÔNG xóa file - giữ lại để user có thể tải xuống
    });

    // XLSX import: read buffer and call existing excel controller
    boss.work('xlsx-import', async (job) => {
        const jobId = job.id;
        const { path: filePath, originalname, savedFilename, description, userId, areaId, modelName, template } = job.data || {};
        const templateType = template === 'excel2' ? 'Mẫu 2' : 'Mẫu 1';

        // Sync job start to our table
        await syncJob.start(jobId, 'xlsx-import', job.data);

        try {
            jobLogger.info(`XLSX Import Job Started [${jobId}]`, {
                file: originalname || filePath,
                userId,
                areaId,
                modelName,
                template: templateType
            });

            if (!filePath || !fs.existsSync(filePath)) {
                const error = new Error('file_not_found');
                jobLogger.error(`XLSX Import Job Failed [${jobId}]: File not found`, { filePath });
                throw error;
            }

            jobLogger.progress(jobId, 'Reading file', { filePath, size: fs.statSync(filePath).size });
            const buffer = fs.readFileSync(filePath);

            jobLogger.progress(jobId, 'Preparing request', { template: templateType, userId, areaId, modelName });
            const reqInit = { body: { userId, areaId, modelName }, file: { buffer, originalname } };
            const handler = template === 'excel2'
                ? predictionController.createBatchPredictionFromExcel2
                : predictionController.createBatchPredictionFromExcel;

            jobLogger.progress(jobId, 'Processing Excel', { handler: template === 'excel2' ? 'createBatchPredictionFromExcel2' : 'createBatchPredictionFromExcel' });
            const result = await callController(handler, reqInit);

            // Output với thông tin file để cho phép tải xuống
            const output = {
                ...result.data,
                filePath,
                filename: savedFilename || originalname,
                originalname,
                template: templateType,
            };

            jobLogger.info(`XLSX Import Job Completed [${jobId}]`, {
                template: templateType,
                result: output
            });

            // Sync job complete to our table (KHÔNG xóa file)
            await syncJob.complete(jobId, output);

            return output;
        } catch (error) {
            // Log error with detailed information
            const errorDetails = {
                error: error.message,
                stack: error.stack,
                file: originalname || filePath,
                template: templateType,
                jobId: jobId,
                statusCode: error.statusCode || 'unknown',
                errorData: error.data || null
            };

            if (error.statusCode >= 400) {
                jobLogger.error(`XLSX Import Job Failed [${jobId}]: Controller returned error status ${error.statusCode}`, errorDetails);
            } else {
                jobLogger.error(`XLSX Import Job Failed [${jobId}]`, errorDetails);
            }

            // Sync job fail to our table
            await syncJob.fail(jobId, error.message);

            // Re-throw to ensure pg-boss marks job as failed
            throw error;
        }
        // KHÔNG xóa file - giữ lại để user có thể tải xuống
    });

    boss.work('area-xlsx-import', async (job) => {
        const jobId = job.id;
        const { path: filePath, originalname, provinceId, districtId, area: defaultArea, area_type: defaultAreaType, userId } = job.data || {};

        // Sync job start to our table
        await syncJob.start(jobId, 'area-xlsx-import', job.data);

        jobLogger.info(`Area XLSX Import Job Started [${jobId}]`, {
            file: originalname || filePath,
            provinceId,
            districtId,
            userId,
        });

        if (!filePath || !fs.existsSync(filePath)) {
            const error = new Error('file_not_found');
            jobLogger.error(`Area XLSX Import Job Failed [${jobId}]: File not found`, { filePath });
            await syncJob.fail(jobId, 'file_not_found');
            throw error;
        }

        // Lấy central_meridian từ province
        let centralMeridian = null;
        if (provinceId) {
            try {
                const province = await Province.findOne({ where: { id: provinceId } });
                if (province && province.central_meridian) {
                    centralMeridian = province.central_meridian;
                    jobLogger.info(`Using central_meridian ${centralMeridian} for province ${province.name || provinceId}`);
                } else {
                    jobLogger.info(`No central_meridian found for province ${province?.name || provinceId}, will auto-detect`);
                }
            } catch (error) {
                jobLogger.warn(`Failed to get province central_meridian`, { provinceId, error: error.message });
            }
        }

        const summary = {
            totalRows: 0,
            created: 0,
            skipped: 0,
            duplicates: 0,
            notConverted: 0,
            skippedRows: [],
        };

        const transaction = await Area.sequelize.transaction();

        try {
            jobLogger.progress(jobId, 'Reading file', { filePath, size: fs.statSync(filePath).size });
            const buffer = fs.readFileSync(filePath);
            const workbook = xlsx.read(buffer, { type: 'buffer' });

            if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
                throw new Error('empty_workbook');
            }

            for (const sheetName of workbook.SheetNames) {
                const worksheet = workbook.Sheets[sheetName];
                if (!worksheet) continue;

                const rows = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: null, blankrows: false });
                if (rows.length <= 1) continue; // header only

                for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
                    summary.totalRows += 1;
                    const row = rows[rowIndex];
                    const excelRowNumber = rowIndex + 1;

                    const xValue = parseNumber(row?.[2]); // Column C (X)
                    const yValue = parseNumber(row?.[3]); // Column D (Y)
                    const nameValue = row?.[4] ? String(row[4]).trim() : '';

                    if (!nameValue) {
                        summary.skipped += 1;
                        summary.skippedRows.push({ row: excelRowNumber, reason: 'missing_name' });
                        continue;
                    }

                    if (xValue == null || yValue == null) {
                        summary.skipped += 1;
                        summary.skippedRows.push({ row: excelRowNumber, reason: 'missing_coordinates', name: nameValue });
                        continue;
                    }

                    // Sử dụng central_meridian từ province nếu có
                    jobLogger.info(`Converting VN2000 for row ${excelRowNumber}`, {
                        name: nameValue,
                        x: xValue,
                        y: yValue,
                        centralMeridian: centralMeridian || 'auto'
                    });
                    const coords = convertVN2000ToWGS84(xValue, yValue, centralMeridian);
                    if (!coords) {
                        jobLogger.warn(`Conversion failed for row ${excelRowNumber}`, {
                            name: nameValue,
                            x: xValue,
                            y: yValue,
                            centralMeridian: centralMeridian || 'auto'
                        });
                        summary.notConverted += 1;
                        summary.skippedRows.push({ row: excelRowNumber, reason: 'conversion_failed', name: nameValue, x: xValue, y: yValue });
                        continue;
                    }
                    jobLogger.info(`Conversion successful for row ${excelRowNumber}`, {
                        name: nameValue,
                        lat: coords.lat,
                        lon: coords.lon,
                        zone: coords.zone
                    });

                    const existingArea = await Area.findOne({
                        where: {
                            name: nameValue,
                            district: districtId,
                        },
                        transaction,
                    });

                    if (existingArea) {
                        summary.duplicates += 1;
                        summary.skippedRows.push({ row: excelRowNumber, reason: 'duplicate_name', name: nameValue });
                        continue;
                    }

                    // Sử dụng area và area_type từ form (không đọc từ Excel)
                    await Area.create({
                        name: nameValue,
                        latitude: coords.lat,
                        longitude: coords.lon,
                        province: provinceId,
                        district: districtId,
                        area: defaultArea || 0,
                        area_type: defaultAreaType || 'oyster',
                    }, { transaction });

                    summary.created += 1;

                    if (summary.created % 50 === 0) {
                        jobLogger.progress(jobId, 'Imported rows', { created: summary.created, processed: summary.totalRows });
                    }
                }
            }

            await transaction.commit();

            // Output với thông tin file để cho phép tải xuống
            const output = {
                ...summary,
                filePath,
                filename: originalname,
                originalname,
            };

            jobLogger.info(`Area XLSX Import Job Completed [${jobId}]`, output);

            // Sync job complete to our table (KHÔNG xóa file)
            await syncJob.complete(jobId, output);

            return output;
        } catch (error) {
            await transaction.rollback();

            jobLogger.error(`Area XLSX Import Job Failed [${jobId}]`, {
                error: error.message,
                stack: error.stack,
                summary,
            });

            // Sync job fail to our table
            await syncJob.fail(jobId, error.message);

            throw error;
        }
        // KHÔNG xóa file - giữ lại để user có thể tải xuống
    });

    // Export predictions to Excel job
    boss.work('prediction-export', async (job) => {
        const jobId = job.id;
        const { filters, userId, username } = job.data || {};

        // Sync job start to our table
        await syncJob.start(jobId, 'prediction-export', job.data);

        try {
            jobLogger.info(`Prediction Export Job Started [${jobId}]`, { filters, userId, username });

            const ExcelJS = require('exceljs');
            const { Prediction, User, Area, Province: ProvinceModel, District, NatureElement } = require('../models');
            const { Op } = require('sequelize');

            // Build query options - không include NatureElement ở đây, sẽ fetch riêng
            const options = {
                attributes: ['id', 'user_id', 'area_id', 'prediction_text', 'createdAt', 'updatedAt'],
                include: [
                    {
                        model: User,
                        attributes: ['id', 'username', 'email'],  // Bỏ role vì chỉ chuyên gia mới export
                    },
                    {
                        model: Area,
                        attributes: ['id', 'name', 'latitude', 'longitude', 'area', 'area_type', 'province', 'district'],
                        include: [
                            { model: ProvinceModel, attributes: ['id', 'name'] },
                            { model: District, attributes: ['id', 'name'] },
                        ],
                    },
                ],
                order: [['createdAt', 'DESC']],
            };

            const where = {};

            // Apply filters
            if (filters) {
                if (filters.areaId) where.area_id = parseInt(filters.areaId, 10);
                if (filters.predictionResult !== undefined && filters.predictionResult !== '') {
                    where.prediction_text = parseInt(filters.predictionResult, 10);
                }
                if (filters.startDate || filters.endDate) {
                    where.createdAt = {};
                    if (filters.startDate) {
                        where.createdAt[Op.gte] = new Date(filters.startDate);
                    }
                    if (filters.endDate) {
                        const end = new Date(filters.endDate);
                        end.setHours(23, 59, 59, 999);
                        where.createdAt[Op.lte] = end;
                    }
                }
                if (filters.areaType) {
                    where['$Area.area_type$'] = filters.areaType;
                    options.include[1].required = true;
                }
                if (filters.province) {
                    where['$Area.province$'] = filters.province;
                    options.include[1].required = true;
                }
                if (filters.district) {
                    where['$Area.district$'] = filters.district;
                    options.include[1].required = true;
                }
            }

            options.where = where;

            jobLogger.progress(jobId, 'Fetching predictions', { filters });
            const predictions = await Prediction.findAll(options);

            if (!predictions || predictions.length === 0) {
                throw new Error('No predictions found with the specified filters');
            }

            // Fetch NatureElements separately for better reliability
            const predictionIds = predictions.map(p => p.id);
            const { PredictionNatureElement } = require('../models');
            
            // Get all prediction-nature element relationships
            const predNatureElements = await PredictionNatureElement.findAll({
                where: { prediction_id: predictionIds },
                include: [{
                    model: NatureElement,
                    as: 'NatureElement',
                    attributes: ['id', 'name'],
                }],
            });

            // Build a map: predictionId -> { elementName: value }
            const predElementsMap = new Map();
            predNatureElements.forEach(pne => {
                const predId = pne.prediction_id;
                const elementName = pne.NatureElement?.name;
                const value = pne.value;
                
                if (!predElementsMap.has(predId)) {
                    predElementsMap.set(predId, new Map());
                }
                if (elementName) {
                    predElementsMap.get(predId).set(elementName, value);
                }
            });

            jobLogger.info(`[Export] Loaded ${predNatureElements.length} nature element values for ${predictionIds.length} predictions`);

            // Fetch all NatureElements to get units
            const allNatureElements = await NatureElement.findAll({
                attributes: ['name', 'unit'],
            });
            const unitMap = new Map();
            allNatureElements.forEach(ne => {
                if (ne.name && ne.unit) {
                    unitMap.set(ne.name, ne.unit);
                }
            });
            
            jobLogger.progress(jobId, 'Creating Excel workbook', { recordCount: predictions.length });

            // Create workbook
            const workbook = new ExcelJS.Workbook();
            workbook.creator = 'Environment Prediction System';
            workbook.created = new Date();

            const worksheet = workbook.addWorksheet('Báo cáo dự đoán', {
                views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }]
            });

            // Define columns - giống như exportPredictionsToExcel
            const columns = [
                { header: 'STT', key: 'stt', width: 8 },
                { header: 'Mã dự đoán', key: 'id', width: 12 },
                { header: 'Ngày tạo', key: 'createdAt', width: 20 },
                { header: 'Quý', key: 'quarter', width: 10 },
                { header: 'Tháng', key: 'month', width: 10 },
                { header: 'Tên khu vực', key: 'areaName', width: 25 },
                { header: 'Loại khu vực', key: 'areaType', width: 15 },
                { header: 'Tỉnh/Thành phố', key: 'province', width: 20 },
                { header: 'Quận/Huyện', key: 'district', width: 20 },
                { header: 'Đánh giá', key: 'predictionText', width: 15 },
                { header: 'Người tạo', key: 'creator', width: 18 },
            ];

            // Add indicator columns with units
            const indicators = ['R_PO4', 'O2Sat', 'O2ml_L', 'STheta', 'Salnty', 'R_DYNHT', 'T_degC',
                'R_Depth', 'Distance', 'Wind_Spd', 'Wave_Ht', 'Wave_Prd', 'IntChl', 'Dry_T'];
            indicators.forEach(indicator => {
                const unit = unitMap.get(indicator);
                const headerText = unit ? `${indicator} (${unit})` : indicator;
                columns.push({ header: headerText, key: indicator, width: 14 });
            });

            worksheet.columns = columns;

            // Style header row - màu trung tính hơn
            const headerRow = worksheet.getRow(1);
            headerRow.height = 28;
            headerRow.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
            headerRow.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF1F4E78' }  // Xanh đậm trung tính
            };
            headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
            headerRow.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };

            // Add data rows
            let processedRows = 0;
            predictions.forEach((prediction, index) => {
                try {
                    // Tính quý và tháng từ ngày tạo
                    const date = prediction.createdAt ? new Date(prediction.createdAt) : null;
                    const quarter = date ? Math.ceil((date.getMonth() + 1) / 3) : 0;
                    const month = date ? date.getMonth() + 1 : 0;

                    // Chuyển đổi kết quả số thành text
                    let predictionText = 'Không xác định';
                    let predictionColor = 'FFFAAD14'; // Orange mặc định
                    const predValue = prediction.prediction_text !== null && prediction.prediction_text !== undefined
                        ? parseInt(prediction.prediction_text, 10)
                        : NaN;

                    if (!isNaN(predValue)) {
                        if (predValue === 1) {
                            predictionText = 'Tốt';
                            predictionColor = 'FF52C41A'; // Green
                        } else if (predValue === 0) {
                            predictionText = 'Trung bình';
                            predictionColor = 'FFFAAD14'; // Orange
                        } else if (predValue === -1) {
                            predictionText = 'Kém';
                            predictionColor = 'FFFF4D4F'; // Red
                        }
                    }

                    const rowData = {
                        stt: index + 1,
                        id: prediction.id || '-',
                        createdAt: date ? date.toLocaleString('vi-VN', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit'
                        }) : '-',
                        quarter: date ? `Quý ${quarter}` : '-',
                        month: date ? `Tháng ${month}` : '-',
                        areaName: prediction.Area?.name || '-',
                        areaType: prediction.Area?.area_type === 'oyster' ? 'Hàu' : prediction.Area?.area_type === 'cobia' ? 'Cá giò' : '-',
                        province: prediction.Area?.Province?.name || '-',
                        district: prediction.Area?.District?.name || '-',
                        predictionText: predictionText,
                        creator: prediction.User?.username || '-',
                    };

                    // Add indicator values - lấy từ map đã query riêng
                    const elementMap = predElementsMap.get(prediction.id) || new Map();
                    
                    // Debug log for first prediction
                    if (index === 0) {
                        jobLogger.info(`[Export Debug] First prediction ID: ${prediction.id}`);
                        jobLogger.info(`[Export Debug] ElementMap size: ${elementMap.size}`);
                        if (elementMap.size > 0) {
                            jobLogger.info(`[Export Debug] Sample elements:`, Object.fromEntries([...elementMap.entries()].slice(0, 5)));
                        }
                    }
                    
                    indicators.forEach(indicator => {
                        const value = elementMap.get(indicator);
                        rowData[indicator] = value !== undefined && value !== null ? value : '-';
                    });

                    const row = worksheet.addRow(rowData);

                    // Style prediction result cell
                    const predCell = row.getCell('predictionText');
                    predCell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: predictionColor }
                    };
                    predCell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
                    predCell.alignment = { horizontal: 'center', vertical: 'middle' };

                    // Apply borders to all cells
                    row.eachCell({ includeEmpty: true }, (cell) => {
                        cell.border = {
                            top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
                            left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
                            bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
                            right: { style: 'thin', color: { argb: 'FFD0D0D0' } }
                        };
                        cell.alignment = { vertical: 'middle' };
                    });

                    processedRows++;
                    if (processedRows % 100 === 0) {
                        jobLogger.progress(jobId, 'Processing rows', { processed: processedRows, total: predictions.length });
                    }
                } catch (rowError) {
                    jobLogger.warn(`Error processing row ${index}`, { error: rowError.message });
                }
            });

            // Sheet 2: Summary Statistics
            const summarySheet = workbook.addWorksheet('Thống kê tổng hợp');

            summarySheet.mergeCells('A1:B1');
            const titleCell = summarySheet.getCell('A1');
            titleCell.value = 'THỐNG KÊ TỔNG HỢP DỰ ĐOÁN';
            titleCell.font = { bold: true, size: 16, color: { argb: 'FF1F4E78' } };
            titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
            summarySheet.getRow(1).height = 30;

            const totalPredictions = predictions.length;
            const goodCount = predictions.filter(p => parseInt(p.prediction_text) === 1).length;
            const averageCount = predictions.filter(p => parseInt(p.prediction_text) === 0).length;
            const poorCount = predictions.filter(p => parseInt(p.prediction_text) === -1).length;

            const statsData = [
                ['', ''],
                ['Tổng số dự đoán', totalPredictions],
                ['Số dự đoán Tốt', goodCount],
                ['Số dự đoán Trung bình', averageCount],
                ['Số dự đoán Kém', poorCount],
                ['', ''],
                ['Tỷ lệ Tốt (%)', totalPredictions > 0 ? ((goodCount / totalPredictions) * 100).toFixed(2) : 0],
                ['Tỷ lệ Trung bình (%)', totalPredictions > 0 ? ((averageCount / totalPredictions) * 100).toFixed(2) : 0],
                ['Tỷ lệ Kém (%)', totalPredictions > 0 ? ((poorCount / totalPredictions) * 100).toFixed(2) : 0],
            ];

            statsData.forEach((row, idx) => {
                const excelRow = summarySheet.addRow(row);
                if (idx > 0 && row[0]) {
                    excelRow.getCell(1).font = { bold: true };
                    excelRow.getCell(1).fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FFF0F0F0' }
                    };
                }
            });

            summarySheet.getColumn(1).width = 25;
            summarySheet.getColumn(2).width = 15;

            // Save file
            const exportsDir = path.join(process.cwd(), 'exports');
            if (!fs.existsSync(exportsDir)) fs.mkdirSync(exportsDir, { recursive: true });

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
            const filename = `BaoCaoDuDoan_${timestamp}.xlsx`;
            const filePath = path.join(exportsDir, filename);

            await workbook.xlsx.writeFile(filePath);

            const output = { filename, filePath, recordCount: predictions.length };

            jobLogger.info(`Prediction Export Job Completed [${jobId}]`, output);

            // Sync job complete to our table
            await syncJob.complete(jobId, output);

            return output;
        } catch (error) {
            jobLogger.error(`Prediction Export Job Failed [${jobId}]`, {
                error: error.message,
                stack: error.stack,
                filters
            });

            // Sync job fail to our table
            await syncJob.fail(jobId, error.message);

            throw error;
        }
    });

    jobLogger.info('Job workers registered', { jobs: ['csv-import', 'xlsx-import', 'area-xlsx-import', 'prediction-export'] });
};


