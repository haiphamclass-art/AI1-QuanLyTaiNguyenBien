import React, { useEffect, useState } from 'react';
import {
  Form,
  Input,
  Button,
  Typography,
  message,
  Card,
  Alert,
  Space,
  Divider,
  Row,
  Col,
  Spin,
  Tooltip
} from 'antd';
import {
  UserOutlined,
  LockOutlined,
  ArrowLeftOutlined,
  LoginOutlined,
  EyeInvisibleOutlined,
  EyeTwoTone,
  MailOutlined,
  KeyOutlined,
  CloseOutlined
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { login, logout } from '../redux/authSlice';
import axios from '../axios';
import { jwtDecode } from 'jwt-decode';
import { toast } from 'react-toastify';

const { Title } = Typography;

const Login = () => {
  const { t } = useTranslation();
  const { token } = useSelector((state) => state.auth);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorType, setErrorType] = useState(''); // 'network', 'auth', 'validation', 'server'
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [form] = Form.useForm();

  useEffect(() => {
    if (token) {
      try {
        const decodedToken = jwtDecode(token); // Decode the JWT token
        const exp = decodedToken.exp * 1000;
        const now = Date.now();
        if (now > exp) {
          dispatch(logout());
          navigate('/');
        }
        // Navigate based on role
        const decodedRole = decodedToken.role;
        if (decodedRole === 'admin' || decodedRole === 'manager') {
          navigate('/admin-stats');
        } else {
          navigate('/dashboard');
        }
      } catch (error) {
        console.error('Error decoding token:', error);
        toast.error(t('login.invalidToken'));
      }
    }
  }, [token, dispatch, navigate, t]);

  const handleLogin = async (values) => {
    setLoading(true);
    setError('');
    setErrorType('');

    try {
      console.log('Login attempt:', { email: values.email, password: '***' });

      const response = await axios.post('/api/express/auth/login', {
        email: values.email,
        password: values.password,
      });

      const { token, role } = response.data;
      localStorage.setItem('token', token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

      // Dispatch login action with token and role
      dispatch(
        login({
          user: values.email,
          token,
          role,
        })
      );

      message.success(t('login.success') || 'Đăng nhập thành công!');

      // Navigate based on role after successful login
      if (role === 'admin' || role === 'manager') {
        navigate('/admin-stats');
      } else {
        navigate('/dashboard');
      }
    } catch (error) {
      console.error('Login error:', error);

      let errorMessage = '';
      let errorType = 'server';

      if (!error.response) {
        // Network error
        errorMessage = t('login.networkError') || 'Không thể kết nối đến server. Vui lòng kiểm tra kết nối mạng.';
        errorType = 'network';
      } else {
        const status = error.response.status;
        const data = error.response.data;

        switch (status) {
          case 401:
            errorMessage = data?.error || t('login.invalidCredentials') || 'Email hoặc mật khẩu không đúng.';
            errorType = 'auth';
            break;
          case 403:
            errorMessage = data?.error || t('login.accountDeactivated') || 'Tài khoản đã bị vô hiệu hóa.';
            errorType = 'auth';
            break;
          case 400:
            errorMessage = data?.error || t('login.invalidInput') || 'Thông tin đăng nhập không hợp lệ.';
            errorType = 'validation';
            break;
          case 500:
            errorMessage = t('login.serverError') || 'Lỗi server. Vui lòng thử lại sau.';
            errorType = 'server';
            break;
          default:
            errorMessage = data?.error || t('login.unknownError') || 'Có lỗi xảy ra. Vui lòng thử lại.';
            errorType = 'server';
        }
      }

      setError(errorMessage);
      setErrorType(errorType);
      message.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const getErrorIcon = () => {
    switch (errorType) {
      case 'network':
        return <UserOutlined />;
      case 'auth':
        return <LockOutlined />;
      case 'validation':
        return <MailOutlined />;
      case 'server':
        return <KeyOutlined />;
      default:
        return <UserOutlined />;
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'transparent',
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
              borderRadius: '12px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
              border: 'none'
            }}
            styles={{ body: { padding: 0 } }}
          >
            <div style={{ padding: '28px' }}>
              <Space direction="vertical" size="large" style={{ width: '100%' }}>
                <Title level={3} style={{ margin: 0, textAlign: 'center', color: '#222' }}>
                  {t('login.title') || 'Đăng nhập'}
                </Title>
                {/* Back Button */}
                <Button
                  type="text"
                  icon={<ArrowLeftOutlined />}
                  onClick={() => navigate('/interactive-map')}
                  style={{
                    paddingLeft: 0,
                    color: '#666',
                    marginBottom: '8px'
                  }}
                >
                  {t('common.back') || 'Trở về trang chủ'}
                </Button>

                {/* Error Alert */}
                {error && (
                  <Alert
                    message={error}
                    type={errorType === 'network' ? 'warning' : 'error'}
                    icon={getErrorIcon()}
                    showIcon
                    style={{ marginBottom: '16px' }}
                    action={
                      <Button
                        size="medium"
                        type="text"
                        onClick={() => setError('')}
                      >
                        Đóng
                      </Button>
                    }
                  />
                )}

                {/* Login Form */}
                <Form
                  form={form}
                  name="login"
                  onFinish={handleLogin}
                  layout="vertical"
                  size="large"
                  initialValues={{}}
                >
                  <Form.Item
                    name="email"
                    label={<span style={{ fontWeight: 500 }}>{t('login.email') || 'Email/Tên đăng nhập'}</span>}
                    rules={[
                      {
                        required: true,
                        message: t('login.emailRequired') || 'Vui lòng nhập email'
                      },
                    ]}
                  >
                    <Input
                      prefix={<MailOutlined style={{ color: '#007bff' }} />}
                      placeholder={t('login.email') || 'Nhập email của bạn'}
                      autoComplete="username"
                      style={{
                        borderRadius: '8px',
                        padding: '12px 16px',
                        fontSize: '16px'
                      }}
                    />
                  </Form.Item>

                  <Form.Item
                    name="password"
                    label={<span style={{ fontWeight: 500 }}>Mật khẩu</span>}
                    rules={[
                      {
                        required: true,
                        message: t('login.passwordRequired') || 'Vui lòng nhập mật khẩu'
                      },
                      {
                        min: 6,
                        message: 'Mật khẩu phải có ít nhất 6 ký tự'
                      }
                    ]}
                  >
                    <Input.Password
                      prefix={<LockOutlined style={{ color: '#007bff' }} />}
                      placeholder={t('login.password') || 'Nhập mật khẩu của bạn'}
                      autoComplete="current-password"
                      iconRender={(visible) => (visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />)}
                      style={{
                        borderRadius: '8px',
                        padding: '12px 16px',
                        fontSize: '16px'
                      }}
                    />
                  </Form.Item>

                  <Form.Item style={{ marginBottom: '16px' }}>
                    <Button
                      type="primary"
                      htmlType="submit"
                      loading={loading}
                      block
                      size="large"
                      icon={<LoginOutlined />}
                      style={{
                        height: '48px',
                        borderRadius: '8px',
                        fontSize: '16px',
                        fontWeight: 500,
                        background: '#007bff',
                        border: 'none',
                        boxShadow: '0 4px 12px rgba(0, 123, 255, 0.35)'
                      }}
                    >
                      {loading ? (
                        <Space>
                          <Spin size="medium" />
                          <span>Đang đăng nhập...</span>
                        </Space>
                      ) : (
                        t('login.button') || 'Đăng nhập'
                      )}
                    </Button>
                  </Form.Item>

                  {/* Forgot Password Link */}
                  <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                    <Button
                      type="link"
                      onClick={() => navigate('/forgot-password')}
                      style={{ color: '#007bff', padding: 0 }}
                    >
                      <KeyOutlined style={{ marginRight: 4 }} />
                      {t('login.forgotPassword') || 'Quên mật khẩu?'}
                    </Button>
                  </div>
                </Form>
              </Space>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Login;
