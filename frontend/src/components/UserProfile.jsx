import React, { useState, useEffect } from 'react';
import {
  Card,
  Typography,
  Row,
  Col,
  Spin,
  Button,
  Modal,
  Form,
  Input,
  message,
} from 'antd';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from '../axios';

const { Title } = Typography;

const UserProfile = () => {
  const { t } = useTranslation();
  const { token, role } = useSelector((state) => state.auth);
  const navigate = useNavigate();
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [editForm] = Form.useForm();
  const [passwordForm] = Form.useForm();
  const [loadingUpdate, setLoadingUpdate] = useState(false);
  const [loadingPassword, setLoadingPassword] = useState(false);
  const [regionList, setRegionList] = useState([]);
  const [districtList, setDistrictList] = useState([]);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        // Use /auth/me instead of decoding token and fetching by ID
        const response = await axios.get('/api/express/auth/me');
        setUserData(response.data);
      } catch (error) {
        console.error('Error fetching user data:', error);
        if (error.response?.status === 401) {
          message.error('Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.');
          navigate('/login');
        }
      } finally {
        setLoading(false);
      }
    };

    if (token) {
      fetchUserData();
    } else {
      setLoading(false);
      navigate('/login');
    }
  }, [token, navigate]);

  useEffect(() => {
    const fetchRegions = async () => {
      try {
        const [provinces, districts] = await Promise.all([
          axios.get('/api/express/areas/provinces'),
          axios.get('/api/express/areas/districts'),
        ]);
        setRegionList(provinces.data);
        setDistrictList(districts.data);
      } catch (err) {
        // ignore
      }
    };
    fetchRegions();
  }, []);

  const getProvinceName = (id) =>
    regionList.find((r) => r.id === userData?.province)?.name ||
    'Chưa có thông tin';
  const getDistrictName = (id) =>
    districtList.find((d) => d.id === userData?.district)?.name ||
    'Chưa có thông tin';

  const handleEditUser = () => {
    setIsEditModalOpen(true);
  };

  // ✅ Sửa chính ở đây: đảm bảo form nhận giá trị sau khi modal mở
  useEffect(() => {
    if (isEditModalOpen && userData) {
      editForm.setFieldsValue({
        username: userData.username || '',
        phone: userData.phone || '',
        address: userData.address || '',
      });
    }
  }, [isEditModalOpen, userData, editForm]);

  const handleUpdateUser = async (values) => {
    setLoadingUpdate(true);
    try {
      const changed = {};
      if (values.username !== userData?.username)
        changed.name = values.username;
      if (values.phone !== userData?.phone) changed.phone = values.phone;
      if (values.address !== userData?.address)
        changed.address = values.address;
      if (Object.keys(changed).length === 0) {
        message.info('Không có thay đổi nào');
        setLoadingUpdate(false);
        setIsEditModalOpen(false);
        return;
      }
      await axios.post(`/api/express/auth/update/${userData.id}`, changed);
      message.success(t('profile.update-success') || 'Cập nhật thành công!');
      setIsEditModalOpen(false);
      window.location.reload();
    } catch (err) {
      message.error(t('profile.update-failed') || 'Cập nhật thất bại!');
    }
    setLoadingUpdate(false);
  };

  const handleChangePassword = async (values) => {
    setLoadingPassword(true);
    try {
      if (
        !values.oldPassword ||
        !values.newPassword ||
        !values.confirmPassword
      ) {
        message.error(
          t('profile.please-fill-all-information') ||
          'Vui lòng nhập đầy đủ thông tin'
        );
        setLoadingPassword(false);
        return;
      }
      if (values.newPassword !== values.confirmPassword) {
        message.error(
          t('profile.incorrect-confirm-password') ||
          'Mật khẩu xác nhận không khớp'
        );
        setLoadingPassword(false);
        return;
      }
      await axios.post(`/api/express/auth/change-password`, {
        oldPassword: values.oldPassword,
        newPassword: values.newPassword,
      });
      message.success(
        t('profile.password-change-success') || 'Đổi mật khẩu thành công!'
      );
      setIsPasswordModalOpen(false);
    } catch (err) {
      message.error(
        t('profile.password-change-failed') || 'Đổi mật khẩu thất bại!'
      );
    }
    setLoadingPassword(false);
  };

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
        }}
      >
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ padding: '24px' }}>
      <Card>
        <Title level={2}>{t('profile.title')}</Title>
        <div style={{ marginBottom: 24, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Button
            type="primary"
            style={{ marginRight: 12 }}
            onClick={handleEditUser}
          >
            {t('profile.update')}
          </Button>
          <Button onClick={() => setIsPasswordModalOpen(true)}>
            {t('profile.password-change')}
          </Button>
          {(userData?.role === 'admin' || userData?.role === 'expert') && (
            <Button onClick={() => navigate('/jobs')}>
              Xem danh sách Job
            </Button>
          )}
        </div>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <div style={{ display: 'flex', marginBottom: 16 }}>
            <div style={{ flex: 1, color: '#888' }}>
              {t('profile.username')}
            </div>
            <div style={{ flex: 2, fontWeight: 500 }}>
              {userData?.username || 'Chưa có thông tin'}
            </div>
          </div>
          <div style={{ display: 'flex', marginBottom: 16 }}>
            <div style={{ flex: 1, color: '#888' }}>{t('profile.phone')}</div>
            <div style={{ flex: 2 }}>
              {userData?.phone || 'Chưa có thông tin'}
            </div>
          </div>
          <div style={{ display: 'flex', marginBottom: 16 }}>
            <div style={{ flex: 1, color: '#888' }}>{t('profile.email')}</div>
            <div style={{ flex: 2 }}>
              {userData?.email || 'Chưa có thông tin'}
            </div>
          </div>
          <div style={{ display: 'flex', marginBottom: 16 }}>
            <div style={{ flex: 1, color: '#888' }}>{t('profile.role')}</div>
            <div style={{ flex: 2 }}>
              {userData?.role
                ? userData.role === 'manager'
                  ? userData.district
                    ? t('userList.districtManager')
                    : t('userList.provinceManager')
                  : t(`userList.${userData.role}`)
                : 'Chưa có thông tin'}
            </div>
          </div>
          <div style={{ display: 'flex', marginBottom: 16 }}>
            <div style={{ flex: 1, color: '#888' }}>{t('profile.status')}</div>
            <div style={{ flex: 2 }}>
              {userData?.status
                ? t(`userList.${userData.status}Account`)
                : 'Chưa có thông tin'}
            </div>
          </div>
          <div style={{ display: 'flex', marginBottom: 16 }}>
            <div style={{ flex: 1, color: '#888' }}>{t('profile.address')}</div>
            <div style={{ flex: 2 }}>
              {userData?.address || 'Chưa có thông tin'}
            </div>
          </div>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={8} style={{ color: '#888' }}>
              {t('profile.province')}
            </Col>
            <Col span={16}>{getProvinceName(userData?.province)}</Col>
          </Row>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={8} style={{ color: '#888' }}>
              {t('profile.district')}
            </Col>
            <Col span={16}>{getDistrictName(userData?.district)}</Col>
          </Row>
        </div>
      </Card>

      {/* Modal cập nhật người dùng */}
      <Modal
        title={t('profile.edit')}
        open={isEditModalOpen}
        onCancel={() => setIsEditModalOpen(false)}
        footer={null}
      >
        <Form form={editForm} layout="vertical" onFinish={handleUpdateUser}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label={t('profile.username')}
                name="username"
                rules={[{ required: true, message: 'Không được để trống' }]}
              >
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label={t('profile.phone')}
                name="phone"
                rules={[
                  { required: true, message: 'Không được để trống' },
                  {
                    pattern: /^0\d{9}$/,
                    message: 'Sai định dạng số điện thoại',
                  },
                ]}
              >
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label={t('profile.address')}
                name="address"
                rules={[{ required: true, message: 'Không được để trống' }]}
              >
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label={t('profile.email')}>
                <Input value={userData?.email} disabled />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label={t('profile.province')}>
                <Input value={getProvinceName(userData?.province)} disabled />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label={t('profile.district')}>
                <Input value={getDistrictName(userData?.district)} disabled />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label={t('profile.role')}>
                <Input
                  value={
                    userData?.role
                      ? userData.role === 'manager'
                        ? userData.district
                          ? t('userList.districtManager')
                          : t('userList.provinceManager')
                        : t(`userList.${userData.role}`)
                      : ''
                  }
                  disabled
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label={t('profile.status')}>
                <Input
                  value={
                    userData?.status
                      ? t(`userList.${userData.status}Account`)
                      : ''
                  }
                  disabled
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={loadingUpdate}
              style={{ width: '100%' }}
            >
              {t('profile.save-changes')}
            </Button>
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal đổi mật khẩu */}
      <Modal
        title={t('profile.password-change')}
        open={isPasswordModalOpen}
        onCancel={() => setIsPasswordModalOpen(false)}
        footer={null}
      >
        <Form
          form={passwordForm}
          layout="vertical"
          onFinish={handleChangePassword}
        >
          <Form.Item
            label={t('profile.old-password')}
            name="oldPassword"
            rules={[{ required: true, message: 'Không được để trống' }]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item
            label={t('profile.new-password')}
            name="newPassword"
            rules={[{ required: true, message: 'Không được để trống' }]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item
            label={t('profile.confirm-password')}
            name="confirmPassword"
            dependencies={['newPassword']}
            rules={[
              { required: true, message: 'Không được để trống' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('newPassword') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(
                    new Error('Mật khẩu xác nhận không khớp')
                  );
                },
              }),
            ]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={loadingPassword}
              style={{ width: '100%' }}
            >
              {t('profile.password-change')}
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default UserProfile;
