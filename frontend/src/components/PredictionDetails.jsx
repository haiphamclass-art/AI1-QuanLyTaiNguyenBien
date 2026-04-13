import React, { useState, useEffect } from 'react';
import axios from '../axios';
import { useTranslation } from 'react-i18next';
import { Typography, Descriptions, Table, Spin } from 'antd';
import PredictionBadge from './PredictionBadge';

const { Title, Text } = Typography;

const PredictionDetails = ({ predictionId }) => {
  const [prediction, setPrediction] = useState(null);
  const { t } = useTranslation();
  useEffect(() => {
    axios
      .get(`/api/express/predictions/${predictionId}`)
      .then((response) => {
        setPrediction(response.data);
      })
      .catch((error) => {
        console.error('Error fetching prediction details:', error);
      });
  }, [predictionId]);

  if (!prediction)
    return (
      <Spin
        tip={t('predictionDetails.loading')}
        style={{ width: '100%', margin: '32px 0' }}
      />
    );


  const columns = [
    {
      title: t('predictionDetails.element'),
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: t('predictionDetails.value'),
      dataIndex: ['PredictionNatureElement', 'value'],
      key: 'value',
      render: (_, record) => record.PredictionNatureElement.value,
    },
  ];

  return (
    <div style={{ width: '100%' }}>
      <Title level={3} style={{ marginBottom: 16 }}>
        {t('predictionDetails.title')}
      </Title>
      <Descriptions
        bordered
        column={1}
        size="large"
        style={{ marginBottom: 24 }}
      >
        <Descriptions.Item label={t('predictionDetails.id')}>
          {prediction.id}
        </Descriptions.Item>
        <Descriptions.Item label={t('predictionDetails.area')}>
          {prediction.Area.name}, {prediction.Area.address}
        </Descriptions.Item>
        <Descriptions.Item label={t('predictionDetails.areaType')}>
          {prediction.Area.area_type}
        </Descriptions.Item>
        <Descriptions.Item label={t('predictionDetails.predictionText')}>
          <PredictionBadge prediction={prediction} />
        </Descriptions.Item>
        <Descriptions.Item label={t('predictionDetails.expertId')}>
          {prediction.user_id}
        </Descriptions.Item>
        <Descriptions.Item label="Ngày tạo">
          {prediction.createdAt ? new Date(prediction.createdAt).toLocaleString('vi-VN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          }) : '-'}
        </Descriptions.Item>
      </Descriptions>
      <Title level={4} style={{ marginBottom: 12 }}>
        {t('predictionDetails.naturalElements')}
      </Title>
      <Table
        columns={columns}
        dataSource={prediction.NaturalElements}
        rowKey="id"
        pagination={false}
        size="large"
        bordered
      />
    </div>
  );
};

export default PredictionDetails;
