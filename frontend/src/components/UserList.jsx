import React, { useState, useEffect } from 'react';
import axios from '../axios';
import { useSelector } from 'react-redux';
import './UserList.css';
import { jwtDecode } from 'jwt-decode';
import { useTranslation } from 'react-i18next';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import {
  Card,
  Table,
  Typography,
  Row,
  Col,
  Button,
  Space,
  Pagination,
  Modal,
  Input,
  Form,
  Select,
  message,
  Tooltip,
  Spin,
} from 'antd';
import {
  EditOutlined,
  DeleteOutlined,
  StopOutlined,
  CheckOutlined,
  UserAddOutlined,
  SaveOutlined,
  CloseOutlined,
  KeyOutlined,
} from '@ant-design/icons';
const { Title } = Typography;

const UserList = () => {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const { token } = useSelector((state) => state.auth);
  const [authData, setAuthData] = useState(null);
  const [users, setUsers] = useState([]);
  const [isRegionPopup, setIsRegionPopup] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [regionList, setRegionList] = useState([]);
  const [districtList, setDistrictList] = useState([]);
  const [filteredDistrictList, setFilteredDistrictList] = useState([]);
  const [isUserPopupOpen, setIsUserPopupOpen] = useState(false);
  const [isConfirmPopupOpen, setIsConfirmPopupOpen] = useState(false);
  const [isShowPasswordPopupOpen, setIsShowPasswordPopupOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [adminPassword, setAdminPassword] = useState('');
  const [isResetPasswordModalOpen, setIsResetPasswordModalOpen] = useState(false);
  const [resetPasswordForm] = Form.useForm();
  const [loadingResetPassword, setLoadingResetPassword] = useState(false);
  const [userPopupData, setUserPopupData] = useState({
    id: null,
    name: '',
    login_name: '',
    email: '',
    address: '',
    phone: '',
    password: '',
    role: '',
  });
  const [selectedRegionName, setSelectedRegionName] = useState('');
  const [pagination, setPagination] = useState({
    current: 1,
    usersPerPage: 10,
    total: 0,
  });
  const [loading, setLoading] = useState(false);
  const [loginNameValue, setLoginNameValue] = useState('');
  const [loginNameError, setLoginNameError] = useState(false);
  const [loginNameErrorMessage, setLoginNameErrorMessage] = useState('');
  const [checkingLoginName, setCheckingLoginName] = useState(false);
  const debouncedLoginName = useDebouncedValue(loginNameValue, 500);
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 500);

  // Fetch users from the API
  const fetchUsers = async (page = 1, usersPerPage = 10) => {
    setLoading(true);
    try {
      const { role, province } = authData || {};

      const response = await axios.get('/api/express/auth/paginated', {
        params: {
          search: debouncedSearchTerm,
          role,
          province,
          limit: usersPerPage,
          offset: (page - 1) * usersPerPage
        },
      });
      console.log(response.data.users);
      setUsers(response.data.users || []);
      setPagination({
        current: page,
        usersPerPage: usersPerPage,
        total: response.data.total || 0,
      });
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch provinces and districts independently so selects are always available
  const fetchRegions = async () => {
    try {
      const regionResponse = await axios.get('/api/express/areas/provinces');
      setRegionList(regionResponse.data);
    } catch (error) {
      console.error('Error fetching provinces:', error);
    }
  };

  const fetchDistricts = async () => {
    try {
      const districtResponse = await axios.get('/api/express/areas/districts');
      setDistrictList(districtResponse.data);
      setFilteredDistrictList(districtResponse.data);
    } catch (error) {
      console.error('Error fetching districts:', error);
    }
  };

  useEffect(() => {
    if (token) {
      try {
        console.log('token1', token);
        const decodedToken = jwtDecode(token); // Decode the JWT token
        setAuthData(decodedToken);
        console.log('haha', authData);
      } catch (error) {
        console.error('Error decoding token:', error);
      }
    }
  }, [token]);

  useEffect(() => {
    if (authData) {
      fetchUsers(pagination.current, pagination.usersPerPage);
    }
  }, [authData, pagination.current, pagination.usersPerPage]);

  useEffect(() => {
    fetchUsers(1, pagination.usersPerPage);
  }, [debouncedSearchTerm]);

  // Check login name availability when debounced value changes
  useEffect(() => {
    const checkLoginNameAvailability = async () => {
      // Check if value is not empty and modal is open
      if (debouncedLoginName && debouncedLoginName.trim() !== '' && isUserPopupOpen) {
        // Validate format first
        if (!/^[a-zA-Z0-9_]+$/.test(debouncedLoginName)) {
          setCheckingLoginName(true);
          setLoginNameErrorMessage(t('userList.nameContainsOnlyLettersAndNumbers') || 'Tên đăng nhập chỉ được chứa chữ cái không dấu, số và dấu gạch dưới');
          setLoginNameError(true);
          setCheckingLoginName(false);
          return;
        }
        else if (debouncedLoginName.length < 3) {
          setCheckingLoginName(true);
          console.log('login name is too short');
          setLoginNameErrorMessage(t('userList.shortLoginName') || 'Tên đăng nhập phải có ít nhất 3 ký tự');
          setLoginNameError(true);
          setCheckingLoginName(false);

        } else {

          setCheckingLoginName(true);
          setLoginNameErrorMessage('');
          setLoginNameError(false);

          try {
            const params = { login_name: debouncedLoginName.trim() };
            // If editing, exclude current user from check
            if (userPopupData.id) {
              params.exclude_id = userPopupData.id;
            }

            const response = await axios.get('/api/express/auth/check-login-name', {
              params
            });

            if (!response.data.available) {
              setLoginNameError(true);
              setLoginNameErrorMessage(t('userList.loginNameUsed') || 'Tên đăng nhập đã được sử dụng');
            } else {
              setLoginNameError(false);
              setLoginNameErrorMessage(t('userList.loginNameValid') || 'Tên đăng nhập có thể sử dụng');
            }
          } catch (error) {
            console.error('Error checking login name:', error);
            // Don't set error on network/server errors, just log
          } finally {
            setCheckingLoginName(false);
          }
        }
      } else {
        // Reset when value is empty or modal is closed
        setLoginNameErrorMessage('');
        setLoginNameError(false);
        setCheckingLoginName(false);
      }
    };

    checkLoginNameAvailability();
  }, [debouncedLoginName, userPopupData.id, isUserPopupOpen, t]);

  // Always load provinces/districts once token is available
  useEffect(() => {
    if (token) {
      fetchRegions();
      fetchDistricts();
    }
  }, [token]);

  const getRegionNameFromId = (id) => {
    const region = regionList.find((r) => r.id === id);
    return region ? region.name : '';
  };

  // Input change for popup form
  const handlePopupInputChange = (e) => {
    console.log(e.target.value, 'and', e.target.name, 'and', e.target.key);

    const { name, value } = e.target;
    console.log(name, value);

    setUserPopupData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const convertRoleForSubmission = (values) => {
    if (values.role === 'province_manager') {
      return {
        ...values,
        role: 'manager',
        district: null,
      };
    }
    if (values.role === 'district_manager') {
      return {
        ...values,
        role: 'manager',
      };
    }
    return values;
  };

  // Submit handler for creating/updating a user
  const handleUserPopupSubmit = async (values) => {
    try {
      // Auto-assign role for manager creating users
      try {
        const decoded = jwtDecode(token);
        if (decoded.role === 'manager' && !values.role) {
          // If manager cấp tỉnh (có province nhưng không có district) tạo tài khoản với district
          // thì tự động gán role là district_manager (sẽ được convert thành 'manager' khi submit)
          if (values.district) {
            values.role = 'district_manager';
          } else if (values.province && !values.district) {
            // Nếu chỉ có province, có thể là province_manager (nhưng manager không thể tạo province_manager)
            // Nên để trống hoặc yêu cầu chọn district
            message.error('Vui lòng chọn quận/huyện để tạo tài khoản quản lý cấp quận');
            return;
          }
        }
      } catch (e) {
        // ignore decode errors
      }

      // Check if login name is available (for new users only)
      if (!userPopupData.id && loginNameError) {
        message.error('Vui lòng chọn tên đăng nhập khác');
        return;
      }

      const basicFields = ['name', 'email', 'address', 'phone', 'role'];
      const missingBasicField = basicFields.some((field) => !values[field]);
      if (missingBasicField) {
        message.error('Vui lòng điền đầy đủ thông tin bắt buộc');
        return;
      }

      if (values.role !== 'admin' && !values.province) {
        message.error('Vui lòng chọn tỉnh cho vai trò đã chọn');
        return;
      }

      // Validate role-specific requirements
      if (values.role === 'expert' && !values.district) {
        message.error('Expert role requires district selection');
        return;
      }

      // Validate district belongs to province
      if (values.district) {
        const selectedDistrict = districtList.find(d => d.id === values.district);
        if (selectedDistrict && selectedDistrict.province_id !== values.province) {
          message.error('District does not belong to selected province');
          return;
        }
      }

      // Convert role for backend - keep original role names for clarity
      let submitValues = convertRoleForSubmission(values);

      // For new users, ensure password is provided
      if (!userPopupData.id && !values.password) {
        message.error('Password is required for new users');
        return;
      }

      if (userPopupData.id) {
        // Update existing user
        const result = await axios.post(
          `/api/express/auth/update/${userPopupData.id}`,
          {
            id: userPopupData.id,
            ...submitValues,
          }
        );
        if (result.status === 200) {
          message.success(
            t('userList.updateSuccess') || 'User updated successfully'
          );
        } else {
          message.error(t('userList.updateFailed') || 'User update failed');
        }
      } else {
        // Create new user
        const result = await axios.post(
          '/api/express/auth/create-user',
          submitValues
        );
        console.log(result);
        if (result.status === 200) {
          message.success(
            t('userList.createSuccess') || 'User created successfully'
          );
        } else {
          message.error(t('userList.createFailed') || 'User creation failed');
        }
      }

      setIsUserPopupOpen(false);
      fetchUsers();
      // Reset all state
      setUserPopupData({
        id: null,
        name: '',
        login_name: '',
        email: '',
        address: '',
        phone: '',
        password: '',
        province: '',
        district: '',
        role: '',
      });
      form.resetFields();
      setSelectedRegionName('');
      setFilteredDistrictList(districtList);
    } catch (error) {
      console.error('Error saving user:', error);
      message.error('Có lỗi xảy ra khi lưu thông tin người dùng');
    }
  };

  // Modify user popup
  const handleModifyUser = (user) => {
    // Set login name value when editing to trigger check
    setLoginNameValue(user.login_name || '');
    setLoginNameErrorMessage('');
    setLoginNameError(false);
    setCheckingLoginName(false);
    const regionName = getRegionNameFromId(user.province);
    console.log(user);

    // Filter districts based on user's province
    setFilteredDistrictList(
      districtList.filter((district) => district.province_id === user.province)
    );
    setSelectedRegionName(regionName);

    // Convert role for display
    let displayRole = user.role;
    if (user.role === 'manager') {
      displayRole = user.district ? 'district_manager' : 'province_manager';
    }

    setUserPopupData({
      id: user.id,
      name: user.username,
      login_name: user.login_name || '',
      email: user.email,
      address: user.address,
      phone: user.phone,
      password: '', // leave password empty when updating
      province: user.province,
      district: user.district,
      role: displayRole,
    });

    // Reset form and set values
    form.resetFields();
    form.setFieldsValue({
      name: user.username,
      login_name: user.login_name || '',
      email: user.email,
      address: user.address,
      phone: user.phone,
      province: user.province,
      district: user.district,
      role: displayRole,
    });
    setIsUserPopupOpen(true);
  };

  const handleDeleteUser = async (id) => {
    try {
      // Giả sử endpoint để xoá user là DELETE /api/express/auth/delete/:id
      await axios.delete(`/api/express/auth/delete/${id}`);
      message.success(
        t('userList.deleteSuccess') || 'User deleted successfully'
      );
      setIsDeleteConfirmOpen(false);
      fetchUsers();
    } catch (error) {
      console.error('Error deleting user:', error);
      message.error(t('userList.deleteFailed') || 'Failed to delete user');
    }
  };

  // Deactivate user confirmation popup
  const handleDeactivateUser = async (id) => {
    try {
      console.log('trying to deactive');

      await axios.patch(`/api/express/auth/deactivate/${id}`);
      setIsConfirmPopupOpen(false);
      fetchUsers();
    } catch (error) {
      console.error('Error deactivating user:', error);
    }
  };

  // Activate user without confirmation (or add one if needed)
  const handleActivateUser = async (id) => {
    try {
      await axios.patch(`/api/express/auth/activate/${id}`);
      fetchUsers();
    } catch (error) {
      console.error('Error activating user:', error);
    }
  };

  // Show password popup handler (simulate verification)
  const handleShowPassword = (user) => {
    setSelectedUser(user);
    setRevealedPassword(user.password);
  };

  const handleVerifyAdminPassword = () => {
    // For demo, assume admin password is 'adminpassword'
    setRevealedPassword('dummy_password');
  };

  // Admin reset password for user
  const handleOpenResetPasswordModal = (user) => {
    setSelectedUser(user);
    resetPasswordForm.resetFields();
    setIsResetPasswordModalOpen(true);
  };

  const handleAdminResetPassword = async (values) => {
    if (!selectedUser) return;

    if (values.newPassword !== values.confirmPassword) {
      message.error('Mật khẩu xác nhận không khớp');
      return;
    }

    setLoadingResetPassword(true);
    try {
      await axios.post(`/api/express/auth/admin-reset-password/${selectedUser.id}`, {
        newPassword: values.newPassword,
      });
      message.success(`Đã đặt lại mật khẩu cho ${selectedUser.username} thành công`);
      setIsResetPasswordModalOpen(false);
      resetPasswordForm.resetFields();
    } catch (error) {
      console.error('Reset password error:', error);
      message.error(error.response?.data?.error || 'Đặt lại mật khẩu thất bại');
    } finally {
      setLoadingResetPassword(false);
    }
  };

  // Update the modal open handler to reset region name
  const handleAddUser = () => {
    setSelectedRegionName('');
    const emptyData = {
      id: null,
      name: '',
      login_name: '',
      email: '',
      address: '',
      phone: '',
      password: '',
      province: '',
      district: '',
      role: '',
    };
    setUserPopupData(emptyData);

    // Reset login name validation state
    setLoginNameValue('');
    setLoginNameErrorMessage('');
    setLoginNameError(false);
    setCheckingLoginName(false);

    // Reset form completely and set values
    form.resetFields();
    form.setFieldsValue(emptyData);

    // Pre-fill province/district for managers (especially district managers)
    try {
      if (token) {
        const decoded = jwtDecode(token);
        if (decoded.role === 'manager') {
          if (decoded.province) {
            form.setFieldsValue({ province: decoded.province });
            // Filter district options to selected province
            setFilteredDistrictList(
              districtList.filter((d) => d.province_id === decoded.province)
            );
          }
          if (decoded.district) {
            form.setFieldsValue({ district: decoded.district });
          }
        }
      }
    } catch (e) {
      // ignore decode issues
    }

    setIsUserPopupOpen(true);
  };

  // Add this function to handle form values change
  const handleFormValuesChange = (changedValues) => {
    if (changedValues.region) {
      const region = regionList.find((r) => r.id === changedValues.region);
      if (region) {
        setSelectedRegionName(`${region.province}, ${region.name}`);
      }
    }
  };

  return (
    <div style={{ width: '100%', padding: 0, margin: 0 }}>
      <Card
        style={{
          width: '100%',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          borderRadius: 12,
        }}
        styles={{ body: { padding: 24 } }}
      >
        <Title level={3} style={{ marginBottom: 24 }}>
          {t('userList.title') || 'Danh sách người dùng'}
        </Title>
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col xs={24} sm={16} md={8}>
            <Input
              size='large'
              placeholder={t('userList.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              allowClear
            />
          </Col>
          <Col xs={24} sm={8} md={4}>
            <Button
              type="primary"
              icon={<UserAddOutlined />}
              size='large'
              block
              onClick={handleAddUser}
            >
              {t('userList.addUser')}
            </Button>
          </Col>
        </Row>
        <Spin spinning={loading}>
          <div style={{ overflowX: 'auto', width: '100%', position: 'relative' }}>
            <Table
              className="user-actions-table"
              columns={[
                {
                  title: t('userList.fullName'),
                  dataIndex: 'username',
                  key: 'username',
                  width: 'max-content',
                  minWidth: 150,
                },
                {
                  title: t('userList.email'),
                  dataIndex: 'email',
                  key: 'email',
                  width: 'max-content',
                  minWidth: 200,
                },
                {
                  title: t('userList.address'),
                  dataIndex: 'address',
                  key: 'address',
                  width: 'max-content',
                  minWidth: 200,
                },
                {
                  title: t('userList.phone'),
                  dataIndex: 'phone',
                  key: 'phone',
                  width: 'max-content',
                  minWidth: 120,
                },
                {
                  title: t('userList.role'),
                  dataIndex: 'role',
                  key: 'role',
                  width: 'max-content',
                  minWidth: 100,
                  render: (role, record) => {
                    if (
                      role === 'manager' ||
                      role === 'province_manager' ||
                      role === 'district_manager'
                    ) {
                      // Use district/province to determine label
                      if (record.district) {
                        return t('userList.districtManager');
                      }
                      if (record.province) {
                        return t('userList.provinceManager');
                      }
                    }
                    return t(`userList.${role}`);
                  },
                },
                {
                  title: t('userList.status'),
                  dataIndex: 'status',
                  key: 'status',
                  width: 'max-content',
                  minWidth: 100,
                  render: (status) =>
                    status === 'active'
                      ? t('userList.activeAccount')
                      : t('userList.inactiveAccount'),
                },
                {
                  title: t('userList.actions'),
                  key: 'actions',
                  width: 'min-content',
                  align: 'center',
                  fixed: 'right',
                  onCell: () => ({
                    style: { whiteSpace: 'nowrap' },
                  }),
                  render: (_, user) => (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'nowrap', alignItems: 'center', justifyContent: 'center' }}>
                      <Tooltip title={t('userList.editUser')}>
                        <Button
                          type="primary"
                          icon={<EditOutlined />}
                          size="middle"
                          onClick={() => handleModifyUser(user)}
                        />
                      </Tooltip>
                      {user.role !== 'admin' ? (
                        user.status === 'active' ? (
                          <Tooltip title={t('userList.deactivateUser')}>
                            <Button
                              danger
                              type="primary"
                              icon={<StopOutlined />}
                              size="middle"
                              onClick={() => {
                                setSelectedUser(user);
                                setIsConfirmPopupOpen(true);
                              }}
                            />
                          </Tooltip>
                        ) : (
                          <Tooltip title={t('userList.activateUser')}>
                            <Button
                              type="primary"
                              icon={<CheckOutlined />}
                              size="middle"
                              onClick={() => handleActivateUser(user.id)}
                            />
                          </Tooltip>
                        )
                      ) : null}
                      {jwtDecode(token).role === 'admin' &&
                        user.role !== 'admin' && (
                          <>
                            <Tooltip title="Đặt lại mật khẩu">
                              <Button
                                type="default"
                                icon={<KeyOutlined />}
                                size="middle"
                                onClick={() => handleOpenResetPasswordModal(user)}
                                style={{ color: '#faad14', borderColor: '#faad14' }}
                              />
                            </Tooltip>
                            <Tooltip title={t('userList.deleteUser') || 'Xoá'}>
                              <Button
                                danger
                                type="default"
                                icon={<DeleteOutlined />}
                                size="middle"
                                onClick={() => {
                                  setSelectedUser(user);
                                  setIsDeleteConfirmOpen(true);
                                }}
                              />
                            </Tooltip>
                          </>
                        )}
                    </div>
                  ),
                },
              ]}
              dataSource={users}
              rowKey="id"
              pagination={false}
              scroll={{ x: 'max-content' }}
              style={{ width: '100%' }}
              locale={{ emptyText: t('userList.noData') }}
            />
          </div>
        </Spin>
        <div style={{ margin: '16px 0', textAlign: 'center' }}>
          <Pagination
            current={pagination.current}
            total={pagination.total}
            pageSize={pagination.usersPerPage}
            onChange={(page, usersPerPage) => { setPagination((prev) => ({ ...prev, current: page, usersPerPage })); fetchUsers(page, usersPerPage); }}
            showSizeChanger={true}
            pageSizeOptions={[10, 20, 50, 100]}
          />
        </div>
        {/* Modals for add/edit, confirm, etc. can be refactored similarly if needed */}
      </Card>

      {/* Add/Modify User Modal */}
      <Modal
        title={
          userPopupData.id ? t('userList.editUser') : t('userList.addUser')
        }
        open={isUserPopupOpen}
        onCancel={() => {
          setIsUserPopupOpen(false);
        }}
        afterClose={() => {
          // Reset all state after modal is completely closed
          setSelectedRegionName('');
          setUserPopupData({
            id: null,
            name: '',
            login_name: '',
            email: '',
            address: '',
            phone: '',
            password: '',
            province: '',
            district: '',
            role: '',
          });
          setFilteredDistrictList(districtList);
          // Form will be reset when modal opens next time via initialValues
        }}
        footer={null}
        styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
        width={700}
      >
        <Form
          key={userPopupData.id || 'new-user'}
          form={form}
          layout="vertical"
          initialValues={userPopupData}
          onFinish={handleUserPopupSubmit}
          onValuesChange={handleFormValuesChange}
        >
          <Form.Item
            name="name"
            label={t('userList.fullName')}
            rules={[{ required: true, message: t('userList.required') }]}
          >
            <Input size='large' />
          </Form.Item>

          <Form.Item
            name="login_name"
            label="Tên đăng nhập"
            validateStatus={loginNameError ? 'error' : checkingLoginName ? 'validating' : 'success'}
            help={loginNameErrorMessage || (checkingLoginName ? 'Đang kiểm tra...' : '')}
            rules={[
              { required: true, message: 'Vui lòng nhập tên đăng nhập' },
              {
                pattern: /^[a-zA-Z0-9_]+$/,
                message: 'Tên đăng nhập chỉ được chứa chữ cái, số và dấu gạch dưới'
              },
              () => ({
                validator(_, value) {
                  if (loginNameError) {
                    return Promise.reject(new Error(loginNameErrorMessage));
                  }
                  return Promise.resolve();
                },
              }),
            ]}
            tooltip="Tên đăng nhập sẽ được sử dụng để đăng nhập vào hệ thống"
          >
            <Input
              size='large'
              placeholder="Ví dụ: john_doe"
              onChange={(e) => {
                setLoginNameValue(e.target.value);
                if (loginNameError) {
                  setLoginNameErrorMessage('');
                  setLoginNameError(false);
                }
              }}
            />
          </Form.Item>

          <Form.Item
            name="email"
            label={t('userList.email')}
            rules={[
              { required: true, message: t('userList.required') },
              { type: 'email', message: t('userList.invalidEmail') },
            ]}
          >
            <Input size='large' />
          </Form.Item>

          <Form.Item
            name="address"
            label={t('userList.address')}
            rules={[{ required: true, message: t('userList.required') }]}
          >
            <Input size='large' />
          </Form.Item>

          <Form.Item
            name="phone"
            label={t('userList.phone')}
            rules={[{ required: true, message: t('userList.required') }]}
          >
            <Input width={50} size='large' />
          </Form.Item>

          {/* Show role select for admin or manager when editing or always when creating */}
          {(!userPopupData.id || ['admin', 'manager'].includes(jwtDecode(token).role)) && (
            <Form.Item
              name="role"
              label={t('userList.role')}
              rules={[{ required: true, message: t('userList.required') }]}
            >
              <Select
                disabled={jwtDecode(token).role === 'manager'}
                size='large'
                placeholder={t('userList.selectRole')}
                options={
                  jwtDecode(token).role === 'manager'
                    ? [
                      {
                        value: 'district_manager',
                        label: t('userList.districtManager'),
                      },
                    ]
                    : [
                      {
                        value: 'admin',
                        label: t('userList.admin'),
                      },
                      {
                        value: 'expert',
                        label: t('userList.expert'),
                      },
                      {
                        value: 'province_manager',
                        label: t('userList.provinceManager'),
                      },
                      {
                        value: 'district_manager',
                        label: t('userList.districtManager'),
                      },
                    ]
                }
                onChange={(value) => {
                  // Simplified role handling
                  form.setFieldsValue({ role: value });

                  // Reset district when role changes
                  form.setFieldsValue({ district: undefined });

                  // If current user is manager, lock province to their own
                  try {
                    const decoded = jwtDecode(token);
                    if (decoded.role === 'manager' && decoded.province) {
                      form.setFieldsValue({ province: decoded.province });
                    }
                  } catch (e) {
                    // ignore decode issues
                  }

                  // Filter districts based on current province
                  const currentProvince = form.getFieldValue('province');
                  if (currentProvince) {
                    setFilteredDistrictList(
                      districtList.filter(
                        (district) => district.province_id === currentProvince
                      )
                    );
                  }

                  // Validate required fields based on role
                  form.validateFields(['province', 'district']);
                }}
              />
            </Form.Item>
          )}

          <Form.Item
            name="province"
            label={t('userList.region')}
            dependencies={['role']}
            rules={[
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (getFieldValue('role') === 'admin' || value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error(t('userList.required')));
                },
              }),
            ]}
          >
            <Select
              size='large'
              disabled={jwtDecode(token).role === 'manager'}
              showSearch
              placeholder={t('userList.selectProvince')}
              optionFilterProp="children"
              filterOption={(input, option) =>
                (option?.label ?? '')
                  .toLowerCase()
                  .includes(input.toLowerCase())
              }
              options={regionList.map((region) => ({
                value: region.id,
                label: `${region.name}`,
              }))}
              onChange={(value) => {
                setFilteredDistrictList(
                  districtList.filter(
                    (district) => district.province_id === value
                  )
                );
                form.setFieldsValue({ district: '' });
              }}
            />
          </Form.Item>

          <Form.Item
            name="district"
            label={t('userList.region')}
            rules={[
              {
                required:
                  form.getFieldValue('role') === 'expert' ||
                  form.getFieldValue('role') === 'district_manager' ||
                  (jwtDecode(token)?.role === 'manager' && !form.getFieldValue('role')),
                message: t('userList.required'),
              },
            ]}
            dependencies={['role', 'province']}
          >
            <Select
              size='large'
              showSearch
              placeholder={t('userList.selectDistrict')}
              optionFilterProp="children"
              disabled={
                !form.getFieldValue('province') ||
                form.getFieldValue('role') === 'province_manager'
              }
              filterOption={(input, option) =>
                (option?.label ?? '')
                  .toLowerCase()
                  .includes(input.toLowerCase())
              }
              onChange={(value) => {
                // Auto-assign district_manager role when manager selects district
                try {
                  const decoded = jwtDecode(token);
                  if (decoded.role === 'manager' && value && !form.getFieldValue('role')) {
                    form.setFieldsValue({ role: 'district_manager' });
                  }
                } catch (e) {
                  // ignore decode errors
                }
              }}
              options={filteredDistrictList.map((region) => ({
                value: region.id,
                label: `${region.name}`,
              }))}
            />
          </Form.Item>

          {!userPopupData.id && (
            <Form.Item
              name="password"
              label={t('userList.password')}
              rules={[{ required: true, message: t('userList.required') }]}
            >
              <Input.Password size='large' />
            </Form.Item>
          )}

          <Form.Item>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button
                onClick={() => {
                  setIsUserPopupOpen(false);
                  form.resetFields();
                }}
              >
                {t('userList.cancel')}
              </Button>
              <Button type="primary" htmlType="submit">
                {t('userList.save')}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Deactivate Confirmation Modal */}
      <Modal
        title={t('userList.deactivateConfirm')}
        open={isConfirmPopupOpen}
        onOk={() => handleDeactivateUser(selectedUser?.id)}
        onCancel={() => setIsConfirmPopupOpen(false)}
        okText={t('userList.yes')}
        cancelText={t('userList.no')}
      >
        <p>{t('userList.deactivateConfirmMessage')}</p>
      </Modal>
      <Modal
        title={t('userList.deleteConfirm') || 'Xác nhận xoá'}
        open={isDeleteConfirmOpen}
        onOk={() => handleDeleteUser(selectedUser?.id)}
        onCancel={() => setIsDeleteConfirmOpen(false)}
        okText={t('userList.yes') || 'Có'}
        cancelText={t('userList.no') || 'Không'}
      >
        <p>
          {t('userList.deleteConfirmMessage') ||
            'Bạn có chắc chắn muốn xóa người dùng này? Hành động này không thể hoàn tác.'}
        </p>
      </Modal>

      {/* Admin Reset Password Modal */}
      <Modal
        title={
          <Space>
            <KeyOutlined style={{ color: '#faad14' }} />
            <span>Đặt lại mật khẩu cho {selectedUser?.username}</span>
          </Space>
        }
        open={isResetPasswordModalOpen}
        onCancel={() => {
          setIsResetPasswordModalOpen(false);
          resetPasswordForm.resetFields();
        }}
        footer={null}
        width={450}
      >
        <div style={{ marginBottom: 16, padding: '12px', background: '#fff7e6', borderRadius: '8px', border: '1px solid #ffd591' }}>
          <p style={{ margin: 0, color: '#ad6800' }}>
            ⚠️ <strong>Lưu ý:</strong> Bạn đang đặt lại mật khẩu cho người dùng <strong>{selectedUser?.username}</strong> ({selectedUser?.email}).
          </p>
        </div>
        <Form
          form={resetPasswordForm}
          layout="vertical"
          onFinish={handleAdminResetPassword}
        >
          <Form.Item
            name="newPassword"
            label="Mật khẩu mới"
            rules={[
              { required: true, message: 'Vui lòng nhập mật khẩu mới' },
              { min: 6, message: 'Mật khẩu phải có ít nhất 6 ký tự' },
            ]}
          >
            <Input.Password
              size="large"
              placeholder="Nhập mật khẩu mới"
              prefix={<KeyOutlined style={{ color: '#faad14' }} />}
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
              size="large"
              placeholder="Nhập lại mật khẩu mới"
              prefix={<KeyOutlined style={{ color: '#faad14' }} />}
            />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={() => setIsResetPasswordModalOpen(false)}>
                Hủy
              </Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={loadingResetPassword}
                style={{ background: '#faad14', borderColor: '#faad14' }}
              >
                Đặt lại mật khẩu
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default UserList;
