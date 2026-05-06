const xlsx = require('xlsx');
const { Area } = require('../models');
const { Op } = require('sequelize');
const { Sequelize } = require('sequelize');
const sequelize = require('../config/db');
const logger = require('../config/logger');
const { normalizeFeatureName } = require('../config/predictionFeatures');

function normalizeHeader(name, areaType = null) {
    if (!name) return '';
    const configuredName = normalizeFeatureName(name, areaType);
    if (configuredName) return configuredName;
    const s = String(name).toLowerCase().trim();
    const map = {
        // Map trực tiếp sang CALCOFI khi có thể
        'nhiệt độ': 'T_degC', 'nhiet do': 'T_degC',
        'độ muối': 'Salnty', 'do muoi': 'Salnty', 'độ mặn': 'Salnty', 'do man': 'Salnty',
        'do': 'DO_mgL', 'd.o': 'DO_mgL', 'ôxy': 'DO_mgL', 'oxy': 'DO_mgL',
        'phosphat': 'R_PO4', 'photphat': 'R_PO4', 'po4': 'R_PO4',
        'độ sâu': 'R_Depth', 'do sau': 'R_Depth',
        'tốc độ gió': 'Wind_Spd', 'toc do gio': 'Wind_Spd', 'wind': 'Wind_Spd',
        'chiều cao sóng': 'Wave_Ht', 'chieu cao song': 'Wave_Ht',
        'chu kỳ sóng': 'Wave_Prd', 'chu ky song': 'Wave_Prd',
        'tích hợp diệp lục': 'IntChl', 'diep luc': 'IntChl', 'chlorophyll': 'IntChl',
        'nhiệt độ không khí': 'Dry_T', 'nhiet do khong khi': 'Dry_T',
        'sigma theta': 'STheta', 's theta': 'STheta',
        'chiều cao động': 'R_DYNHT', 'chieu cao dong': 'R_DYNHT',
        'khoảng cách từ bờ': 'Distance', 'khoang cach tu bo': 'Distance',
        // Các trường meta khác
        'ph': 'ph',
        'độ đục': 'turbidity', 'do duc': 'turbidity',
        'độ trong': 'clarity', 'do trong': 'clarity',
        'tss': 'tss',
        'amoni': 'ammoni', 'ammoni': 'ammoni',
        'tổng xianua': 'cyanide_total', 'tong xianua': 'cyanide_total',
        'florua': 'fluoride',
        'tổng dầu, mỡ khoáng': 'oil_grease', 'tong dau, mo khoang': 'oil_grease',
        'coliform': 'coliform',
        'as': 'as', 'hg': 'hg', 'pb': 'pb', 'cd': 'cd', 'fe': 'fe', 'mn': 'mn', 'cu': 'cu', 'zn': 'zn', 'cr': 'cr',
        'phenol': 'phenol', 'aldrin': 'aldrin', 'bhc': 'bhc', 'diedrin': 'diedrin', 'ddts': 'ddts', 'heptachlor & heptachloreproxide': 'heptachlor_total'
    };
    return map[s] || s;
}

function parseNumeric(v) {
    if (v == null) return null;
    let s = String(v).trim();
    if (!s) return null;
    s = s.replaceAll(' ', '').replaceAll('%', '');
    s = s.replace(/^</, '').replace(/^>/, '');
    s = s.replace(',', '.');
    const num = Number(s);
    return Number.isFinite(num) ? num : null;
}

function parseQuarterYear(s) {
    if (!s) return { year: null, quarter: null };
    const str = String(s).toLowerCase();
    const q = /quý\s*(\d)/.exec(str) || /q\s*(\d)/.exec(str);
    const y = /(năm|nam)\s*(\d{4})/.exec(str) || /(\d{4})/.exec(str);
    const quarter = q ? Number(q[1]) : null;
    const year = y ? Number(y[y.length - 1]) : null;
    return { year, quarter };
}

function o2SolubilityMlPerL(tempC, salinity) {
    const Tk = (Number(tempC) || 0) + 273.15;
    const Ts = Tk / 100.0;
    const A1 = -173.4292, A2 = 249.6339, A3 = 143.3483, A4 = -21.8492;
    const B1 = -0.033096, B2 = 0.014259, B3 = -0.0017000;
    const lnC = A1 + A2 * (100.0 / Tk) + A3 * Math.log(Ts) + A4 * Ts + salinity * (B1 + B2 * Ts + B3 * Ts * Ts);
    return Math.exp(lnC); // ml/L
}

/**
 * Normalize area name for comparison:
 * - Convert to lowercase
 * - Remove special characters like -, _, etc. (but keep spaces between words)
 * - Keep Vietnamese diacritics (ả, ế, ư, etc.)
 * - Only trim leading/trailing spaces, keep spaces between words
 * @param {string} name - Area name to normalize
 * @returns {string} - Normalized name
 */
function normalizeAreaName(name) {
    if (!name) return '';
    // Convert to lowercase
    let normalized = String(name).toLowerCase();
    // Remove special characters: -, _, dots, commas, etc.
    // But keep spaces between words and Vietnamese diacritics (ả, ế, ư, etc.)
    normalized = normalized.replace(/[-_.,;:!?()[\]{}'"`~@#$%^&*+=|\\\/<>]/g, '');
    // Normalize multiple spaces to single space (but keep the structure)
    normalized = normalized.replace(/\s+/g, ' ');
    // Only trim leading and trailing spaces
    normalized = normalized.trim();
    return normalized;
}

async function parseExcel2(buffer, areaType = null) {
    const wb = xlsx.read(buffer, { type: 'buffer' });
    const results = [];

    // Load all areas once and create a normalized name map for efficient lookup
    // This avoids complex SQL escaping issues and is more maintainable
    const allAreas = await Area.findAll({ attributes: ['id', 'name'] });
    const areaMap = new Map();
    for (const area of allAreas) {
        const normalized = normalizeAreaName(area.name);
        if (normalized) {
            if (!areaMap.has(normalized)) {
                areaMap.set(normalized, []);
            }
            areaMap.get(normalized).push({ id: area.id, name: area.name });
        }
    }

    for (const sheetName of wb.SheetNames) {
        const ws = wb.Sheets[sheetName];
        if (!ws) continue;
        const aoa = xlsx.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: null });
        if (!aoa || aoa.length < 4) continue;
        const headerRow = aoa[1]; // row index 1 (Excel row 2) - dòng chứa tên yếu tố
        const rawHeaders = headerRow ? headerRow.map(h => h || '') : [];
        const sheetAreaType = areaType || (/cobia|ca\s*gio|cá\s*giò/i.test(sheetName) ? 'cobia' : 'oyster');
        const headers = headerRow ? headerRow.map(h => normalizeHeader(h, sheetAreaType)) : [];
        const COL_NAME = 0; // A
        const COL_TIME = 2; // C (Quý ... Năm ...)
        let currentName = null;
        for (let r = 3; r < aoa.length; r++) { // start at row 4
            const row = aoa[r];
            if (!row || row.length === 0) continue;
            if (row[COL_NAME] && String(row[COL_NAME]).trim()) currentName = String(row[COL_NAME]).trim();
            if (!currentName) continue;
            const timeCell = row[COL_TIME];
            const { year, quarter } = parseQuarterYear(timeCell);
            const features = {};
            for (let c = 3; c < headers.length && c < row.length; c++) {
                const key = headers[c];
                if (!key) continue;
                const val = parseNumeric(row[c]);
                if (val == null) continue;
                features[key] = val;
            }
            // resolve area by name using normalized comparison
            const normalizedCurrentName = normalizeAreaName(currentName);
            let areaId = null;
            if (normalizedCurrentName && areaMap.has(normalizedCurrentName)) {
                const matches = areaMap.get(normalizedCurrentName);
                // Take first match (all matches have same normalized name)
                areaId = matches[0].id;
            }

            results.push({
                sheet: sheetName,
                areaName: currentName,
                areaId: areaId,
                year,
                quarter,
                metrics: features,
            });
        }
    }
    return results;
}

module.exports = { parseExcel2 };


