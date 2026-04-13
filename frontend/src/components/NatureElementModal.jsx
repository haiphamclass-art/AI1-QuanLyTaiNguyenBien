import React, { useEffect } from 'react';
import { Modal, Form, Input, Select, Row, Col, message } from 'antd';
import axios from '../axios';

const { TextArea } = Input;
const { Option } = Select;

/**
 * Modal component for adding/updating Nature Elements
 * @param {boolean} visible - Modal visibility
 * @param {function} onCancel - Callback when modal is cancelled
 * @param {function} onSuccess - Callback when element is successfully saved (receives new/updated element data)
 * @param {object} editingElement - Element to edit (null for create mode)
 */
const NatureElementModal = ({ visible, onCancel, onSuccess, editingElement = null }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = React.useState(false);

  const isEditMode = !!editingElement;

  // Populate form when editing
  useEffect(() => {
    if (visible && editingElement) {
      form.setFieldsValue({
        name: editingElement.name,
        description: editingElement.description,
        unit: editingElement.unit,
        category: editingElement.category,
      });
    } else if (visible && !editingElement) {
      form.resetFields();
    }
  }, [visible, editingElement, form]);

  const handleSubmit = async () => {
    try {
      setLoading(true);
      const values = await form.validateFields();

      let response;
      if (isEditMode) {
        // Update existing element
        response = await axios.put(
          `/api/express/nature-elements/${editingElement.id}`,
          values
        );
        message.success('Cập nhật yếu tố môi trường thành công');
      } else {
        // Create new element
        response = await axios.post('/api/express/nature-elements', values);
        message.success('Thêm yếu tố môi trường mới thành công');
      }

      form.resetFields();
      if (onSuccess) {
        onSuccess(response.data);
      }
    } catch (error) {
      console.error('Error saving nature element:', error);
      message.error(
        error.response?.data?.error ||
        `Không thể ${isEditMode ? 'cập nhật' : 'thêm'} yếu tố môi trường`
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    form.resetFields();
    if (onCancel) {
      onCancel();
    }
  };

  return (
    <Modal
      title={isEditMode ? 'Cập nhật yếu tố môi trường' : 'Thêm yếu tố môi trường mới'}
      open={visible}
      onOk={handleSubmit}
      onCancel={handleCancel}
      okText={isEditMode ? 'Cập nhật' : 'Thêm'}
      cancelText="Hủy"
      width={600}
      confirmLoading={loading}
      destroyOnHidden
    >
      <Form form={form} layout="vertical">
        <Form.Item
          label="Tên yếu tố"
          name="name"
          rules={[{ required: true, message: 'Vui lòng nhập tên yếu tố' }]}
        >
          <Input placeholder="VD: Nhiệt độ, pH, Độ mặn..." />
        </Form.Item>

        <Form.Item label="Mô tả" name="description">
          <TextArea rows={3} placeholder="Mô tả chi tiết về yếu tố này" />
        </Form.Item>

        <Row gutter={16}>
          <Col span={12}>
            <Form.Item label="Đơn vị" name="unit">
              <Input placeholder="VD: °C, mg/L, ppm..." />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="Loại" name="category">
              <Select placeholder="Chọn loại yếu tố" allowClear>
                <Option value="water_quality">Chất lượng nước</Option>
                <Option value="weather">Thời tiết</Option>
                <Option value="biological">Sinh học</Option>
                <Option value="chemical">Hóa học</Option>
                <Option value="physical">Vật lý</Option>
                <Option value="other">Khác</Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
};

export default NatureElementModal;

