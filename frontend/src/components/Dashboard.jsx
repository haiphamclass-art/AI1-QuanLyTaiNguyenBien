import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import PredictionDetails from './PredictionDetails';
import { jwtDecode } from 'jwt-decode';
import axios from '../axios';
import './Dashboard.css';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
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
  Checkbox,
  List,
  Spin,
  message,
  Tooltip,
  Select,
  DatePicker,
} from 'antd';
import { ClearOutlined, MailOutlined, EyeOutlined, CloseOutlined, SendOutlined, DownloadOutlined, FilterOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import PredictionBadge from './PredictionBadge';

const { Title } = Typography;

const Dashboard = () => {
  const { t } = useTranslation();
  const { token } = useSelector((state) => state.auth);
  const navigate = useNavigate();
  console.log('The token', token);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPredictions, setTotalPredictions] = useState(0);
  const [predictionsPerPage, setPredictionsPerPage] = useState(10);
  const [showModal, setShowModal] = useState(false);
  const [selectedPredictionId, setSelectedPredictionId] = useState(null);
  const [userId, setUserId] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [predictionList, setPredictionList] = useState([]);
  const [isManualModalVisible, setIsManualModalVisible] = useState(false);
  const [subscribers, setSubscribers] = useState([]);
  const [selectedEmails, setSelectedEmails] = useState([]);
  const [isLoadingSubscribers, setIsLoadingSubscribers] = useState(false);
  const [isSendingManual, setIsSendingManual] = useState(false);
  const [selectedPrediction, setSelectedPrediction] = useState(null);
  const [areas, setAreas] = useState([]);
  const [selectedAreaId, setSelectedAreaId] = useState(null);
  const [isLoadingAreas, setIsLoadingAreas] = useState(false);
  const [loading, setLoading] = useState(false);

  // Extended filters
  const [selectedPredictionResult, setSelectedPredictionResult] = useState(undefined);
  const [selectedAreaType, setSelectedAreaType] = useState(undefined);
  const [selectedProvince, setSelectedProvince] = useState(undefined);
  const [selectedDistrict, setSelectedDistrict] = useState(undefined);
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [provinces, setProvinces] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [isLoadingProvinces, setIsLoadingProvinces] = useState(false);
  const [isLoadingDistricts, setIsLoadingDistricts] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // States for batch delete
  const [selectedPredictionIds, setSelectedPredictionIds] = useState([]);
  const [isDeleteModalVisible, setIsDeleteModalVisible] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Load areas list for filter
  useEffect(() => {
    if (token) {
      try {
        const decodedToken = jwtDecode(token);
        setUserRole(decodedToken.role);
        setIsLoadingAreas(true);
        axios
          .get('/api/express/areas/all')
          .then((response) => {
            // API returns { areas: [...] } format
            let areasData = response.data?.areas || response.data || [];
            if (decodedToken.role === 'manager') {
              if (decodedToken.district) {
                areasData = areasData.filter(area => area.district === decodedToken.district);
              } else {
                areasData = areasData.filter(area => area.province === decodedToken.province);
              }
            }
            setAreas(Array.isArray(areasData) ? areasData : []);
          })
          .catch((error) => {
            console.error('Error fetching areas:', error);
            message.error('Không thể tải danh sách khu vực');
            setAreas([]); // Set empty array on error
          })
          .finally(() => {
            setIsLoadingAreas(false);
          });

      } catch (error) {
        console.error('Error decoding token:', error);
      }
    }
  }, [token]);

  // Load provinces for filter (only for admin)
  useEffect(() => {
    if (token && userRole === 'admin') {
      setIsLoadingProvinces(true);
      axios
        .get('/api/express/areas/provinces')
        .then((response) => {
          const provincesData = response.data || [];
          setProvinces(Array.isArray(provincesData) ? provincesData : []);
          console.log(provinces);
        })
        .catch((error) => {
          console.error('Error fetching provinces:', error);
        })
        .finally(() => {
          setIsLoadingProvinces(false);
        });
    }
  }, [token, userRole]);

  // Load districts when province is selected (only for admin)
  useEffect(() => {
    if (selectedProvince && userRole === 'admin') {
      setIsLoadingDistricts(true);
      axios
        .get(`/api/express/areas/districts`)
        .then((response) => {
          console.log('kkk', response.data);
          const districtsData = response.data.filter(district => district.province_id === selectedProvince) || [];
          setDistricts(districtsData);
        })
        .catch((error) => {
          console.error('Error fetching districts:', error);
          setDistricts([]);
        })
        .finally(() => {
          setIsLoadingDistricts(false);
        });
    } else if (userRole === 'admin') {
      setDistricts([]);
      setSelectedDistrict(undefined);
    }
  }, [selectedProvince, userRole]);

  // Clear selection when page changes or filters change
  useEffect(() => {
    setSelectedPredictionIds([]);
  }, [currentPage, selectedAreaId, selectedPredictionResult, selectedAreaType,
    selectedProvince, selectedDistrict, startDate, endDate]);

  useEffect(() => {
    if (token) {
      setLoading(true);
      try {
        const decodedToken = jwtDecode(token); // Decode the JWT token
        console.log(decodedToken);
        setUserId(decodedToken.id); // Assuming `id` is the field for userId in the token
        setUserRole(decodedToken.role);
        setTimeout(100);
        console.log(userId);
        if (decodedToken.role === 'admin' || decodedToken.role === 'manager') {
          console.log('start fetching');

          const params = {
            limit: predictionsPerPage, // Limit number of results per page
            offset: currentPage * predictionsPerPage,
          };

          // Add filters
          if (selectedAreaId) params.areaId = selectedAreaId;
          if (selectedPredictionResult !== undefined && selectedPredictionResult !== '') {
            params.predictionResult = selectedPredictionResult;
          }
          if (selectedAreaType) params.areaType = selectedAreaType;
          // For admin, use selected filters. For manager, backend will auto-apply their province/district
          if (userRole === 'admin') {
            if (selectedProvince) params.province = selectedProvince;
            if (selectedDistrict) params.district = selectedDistrict;
          }
          if (startDate) params.startDate = startDate.format('YYYY-MM-DD');
          if (endDate) params.endDate = endDate.format('YYYY-MM-DD');

          axios
            .get(`/api/express/predictions/admin`, { params })
            .then((response) => {
              setPredictionList(response.data.rows);
              console.log(response.data);
              setTotalPredictions(response.data.count); // Set total areas for pagination
            })
            .catch((error) => {
              console.error('Error fetching prediction details:', error);
            })
            .finally(() => {
              setLoading(false);
            });
        } else {
          const params = {
            limit: predictionsPerPage, // Limit number of results per page
            offset: currentPage * predictionsPerPage,
          };

          // Add filters
          if (selectedAreaId) params.areaId = selectedAreaId;

          axios
            .get(`/api/express/predictions/user/${decodedToken.id}`, { params })
            .then((response) => {
              // Backend now returns {rows: [], count: number} format
              if (response.data.rows !== undefined) {
                setPredictionList(response.data.rows);
                setTotalPredictions(response.data.count);
              } else {
                // Fallback for old format (array)
                setPredictionList(Array.isArray(response.data) ? response.data : []);
                setTotalPredictions(Array.isArray(response.data) ? response.data.length : 0);
              }
              console.log(response.data);
            })
            .catch((error) => {
              console.error('Error fetching prediction details:', error);
            })
            .finally(() => {
              setLoading(false);
            });
        }
      } catch (error) {
        console.error('Error decoding token:', error);
        toast.error(t('dashboard.invalidToken'));
        setLoading(false);
      }
    }
  }, [currentPage, selectedAreaId, predictionsPerPage, selectedPredictionResult, selectedAreaType,
    selectedProvince, selectedDistrict, startDate, endDate]);

  useEffect(() => { }, [predictionList]);

  const handleViewDetails = (predictionId) => {
    setSelectedPredictionId(predictionId);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedPredictionId(null);
  };

  const totalPages = Math.ceil(totalPredictions / predictionsPerPage);
  const handleNextPage = () => {
    if (currentPage < totalPages - 1) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
    }
  };

  // Load subscribers for an area
  const loadSubscribers = async (areaId) => {
    if (!areaId) return;

    setIsLoadingSubscribers(true);
    try {
      const response = await axios.get(`api/express/emails/area/${areaId}/subscribers`);
      setSubscribers(response.data.data.subscribers);
    } catch (error) {
      message.error('Không thể tải danh sách người đăng ký email');
      console.error('Load subscribers error:', error);
    } finally {
      setIsLoadingSubscribers(false);
    }
  };

  // Show manual notification modal
  const showManualNotificationModal = (prediction) => {
    setSelectedPrediction(prediction);
    setIsManualModalVisible(true);
    if (prediction.Area?.id) {
      loadSubscribers(prediction.Area.id);
    }
  };

  // Send manual notification
  const sendManualNotification = async (sendToAll = false) => {
    if (!selectedPrediction || !selectedPrediction.Area?.id) {
      message.error('Thiếu thông tin để gửi thông báo');
      return;
    }

    setIsSendingManual(true);
    try {
      const predictionData = {
        result: `Dự đoán #${selectedPrediction.id}`,
        model: 'Hệ thống dự đoán',
        predictionCount: 1,
        batchPrediction: false
      };

      const payload = {
        areaId: selectedPrediction.Area.id,
        predictionData: predictionData,
        sendToAll: sendToAll,
        ...(sendToAll ? {} : { selectedEmails: selectedEmails })
      };

      const response = await axios.post('api/express/emails/send-manual', payload);

      message.success(response.data.message);
      setIsManualModalVisible(false);
      setSelectedEmails([]);
    } catch (error) {
      message.error('Gửi thông báo thất bại: ' + (error.response?.data?.error || error.message));
    } finally {
      setIsSendingManual(false);
    }
  };

  // Handle email selection
  const handleEmailSelection = (email, checked) => {
    if (checked) {
      setSelectedEmails([...selectedEmails, email]);
    } else {
      setSelectedEmails(selectedEmails.filter(e => e !== email));
    }
  };

  // Select all emails
  const selectAllEmails = () => {
    setSelectedEmails(subscribers.map(sub => sub.email));
  };

  // Deselect all emails
  const deselectAllEmails = () => {
    setSelectedEmails([]);
  };

  // Clear all filters
  const clearAllFilters = () => {
    setSelectedAreaId(null);
    setSelectedPredictionResult(undefined);
    setSelectedAreaType(undefined);
    // Only clear province/district for admin (manager's are fixed)
    if (userRole === 'admin') {
      setSelectedProvince(undefined);
      setSelectedDistrict(undefined);
    }
    setStartDate(null);
    setEndDate(null);
    setCurrentPage(0);
  };

  // Handle checkbox selection
  const handleSelectPrediction = (predictionId, checked) => {
    if (checked) {
      setSelectedPredictionIds([...selectedPredictionIds, predictionId]);
    } else {
      setSelectedPredictionIds(selectedPredictionIds.filter(id => id !== predictionId));
    }
  };

  // Select all predictions on current page
  const handleSelectAll = (checked) => {
    if (checked) {
      const allIds = predictionList.map(pred => pred.id);
      setSelectedPredictionIds(allIds);
    } else {
      setSelectedPredictionIds([]);
    }
  };

  // Show delete confirmation modal for batch delete
  const showDeleteConfirmModal = () => {
    if (selectedPredictionIds.length === 0) {
      message.warning('Vui lòng chọn ít nhất một dự đoán để xóa');
      return;
    }
    setIsDeleteModalVisible(true);
  };

  // Handle delete single prediction
  const handleDeleteSingle = (predictionId) => {
    setSelectedPredictionIds([predictionId]);
    setIsDeleteModalVisible(true);
  };

  // Handle batch delete
  const handleBatchDelete = async () => {
    if (selectedPredictionIds.length === 0) {
      message.warning('Vui lòng chọn ít nhất một dự đoán để xóa');
      return;
    }

    setIsDeleting(true);
    try {
      const response = await axios.delete('/api/express/predictions/batch-delete', {
        data: { predictionIds: selectedPredictionIds }
      });

      message.success(response.data.message || `Đã xóa ${response.data.deletedCount} dự đoán thành công`);

      // Clear selection
      setSelectedPredictionIds([]);
      setIsDeleteModalVisible(false);

      // Refresh predictions list
      // Trigger re-fetch by incrementing a counter or call fetch function
      if (token) {
        try {
          const decodedToken = jwtDecode(token);
          if (decodedToken.role === 'admin' || decodedToken.role === 'manager') {
            const params = {
              limit: predictionsPerPage,
              offset: currentPage * predictionsPerPage,
            };

            if (selectedAreaId) params.areaId = selectedAreaId;
            if (selectedPredictionResult !== undefined && selectedPredictionResult !== '') {
              params.predictionResult = selectedPredictionResult;
            }
            if (selectedAreaType) params.areaType = selectedAreaType;
            if (userRole === 'admin') {
              if (selectedProvince) params.province = selectedProvince;
              if (selectedDistrict) params.district = selectedDistrict;
            }
            if (startDate) params.startDate = startDate.format('YYYY-MM-DD');
            if (endDate) params.endDate = endDate.format('YYYY-MM-DD');

            const response = await axios.get(`/api/express/predictions/admin`, { params });
            setPredictionList(response.data.rows);
            setTotalPredictions(response.data.count);
          } else {
            const params = {
              limit: predictionsPerPage,
              offset: currentPage * predictionsPerPage,
            };
            if (selectedAreaId) params.areaId = selectedAreaId;

            const response = await axios.get(`/api/express/predictions/user/${decodedToken.id}`, { params });
            if (response.data.rows !== undefined) {
              setPredictionList(response.data.rows);
              setTotalPredictions(response.data.count);
            } else {
              setPredictionList(Array.isArray(response.data) ? response.data : []);
              setTotalPredictions(Array.isArray(response.data) ? response.data.length : 0);
            }
          }
        } catch (error) {
          console.error('Error refreshing predictions:', error);
        }
      }
    } catch (error) {
      console.error('Delete predictions error:', error);
      const errorMsg = error.response?.data?.error || error.message || 'Xóa dự đoán thất bại';
      message.error(errorMsg);
    } finally {
      setIsDeleting(false);
    }
  };

  // Export to Excel via Job
  const handleExportExcel = async () => {
    try {
      setIsExporting(true);

      const body = {};

      // Add all active filters with names for description
      if (selectedAreaId) {
        body.areaId = selectedAreaId;
        const area = areas.find(a => a.id === selectedAreaId);
        if (area) body.areaName = area.name;
      }
      if (selectedPredictionResult !== undefined && selectedPredictionResult !== '') {
        body.predictionResult = selectedPredictionResult;
      }
      if (selectedAreaType) body.areaType = selectedAreaType;
      // For admin, use selected filters. For manager, backend will auto-apply their province/district
      if (userRole === 'admin') {
        if (selectedProvince) {
          body.province = selectedProvince;
          const prov = provinces.find(p => p.id === selectedProvince);
          if (prov) body.provinceName = prov.name;
        }
        if (selectedDistrict) {
          body.district = selectedDistrict;
          const dist = districts.find(d => d.id === selectedDistrict);
          if (dist) body.districtName = dist.name;
        }
      }
      if (startDate) body.startDate = startDate.format('YYYY-MM-DD');
      if (endDate) body.endDate = endDate.format('YYYY-MM-DD');

      // Call job API to queue export
      const response = await axios.post('/api/express/jobs/export/predictions', body);

      const description = response.data.description || 'Tất cả dữ liệu';
      message.success(`Đã tạo job xuất báo cáo: "${description}". Đang chuyển đến trang Danh sách Job...`);

      // Redirect to Jobs page after 2 seconds
      setTimeout(() => {
        navigate('/jobs');
      }, 2000);
    } catch (error) {
      console.error('Export Excel error:', error);
      message.error('Tạo job xuất báo cáo thất bại: ' + (error.response?.data?.error || error.message));
    } finally {
      setIsExporting(false);
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
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Title level={3} style={{ marginBottom: 0 }}>
              {t('dashboard.title')}
            </Title>
            <Space>
              <Button
                icon={<FilterOutlined />}
                onClick={() => setShowFilters(!showFilters)}
              >
                {showFilters ? 'Ẩn bộ lọc' : 'Hiện bộ lọc'}
              </Button>
              {(userRole === 'admin' || userRole === 'manager') && (
                <>
                  <Button
                    danger
                    icon={<DeleteOutlined />}
                    onClick={showDeleteConfirmModal}
                    disabled={selectedPredictionIds.length === 0}
                  >
                    Xóa đã chọn ({selectedPredictionIds.length})
                  </Button>
                  <Button
                    type="primary"
                    icon={<DownloadOutlined />}
                    onClick={handleExportExcel}
                    loading={isExporting}
                    disabled={predictionList.length === 0}
                  >
                    Xuất Excel
                  </Button>
                </>
              )}
            </Space>
          </div>

          {showFilters && (
            <Card size="medium" style={{ marginBottom: 16, backgroundColor: '#f5f5f5' }}>
              <Row gutter={[16, 16]}>
                <Col xs={24} sm={12} md={8} lg={6}>
                  <div style={{ marginBottom: 4 }}>
                    <strong>Khu vực</strong>
                  </div>
                  <Select
                    placeholder="Tất cả khu vực"
                    allowClear
                    style={{ width: '100%' }}
                    value={selectedAreaId}
                    onChange={(value) => {
                      setSelectedAreaId(value);
                      setCurrentPage(0);
                    }}
                    loading={isLoadingAreas}
                    showSearch
                    filterOption={(input, option) =>
                      (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                    }
                    options={areas.map((area) => ({
                      value: area.id,
                      label: area.name,
                    }))}
                  />
                </Col>

                <Col xs={24} sm={12} md={8} lg={6}>
                  <div style={{ marginBottom: 4 }}>
                    <strong>Kết quả dự đoán</strong>
                  </div>
                  <Select
                    placeholder="Tất cả kết quả"
                    allowClear
                    style={{ width: '100%' }}
                    value={selectedPredictionResult}
                    onChange={(value) => {
                      setSelectedPredictionResult(value);
                      setCurrentPage(0);
                    }}
                    options={[
                      { value: 1, label: 'Tốt' },
                      { value: 0, label: 'Trung bình' },
                      { value: -1, label: 'Kém' },
                    ]}
                  />
                </Col>

                <Col xs={24} sm={12} md={8} lg={6}>
                  <div style={{ marginBottom: 4 }}>
                    <strong>Loại khu vực</strong>
                  </div>
                  <Select
                    placeholder="Tất cả loại"
                    allowClear
                    style={{ width: '100%' }}
                    value={selectedAreaType}
                    onChange={(value) => {
                      setSelectedAreaType(value);
                      setCurrentPage(0);
                    }}
                    options={[
                      { value: 'oyster', label: 'Hàu' },
                      { value: 'cobia', label: 'Cá giò' },
                    ]}
                  />
                </Col>

                {(userRole === 'admin') && (
                  <>
                    <Col xs={24} sm={12} md={8} lg={6}>
                      <div style={{ marginBottom: 4 }}>
                        <strong>Tỉnh/Thành phố</strong>
                      </div>
                      <Select
                        placeholder="Tất cả tỉnh"
                        allowClear
                        style={{ width: '100%' }}
                        value={selectedProvince}
                        onChange={(value) => {
                          setSelectedProvince(value);
                          setCurrentPage(0);
                        }}
                        loading={isLoadingProvinces}
                        showSearch
                        filterOption={(input, option) =>
                          (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                        }
                        options={provinces.map((province) => ({
                          value: province.id,
                          label: province.name,
                        }))}
                      />
                    </Col>

                    <Col xs={24} sm={12} md={8} lg={6}>
                      <div style={{ marginBottom: 4 }}>
                        <strong>Quận/Huyện</strong>
                      </div>
                      <Select
                        placeholder="Chọn tỉnh trước"
                        allowClear
                        style={{ width: '100%' }}
                        value={selectedDistrict}
                        onChange={(value) => {
                          setSelectedDistrict(value);
                          setCurrentPage(0);
                        }}
                        loading={isLoadingDistricts}
                        disabled={!selectedProvince}
                        showSearch
                        filterOption={(input, option) =>
                          (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                        }
                        options={districts.map((district) => ({
                          value: district.id,
                          label: district.name,
                        }))}
                      />
                    </Col>
                  </>
                )}

                <Col xs={24} sm={12} md={8} lg={6}>
                  <div style={{ marginBottom: 4 }}>
                    <strong>Từ ngày</strong>
                  </div>
                  <DatePicker
                    placeholder="Chọn ngày bắt đầu"
                    style={{ width: '100%' }}
                    value={startDate}
                    onChange={(date) => {
                      setStartDate(date);
                      setCurrentPage(0);
                    }}
                    format="DD/MM/YYYY"
                  />
                </Col>

                <Col xs={24} sm={12} md={8} lg={6}>
                  <div style={{ marginBottom: 4 }}>
                    <strong>Đến ngày</strong>
                  </div>
                  <DatePicker
                    placeholder="Chọn ngày kết thúc"
                    style={{ width: '100%' }}
                    value={endDate}
                    onChange={(date) => {
                      setEndDate(date);
                      setCurrentPage(0);
                    }}
                    format="DD/MM/YYYY"
                  />
                </Col>

                <Col xs={24} sm={12} md={8} lg={6}>
                  <Button variant='primary' onClick={clearAllFilters} style={{ marginTop: '1.5rem', width: '100%' }}>
                    <ClearOutlined /> Xóa tất cả bộ lọc
                  </Button>
                </Col>
              </Row>
            </Card>
          )}
        </div>
        <Spin spinning={loading}>
          <Table
            columns={[
              ...(userRole === 'admin' || userRole === 'manager'
                ? [
                  {
                    title: (
                      <Checkbox
                        checked={selectedPredictionIds.length === predictionList.length && predictionList.length > 0}
                        indeterminate={selectedPredictionIds.length > 0 && selectedPredictionIds.length < predictionList.length}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                      />
                    ),
                    key: 'checkbox',
                    width: 'min-content',
                    align: 'center',
                    render: (_, record) => (
                      <Checkbox
                        checked={selectedPredictionIds.includes(record.id)}
                        onChange={(e) => handleSelectPrediction(record.id, e.target.checked)}
                      />
                    ),
                  },
                ]
                : []),
              {
                title: t('dashboard.id'),
                dataIndex: 'id',
                key: 'id',
                render: (id) => `${t('dashboard.prediction')}#${id}`,
              },
              ...(userRole === 'admin' || userRole === 'manager'
                ? [
                  {
                    title: t('dashboard.creator'),
                    dataIndex: ['User', 'username'],
                    key: 'creator',
                  },
                ]
                : []),
              {
                title: t('dashboard.area'),
                dataIndex: ['Area', 'name'],
                key: 'area',
              },
              {
                title: 'Kết quả',
                dataIndex: 'prediction_text',
                key: 'result',
                render: (_, record) => (
                  <PredictionBadge prediction={record} />
                ),
              },
              {
                title: 'Ngày tạo',
                dataIndex: 'createdAt',
                key: 'createdAt',
                render: (date) => {
                  if (!date) return '-';
                  return new Date(date).toLocaleString('vi-VN', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                  });
                },
              },
              ...(userRole === 'admin' || userRole === 'manager'
                ? [
                  {
                    title: 'Địa điểm',
                    key: 'location',
                    render: (_, record) => {
                      const province = record.Area?.Province?.name || '';
                      const district = record.Area?.District?.name || '';
                      if (!province && !district) return '-';
                      return `${province}${province && district ? ', ' : ''}${district}`;
                    },
                  },
                ]
                : []),
              {
                title: t('dashboard.actions'),
                key: 'actions',
                fixed: 'right',
                width: 'min-content',
                align: 'center',
                render: (_, item) => (
                  <Space>
                    <Tooltip title={t('dashboard.viewDetails')}>
                      <Button
                        type="primary"
                        icon={<EyeOutlined />}
                        size="middle"
                        onClick={() => handleViewDetails(item.id)}
                      />
                    </Tooltip>
                    {(userRole === 'admin' || userRole === 'manager') && (
                      <>
                        <Tooltip title="Gửi thông báo">
                          <Button
                            type="default"
                            icon={<MailOutlined />}
                            size="middle"
                            onClick={() => showManualNotificationModal(item)}
                          />
                        </Tooltip>
                        <Tooltip title="Xóa dự đoán">
                          <Button
                            danger
                            icon={<DeleteOutlined />}
                            size="middle"
                            onClick={() => handleDeleteSingle(item.id)}
                          />
                        </Tooltip>
                      </>
                    )}
                  </Space>
                ),
              },
            ]}
            dataSource={predictionList}
            rowKey="id"
            pagination={false}
            style={{ width: '100%', overflowX: 'scroll' }}
            scroll={{ x: 'max-content' }}
            locale={{ emptyText: t('dashboard.noData') }}
          />
        </Spin>
        <div style={{ margin: '16px 0', textAlign: 'center' }}>
          <Pagination
            current={currentPage + 1}
            total={totalPredictions}
            pageSize={predictionsPerPage}
            onChange={(page, pageSize) => { setCurrentPage(page - 1); setPredictionsPerPage(pageSize); }}
            showSizeChanger={true}
            pageSizeOptions={[10, 20, 50, 100]}
          />
        </div>
        <Modal
          open={showModal}
          onCancel={closeModal}
          footer={null}
          width={800}
          style={{ maxWidth: '100vw' }}
          styles={{ body: { maxHeight: '70vh', overflowY: 'auto', overflowX: 'auto' } }}
        >
          <div style={{ minWidth: '750px' }}>
            <PredictionDetails predictionId={selectedPredictionId} />
          </div>
        </Modal>

        {/* Delete Confirmation Modal */}
        <Modal
          title="Xác nhận xóa dự đoán"
          open={isDeleteModalVisible}
          onOk={handleBatchDelete}
          onCancel={() => {
            setIsDeleteModalVisible(false);
            // Don't clear selectedPredictionIds here to keep checkbox selection
          }}
          confirmLoading={isDeleting}
          okText="Xóa"
          cancelText="Hủy"
          okButtonProps={{ danger: true }}
        >
          <p>
            Bạn đang xóa <strong style={{ fontSize: '18px', color: '#ff4d4f' }}>{selectedPredictionIds.length}</strong> dự đoán
          </p>
          <p style={{ marginTop: 8 }}>
            Bạn có chắc chắn muốn tiếp tục?
          </p>
          <p style={{ color: '#ff4d4f', marginTop: 16, fontWeight: 500 }}>
            ⚠️ Hành động này không thể hoàn tác!
          </p>
        </Modal>

        {/* Manual Notification Modal */}
        <Modal
          title={
            <div style={{ fontSize: '18px', fontWeight: '600', color: '#1890ff' }}>
              📧 Gửi thông báo thủ công
            </div>
          }
          open={isManualModalVisible}
          onCancel={() => {
            setIsManualModalVisible(false);
            setSelectedEmails([]);
          }}
          width={700}
          style={{
            top: '5vh',
            bottom: '5vh',
            margin: '0 auto',
            maxHeight: '90vh'
          }}
          styles={{
            body: {
              maxHeight: 'calc(90vh - 120px)',
              overflowY: 'auto',
              padding: '16px 24px'
            }
          }}
          footer={[
            <Tooltip title="Hủy" key="cancel">
              <Button
                onClick={() => {
                  setIsManualModalVisible(false);
                  setSelectedEmails([]);
                }}
                size="large"
                icon={<CloseOutlined />}
              />
            </Tooltip>,
            <Tooltip title={`Gửi cho tất cả (${subscribers.length})`} key="send-all">
              <Button
                type="primary"
                loading={isSendingManual}
                onClick={() => sendManualNotification(true)}
                disabled={subscribers.length === 0}
                size="large"
                style={{ marginLeft: '8px' }}
                icon={<SendOutlined />}
              />
            </Tooltip>,
            <Tooltip title={`Gửi cho đã chọn (${selectedEmails.length})`} key="send-selected">
              <Button
                type="primary"
                loading={isSendingManual}
                onClick={() => sendManualNotification(false)}
                disabled={selectedEmails.length === 0}
                size="large"
                style={{ marginLeft: '8px' }}
                icon={<SendOutlined />}
              />
            </Tooltip>
          ]}
        >
          <div style={{ padding: '8px 0', width: '100%' }}>
            {selectedPrediction && (
              <div style={{
                marginBottom: '20px',
                padding: '16px',
                backgroundColor: '#f0f8ff',
                borderRadius: '8px',
                border: '1px solid #d6e4ff'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '16px', marginRight: '8px' }}>📊</span>
                  <strong style={{ fontSize: '16px', color: '#1890ff' }}>Thông tin dự đoán</strong>
                </div>
                <div style={{ marginLeft: '24px' }}>
                  <p style={{ margin: '4px 0', fontSize: '14px' }}>
                    <strong>Dự đoán:</strong> <span style={{ color: '#1890ff' }}>#{selectedPrediction.id}</span>
                  </p>
                  <p style={{ margin: '4px 0', fontSize: '14px' }}>
                    <strong>Khu vực:</strong> {selectedPrediction.Area?.name}
                  </p>
                  <p style={{ margin: '4px 0', fontSize: '14px' }}>
                    <strong>Loại khu vực:</strong> {selectedPrediction.Area?.area_type}
                  </p>
                  {selectedPrediction.createdAt && (
                    <p style={{ margin: '4px 0', fontSize: '14px' }}>
                      <strong>Ngày tạo:</strong> {new Date(selectedPrediction.createdAt).toLocaleString('vi-VN', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                  )}
                </div>
              </div>
            )}

            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ fontSize: '16px', marginRight: '8px' }}>👥</span>
                <strong style={{ fontSize: '16px', color: '#52c41a' }}>Chọn người nhận thông báo</strong>
              </div>
              <p style={{ color: '#666', fontSize: '14px', margin: '0 0 16px 24px' }}>
                Click vào dòng để chọn/bỏ chọn người dùng
              </p>
            </div>

            {isLoadingSubscribers ? (
              <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                <Spin size="large" tip="Đang tải danh sách người đăng ký..." />
              </div>
            ) : subscribers.length > 0 ? (
              <div style={{ width: '100%' }}>
                <div style={{
                  marginBottom: '16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0 4px'
                }}>
                  <Space>
                    <Button
                      size="middle"
                      onClick={selectAllEmails}
                      style={{ borderRadius: '6px' }}
                    >
                      ✅ Chọn tất cả
                    </Button>
                    <Button
                      size="middle"
                      onClick={deselectAllEmails}
                      style={{ borderRadius: '6px' }}
                    >
                      ❌ Bỏ chọn tất cả
                    </Button>
                  </Space>
                  <span style={{
                    fontSize: '14px',
                    color: '#1890ff',
                    fontWeight: '500'
                  }}>
                    Đã chọn: {selectedEmails.length}/{subscribers.length}
                  </span>
                </div>

                <div style={{ width: '100%' }}>
                  <List
                    dataSource={subscribers}
                    renderItem={(subscriber) => (
                      <List.Item
                        style={{
                          padding: '8px 16px',
                          cursor: 'pointer',
                          borderRadius: '4px',
                          margin: '2px 0',
                          transition: 'background-color 0.2s',
                          width: '100% !important',
                          display: 'block !important',
                          maxWidth: 'none !important'
                        }}
                        onClick={() => handleEmailSelection(subscriber.email, !selectedEmails.includes(subscriber.email))}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#f5f5f5';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', width: '100% !important', maxWidth: 'none !important' }}>
                          <Checkbox
                            checked={selectedEmails.includes(subscriber.email)}
                            onChange={(e) => {
                              e.stopPropagation();
                              handleEmailSelection(subscriber.email, e.target.checked);
                            }}
                            style={{ marginRight: '12px' }}
                          />
                          <span style={{ flex: 1, fontSize: '14px', wordBreak: 'break-all', width: '100% !important', maxWidth: 'none !important' }}>
                            {subscriber.email}
                          </span>
                        </div>
                      </List.Item>
                    )}
                    style={{
                      maxHeight: 'calc(90vh - 400px)',
                      minHeight: '200px',
                      overflowY: 'auto',
                      border: '1px solid #d9d9d9',
                      borderRadius: '6px',
                      padding: '8px 0',
                      width: '100% !important',
                      maxWidth: 'none !important'
                    }}
                  />
                </div>
              </div>
            ) : (
              <div style={{
                textAlign: 'center',
                padding: '40px 20px',
                color: '#999',
                backgroundColor: '#fafafa',
                borderRadius: '8px',
                border: '1px dashed #d9d9d9'
              }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📭</div>
                <p style={{ fontSize: '16px', margin: '0 0 8px 0', fontWeight: '500' }}>
                  Không có người đăng ký email
                </p>
                <p style={{ fontSize: '14px', margin: '0' }}>
                  Chưa có ai đăng ký nhận thông báo cho khu vực này
                </p>
              </div>
            )}
          </div>
        </Modal>
      </Card>
    </div>
  );
};

export default Dashboard;
