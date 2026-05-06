export const PREDICTION_LABELS = {
  1: 'Rất phù hợp',
  0: 'Phù hợp',
  '-1': 'Rất không phù hợp',
};

export const PREDICTION_COLORS = {
  1: '#52c41a',
  0: '#faad14',
  '-1': '#ff4d4f',
};

export const PREDICTION_TAG_COLORS = {
  1: 'green',
  0: 'orange',
  '-1': 'red',
};

export const getPredictionValue = (predictionOrValue) => {
  const rawValue = typeof predictionOrValue === 'object'
    ? predictionOrValue?.prediction_text
    : predictionOrValue;
  const value = Number.parseInt(rawValue, 10);
  return Number.isNaN(value) ? null : value;
};

export const getPredictionLabel = (predictionOrValue, fallback = 'Chưa có dự báo') => {
  const value = getPredictionValue(predictionOrValue);
  return PREDICTION_LABELS[value] || fallback;
};

export const getPredictionColor = (predictionOrValue, fallback = '#1890ff') => {
  const value = getPredictionValue(predictionOrValue);
  return PREDICTION_COLORS[value] || fallback;
};

export const getPredictionTagColor = (predictionOrValue, fallback = 'blue') => {
  const value = getPredictionValue(predictionOrValue);
  return PREDICTION_TAG_COLORS[value] || fallback;
};

export const predictionFilterOptions = [
  { value: 1, label: PREDICTION_LABELS[1] },
  { value: 0, label: PREDICTION_LABELS[0] },
  { value: -1, label: PREDICTION_LABELS[-1] },
];
