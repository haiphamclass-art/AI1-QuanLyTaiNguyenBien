import React, { useState } from 'react';
import {
  Form,
  Input,
  Button,
  Typography,
  message,
  Card,
  Steps,
  Result,
  Space,
  Row,
  Col,
} from 'antd';
import {
  MailOutlined,
  LockOutlined,
  ArrowLeftOutlined,
  KeyOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import axios from '../axios';

const { Title, Text } = Typography;

const ForgotPassword = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailForm] = Form.useForm();
  const [otpForm] = Form.useForm();

  // Step 1: Gửi OTP đến email
  const handleSendOTP = async (values) => {
    setLoading(true);
    try {
      const result = await axios.post('/api/express/auth/forgot-password', {
        email: values.email,
      });
      setEmail(values.email);
      message.success(result.data.message);
      setCurrentStep(1);
    } catch (error) {
      console.error('Send OTP error:', error);
      message.error(
        error.response?.data?.error || 'Có lỗi xảy ra. Vui lòng thử lại.'
      );
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Xác thực OTP và đặt lại mật khẩu
  const handleResetPassword = async (values) => {
    if (values.newPassword !== values.confirmPassword) {
      message.error('Mật khẩu xác nhận không khớp');
      return;
    }

    setLoading(true);
    try {
      await axios.post('/api/express/auth/reset-password', {
        email: email,
        otp_code: values.otp_code,
        newPassword: values.newPassword,
      });
      message.success('Đặt lại mật khẩu thành công!');
      setCurrentStep(2);
    } catch (error) {
      console.error('Reset password error:', error);
      message.error(
        error.response?.data?.error || 'Mã OTP không hợp lệ hoặc đã hết hạn'
      );
    } finally {
      setLoading(false);
    }
  };

  // Gửi lại OTP
  const handleResendOTP = async () => {
    setLoading(true);
    try {
      await axios.post('/api/express/auth/forgot-password', {
        email: email,
      });
      message.success('Mã OTP mới đã được gửi đến email của bạn');
    } catch (error) {
      console.error('Resend OTP error:', error);
      message.error('Có lỗi xảy ra. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  const steps = [
    { title: 'Nhập Email', icon: <MailOutlined /> },
    { title: 'Xác thực OTP', icon: <KeyOutlined /> },
    { title: 'Hoàn tất', icon: <CheckCircleOutlined /> },
  ];

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <Row justify="center" style={{ width: '100%', maxWidth: '1200px' }}>
        <Col xs={24} sm={20} md={16} lg={12} xl={10}>
          <Card
            style={{
              borderRadius: '16px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
              border: 'none',
            }}
            styles={{ body: { padding: '32px' } }}
          >
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              {/* Back Button */}
              <Button
                type="text"
                icon={<ArrowLeftOutlined />}
                onClick={() => navigate('/Login')}
                style={{ paddingLeft: 0, color: '#666' }}
              >
                Quay lại đăng nhập
              </Button>

              <Title level={3} style={{ margin: 0, textAlign: 'center' }}>
                🔐 Quên mật khẩu
              </Title>

              {/* Steps */}
              <Steps
                current={currentStep}
                items={steps}
                size="medium"
                style={{ marginBottom: '24px' }}
              />

              {/* Step 1: Email Input */}
              {currentStep === 0 && (
                <Form
                  form={emailForm}
                  layout="vertical"
                  onFinish={handleSendOTP}
                  size="large"
                >
                  <Text type="secondary" style={{ display: 'block', marginBottom: '16px' }}>
                    Nhập email của bạn để nhận mã xác thực (OTP).
                  </Text>

                  <Form.Item
                    name="email"
                    label="Email"
                    rules={[
                      { required: true, message: 'Vui lòng nhập email' },
                      { type: 'email', message: 'Email không hợp lệ' },
                    ]}
                  >
                    <Input
                      prefix={<MailOutlined style={{ color: '#667eea' }} />}
                      placeholder="Nhập email của bạn"
                      style={{ borderRadius: '8px', padding: '12px 16px' }}
                    />
                  </Form.Item>

                  <Form.Item>
                    <Button
                      type="primary"
                      htmlType="submit"
                      loading={loading}
                      block
                      style={{
                        height: '48px',
                        borderRadius: '8px',
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        border: 'none',
                        fontSize: '16px',
                        fontWeight: 500,
                      }}
                    >
                      Gửi mã OTP
                    </Button>
                  </Form.Item>
                </Form>
              )}

              {/* Step 2: OTP Verification & New Password */}
              {currentStep === 1 && (
                <Form
                  form={otpForm}
                  layout="vertical"
                  onFinish={handleResetPassword}
                  size="large"
                >
                  <Text type="secondary" style={{ display: 'block', marginBottom: '16px' }}>
                    Mã OTP đã được gửi đến <strong>{email}</strong>.
                    Mã có hiệu lực trong 10 phút.
                  </Text>

                  <Form.Item
                    name="otp_code"
                    label="Mã OTP"
                    rules={[
                      { required: true, message: 'Vui lòng nhập mã OTP' },
                      { len: 6, message: 'Mã OTP phải có 6 chữ số' },
                    ]}
                  >
                    <Input
                      prefix={<KeyOutlined style={{ color: '#667eea' }} />}
                      placeholder="Nhập mã OTP 6 chữ số"
                      maxLength={6}
                      style={{
                        borderRadius: '8px',
                        padding: '12px 16px',
                        fontSize: '18px',
                        letterSpacing: '8px',
                        textAlign: 'center',
                      }}
                    />
                  </Form.Item>

                  <Form.Item
                    name="newPassword"
                    label="Mật khẩu mới"
                    rules={[
                      { required: true, message: 'Vui lòng nhập mật khẩu mới' },
                      { min: 6, message: 'Mật khẩu phải có ít nhất 6 ký tự' },
                    ]}
                  >
                    <Input.Password
                      prefix={<LockOutlined style={{ color: '#667eea' }} />}
                      placeholder="Nhập mật khẩu mới"
                      style={{ borderRadius: '8px', padding: '12px 16px' }}
                    />
                  </Form.Item>

                  <Form.Item
                    name="confirmPassword"
                    label="Xác nhận mật khẩu mới"
                    dependencies={['newPassword']}
                    rules={[
                      { required: true, message: 'Vui lòng xác nhận mật khẩu' },
                      ({ getFieldValue }) => ({
                        validator(_, value) {
                          if (!value || getFieldValue('newPassword') === value) {
                            return Promise.resolve();
                          }
                          return Promise.reject(new Error('Mật khẩu xác nhận không khớp'));
                        },
                      }),
                    ]}
                  >
                    <Input.Password
                      prefix={<LockOutlined style={{ color: '#667eea' }} />}
                      placeholder="Nhập lại mật khẩu mới"
                      style={{ borderRadius: '8px', padding: '12px 16px' }}
                    />
                  </Form.Item>

                  <Form.Item>
                    <Button
                      type="primary"
                      htmlType="submit"
                      loading={loading}
                      block
                      style={{
                        height: '48px',
                        borderRadius: '8px',
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        border: 'none',
                        fontSize: '16px',
                        fontWeight: 500,
                      }}
                    >
                      Đặt lại mật khẩu
                    </Button>
                  </Form.Item>

                  <div style={{ textAlign: 'center' }}>
                    <Button
                      type="link"
                      onClick={handleResendOTP}
                      loading={loading}
                      style={{ color: '#667eea' }}
                    >
                      Gửi lại mã OTP
                    </Button>
                    <span style={{ margin: '0 8px', color: '#999' }}>|</span>
                    <Button
                      type="link"
                      onClick={() => setCurrentStep(0)}
                      style={{ color: '#666' }}
                    >
                      Đổi email
                    </Button>
                  </div>
                </Form>
              )}

              {/* Step 3: Success */}
              {currentStep === 2 && (
                <Result
                  status="success"
                  title="Đặt lại mật khẩu thành công!"
                  subTitle="Bạn có thể đăng nhập với mật khẩu mới ngay bây giờ."
                  extra={[
                    <Button
                      type="primary"
                      key="login"
                      onClick={() => navigate('/Login')}
                      style={{
                        height: '48px',
                        borderRadius: '8px',
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        border: 'none',
                        fontSize: '16px',
                        fontWeight: 500,
                        padding: '0 32px',
                      }}
                    >
                      Đăng nhập ngay
                    </Button>,
                  ]}
                />
              )}
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default ForgotPassword;

