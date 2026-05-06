const COBIA_INPUT_FIELDS = [
  'Độ mặn',
  'Nhiệt độ nước biển',
  'DO',
  'pH',
  'Tổng chất rắn lơ lửng (TSS)',
  'Amoni (NH4+)',
  'Phosphat (PO43-)',
  'Florua (F-)',
  'Xianua (CN-)',
  'Asen (As)',
  'Cadimi (Cd)',
  'Chì (Pb)',
  'Crom VI (Cr6+)',
  'Tổng Crom',
  'Đồng (Cu)',
  'Kẽm (Zn)',
  'Mangan (Mn)',
  'Sắt (Fe)',
  'Tổng dầu mỡ khoáng',
];

const OYSTER_INPUT_FIELDS = [
  'DO',
  'Nhiệt độ nước biển',
  'pH',
  'Độ mặn',
  'Độ kiềm',
  'Độ trong',
  'NH3',
  'H2S',
  'Nhiệt độ không khí',
  'BOD5(20C)',
  'COD',
  'Coliform',
  'TSS',
  'CN-',
  'Asen (As)',
  'Cadimi (Cd)',
  'Chì (Pb)',
  'Cu',
  'Hg',
  'Zn',
  'Tổng Crom',
];

const OYSTER_MODEL_FIELDS = [
  'DO',
  'pH',
  'Độ mặn',
  'Độ trong',
  'TSS',
  'Coliform',
  'CN-',
  'Asen (As)',
  'Cadimi (Cd)',
  'Chì (Pb)',
  'Cu',
  'Hg',
  'Zn',
  'Tổng Crom',
  'Nhiệt độ nước biển',
];

const INPUT_FIELDS_BY_AREA_TYPE = {
  cobia: COBIA_INPUT_FIELDS,
  oyster: OYSTER_INPUT_FIELDS,
};

const MODEL_FIELDS_BY_AREA_TYPE = {
  cobia: COBIA_INPUT_FIELDS,
  oyster: OYSTER_MODEL_FIELDS,
};

const FIELD_METADATA = {
  'Độ mặn': { unit: '%o', category: 'Physical', fallback_value: 30.0 },
  'Nhiệt độ nước biển': { unit: '°C', category: 'Physical', fallback_value: 29.0 },
  DO: { unit: 'mg/L', category: 'Water Quality', fallback_value: 5.0 },
  pH: { unit: '', category: 'Water Quality', fallback_value: 8.0 },
  'Tổng chất rắn lơ lửng (TSS)': { unit: 'mg/L', category: 'Water Quality', fallback_value: 20.0 },
  TSS: { unit: 'mg/L', category: 'Water Quality', fallback_value: 20.0 },
  'Amoni (NH4+)': { unit: 'mg/L', category: 'Nutrients', fallback_value: 0.1 },
  'Phosphat (PO43-)': { unit: 'mg/L', category: 'Nutrients', fallback_value: 0.05 },
  'Florua (F-)': { unit: 'mg/L', category: 'Water Quality', fallback_value: 1.0 },
  'Xianua (CN-)': { unit: 'mg/L', category: 'Water Quality', fallback_value: 0.005 },
  'CN-': { unit: 'mg/L', category: 'Water Quality', fallback_value: 0.005 },
  'Asen (As)': { unit: 'mg/L', category: 'Heavy Metals', fallback_value: 0.01 },
  'Cadimi (Cd)': { unit: 'mg/L', category: 'Heavy Metals', fallback_value: 0.005 },
  'Chì (Pb)': { unit: 'mg/L', category: 'Heavy Metals', fallback_value: 0.01 },
  'Crom VI (Cr6+)': { unit: 'mg/L', category: 'Heavy Metals', fallback_value: 0.01 },
  'Tổng Crom': { unit: 'mg/L', category: 'Heavy Metals', fallback_value: 0.05 },
  'Đồng (Cu)': { unit: 'mg/L', category: 'Heavy Metals', fallback_value: 0.02 },
  Cu: { unit: 'mg/L', category: 'Heavy Metals', fallback_value: 0.02 },
  'Kẽm (Zn)': { unit: 'mg/L', category: 'Heavy Metals', fallback_value: 0.05 },
  Zn: { unit: 'mg/L', category: 'Heavy Metals', fallback_value: 0.05 },
  'Mangan (Mn)': { unit: 'mg/L', category: 'Heavy Metals', fallback_value: 0.1 },
  'Sắt (Fe)': { unit: 'mg/L', category: 'Heavy Metals', fallback_value: 0.3 },
  'Tổng dầu mỡ khoáng': { unit: 'mg/L', category: 'Water Quality', fallback_value: 0.1 },
  'Độ kiềm': { unit: 'mg/L', category: 'Water Quality', fallback_value: 100.0 },
  'Độ trong': { unit: 'cm', category: 'Physical', fallback_value: 30.0 },
  NH3: { unit: 'mg/L', category: 'Nutrients', fallback_value: 0.1 },
  H2S: { unit: 'mg/L', category: 'Water Quality', fallback_value: 0.01 },
  'Nhiệt độ không khí': { unit: '°C', category: 'Atmospheric', fallback_value: 28.0 },
  'BOD5(20C)': { unit: 'mg/L', category: 'Water Quality', fallback_value: 4.0 },
  COD: { unit: 'mg/L', category: 'Water Quality', fallback_value: 10.0 },
  Coliform: { unit: 'MPN/100ml', category: 'Microbiology', fallback_value: 1000.0 },
  Hg: { unit: 'mg/L', category: 'Heavy Metals', fallback_value: 0.001 },
};

const norm = (value) => (value || '').toString().toLowerCase()
  .normalize('NFD')
  .replace(/\p{Diacritic}/gu, '')
  .replace(/đ/g, 'd')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const aliasEntries = [
  ['Độ mặn', [/^do man$/, /^salinity$/, /^salnty$/]],
  ['Nhiệt độ nước biển', [/nhiet do nuoc bien/, /^temperature$/, /^t degc$/, /^t deg c$/]],
  ['Nhiệt độ không khí', [/nhiet do khong khi/, /^dry t$/, /^air temperature$/]],
  ['DO', [/^do$/, /oxy hoa tan/, /dissolved oxygen/, /^o2$/]],
  ['pH', [/^ph$/]],
  ['Tổng chất rắn lơ lửng (TSS)', [/tong chat ran lo lung/, /^tss$/]],
  ['TSS', [/^tss$/]],
  ['Amoni (NH4+)', [/amoni/, /ammoni/, /nh4/]],
  ['Phosphat (PO43-)', [/phosphat/, /photphat/, /phosphate/, /po4/]],
  ['Florua (F-)', [/florua/, /fluoride/]],
  ['Xianua (CN-)', [/xianua/, /cyanide/, /^cn$/]],
  ['CN-', [/^cn$/]],
  ['Asen (As)', [/asen/, /^as$/]],
  ['Cadimi (Cd)', [/cadimi/, /^cd$/]],
  ['Chì (Pb)', [/^chi pb$/, /^chi$/, /^pb$/]],
  ['Crom VI (Cr6+)', [/crom vi/, /cr6/]],
  ['Tổng Crom', [/tong crom/, /^cr$/, /^chromium$/]],
  ['Đồng (Cu)', [/dong cu/, /^cu$/]],
  ['Cu', [/^cu$/]],
  ['Kẽm (Zn)', [/kem zn/, /^zn$/]],
  ['Zn', [/^zn$/]],
  ['Mangan (Mn)', [/mangan/, /^mn$/]],
  ['Sắt (Fe)', [/sat fe/, /^fe$/]],
  ['Tổng dầu mỡ khoáng', [/dau mo khoang/, /oil/]],
  ['Độ kiềm', [/do kiem/, /alkalinity/]],
  ['Độ trong', [/do trong/, /clarity/, /transparency/]],
  ['NH3', [/^nh3$/]],
  ['H2S', [/^h2s$/]],
  ['BOD5(20C)', [/bod5/, /bod 5/]],
  ['COD', [/^cod$/]],
  ['Coliform', [/coliform/]],
  ['Hg', [/^hg$/, /thuy ngan/]],
];

function normalizeFeatureName(rawName, areaType = null) {
  if (!rawName) return null;
  const raw = String(rawName).trim();
  const inputFields = areaType ? getInputFields(areaType) : ALL_INPUT_FIELDS;
  if (inputFields.includes(raw)) return raw;

  const normalized = norm(raw);
  for (const field of inputFields) {
    if (norm(field) === normalized) return field;
  }

  for (const [field, patterns] of aliasEntries) {
    if (!inputFields.includes(field)) continue;
    if (patterns.some((pattern) => pattern.test(normalized))) return field;
  }

  return null;
}

function getInputFields(areaType) {
  return INPUT_FIELDS_BY_AREA_TYPE[(areaType || '').toLowerCase()] || [];
}

function getModelFields(areaType) {
  return MODEL_FIELDS_BY_AREA_TYPE[(areaType || '').toLowerCase()] || getInputFields(areaType);
}

const ALL_INPUT_FIELDS = [...new Set([...COBIA_INPUT_FIELDS, ...OYSTER_INPUT_FIELDS])];

module.exports = {
  COBIA_INPUT_FIELDS,
  OYSTER_INPUT_FIELDS,
  OYSTER_MODEL_FIELDS,
  INPUT_FIELDS_BY_AREA_TYPE,
  MODEL_FIELDS_BY_AREA_TYPE,
  FIELD_METADATA,
  ALL_INPUT_FIELDS,
  getInputFields,
  getModelFields,
  normalizeFeatureName,
  norm,
};
