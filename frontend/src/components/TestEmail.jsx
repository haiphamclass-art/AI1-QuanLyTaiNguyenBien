import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  Form,
  Input,
  Button,
  Alert,
  Typography,
  Space,
  Divider,
} from 'antd';
import {
  MailOutlined,
  SendOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import axios from '../axios';

const { Title, Text, Paragraph } = Typography;

const TestEmail = () => {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleTestEmail = async (values) => {
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const response = await axios.post('/api/express/emails/test', {
        email: values.email,
      });
      setMessage(response.data.message);
      form.resetFields();
    } catch (err) {
      if (err.response?.data?.error) {
        setError(err.response.data.error);
      } else {
        setError(t('email.testFailed'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '24px' }}>
      <Card>
        <div style={{ marginBottom: '24px' }}>
          <Title level={3}>
            <MailOutlined /> Test Email
          </Title>
          <Paragraph type="secondary">
            Gửi email test để kiểm tra cấu hình email của hệ thống
          </Paragraph>
        </div>

        <Divider />

        <Form
          form={form}
          layout="vertical"
          onFinish={handleTestEmail}
          style={{ maxWidth: 500 }}
        >
          <Form.Item
            name="email"
            label="Email nhận test"
            rules={[
              { required: true, message: t('email.required') },
              { type: 'email', message: t('email.invalidEmail') },
            ]}
          >
            <Input
              placeholder="test@example.com"
              prefix={<MailOutlined />}
              disabled={loading}
            />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              icon={<SendOutlined />}
              size="large"
            >
              Gửi Email Test
            </Button>
          </Form.Item>
        </Form>

        {error && (
          <Alert
            message="Lỗi gửi email"
            description={error}
            type="error"
            showIcon
            icon={<ExclamationCircleOutlined />}
            style={{ marginTop: 16 }}
          />
        )}

        {message && (
          <Alert
            message="Gửi email thành công"
            description={
              <div>
                <Paragraph style={{ margin: 0 }}>{message}</Paragraph>
                <Paragraph
                  type="secondary"
                  style={{ margin: '8px 0 0 0', fontSize: '12px' }}
                >
                  Vui lòng kiểm tra hộp thư email của bạn để xác nhận email đã
                  được gửi thành công.
                </Paragraph>
              </div>
            }
            type="success"
            showIcon
            icon={<CheckCircleOutlined />}
            style={{ marginTop: 16 }}
          />
        )}

        <Divider />

        <div
          style={{
            background: '#f6f8fa',
            padding: '16px',
            borderRadius: '6px',
          }}
        >
          <Title level={5}>Hướng dẫn:</Title>
          <ul style={{ margin: 0, paddingLeft: '20px' }}>
            <li>Nhập email hợp lệ để nhận email test</li>
            <li>Email test sẽ được gửi từ hệ thống để kiểm tra cấu hình</li>
            <li>
              Nếu nhận được email, có nghĩa là cấu hình email đã hoạt động
            </li>
            <li>
              Nếu không nhận được, vui lòng kiểm tra cấu hình email trong
              backend
            </li>
          </ul>
        </div>
      </Card>
    </div>
  );
};

export default TestEmail;
