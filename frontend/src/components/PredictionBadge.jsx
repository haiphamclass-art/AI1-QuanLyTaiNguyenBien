import React from 'react';
import { Tag } from 'antd';
import { useTranslation } from 'react-i18next';

const PredictionBadge = ({ prediction, size = 'default' }) => {
    const { t } = useTranslation();

    if (!prediction) {
        return (
            <Tag color="blue" size={size}>
                {t('detail.noPrediction')}
            </Tag>
        );
    }

    const value = Number.parseInt(prediction.prediction_text, 10);
    let color, label;

    if (value === 1) {
        color = 'green';
        label = t('detail.good');
    } else if (value === 0) {
        color = 'orange';
        label = t('detail.average');
    } else if (value === -1) {
        color = 'red';
        label = t('detail.poor');
    } else {
        color = 'blue';
        label = t('detail.noPrediction');
    }

    return (
        <Tag color={color} size={size}>
            {label}
        </Tag>
    );
};

export default PredictionBadge;
