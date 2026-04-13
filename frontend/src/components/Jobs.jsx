import React, { useEffect, useState } from 'react';
import { Card, Table, Tag, Space, Select, Input, Button, Typography, message, Pagination, Tooltip } from 'antd';
import { DownloadOutlined, LoadingOutlined } from '@ant-design/icons';
import axios from '../axios';

const { Title, Text } = Typography;
const { Option } = Select;

const Jobs = () => {
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [name, setName] = useState('');
    const [state, setState] = useState('');
    const [pagination, setPagination] = useState({
        current: 1,
        pageSize: 10,
        total: 0,
    });
    const [downloadingJobId, setDownloadingJobId] = useState(null);

    const [availableJobNames, setAvailableJobNames] = useState([]);

    // Download file from job (works for both export and import)
    const handleDownload = async (jobId, defaultFilename = 'download.xlsx') => {
        try {
            setDownloadingJobId(jobId);
            const response = await axios.get(`/api/express/jobs/${jobId}/download`, {
                responseType: 'blob',
            });

            // Get filename from content-disposition header
            const contentDisposition = response.headers['content-disposition'];
            let filename = defaultFilename;
            if (contentDisposition) {
                // Try to extract filename from header (handles both encoded and non-encoded)
                const filenameMatch = contentDisposition.match(/filename\*?=['"]?(?:UTF-8'')?([^";\n]+)['"]?/i);
                if (filenameMatch && filenameMatch[1]) {
                    filename = decodeURIComponent(filenameMatch[1]);
                }
            }

            // Get content type to determine extension if needed
            const contentType = response.headers['content-type'];
            if (filename && !filename.includes('.')) {
                if (contentType?.includes('spreadsheetml')) {
                    filename += '.xlsx';
                } else if (contentType?.includes('csv')) {
                    filename += '.csv';
                } else if (contentType?.includes('ms-excel')) {
                    filename += '.xls';
                }
            }

            console.log('Downloading file:', { filename, contentType, contentDisposition });

            // Create download link
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            link.parentNode.removeChild(link);
            window.URL.revokeObjectURL(url);

            message.success(`Tải file "${filename}" thành công!`);
        } catch (e) {
            console.error('Download error:', e);
            message.error('Không thể tải file: ' + (e.response?.data?.error || e.message));
        } finally {
            setDownloadingJobId(null);
        }
    };

    const fetchJobs = async (page = 1, pageSize = 10) => {
        try {
            setLoading(true);
            const res = await axios.get('/api/express/jobs', {
                params: {
                    name: name || undefined,
                    state: state || undefined,
                    limit: pageSize,
                    offset: (page - 1) * pageSize
                }
            });
            const rows = res.data?.jobs || [];
            const namesInResponse = Array.from(new Set(rows.map((r) => r.name))).sort();
            setAvailableJobNames(namesInResponse);
            setJobs(rows);
            setPagination({
                current: page,
                pageSize: pageSize,
                total: res.data?.total || rows.length,
            });
        } catch (e) {
            message.error('Không tải được danh sách job');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchJobs(1, 10); }, []);

    const columns = [
        { title: 'ID', dataIndex: 'id', key: 'id', ellipsis: true, width: 100 },
        {
            title: 'Tên', dataIndex: 'name', key: 'name', render: (name) => {
                const nameLabels = {
                    'csv-import': 'Import CSV',
                    'xlsx-import': 'Import Excel',
                    'area-xlsx-import': 'Import Khu vực',
                    'prediction-export': 'Xuất báo cáo',
                };
                return <Tag color={name === 'prediction-export' ? 'blue' : 'default'}>{nameLabels[name] || name}</Tag>;
            }
        },
        { title: 'Trạng thái', dataIndex: 'state', key: 'state', render: (s) => <Tag color={s === 'completed' ? 'green' : s === 'failed' ? 'red' : s === 'active' ? 'blue' : s === 'retry' ? 'orange' : 'default'}>{s}</Tag> },
        { title: 'Người tạo', key: 'user', render: (_, r) => r.creator?.username || r.data?.userId || '-' },
        {
            title: 'Chi tiết', key: 'details', render: (_, r) => {
                const data = r.data || {};
                const output = r.output || {};

                if (r.name === 'area-xlsx-import') {
                    return (
                        <Space direction="vertical" size={0}>
                            {data.description && <Text strong style={{ color: '#52c41a' }}>📋 {data.description}</Text>}
                            <Text type="secondary">Tỉnh ID: {data.provinceId || '-'} | Huyện ID: {data.districtId || '-'}</Text>
                            {output.created !== undefined && <Text type="secondary">✅ Đã tạo: {output.created} khu vực</Text>}
                            {data.originalname && <Text type="secondary" style={{ fontSize: '12px' }}>📁 {data.savedFilename || data.originalname}</Text>}
                        </Space>
                    );
                }
                if (r.name === 'prediction-export') {
                    const description = data.description;
                    return (
                        <Space direction="vertical" size={0}>
                            {description && (
                                <Text strong style={{ color: '#1890ff' }}>📋 {description}</Text>
                            )}
                            {!description && <Text type="secondary">Tất cả dữ liệu</Text>}
                            {output.recordCount && (
                                <Text type="secondary">📊 Số bản ghi: {output.recordCount}</Text>
                            )}
                            {output.filename && (
                                <Text type="secondary" style={{ fontSize: '12px' }}>📁 {output.filename}</Text>
                            )}
                        </Space>
                    );
                }
                if (r.name === 'csv-import' || r.name === 'xlsx-import') {
                    return (
                        <Space direction="vertical" size={0}>
                            {data.description && <Text strong style={{ color: '#52c41a' }}>📋 {data.description}</Text>}
                            {data.areaName && <Text type="secondary">Khu vực: {data.areaName}</Text>}
                            {data.modelName && <Text type="secondary">Model: {data.modelName}</Text>}
                            {output.recordCount && <Text type="secondary">✅ Đã import: {output.recordCount} bản ghi</Text>}
                            {data.originalname && <Text type="secondary" style={{ fontSize: '12px' }}>📁 {data.savedFilename || data.originalname}</Text>}
                        </Space>
                    );
                }
                return (
                    <Space direction="vertical" size={0}>
                        {data.areaId && <Text type="secondary">Area ID: {data.areaId}</Text>}
                        {data.modelName && <Text type="secondary">Model: {data.modelName}</Text>}
                        {data.originalname && <Text type="secondary">📁 {data.originalname}</Text>}
                    </Space>
                );
            }
        },
        { title: 'Tạo lúc', dataIndex: 'createdon', key: 'createdon', render: (v) => v ? new Date(v).toLocaleString('vi-VN') : '-' },
        { title: 'Bắt đầu', dataIndex: 'startedon', key: 'startedon', render: (v) => v ? new Date(v).toLocaleString('vi-VN') : '-' },
        { title: 'Hoàn tất', dataIndex: 'completedon', key: 'completedon', render: (v) => v ? new Date(v).toLocaleString('vi-VN') : '-' },
        {
            title: 'Hành động',
            key: 'actions',
            fixed: 'right',
            width: 120,
            render: (_, r) => {
                const output = r.output || {};
                const data = r.data || {};

                // Check if file exists (from output or data)
                const hasFile = r.state === 'completed' && (output.filePath || data.path);
                const filename = output.filename || output.originalname || data.savedFilename || data.originalname || 'file';

                // Show download for all job types that have files
                if (r.state === 'completed' && hasFile) {
                    return (
                        <Tooltip title={`Tải: ${filename}`}>
                            <Button
                                type="primary"
                                icon={downloadingJobId === r.id ? <LoadingOutlined /> : <DownloadOutlined />}
                                onClick={() => handleDownload(r.id, filename)}
                                loading={downloadingJobId === r.id}
                                size="medium"
                            >
                                Tải
                            </Button>
                        </Tooltip>
                    );
                } else if (r.state === 'active' || r.state === 'created') {
                    return <Tag color="processing">Đang xử lý...</Tag>;
                } else if (r.state === 'failed') {
                    return <Tag color="error">Lỗi</Tag>;
                } else if (r.state === 'completed' && !hasFile) {
                    return <Tag color="success">Hoàn thành</Tag>;
                }
                return null;
            }
        },
    ];

    return (
        <Card>
            <Space direction="vertical" style={{ width: '100%' }} size="large">
                <Title level={3} style={{ margin: 0 }}>Danh sách Job</Title>
                <Space wrap>
                    <Select placeholder="Tên job" allowClear value={name} onChange={setName} style={{ width: 220 }}>
                        {(availableJobNames.length ? availableJobNames : ['csv-import', 'xlsx-import', 'area-xlsx-import', 'prediction-export']).map(jobName => {
                            const nameLabels = {
                                'csv-import': 'Import CSV',
                                'xlsx-import': 'Import Excel',
                                'area-xlsx-import': 'Import Khu vực',
                                'prediction-export': 'Xuất báo cáo',
                            };
                            return <Option key={jobName} value={jobName}>{nameLabels[jobName] || jobName}</Option>;
                        })}
                    </Select>
                    <Select placeholder="Trạng thái" allowClear value={state} onChange={setState} style={{ width: 180 }}>
                        <Option value="created">created</Option>
                        <Option value="active">active</Option>
                        <Option value="completed">completed</Option>
                        <Option value="failed">failed</Option>
                        <Option value="retry">retry</Option>
                    </Select>
                    <Button type="primary" onClick={() => fetchJobs(pagination.current, pagination.pageSize)}>Tải</Button>
                </Space>
                <div style={{ overflowX: 'auto', width: '100%' }}>
                    <Table
                        rowKey="id"
                        loading={loading}
                        dataSource={jobs}
                        columns={columns}
                        pagination={false}
                        scroll={{ x: 'max-content' }}
                    />
                </div>
                <div style={{ margin: '16px 0', textAlign: 'center' }}>
                    <Pagination
                        current={pagination.current}
                        total={pagination.total}
                        pageSize={pagination.pageSize}
                        showSizeChanger={false}
                        onChange={(page, pageSize) => fetchJobs(page, pageSize)}
                    />
                </div>
            </Space>
        </Card>
    );
};

export default Jobs;


