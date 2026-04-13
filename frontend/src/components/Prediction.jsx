import React, { useState, useEffect } from 'react';
import axios from '../axios';
import MapView from './MapView';
import { useNavigate, useParams } from 'react-router-dom';
import './Prediction.css';
import { useTranslation } from 'react-i18next';
import { Card, Typography, Space, Button, Result, Spin } from 'antd';
import PredictionBadge from './PredictionBadge';
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  HomeOutlined,
  LoadingOutlined,
  QuestionCircleOutlined,
  WarningOutlined,
  MailOutlined,
} from '@ant-design/icons';

const { Title, Text } = Typography;

const Prediction = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { areaId } = useParams();
  const [area, setArea] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(true);

  const getPredictionInfo = (prediction) => {
    if (!prediction) return {};
    console.log('result', prediction.prediction_text);

    switch (prediction.prediction_text) {
      case -1:
        return {
          text: t('prediction.unsuitable'),
          icon: <WarningOutlined style={{ fontSize: 24, color: '#ff4d4f' }} />,
          color: '#ff4d4f',
        };
      case 1:
        return {
          text: t('prediction.excellent'),
          icon: (
            <CheckCircleOutlined style={{ fontSize: 24, color: '#52c41a' }} />
          ),
          color: '#52c41a',
        };
      case 0:
        return {
          text: t('prediction.suitable'),
          icon: (
            <ExclamationCircleOutlined
              style={{ fontSize: 24, color: '#faad14' }}
            />
          ),
          color: '#faad14',
        };
      default:
        return {
          text: t('prediction.unidentified'),
          icon: (
            <QuestionCircleOutlined
              style={{ fontSize: 24, color: '#faad14' }}
            />
          ),
          color: '#faad14',
        };
    }
  };

  const fetchArea = async () => {
    try {
      const areaResponse = await axios.get(`/api/express/areas/area/${areaId}`);
      setArea(areaResponse.data);
    } catch (error) {
      console.error('Error fetching area:', error);
    }
  };

  const fetchPrediction = async () => {
    try {
      const predictionResponse = await axios.get(
        `/api/express/predictions/${areaId}/latest`
      );
      if (predictionResponse.data) setPrediction(predictionResponse.data);
    } catch (err) {
      console.error('Error fetching prediction:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchArea();
    fetchPrediction();
  }, [areaId]);

  const handleBack = () => {
    navigate('/');
  };

  const handleEmailSubscription = () => {
    navigate(`/email-subscription/${areaId}`);
  };

  if (loading) {
    return (
      <Result
        icon={<LoadingOutlined />}
        title={t('prediction.loadingArea')}
        extra={
          <Button
            style={{
              whiteSpace: 'normal',
              wordBreak: 'break-word',
              maxWidth: '100%',
              height: 'auto',
            }}
            type="primary"
            icon={<HomeOutlined />}
            onClick={handleBack}
          >
            <p> {t('prediction.return')} </p>
          </Button>
        }
      />
    );
  }

  if (!area) {
    return (
      <Result
        status="404"
        title={t('prediction.areaNotFound')}
        extra={
          <Button
            style={{
              whiteSpace: 'normal',
              wordBreak: 'break-word',
              maxWidth: '100%',
              height: 'auto',
            }}
            type="primary"
            icon={<HomeOutlined />}
            onClick={handleBack}
          >
            {t('prediction.return')}
          </Button>
        }
      />
    );
  }

  const predictionInfo = getPredictionInfo(prediction);

  return (
    <Card
      style={{ maxWidth: 1200, margin: '32px auto' }}
      title={
        <Space>
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={handleBack}
            type="link"
          />
          <Title level={4} style={{ margin: 0 }}>
            {t('prediction.title', { area: area.name })}
          </Title>
        </Space>
      }
    >
      {prediction ? (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Space align="center">
            {predictionInfo.icon}
            <PredictionBadge prediction={prediction} />
          </Space>
          {prediction.createdAt && (
            <div style={{
              textAlign: 'center',
              padding: '12px 16px',
              backgroundColor: '#f5f5f5',
              borderRadius: '6px',
              border: '1px solid #d9d9d9'
            }}>
              <Text type="secondary" style={{ fontSize: '14px' }}>
                📅 Ngày tạo: {new Date(prediction.createdAt).toLocaleString('vi-VN', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </Text>
            </div>
          )}
          <MapView
            latitude={area?.latitude}
            longitude={area?.longitude}
            result={prediction?.prediction_text}
            area={area?.area}
          />
          <Space style={{ justifyContent: 'center', width: '100%' }}>
            <Button
              type="primary"
              icon={<MailOutlined />}
              onClick={handleEmailSubscription}
              size="large"
            >
              {t('prediction.subscribeEmail')}
            </Button>
          </Space>
        </Space>
      ) : (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Result
            status="warning"
            title={t('prediction.noPrediction')}
            extra={
              <Space>
                <Button
                  style={{
                    whiteSpace: 'normal',
                    wordBreak: 'break-word',
                    maxWidth: '100%',
                  }}
                  type="primary"
                  size="large"
                  icon={<HomeOutlined />}
                  onClick={handleBack}
                >
                  {t('prediction.goBack')}
                </Button>
                <Button
                  type="default"
                  icon={<MailOutlined />}
                  onClick={handleEmailSubscription}
                  size="large"
                >
                  {t('prediction.subscribeEmail')}
                </Button>
              </Space>
            }
          />
          <MapView
            latitude={area?.latitude}
            longitude={area?.longitude}
            result={-2}
            area={area?.area}
          />
        </Space>
      )}
    </Card>
  );
};

export default Prediction;
