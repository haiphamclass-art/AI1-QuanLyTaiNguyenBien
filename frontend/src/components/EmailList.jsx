import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  Select,
  Switch,
  message,
  Popconfirm,
  Tag,
  Typography,
  Tooltip,
  Grid,
  Row,
  Col,
  Spin,
} from 'antd';
import {
  MailOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  EyeOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SendOutlined,
  SaveOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import axios from '../axios';

const { Title, Text } = Typography;
const { Option } = Select;

const EmailList = () => {
  const { t } = useTranslation();
  const { useBreakpoint } = Grid;
  const screens = useBreakpoint();
  const [form] = Form.useForm();
  const [subscriptions, setSubscriptions] = useState([]);
  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [pagination, setPagination] = useState({
    current: 1,
    emailsPerPage: 10,
    total: 0,
  });

  // Fetch subscriptions
  const fetchSubscriptions = async (page = 1, emailsPerPage = 10) => {
    setLoading(true);
    try {
      const response = await axios.get('/api/express/emails', {
        params: { limit: emailsPerPage, offset: (page - 1) * emailsPerPage },
      });
      setSubscriptions(response.data.subscriptions);
      setPagination({
        current: page,
        emailsPerPage: emailsPerPage,
        total: response.data.total,
      });
    } catch (error) {
      message.error('Không thể tải danh sách đăng ký email');
    } finally {
      setLoading(false);
    }
  };

  // Fetch areas for select
  const fetchAreas = async () => {
    try {
      const response = await axios.get('/api/express/areas/all');
      setAreas(response.data.areas);
    } catch (error) {
      console.error('Error fetching areas:', error);
      message.error('Không thể tải danh sách khu vực');
    }
  };

  useEffect(() => {
    fetchSubscriptions();
    fetchAreas();
  }, []);

  // Handle form submit
  const handleSubmit = async (values) => {
    try {
      // Validate required fields
      if (!values.email || !values.area_id) {
        message.error('Vui lòng điền đầy đủ thông tin bắt buộc');
        return;
      }

      if (editingId) {
        await axios.put(`/api/express/emails/${editingId}`, values);
        message.success(t('email.updateSuccess') || 'Cập nhật đăng ký email thành công');
      } else {
        await axios.post('/api/express/emails/subscribe', values);
        message.success(t('email.createSuccess') || 'Tạo đăng ký email thành công');
      }
      setModalVisible(false);
      form.resetFields();
      setEditingId(null);
      fetchSubscriptions(pagination.current, pagination.emailsPerPage);
    } catch (error) {
      console.error('Error submitting email subscription:', error);
      const errorMsg = error.response?.data?.error || t('email.createFailed') || 'Có lỗi xảy ra khi lưu đăng ký email';
      message.error(errorMsg);
    }
  };

  // Handle delete
  const handleDelete = async (id) => {
    try {
      await axios.delete(`/api/express/emails/${id}`);
      message.success(t('email.deleteSuccess'));
      fetchSubscriptions(pagination.current, pagination.emailsPerPage);
    } catch (error) {
      message.error(t('email.deleteFailed'));
    }
  };

  // Handle edit
  const handleEdit = (record) => {
    setEditingId(record.id);
    form.setFieldsValue({
      email: record.email,
      area_id: record.area_id,
      is_active: record.is_active,
    });
    setModalVisible(true);
  };

  // Handle add new
  const handleAdd = () => {
    setEditingId(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleTestEmail = async (email) => {
    try {
      await axios.post('/api/express/emails/test', { email });
      message.success(t('email.testSuccess'));
    } catch (error) {
      const errorMsg = error.response?.data?.error || t('email.testFailed');
      message.error(errorMsg);
    }
  };

  // Table columns
  const columns = [
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
      render: (email) => (
        <Space>
          <MailOutlined />
          <Text copyable>{email}</Text>
        </Space>
      ),
    },
    {
      title: 'Khu vực',
      dataIndex: ['area', 'name'],
      key: 'area_name',
      render: (name, record) => (
        <Space>
          <Text strong>{name}</Text>
          <Tag color={record.area?.area_type === 'oyster' ? 'blue' : 'green'}>
            {record.area?.area_type}
          </Tag>
        </Space>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (isActive) => (
        <Tag
          color={isActive ? 'green' : 'red'}
          icon={isActive ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
        >
          {isActive ? t('email.active') : t('email.inactive')}
        </Tag>
      ),
    },
    {
      title: 'Ngày tạo',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date) => new Date(date).toLocaleDateString('vi-VN'),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      fixed: 'right',
      width: 'max-content',
      minWidth: 200,
      align: 'center',
      render: (_, record) => (
        <Space>
          <Tooltip title="Sửa">
            <Button
              type="primary"
              icon={<EditOutlined />}
              size="middle"
              onClick={() => handleEdit(record)}
            />
          </Tooltip>
          <Tooltip title={t('email.testEmail')}>
            <Button
              type="default"
              icon={<SendOutlined />}
              size="middle"
              onClick={() => handleTestEmail(record.email)}
            />
          </Tooltip>
          <Popconfirm
            title={t('email.confirmDelete')}
            description={t('email.deleteConfirmMessage')}
            onConfirm={() => handleDelete(record.id)}
            okText={t('email.yes')}
            cancelText={t('email.no')}
          >
            <Tooltip title="Xóa">
              <Button
                type="primary"
                danger
                icon={<DeleteOutlined />}
                size="middle"
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // Inject lightweight CSS to stack size changer below the pager
  React.useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      .email-pagination { display: flex; justify-content: center; align-items: center; margin-top: 12px; }
      .email-pagination .ant-pagination-item,
      .email-pagination .ant-pagination-prev,
      .email-pagination .ant-pagination-next { margin-top: 20px; }
      .email-pagination .ant-pagination-options { justify-content: center; margin-top: 20px; }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  return (
    <Space direction="vertical" style={{ width: '100%', padding: 24 }}>
      <Card>
        <Row align="middle" justify="space-between" gutter={[12, 12]} style={{ marginBottom: 16 }}>
          <Col flex="auto">
            <Title level={3} style={{ margin: 0 }}>
              <MailOutlined /> {t('email.title')}
            </Title>
          </Col>
          <Col>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleAdd}
              block={screens.xs}
            >
              {t('email.addSubscription')}
            </Button>
          </Col>
        </Row>

        <Spin spinning={loading}>
          <Table
            columns={columns}
            dataSource={subscriptions}
            rowKey="id"
            loading={false}
            style={{ width: '100%' }}
            scroll={{ x: 'max-content' }}
            pagination={{
              className: 'email-pagination',
              position: ['bottomCenter'],
              ...pagination,
              showSizeChanger: true,
              pageSizeOptions: [10, 20, 50, 100],
              onChange: (page, emailsPerPage) => { setPagination((prev) => ({ ...prev, current: page, emailsPerPage })); fetchSubscriptions(page, emailsPerPage); },
            }}
          />
        </Spin>
      </Card>

      <Modal
        title={
          editingId ? t('email.editSubscription') : t('email.addSubscription')
        }
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false);
          setEditingId(null);
          form.resetFields();
        }}
        footer={null}
        width={600}
        style={{ maxWidth: '100vw' }}
        styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            name="email"
            label="Email"
            rules={[
              { required: true, message: t('email.required') },
              { type: 'email', message: t('email.invalidEmail') },
            ]}
          >
            <Input
              placeholder="your-email@example.com"
              prefix={<MailOutlined />}
            />
          </Form.Item>

          <Form.Item
            name="area_id"
            label="Khu vực"
            rules={[{ required: true, message: t('email.selectArea') }]}
          >
            <Select placeholder="Chọn khu vực">
              {areas.map((area) => (
                <Option key={area.id} value={area.id}>
                  {area.name} ({area.area_type})
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="is_active"
            label="Trạng thái"
            valuePropName="checked"
            initialValue={true}
          >
            <Switch
              checkedChildren={t('email.active')}
              unCheckedChildren={t('email.inactive')}
            />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                {editingId ? t('email.save') : t('email.save')}
              </Button>
              <Button
                onClick={() => {
                  setModalVisible(false);
                  setEditingId(null);
                  form.resetFields();
                }}
              >
                {t('email.cancel')}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
};

export default EmailList;
