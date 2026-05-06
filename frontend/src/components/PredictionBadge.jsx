import React from 'react';
import { Tag } from 'antd';
import { useTranslation } from 'react-i18next';
import { getPredictionLabel, getPredictionTagColor } from '../utils/predictionLabels';

const PredictionBadge = ({ prediction, size = 'default' }) => {
    const { t } = useTranslation();

    if (!prediction) {
        return (
            <Tag color="blue" size={size}>
                {t('detail.noPrediction')}
            </Tag>
        );
    }

    const color = getPredictionTagColor(prediction);
    const label = getPredictionLabel(prediction, t('detail.noPrediction'));

    return (
        <Tag color={color} size={size}>
            {label}
        </Tag>
    );
};

export default PredictionBadge;
