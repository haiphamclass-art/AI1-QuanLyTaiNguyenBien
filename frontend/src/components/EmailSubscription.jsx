import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Form,
  Input,
  Button,
  Alert,
  Typography,
  Space,
  Spin,
  Tooltip,
} from 'antd';
import {
  MailOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ArrowLeftOutlined,
} from '@ant-design/icons';
import axios from '../axios';

const { Title, Text } = Typography;

const EmailSubscription = () => {
  const { t } = useTranslation();
  const { areaId } = useParams();
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [otpForm] = Form.useForm();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [showOTPForm, setShowOTPForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [area, setArea] = useState(null);
  const [areaLoading, setAreaLoading] = useState(true);
  const [emailForOTP, setEmailForOTP] = useState('');

  // Fetch area information
  useEffect(() => {
    const fetchArea = async () => {
      try {
        const response = await axios.get(`/api/express/areas/area/${areaId}`);
        setArea(response.data);
      } catch (error) {
        console.error('Error fetching area:', error);
        setError('Không thể tải thông tin khu vực. Vui lòng kiểm tra lại ID khu vực.');
      } finally {
        setAreaLoading(false);
      }
    };

    if (areaId) {
      fetchArea();
    }
  }, [areaId]);

  const handleSendOTP = async (values) => {
    setOtpLoading(true);
    setError('');
    setMessage('');

    try {
      const response = await axios.post('/api/express/emails/send-otp', {
        email: values.email,
        area_id: areaId,
      });

      setMessage(
        'Mã OTP đã được gửi đến email của bạn. Vui lòng kiểm tra hộp thư.'
      );
      setEmailForOTP(values.email);
      setShowOTPForm(true);
      form.resetFields();
    } catch (err) {
      console.error('Error sending OTP:', err);
      if (err.response?.data?.error) {
        setError(err.response.data.error);
      } else {
        setError('Không thể gửi mã OTP. Vui lòng kiểm tra kết nối mạng và thử lại.');
      }
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOTP = async (values) => {
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const response = await axios.post('/api/express/emails/verify-otp', {
        email: emailForOTP,
        area_id: areaId,
        otp_code: values.otp_code,
      });

      setMessage(response.data.message);
      setIsSubscribed(true);
      setShowOTPForm(false);
      otpForm.resetFields();
    } catch (err) {
      console.error('Error verifying OTP:', err);
      if (err.response?.data?.error) {
        setError(err.response.data.error);
      } else {
        setError('Mã OTP không đúng hoặc đã hết hạn. Vui lòng thử lại.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribeAnother = () => {
    setIsSubscribed(false);
    setShowOTPForm(false);
    setMessage('');
    setError('');
    form.resetFields();
    otpForm.resetFields();
  };

  const handleResendOTP = async () => {
    setOtpLoading(true);
    setError('');

    try {
      await axios.post('/api/express/emails/send-otp', {
        email: emailForOTP,
        area_id: areaId,
      });

      setMessage('Mã OTP mới đã được gửi đến email của bạn.');
    } catch (err) {
      if (err.response?.data?.error) {
        setError(err.response.data.error);
      } else {
        setError('Không thể gửi lại mã OTP. Vui lòng thử lại.');
      }
    } finally {
      setOtpLoading(false);
    }
  };

  if (areaLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <Spin size="large" />
        <div style={{ marginTop: 16 }}>Đang tải thông tin khu vực...</div>
      </div>
    );
  }

  if (!area) {
    return (
      <Alert
        message="Lỗi"
        description="Không tìm thấy thông tin khu vực"
        type="error"
        showIcon
      />
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '50vh',
        padding: '20px',
      }}
    >
      <Card
        title={
          <Space>
            <MailOutlined />
            <span>{t('email.subscriptions')}</span>
          </Space>
        }
        extra={
          <Button
            type="default"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/interactive-map')}
          >
            Quay về
          </Button>
        }
        style={{ maxWidth: 500, width: '100%' }}
      >
        <Text type="secondary">
          Đăng ký nhận thông báo cho khu vực <Text strong>{area.name}</Text>
        </Text>

        {!isSubscribed && !showOTPForm ? (
          <Form
            form={form}
            layout="vertical"
            onFinish={handleSendOTP}
            style={{ marginTop: 16 }}
          >
            <Form.Item
              name="email"
              label={t('email.email')}
              rules={[
                { required: true, message: t('email.required') },
                { type: 'email', message: t('email.invalidEmail') },
              ]}
            >
              <Input
                placeholder="your-email@example.com"
                disabled={otpLoading}
                prefix={<MailOutlined />}
              />
            </Form.Item>

            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                loading={otpLoading}
                icon={<MailOutlined />}
                block
              >
                Gửi mã xác thực
              </Button>
            </Form.Item>
          </Form>
        ) : showOTPForm && !isSubscribed ? (
          <div style={{ marginTop: 16 }}>
            <Alert
              message="Nhập mã OTP"
              description={`Vui lòng nhập mã 6 số đã được gửi đến ${emailForOTP}`}
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />
            <Form form={otpForm} layout="vertical" onFinish={handleVerifyOTP}>
              <Form.Item
                name="otp_code"
                label="Mã OTP"
                rules={[
                  { required: true, message: 'Vui lòng nhập mã OTP' },
                  { len: 6, message: 'Mã OTP phải có 6 số' },
                  { pattern: /^\d{6}$/, message: 'Mã OTP chỉ được chứa số' },
                ]}
              >
                <Input
                  placeholder="123456"
                  maxLength={6}
                  disabled={loading}
                  style={{
                    textAlign: 'center',
                    fontSize: '18px',
                    letterSpacing: '2px',
                  }}
                />
              </Form.Item>

              <Form.Item>
                <Space
                  style={{ width: '100%', justifyContent: 'space-between' }}
                >
                  <Button
                    type="default"
                    onClick={handleResendOTP}
                    loading={otpLoading}
                    disabled={loading}
                  >
                    Gửi lại mã
                  </Button>
                  <Button
                    type="primary"
                    htmlType="submit"
                    loading={loading}
                    icon={<CheckCircleOutlined />}
                  >
                    Xác thực và đăng ký
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </div>
        ) : (
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <Alert
              message="Đăng ký thành công"
              description={message}
              type="success"
              showIcon
              icon={<CheckCircleOutlined />}
              style={{ marginBottom: 16 }}
            />
            <Button onClick={handleSubscribeAnother} type="default">
              Đăng ký email khác
            </Button>
          </div>
        )}

        {error && (
          <Alert
            message="Lỗi"
            description={error}
            type="error"
            showIcon
            icon={<ExclamationCircleOutlined />}
            style={{ marginTop: 16 }}
          />
        )}

        {message && !isSubscribed && (
          <Alert
            message="Thành công"
            description={message}
            type="success"
            showIcon
            icon={<CheckCircleOutlined />}
            style={{ marginTop: 16 }}
          />
        )}
      </Card>
    </div>
  );
};

export default EmailSubscription;
