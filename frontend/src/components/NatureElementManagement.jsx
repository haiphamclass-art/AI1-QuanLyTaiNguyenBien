import React, { useState, useEffect } from 'react';
import {
    Table,
    Button,
    Modal,
    Form,
    Input,
    Select,
    message,
    Space,
    Tag,
    Card,
    Tooltip,
    Popconfirm,
} from 'antd';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    InfoCircleOutlined,
    WarningOutlined,
} from '@ant-design/icons';
import axios from '../axios';

const { Option } = Select;
const { TextArea } = Input;

const NatureElementManagement = () => {
    const [elements, setElements] = useState([]);
    const [loading, setLoading] = useState(false);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [editingElement, setEditingElement] = useState(null);
    const [form] = Form.useForm();
    const [categories, setCategories] = useState([]);

    // Pagination state
    const [pagination, setPagination] = useState({
        current: 1,
        pageSize: 15,
        total: 0,
    });

    // Fetch nature elements with optional pagination
    const fetchElements = async (page = 1, pageSize = 15, usePagination = false) => {
        setLoading(true);
        try {
            const params = {};

            // Optional pagination - only add params if usePagination is true
            if (usePagination) {
                params.limit = pageSize;
                params.offset = (page - 1) * pageSize;
            }

            const response = await axios.get('/api/express/nature-elements', { params });
            const data = response.data?.data;

            setElements(data?.elements || []);
            setPagination({
                current: page,
                pageSize: pageSize,
                total: data?.total || (data?.elements || []).length,
            });

            // Get unique categories from response
            if (data?.categories) {
                setCategories(data.categories);
            } else {
                // Fallback: calculate from elements
                const uniqueCategories = [...new Set(
                    (data?.elements || [])
                        .map(el => el.category)
                        .filter(Boolean)
                )];
                setCategories(uniqueCategories);
            }
        } catch (error) {
            console.error('Error fetching nature elements:', error);
            message.error('Không thể tải danh sách yếu tố môi trường');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchElements();
    }, []);

    // Show modal for create/edit
    const showModal = (element = null) => {
        setEditingElement(element);
        setIsModalVisible(true);

        if (element) {
            // Editing existing element
            form.setFieldsValue({
                name: element.name,
                description: element.description,
                unit: element.unit,
                category: element.category,
            });
        } else {
            // Creating new element
            form.resetFields();
        }
    };

    const handleCancel = () => {
        setIsModalVisible(false);
        setEditingElement(null);
        form.resetFields();
    };

    // Handle form submit
    const handleSubmit = async () => {
        try {
            const values = await form.validateFields();

            if (editingElement) {
                // Update
                await axios.put(`/api/express/nature-elements/${editingElement.id}`, values);
                message.success('Cập nhật yếu tố thành công');
            } else {
                // Create
                await axios.post('/api/express/nature-elements', values);
                message.success('Thêm yếu tố thành công');
            }

            fetchElements();
            handleCancel();
        } catch (error) {
            console.error('Error saving nature element:', error);
            message.error(error.response?.data?.error || 'Có lỗi xảy ra khi lưu yếu tố');
        }
    };

    // Delete element
    const handleDelete = async (record) => {
        try {
            await axios.delete(`/api/express/nature-elements/${record.id}`);
            message.success('Xóa yếu tố thành công');
            fetchElements();
        } catch (error) {
            console.error('Error deleting nature element:', error);
            const errorMsg = error.response?.data?.error || 'Không thể xóa yếu tố';
            message.error(errorMsg);
        }
    };

    // Table columns
    const columns = [
        {
            title: 'ID',
            dataIndex: 'id',
            key: 'id',
            width: 60,
            sorter: (a, b) => a.id - b.id,
        },
        {
            title: 'Tên',
            dataIndex: 'name',
            key: 'name',
            width: 150,
            sorter: (a, b) => a.name.localeCompare(b.name),
            render: (text) => <strong>{text}</strong>,
        },
        {
            title: 'Mô tả',
            dataIndex: 'description',
            key: 'description',
            ellipsis: true,
            render: (text) => text || '-',
        },
        {
            title: 'Đơn vị',
            dataIndex: 'unit',
            key: 'unit',
            width: 100,
            render: (text) => text || '-',
        },
        {
            title: 'Danh mục',
            dataIndex: 'category',
            key: 'category',
            width: 150,
            filters: categories.map(cat => ({ text: cat, value: cat })),
            onFilter: (value, record) => record.category === value,
            render: (category) => category ? (
                <Tag color="blue">{category}</Tag>
            ) : '-',
        },
        {
            title: 'Hành động',
            key: 'actions',
            fixed: 'right',
            width: 'max-content',
            align: 'center',
            render: (_, record) => (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'nowrap', alignItems: 'center', justifyContent: 'center' }}>
                    <Tooltip title="Chỉnh sửa">
                        <Button
                            type="primary"
                            icon={<EditOutlined />}
                            onClick={() => showModal(record)}

                        />
                    </Tooltip>
                    <Popconfirm
                        title="Xác nhận xóa"
                        description={
                            <div>
                                <p>Bạn có chắc muốn xóa yếu tố này?</p>
                                <p style={{ fontSize: 12, color: '#999', marginTop: 8 }}>
                                    <InfoCircleOutlined /> Không thể xóa nếu đang được sử dụng trong model
                                </p>
                            </div>
                        }
                        onConfirm={() => handleDelete(record)}
                        okText="Xóa"
                        cancelText="Hủy"
                        okButtonProps={{ danger: true }}
                    >
                        <Tooltip title="Xóa">
                            <Button danger icon={<DeleteOutlined />} />
                        </Tooltip>
                    </Popconfirm>
                </div>
            ),
        },
    ];

    return (
        <div style={{ padding: '24px' }}>
            <Card
                title={
                    <Space>
                        <span>Quản lý yếu tố môi trường (Chú ý khi thao tác) <WarningOutlined />   </span>
                        <Tag color="blue">{elements.length} yếu tố môi trường</Tag>
                    </Space>
                }
                extra={
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => showModal()}
                    >
                        Thêm Yếu tố
                    </Button>
                }
            >
                <Table
                    columns={columns}
                    dataSource={elements}
                    rowKey="id"
                    loading={loading}
                    pagination={{
                        current: pagination.current,
                        pageSize: pagination.pageSize,
                        total: pagination.total,
                        showSizeChanger: true,
                        showTotal: (total) => `Tổng số ${total} yếu tố`,
                        onChange: (page, pageSize) => {
                            // Can switch between server-side and client-side pagination
                            // Set usePagination = true to enable server-side pagination
                            fetchElements(page, pageSize, false); // false = client-side (default)
                        },
                    }}
                    scroll={{ x: 'max-content' }}
                />
            </Card>

            {/* Create/Edit Modal */}
            <Modal
                title={editingElement ? 'Chỉnh sửa Yếu tố' : 'Thêm Yếu tố Mới'}
                open={isModalVisible}
                onOk={handleSubmit}
                onCancel={handleCancel}
                width={600}
                okText={editingElement ? 'Cập nhật' : 'Tạo mới'}
                cancelText="Hủy"
            >
                <Form form={form} layout="vertical">
                    <Form.Item
                        label="Tên yếu tố"
                        name="name"
                        rules={[
                            { required: true, message: 'Vui lòng nhập tên yếu tố' },
                            { max: 100, message: 'Tên không được quá 100 ký tự' },
                        ]}
                    >
                        <Input placeholder="Ví dụ: R_PO4, Temperature..." />
                    </Form.Item>

                    <Form.Item
                        label="Mô tả"
                        name="description"
                    >
                        <TextArea
                            rows={3}
                            placeholder="Mô tả chi tiết về yếu tố môi trường này..."
                        />
                    </Form.Item>

                    <Form.Item
                        label="Đơn vị"
                        name="unit"
                    >
                        <Input placeholder="Ví dụ: °C, mg/L, ppm..." />
                    </Form.Item>

                    <Form.Item
                        label="Danh mục"
                        name="category"
                        rules={[{ required: true, message: 'Vui lòng chọn danh mục' }]}
                    >
                        <Select
                            placeholder="Chọn danh mục"
                            showSearch
                            allowClear
                            optionFilterProp="children"
                        >
                            {categories.map((cat) => (
                                <Option key={cat} value={cat}>
                                    {cat}
                                </Option>
                            ))}
                            <Option value="Khác">Khác</Option>
                        </Select>
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default NatureElementManagement;

