import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from '../axios';
import { useSelector } from 'react-redux';
import './AreaList.css';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router-dom';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import {
  MapContainer,
  TileLayer,
  Marker,
  useMapEvents,
  useMap,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import proj4 from 'proj4';
import {
  Input,
  Select,
  Button,
  Space,
  Table,
  Pagination,
  Modal,
  Form,
  Typography,
  Card,
  Row,
  Col,
  Tooltip,
  Upload,
  Tabs,
  message,
  Spin,
} from 'antd';

import {
  EditOutlined,
  DeleteOutlined,
  PlusOutlined,
  MailOutlined,
  SaveOutlined,
  CloseOutlined,
  UploadOutlined,
} from '@ant-design/icons';

const { Option } = Select;
const { Title } = Typography;

// Build VN2000 proj4 string with selected central meridian (lon_0)
const getVN2000Proj4 = (lon0) => `+proj=tmerc +lat_0=0 +lon_0=${lon0} +k=0.9999 +x_0=500000 +y_0=0 +ellps=WGS84 +towgs84=-191.904,-39.303,-111.450,0,0,0,0 +units=m +no_defs`;

// delete L.Icon.Default.prototype._getIconUrl;
// L.Icon.Default.mergeOptions({
//   iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
//   iconUrl: require('leaflet/dist/images/marker-icon.png'),
//   shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
// });

const AreaList = () => {
  const [form] = Form.useForm();
  const [importForm] = Form.useForm();
  const { t } = useTranslation();
  const { token } = useSelector((state) => state.auth);
  const navigate = useNavigate();
  const location = useLocation();
  const [map, setMap] = useState(null);
  const [position, setPosition] = useState(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalAreas, setTotalAreas] = useState(0);
  const [areas, setAreas] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [areaType, setAreaType] = useState('');
  const [latRange, setLatRange] = useState({ min: '', max: '' });
  const [longRange, setLongRange] = useState({ min: '', max: '' });
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [selectedArea, setSelectedArea] = useState(null);
  const [mapCenter, setMapCenter] = useState([10.762622, 106.660172]); // Default center (Vietnam)
  const [regionList, setRegionList] = useState([]);
  const [districtList, setDistrictList] = useState([]);
  const [filteredDistrictList, setFilteredDistrictList] = useState([]);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFileList, setImportFileList] = useState([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importProvince, setImportProvince] = useState('');
  const [importDistrict, setImportDistrict] = useState('');
  const [areasPerPage, setAreasPerPage] = useState(10);
  const [newArea, setNewArea] = useState({
    id: '',
    name: '',
    latitude: '',
    longitude: '',
    area: '',
    region: '',
    area_type: 'oyster',
  });
  const [coordinateType, setCoordinateType] = useState('wgs84');
  const [vnZone, setVnZone] = useState('auto'); // 'auto' | 105 | 107 | 109
  const [provinceCentralMeridian, setProvinceCentralMeridian] = useState(null);
  const [selectedProvince, setSelectedProvince] = useState(null);
  const [selectedDistrict, setSelectedDistrict] = useState(null);

  // Helper function to set central meridian from province
  const setCentralMeridianFromProvince = (provinceId) => {
    if (!provinceId) {
      setProvinceCentralMeridian(null);
      return;
    }
    try {
      const province = regionList.find(p => p.id === provinceId);
      if (province?.central_meridian) {
        setProvinceCentralMeridian(province.central_meridian);
      } else {
        setProvinceCentralMeridian(null);
        // Nếu không có central_meridian và đang dùng vn2000, chuyển về wgs84
        if (coordinateType === 'vn2000') {
          setCoordinateType('wgs84');
          message.warning('Tỉnh này chưa có kinh tuyến trục, chỉ có thể sử dụng WGS84');
        }
      }
    } catch (error) {
      console.error('Error getting province central_meridian:', error);
      setProvinceCentralMeridian(null);
    }
  };

  const [provinceTouched, setProvinceTouched] = useState(false);
  const [districtTouched, setDistrictTouched] = useState(false);
  const [filterInitialized, setFilterInitialized] = useState(false);
  const [loading, setLoading] = useState(false);
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 500);
  const [userInfo, setUserInfo] = useState(null);
  const [userInfoLoading, setUserInfoLoading] = useState(true);


  // Fetch user info from /auth/me
  useEffect(() => {
    const fetchUserInfo = async () => {
      if (!token) {
        setUserInfo(null);
        setUserInfoLoading(false);
        return;
      }

      try {
        const response = await axios.get('/api/express/auth/me');
        setUserInfo(response.data);
      } catch (error) {
        console.error('Error fetching user info:', error);
        if (error.response?.status === 401) {
          message.error('Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.');
          navigate('/login');
        }
        setUserInfo(null);
      } finally {
        setUserInfoLoading(false);
      }
    };

    fetchUserInfo();
  }, [token, navigate]);

  const isWithinVietnam = (lat, lon) => lat >= 8 && lat <= 24 && lon >= 102 && lon <= 110;
  const convertVN2000ToWGS84 = (x, y, zone) => {
    try {
      // Trong VN2000: X là Easting (longitude), Y là Northing (latitude)
      // proj4 nhận [x, y] và trả về [lon, lat]
      if (zone === 'auto') {
        const zones = [105, 107, 109];
        for (const z of zones) {
          const [lon, lat] = proj4(getVN2000Proj4(z), 'EPSG:4326', [x, y]);
          if (Number.isFinite(lat) && Number.isFinite(lon) && isWithinVietnam(lat, lon)) {
            return { lat, lon, usedZone: z };
          }
        }
        const [lon, lat] = proj4(getVN2000Proj4(105), 'EPSG:4326', [x, y]);
        return { lat, lon, usedZone: 105 };
      } else {
        const [lon, lat] = proj4(getVN2000Proj4(zone), 'EPSG:4326', [x, y]);
        return { lat, lon, usedZone: zone };
      }
    } catch (e) {
      return null;
    }
  };
  const [userFilter, setUserFilter] = useState({
    province: '',
    district: '',
    role: '',
  });

  const filteredImportDistricts = useMemo(() => {
    if (!importProvince) {
      return districtList;
    }
    return districtList.filter((district) => String(district.province_id) === String(importProvince));
  }, [districtList, importProvince]);

  const importUploadProps = useMemo(() => ({
    beforeUpload: (file) => {
      const isExcel = file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || file.type === 'application/vnd.ms-excel' || file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
      if (!isExcel) {
        message.error(t('area_list.import_modal.invalid_file'));
        return Upload.LIST_IGNORE;
      }
      setImportFileList([file]);
      return false;
    },
    onRemove: () => {
      setImportFileList([]);
    },
    multiple: false,
    accept: '.xlsx,.xls',
    fileList: importFileList,
  }), [importFileList, t]);

  const resetImportState = useCallback(() => {
    setImportFileList([]);
    setImportProvince('');
    setImportDistrict('');
    importForm.resetFields();
    importForm.setFieldsValue({ area_type: 'oyster' }); // Reset về giá trị mặc định
  }, [importForm]);

  const handleOpenImportModal = () => {
    const defaultProvince = userInfo?.province ? String(userInfo.province) : '';
    const defaultDistrict = userInfo?.district ? String(userInfo.district) : '';

    setImportProvince(defaultProvince);
    setImportDistrict(defaultDistrict);
    importForm.setFieldsValue({
      provinceId: defaultProvince || undefined,
      districtId: defaultDistrict || undefined,
      area_type: 'oyster', // Giá trị mặc định
      area: undefined, // Reset area
    });
    setIsImportModalOpen(true);
  };

  const handleImportSubmit = async () => {
    try {
      const values = await importForm.validateFields();
      if (!importFileList.length) {
        message.error(t('area_list.import_modal.missing_file'));
        return;
      }

      setImportLoading(true);
      const formData = new FormData();
      formData.append('provinceId', values.provinceId);
      formData.append('districtId', values.districtId);
      if (values.area !== undefined && values.area !== null && values.area !== '') {
        formData.append('area', values.area);
      }
      if (values.area_type) {
        formData.append('area_type', values.area_type);
      }
      formData.append('file', importFileList[0]);

      const response = await axios.post('/api/express/areas/import-excel', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      message.success(t('area_list.import_modal.success', 'Đã tạo job import khu vực. Bạn có thể theo dõi tại trang Jobs.'));
      setIsImportModalOpen(false);
      resetImportState();

      if (response?.data?.redirect) {
        navigate(response.data.redirect);
      }
    } catch (error) {
      if (error?.errorFields) {
        return; // Form validation error already shown
      }
      const backendMessage = error?.response?.data?.error || error?.response?.data?.message;
      message.error(backendMessage || 'Không thể tạo job import khu vực.');
    } finally {
      setImportLoading(false);
    }
  };

  // Fetch areas from the API
  const fetchAreas = async (province, district, role, areasPerPage) => {
    setLoading(true);
    try {
      // Use selected filters if set, otherwise fallback to user's default filters
      const provinceFilter = provinceTouched ? selectedProvince : (province || null);
      const districtFilter = districtTouched ? selectedDistrict : (district || null);

      const response = await axios.get('/api/express/areas', {
        params: {
          search: debouncedSearchTerm,
          area_type: areaType,
          lat_min: latRange.min,
          lat_max: latRange.max,
          long_min: longRange.min,
          long_max: longRange.max,
          limit: areasPerPage, // Limit number of results per page
          offset: currentPage * areasPerPage,
          role,
          ...(provinceFilter ? { province: provinceFilter } : {}), // Only include if not empty
          ...(districtFilter ? { district: districtFilter } : {}), // Only include if not empty
        },
      });
      setAreas(response.data.areas);
      setTotalAreas(response.data.total); // Set total areas for pagination
      console.log(response.data.areas);
      console.log('total', response.data.areas.length);
      const regionResponse = await axios.get('/api/express/areas/provinces');
      setRegionList(regionResponse.data); // Set regions for the dropdown
      const districtResponse = await axios.get('/api/express/areas/districts');
      setDistrictList(districtResponse.data); // Set districts for the dropdown
      setFilteredDistrictList(districtResponse.data); // Initialize filtered districts
      console.log(regionResponse.data);
    } catch (error) {
      console.error('Error fetching areas:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userInfo) {
      setUserFilter({
        province: userInfo.province || '',
        district: userInfo.district || '',
        role: userInfo.role || '',
      });
      // Auto-set filter from userInfo only on first load (not if user has already interacted)
      if (!filterInitialized) {
        if (userInfo.province) {
          setSelectedProvince(userInfo.province);
        }
        if (userInfo.district) {
          setSelectedDistrict(userInfo.district);
        }
        setFilterInitialized(true);
      }
    } else {
      setUserFilter({ province: '', district: '', role: '' });
    }
  }, [userInfo, filterInitialized]);

  const userProvinceFilter = userFilter.province;
  const userDistrictFilter = userFilter.district;
  const userRoleFilter = userFilter.role;

  // Fetch areas when dependencies change (only after user info is loaded)
  useEffect(() => {
    if (!userInfoLoading) {
      fetchAreas(
        userProvinceFilter,
        userDistrictFilter,
        userRoleFilter,
        areasPerPage
      );
    }
  }, [debouncedSearchTerm, areaType, latRange, longRange, currentPage, areasPerPage, userProvinceFilter, userDistrictFilter, userRoleFilter, selectedProvince, selectedDistrict, userInfoLoading]);

  useEffect(() => {
    setCurrentPage(0);
  }, [debouncedSearchTerm]);

  // Check for areaId and action=update in query params to auto-open update modal
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const areaId = params.get('areaId');
    const action = params.get('action');

    if (areaId && action === 'update' && !isPopupOpen && !loading) {
      // Open modal first
      setIsPopupOpen(true);

      // Fetch area data and populate form
      const fetchAreaAndUpdate = async () => {
        try {
          // Ensure regionList and districtList are loaded first
          let regionsData = regionList;
          let districtsData = districtList;

          if (regionList.length === 0 || districtList.length === 0) {
            const [regionsRes, districtsRes] = await Promise.all([
              axios.get('/api/express/areas/provinces'),
              axios.get('/api/express/areas/districts')
            ]);
            regionsData = regionsRes.data;
            districtsData = districtsRes.data;
            setRegionList(regionsData);
            setDistrictList(districtsData);
          }

          const response = await axios.get(`/api/express/areas/area/${areaId}`);
          const areaData = response.data;

          // Filter districts based on the area's province
          const areaProvince = areaData.province || userInfo?.province;
          setFilteredDistrictList(
            districtsData.filter(
              (district) => district.province_id === areaProvince
            )
          );

          form.setFieldsValue({
            id: areaData.id || '',
            name: areaData.name || '',
            latitude: areaData.latitude || '',
            longitude: areaData.longitude || '',
            area: areaData.area || '',
            province: areaData.province || '',
            district: areaData.district || '',
            area_type: areaData.area_type || 'oyster',
          });

          // Auto-fill central meridian from province (now regionList is guaranteed to be loaded)
          if (areaProvince) {
            const province = regionsData.find(p => p.id === areaProvince);
            if (province?.central_meridian) {
              setProvinceCentralMeridian(province.central_meridian);
            } else {
              setProvinceCentralMeridian(null);
              if (coordinateType === 'vn2000') {
                setCoordinateType('wgs84');
                message.warning('Tỉnh này chưa có kinh tuyến trục, chỉ có thể sử dụng WGS84');
              }
            }
          } else {
            setProvinceCentralMeridian(null);
          }

          // Update map center and position
          if (areaData.latitude && areaData.longitude) {
            const newPos = [
              Number(areaData.latitude),
              Number(areaData.longitude),
            ];
            setMapCenter(newPos);
            setPosition(newPos);
          }
        } catch (error) {
          console.error('Error fetching area:', error);
          message.error('Không thể tải thông tin khu vực');
          setIsPopupOpen(false);
        }
      };

      fetchAreaAndUpdate();

      // Clean up URL after a short delay
      setTimeout(() => {
        navigate(location.pathname, { replace: true });
      }, 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, isPopupOpen, loading]);

  const handleAddArea = async (values) => {
    console.log('id', form.getFieldValue('id'));

    try {
      // Convert VN2000 to WGS84 if needed
      if (coordinateType === 'vn2000') {
        if (!provinceCentralMeridian) {
          message.error('Tỉnh này chưa có kinh tuyến trục, không thể sử dụng VN2000');
          return;
        }
        const xStr = (values.vn2000_x ?? '').toString().trim();
        const yStr = (values.vn2000_y ?? '').toString().trim();
        if (!xStr || !yStr) {
          message.error('Vui lòng nhập đủ X và Y (VN2000)');
          return;
        }
        const x = Number(xStr); const y = Number(yStr);
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          message.error('Tọa độ VN2000 không hợp lệ');
          return;
        }
        console.log('VN2000 Input - X (Easting):', x, 'Y (Northing):', y, 'Zone:', provinceCentralMeridian);
        const res = convertVN2000ToWGS84(x, y, provinceCentralMeridian);
        console.log('VN2000 Convert Result - Lat:', res?.lat, 'Lon:', res?.lon);
        if (!res) {
          message.error('Không thể chuyển đổi VN2000 → WGS84');
          return;
        }
        values.latitude = res.lat;
        values.longitude = res.lon;
      }

      // Validate required fields
      if (!values.name || !values.latitude || !values.longitude || !values.province) {
        console.error('Missing required fields');
        return;
      }

      // Validate district belongs to province
      if (values.district) {
        const selectedDistrict = districtList.find(d => d.id === values.district);
        if (selectedDistrict && selectedDistrict.province_id !== values.province) {
          console.error('District does not belong to selected province');
          return;
        }
      }

      if (form.getFieldValue('id')) {
        await axios.put(
          `/api/express/areas/${form.getFieldValue('id')}`,
          values
        );
      } else {
        await axios.post('/api/express/areas', values);
      }
      setIsPopupOpen(false);
      fetchAreas(userFilter.province, userFilter.district, userFilter.role, areasPerPage);
      form.resetFields();
      setProvinceCentralMeridian(null);
      setCoordinateType('wgs84');
      setNewArea({
        id: '',
        name: '',
        latitude: '',
        longitude: '',
        area: '',
        region: '',
        area_type: 'oyster',
      });
    } catch (error) {
      console.error('Error saving area:', error);
    }
  };

  const handleDelete = async (id) => {
    try {
      console.log('trying to delete');

      await axios.delete(`/api/express/areas/${id}`);
      setIsDeleteConfirmOpen(false); // Close delete confirmation
      fetchAreas(userFilter.province, userFilter.district, userFilter.role, areasPerPage); // Refresh the area list after deletion
    } catch (error) {
      console.error('Error deleting area:', error);
    }
  };

  const handleUpdate = (id) => {
    const areaToUpdate = areas.find((area) => area.id === id);
    console.log(areaToUpdate);

    // Filter districts based on the area's province, not the current user's province
    const areaProvince = areaToUpdate.province || userInfo?.province;
    setFilteredDistrictList(
      districtList.filter(
        (district) => district.province_id === areaProvince
      )
    );

    form.setFieldsValue({
      id: areaToUpdate.id || '',
      name: areaToUpdate.name || '',
      latitude: areaToUpdate.latitude || '',
      longitude: areaToUpdate.longitude || '',
      area: areaToUpdate.area || '',
      province: areaToUpdate.province || '',
      district: areaToUpdate.district || '',
      area_type: areaToUpdate.area_type || 'oyster',
    });

    // Auto-fill central meridian from province when editing
    if (areaProvince) {
      setCentralMeridianFromProvince(areaProvince);
    } else {
      setProvinceCentralMeridian(null);
    }

    // Update map center and position when editing an area
    if (areaToUpdate.latitude && areaToUpdate.longitude) {
      const newPos = [
        Number(areaToUpdate.latitude),
        Number(areaToUpdate.longitude),
      ];
      setMapCenter(newPos);
      setPosition(newPos);
    }

    setIsPopupOpen(true);
  };

  const handleSearch = (e) => {
    setSearchTerm(e.target.value);
  };

  const totalPages = Math.ceil(totalAreas / areasPerPage);
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

  useEffect(() => {
    if (map) {
      const interval = setInterval(() => {
        map.invalidateSize(true);
      }, 400);

      return () => clearInterval(interval);
    }
  }, [map]);

  function MapUpdater({ center }) {
    const map = useMap();
    useEffect(() => {
      map.setView(center);
    }, [center, map]);
    return null;
  }

  function LocationMarker({ setCoordinates }) {
    useMapEvents({
      click(e) {
        setPosition([e.latlng.lat, e.latlng.lng]);
        setCoordinates(e.latlng);
      },
    });

    return position ? <Marker position={position} /> : null;
  }

  // Table columns for Ant Design Table
  const columns = [
    { title: t('area_list.table.name'), dataIndex: 'name', key: 'name' },
    {
      title: t('area_list.table.type'),
      key: 'area_type',
      render: (_, area) => `${t(`area_list.filter.${area.area_type}`)}`,
    },
    { title: t('area_list.table.lat'), dataIndex: 'latitude', key: 'latitude' },
    {
      title: t('area_list.table.long'),
      dataIndex: 'longitude',
      key: 'longitude',
    },
    {
      title: t('area_list.table.address'),
      key: 'address',
      render: (_, area) => `${area.Province?.name},${area.District?.name}`,
    },
    {
      title: t('area_list.table.actions'),
      key: 'actions',
      fixed: 'right',
      width: 'min-content',
      align: 'center',
      render: (_, area) => (
        <Space>
          <Tooltip title={t('area_list.popup.update')}>
            <Button
              type="primary"
              icon={<EditOutlined />}
              size="middle"
              onClick={() => handleUpdate(area.id)}
            />
          </Tooltip>
          <Tooltip title={t('userList.email')}>
            <Button
              type="default"
              icon={<MailOutlined />}
              size="middle"
              onClick={() => navigate(`/email-subscription/${area.id}`)}
            />
          </Tooltip>
          <Tooltip title={t('area_list.popup.delete')}>
            <Button
              type="primary"
              danger
              icon={<DeleteOutlined />}
              size="middle"
              onClick={() => {
                setIsDeleteConfirmOpen(true);
                console.log(area);
                setSelectedArea(area);
              }}
            />
          </Tooltip>
        </Space>
      ),
    },
  ];

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
          {t('area_list.title') || 'Danh sách khu vực'}
        </Title>
        {/* Hàng đầu: Tìm kiếm, loại khu vực và nút thêm */}
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col xs={24} sm={12} md={14}>
            <Input
              size="large"
              placeholder={
                t('area_list.search_placeholder') || 'Tìm kiếm theo tên khu vực'
              }
              value={searchTerm}
              onChange={handleSearch}
              type="text"
              allowClear
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Select
              size="large"
              value={areaType}
              onChange={setAreaType}
              style={{ width: '100%' }}
              allowClear
              placeholder={t('area_list.type_placeholder') || 'Tất cả'}
            >
              <Option value="">{t('area_list.type_all') || 'Tất cả'}</Option>
              <Option value="oyster">{t('area_list.filter.oyster') || 'Oyster'}</Option>
              <Option value="cobia">{t('area_list.filter.cobia') || 'Cobia'}</Option>
            </Select>
          </Col>
          <Col xs={12} sm={6} md={2}>
            <Tooltip title={t('area_list.add_button') || 'Thêm khu vực mới'}>
              <Button
                type="primary"
                size="large"
                icon={<PlusOutlined />}
                onClick={() => {
                  form.resetFields();

                  form.setFieldValue('area_type', 'oyster');

                  if (userInfo?.province) {
                    form.setFieldValue('province', userInfo.province);
                    setFilteredDistrictList(
                      districtList.filter(
                        (district) =>
                          String(district.province_id) === String(userInfo.province)
                      )
                    );
                    // Auto-fill central meridian from province
                    setCentralMeridianFromProvince(userInfo.province);
                  } else {
                    setFilteredDistrictList(districtList);
                    setProvinceCentralMeridian(null);
                  }

                  if (userInfo?.district) {
                    form.setFieldValue('district', userInfo.district);
                  }

                  setMapCenter([10.762622, 106.660172]);
                  setPosition(null);

                  setIsPopupOpen(true);
                }}
                block
              />
            </Tooltip>
          </Col>
          <Col xs={12} sm={6} md={2}>
            <Tooltip title={t('area_list.import_button') || 'Nhập khu vực từ Excel'}>
              <Button
                size="large"
                icon={<UploadOutlined />}
                onClick={handleOpenImportModal}
                block
              />
            </Tooltip>
          </Col>
        </Row>

        {/* Hàng thứ hai: Filter theo tọa độ và tỉnh/huyện */}
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col xs={24} sm={12} md={4}>
            <Input
              size="large"
              placeholder={t('area_list.filter.min_lat') || 'Vĩ độ tối thiểu'}
              value={latRange.min}
              onChange={(e) =>
                setLatRange({ ...latRange, min: e.target.value })
              }
              type="number"
            />
          </Col>
          <Col xs={24} sm={12} md={4}>
            <Input
              size="large"
              placeholder={t('area_list.filter.max_lat') || 'Vĩ độ tối đa'}
              value={latRange.max}
              onChange={(e) =>
                setLatRange({ ...latRange, max: e.target.value })
              }
              type="number"
            />
          </Col>
          <Col xs={24} sm={12} md={4}>
            <Input
              size="large"
              placeholder={
                t('area_list.filter.min_long') || 'Kinh độ tối thiểu'
              }
              value={longRange.min}
              onChange={(e) =>
                setLongRange({ ...longRange, min: e.target.value })
              }
              type="number"
            />
          </Col>
          <Col xs={24} sm={12} md={4}>
            <Input
              size="large"
              placeholder={t('area_list.filter.max_long') || 'Kinh độ tối đa'}
              value={longRange.max}
              onChange={(e) =>
                setLongRange({ ...longRange, max: e.target.value })
              }
              type="number"
            />
          </Col>
          <Col xs={24} sm={12} md={4}>
            <Select
              placeholder="Lọc theo tỉnh/thành phố"
              allowClear
              size="large"
              style={{ width: '100%' }}
              value={selectedProvince}
              onChange={(value) => {
                setProvinceTouched(true);
                setSelectedProvince(value ?? null);
                setSelectedDistrict(null);
                setDistrictTouched(true);
                setCurrentPage(0);
              }}
              disabled={userInfo?.role !== 'admin'}
              showSearch
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={regionList.map((province) => ({
                value: province.id,
                label: province.name,
              }))}
            />
          </Col>
          <Col xs={24} sm={12} md={4}>
            <Select
              placeholder="Lọc theo quận/huyện"
              allowClear
              size="large"
              style={{ width: '100%' }}
              value={selectedDistrict}
              onChange={(value) => {
                setDistrictTouched(true);
                setSelectedDistrict(value ?? null);
                setCurrentPage(0);
              }}
              loading={!districtList.length}
              disabled={
                !selectedProvince ||
                !(
                  userInfo?.role === 'admin' ||
                  (userInfo?.role === 'manager' && !userInfo?.district)
                )
              }
              showSearch
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
              options={districtList
                .filter((district) =>
                  !selectedProvince || String(district.province_id) === String(selectedProvince)
                )
                .map((district) => ({
                  value: district.id,
                  label: district.name,
                }))}
            />
          </Col>
        </Row>
        <Spin spinning={loading}>
          <Table
            columns={columns}
            dataSource={areas}
            rowKey="id"
            pagination={false}
            style={{ width: '100%' }}
            scroll={{ x: 'max-content' }}
          />
        </Spin>
        <div style={{ margin: '16px 0', textAlign: 'center' }}>
          <Pagination
            current={currentPage + 1}
            total={totalAreas}
            pageSize={areasPerPage}
            onChange={(page, pageSize) => { setCurrentPage(page - 1); setAreasPerPage(pageSize); }}
            showSizeChanger={true}
            pageSizeOptions={[10, 20, 50, 100]}
          />
        </div>

        <Modal
          open={isImportModalOpen}
          title={t('area_list.import_modal.title') || 'Import khu vực từ Excel'}
          onCancel={() => {
            setIsImportModalOpen(false);
            resetImportState();
          }}
          onOk={handleImportSubmit}
          confirmLoading={importLoading}
          okText={t('area_list.import_modal.ok') || 'Tạo job'}
          cancelText={t('common.cancel') || 'Hủy'}
          width={640}
          destroyOnHidden
        >
          <Tabs
            defaultActiveKey="xlsx"
            items={[{
              key: 'xlsx',
              label: 'Excel (.xlsx)',
              children: (
                <Form
                  form={importForm}
                  layout="vertical"
                  onFinish={handleImportSubmit}
                >
                  <Form.Item
                    label={t('area_list.popup.select_province') || 'Tỉnh'}
                    name="provinceId"
                    rules={[{ required: true, message: 'Vui lòng chọn tỉnh' }]}
                  >
                    <Select
                      placeholder={t('area_list.popup.select_province') || 'Chọn tỉnh'}
                      disabled={userInfo?.role === 'manager'}
                      onChange={(value) => {
                        setImportProvince(value);
                        setImportDistrict('');
                        importForm.setFieldsValue({ districtId: undefined });
                      }}
                      showSearch
                      optionFilterProp="children"
                    >
                      {regionList.map((region) => (
                        <Option key={region.id} value={region.id}>
                          {region.name}
                        </Option>
                      ))}
                    </Select>
                  </Form.Item>

                  <Form.Item
                    label={t('area_list.popup.select_district') || 'Huyện'}
                    name="districtId"
                    rules={[{ required: true, message: 'Vui lòng chọn huyện' }]}
                  >
                    <Select
                      placeholder={t('area_list.popup.select_district') || 'Chọn huyện'}
                      onChange={(value) => {
                        setImportDistrict(value);
                      }}
                      showSearch
                      optionFilterProp="children"
                      disabled={
                        !importProvince ||
                        (userInfo?.role === 'manager' && !!userInfo?.district)
                      }
                    >
                      {filteredImportDistricts.map((district) => (
                        <Option key={district.id} value={district.id}>
                          {district.name}
                        </Option>
                      ))}
                    </Select>
                  </Form.Item>

                  <Form.Item
                    label="Diện tích (ha)"
                    name="area"
                    rules={[
                      {
                        validator: (_, value) => {
                          if (!value || value === '') return Promise.resolve();
                          const num = parseFloat(value);
                          if (isNaN(num) || num < 0) {
                            return Promise.reject(new Error('Diện tích phải là số dương'));
                          }
                          return Promise.resolve();
                        },
                      },
                    ]}
                    normalize={(value) => {
                      if (!value) return value;
                      return value.toString().replace(/[^0-9.]/g, '');
                    }}
                  >
                    <Input type="number" placeholder="Nhập diện tích (ha)" step="0.01" min="0" />
                  </Form.Item>

                  <Form.Item
                    label={t('area_list.filter.type') || 'Loại khu vực'}
                    name="area_type"
                    initialValue="oyster"
                  >
                    <Select>
                      <Option value="oyster">{t('area_list.filter.oyster') || 'Oyster'}</Option>
                      <Option value="cobia">{t('area_list.filter.cobia') || 'Cobia'}</Option>
                    </Select>
                  </Form.Item>

                  <Form.Item
                    label={t('area_list.import_modal.file') || 'File Excel (.xlsx)'}
                    required
                  >
                    <Upload {...importUploadProps}>
                      <Button icon={<UploadOutlined />}>{t('area_list.import_modal.select_file') || 'Chọn file'}</Button>
                    </Upload>
                    <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
                      {t('area_list.import_modal.hint')}
                    </Typography.Paragraph>
                  </Form.Item>
                </Form>
              )
            }]}
          />
        </Modal>

        {/* Add/Update Area Modal */}
        <Modal
          open={isPopupOpen}
          title={
            form.getFieldValue('id')
              ? t('area_list.popup.update')
              : t('area_list.popup.add')
          }
          onCancel={() => {
            setIsPopupOpen(false);
            form.resetFields();
            setProvinceCentralMeridian(null);
            setCoordinateType('wgs84');
          }}
          footer={null}
          styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
          width={700}
        >
          <Row gutter={[24, 24]}>
            <Col xs={24} md={12}>
              <Form
                form={form}
                layout="vertical"
                style={{ overflowY: 'auto' }}
                onFinish={handleAddArea}
              >
                <Form.Item
                  label={t('area_list.popup.select_province')}
                  name="province"
                  rules={[{ required: true, message: 'Province is required' }]}
                >
                  <Select
                    disabled={userInfo?.role === 'manager'}
                    onChange={async (value) => {
                      form.setFieldsValue({ district: '' });
                      // Filter districts when province changes
                      setFilteredDistrictList(
                        districtList.filter(
                          (district) => district.province_id === value
                        )
                      );
                      // Lấy central_meridian từ province
                      setCentralMeridianFromProvince(value);
                    }}
                  >
                    {regionList.map((region) => (
                      <Option key={region.id} value={region.id}>
                        {region.name}
                      </Option>
                    ))}
                  </Select>
                </Form.Item>
                <Form.Item
                  label={t('area_list.popup.select_district')}
                  name="district"
                >
                  <Select
                    disabled={
                      userInfo?.role === 'manager' &&
                      userInfo?.district
                    }
                  >
                    {filteredDistrictList.map((region) => (
                      <Option key={region.id} value={region.id}>
                        {region.name}
                      </Option>
                    ))}
                  </Select>
                </Form.Item>
                <Form.Item
                  label="Area Name"
                  name="name"
                  rules={[{ required: true }]}
                >
                  <Input />
                </Form.Item>
                <Form.Item label="Coordinate Type">
                  <Select
                    value={coordinateType}
                    onChange={setCoordinateType}
                    disabled={!provinceCentralMeridian && coordinateType === 'vn2000'}
                  >
                    <Option value="wgs84">WGS84 (lat/lon)</Option>
                    <Option
                      value="vn2000"
                      disabled={!provinceCentralMeridian}
                    >
                      VN2000 {provinceCentralMeridian ? `(TM ${provinceCentralMeridian}°)` : '(Cần chọn tỉnh có kinh tuyến trục)'}
                    </Option>
                  </Select>
                </Form.Item>
                {coordinateType === 'vn2000' && provinceCentralMeridian && (
                  <>
                    <Form.Item
                      label={`VN2000 TM ${provinceCentralMeridian}° (tự động)`}
                    >
                      <Input disabled value={`Kinh tuyến trục: ${provinceCentralMeridian}°`} />
                    </Form.Item>
                    <Form.Item label="VN2000 X (Easting, m)" name="vn2000_x" rules={[{ required: true }]}>
                      <Input
                        type="number"
                        onBlur={(e) => {
                          const x = parseFloat(e.target.value);
                          const y = parseFloat(form.getFieldValue('vn2000_y'));
                          if (!isNaN(x) && !isNaN(y) && provinceCentralMeridian) {
                            const res = convertVN2000ToWGS84(x, y, provinceCentralMeridian);
                            if (res) {
                              form.setFieldsValue({
                                latitude: res.lat,
                                longitude: res.lon
                              });
                              // Kéo map đến tọa độ đã chuyển đổi
                              const newCenter = [res.lat, res.lon];
                              setMapCenter(newCenter);
                              if (map) {
                                map.setView(newCenter, map.getZoom() || 10);
                              }
                            }
                          }
                        }}
                      />
                    </Form.Item>
                    <Form.Item label="VN2000 Y (Northing, m)" name="vn2000_y" rules={[{ required: true }]}>
                      <Input
                        type="number"
                        onBlur={(e) => {
                          const y = parseFloat(e.target.value);
                          const x = parseFloat(form.getFieldValue('vn2000_x'));
                          if (!isNaN(x) && !isNaN(y) && provinceCentralMeridian) {
                            const res = convertVN2000ToWGS84(x, y, provinceCentralMeridian);
                            if (res) {
                              form.setFieldsValue({
                                latitude: res.lat,
                                longitude: res.lon
                              });
                              // Kéo map đến tọa độ đã chuyển đổi
                              const newCenter = [res.lat, res.lon];
                              setMapCenter(newCenter);
                              if (map) {
                                map.setView(newCenter, map.getZoom() || 10);
                              }
                            }
                          }
                        }}
                      />
                    </Form.Item>
                  </>
                )}
                <Form.Item
                  label="Latitude"
                  name="latitude"
                  rules={[{ required: coordinateType === 'wgs84' }]}
                >
                  <Input type="number" disabled={coordinateType === 'vn2000'} />
                </Form.Item>
                <Form.Item
                  label="Longitude"
                  name="longitude"
                  rules={[{ required: coordinateType === 'wgs84' }]}
                >
                  <Input type="number" disabled={coordinateType === 'vn2000'} />
                </Form.Item>
                <Form.Item label="Area's area" name="area">
                  <Input type="number" />
                </Form.Item>

                <Form.Item label={t('area_list.filter.type')} name="area_type">
                  <Select disabled={!!form.getFieldValue('id')}>
                    <Option value="oyster">
                      {t('area_list.filter.oyster')}
                    </Option>
                    <Option value="cobia">{t('area_list.filter.cobia')}</Option>
                  </Select>
                </Form.Item>
                <Form.Item>
                  <Space>
                    <Button type="primary" htmlType="submit">
                      {t('area_list.popup.save')}
                    </Button>
                    <Button
                      onClick={() => {
                        setIsPopupOpen(false);
                        form.resetFields();
                      }}
                    >
                      Cancel
                    </Button>
                  </Space>
                </Form.Item>
              </Form>
            </Col>
            <Col xs={24} md={12}>
              <div style={{ height: '400px' }}>
                <MapContainer
                  center={mapCenter}
                  zoom={30}
                  style={{ height: '100%', width: '100%' }}
                  ref={setMap}
                >
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution="&copy; OpenStreetMap contributors"
                  />
                  <MapUpdater center={mapCenter} />
                  <Marker position={mapCenter} />
                  <LocationMarker
                    setCoordinates={(latlng) => {
                      form.setFieldsValue({
                        latitude: latlng.lat,
                        longitude: latlng.lng,
                      });
                      setMapCenter([latlng.lat, latlng.lng]);
                      setPosition(latlng);
                    }}
                  />
                </MapContainer>
              </div>
            </Col>
          </Row>
        </Modal>

        {/* Delete Confirmation Modal */}
        <Modal
          open={isDeleteConfirmOpen}
          title={t('area_list.confirm_delete.title')}
          onCancel={() => setIsDeleteConfirmOpen(false)}
          onOk={() => handleDelete(selectedArea.id)}
          okText={t('area_list.confirm_delete.yes')}
          cancelText={t('area_list.confirm_delete.no')}
        >
          <p>
            {t('area_list.confirm_delete.title')} {selectedArea?.name}?
          </p>
        </Modal>
      </Card>
    </div>
  );
};

export default AreaList;
