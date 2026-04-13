import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Card,
  Spin,
  Alert,
  Button,
  Typography,
  Descriptions,
  Space,
  Result,
} from 'antd';
import {
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  HomeOutlined,
  LoadingOutlined,
  EnvironmentOutlined,
} from '@ant-design/icons';
import axios from '../axios';

const { Title, Text, Paragraph } = Typography;

const UnsubscribePage = () => {
  const { t } = useTranslation();
  const { token } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [areaInfo, setAreaInfo] = useState(null);

  useEffect(() => {
    const handleUnsubscribe = async () => {
      if (!token) {
        setError('Token không hợp lệ');
        setLoading(false);
        return;
      }

      try {
        const response = await axios.get(
          `/api/express/emails/unsubscribe/${token}`
        );
        setMessage(response.data.message);
        setAreaInfo(response.data.area);
      } catch (err) {
        if (err.response?.data?.error) {
          setError(err.response.data.error);
        } else {
          setError('Có lỗi xảy ra khi hủy đăng ký');
        }
      } finally {
        setLoading(false);
      }
    };

    handleUnsubscribe();
  }, [token]);

  const handleGoHome = () => {
    navigate('/');
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        }}
      >
        <Card style={{ textAlign: 'center', maxWidth: 400 }}>
          <Spin
            indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />}
            size="large"
          />
          <Title level={4} style={{ marginTop: 16 }}>
            Đang xử lý yêu cầu hủy đăng ký...
          </Title>
        </Card>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: '20px',
      }}
    >
      <Card style={{ maxWidth: 500, width: '100%' }}>
        {error ? (
          <Result
            status="error"
            icon={<ExclamationCircleOutlined />}
            title="Hủy đăng ký thất bại"
            subTitle={error}
            extra={[
              <Button
                type="primary"
                icon={<HomeOutlined />}
                onClick={handleGoHome}
                key="home"
              >
                Về trang chủ
              </Button>,
            ]}
          />
        ) : (
          <Result
            status="success"
            icon={<CheckCircleOutlined />}
            title="Hủy đăng ký thành công"
            subTitle={message}
            extra={[
              <Button
                type="primary"
                icon={<HomeOutlined />}
                onClick={handleGoHome}
                key="home"
              >
                Về trang chủ
              </Button>,
            ]}
          >
            {areaInfo && (
              <Card
                title={
                  <Space>
                    <EnvironmentOutlined />
                    <span>Thông tin khu vực</span>
                  </Space>
                }
                style={{ marginTop: 24 }}
                size="medium"
              >
                <Descriptions column={1} size="medium">
                  <Descriptions.Item label="Tên khu vực">
                    <Text strong>{areaInfo.name}</Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="Loại khu vực">
                    <Text>{areaInfo.area_type}</Text>
                  </Descriptions.Item>
                </Descriptions>
              </Card>
            )}

            <div style={{ marginTop: 24, textAlign: 'left' }}>
              <Paragraph type="secondary">
                Bạn sẽ không còn nhận được thông báo email khi có dự đoán mới
                cho khu vực này.
              </Paragraph>
              <Paragraph type="secondary">
                Nếu muốn đăng ký lại, vui lòng truy cập vào trang chi tiết khu
                vực và đăng ký lại.
              </Paragraph>
            </div>
          </Result>
        )}
      </Card>
    </div>
  );
};

export default UnsubscribePage;
