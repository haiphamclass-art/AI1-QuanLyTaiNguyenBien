import React, { useState, useEffect } from 'react';
import axios from '../axios';
import { useSelector } from 'react-redux';
import { toast } from 'react-toastify';
import { useTranslation } from 'react-i18next';
import {
  Form,
  Input,
  Button,
  Select,
  Tabs,
  Upload,
  Card,
  Typography,
  message,
  Spin,
} from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
const { Option } = Select;
const { Title } = Typography;

const getApiErrorMessage = (error, fallbackMessage) => {
  return (
    error?.response?.data?.error ||
    error?.response?.data?.message ||
    error?.message ||
    fallbackMessage
  );
};

const CreateNewPrediction = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useSelector((state) => state.auth);
  const [userId, setUserId] = useState(null);
  const [areas, setAreas] = useState([]);
  const [selectedAreaId, setSelectedAreaId] = useState('');
  const [areaType, setAreaType] = useState('');
  const [modelName, setModelName] = useState('');
  const [selectedModel, setSelectedModel] = useState(null);
  const [modelElements, setModelElements] = useState([]);
  const [inputs, setInputs] = useState({});
  const [csvElements, setCsvElements] = useState([]);
  const [excelFile, setExcelFile] = useState(null);
  const [excelFile2, setExcelFile2] = useState(null);
  const [activeTab, setActiveTab] = useState('single');
  const [singleForm] = Form.useForm();
  const [batchForm] = Form.useForm();
  const [isBatchLoading, setIsBatchLoading] = useState(false);
  const [isSingleLoading, setIsSingleLoading] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const [allModels, setAllModels] = useState([]);

  // Fetch available ML models with their nature elements
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const response = await axios.get('/api/express/ml-models', {
          params: { is_active: true }
        });
        const models = response.data.data || [];
        
        // Only include models that have files (model_file_path is not null)
        const modelsWithFiles = models
          .filter(model => model.model_file_path || model.google_drive_download_link)
          .map(model => ({
            value: model.id,
            label: model.name,
            type: model.area_type,
            path: model.model_file_path,
            natureElements: model.natureElements || [],
          }));
        
        setAllModels(modelsWithFiles);
      } catch (error) {
        console.error('Error fetching models:', error);
        message.error('Không thể tải danh sách model');
      }
    };
    fetchModels();
  }, []);

  // Handle model selection - load nature elements
  const handleModelSelect = (modelId) => {
    const model = allModels.find(m => m.value === modelId);
    if (model) {
      setSelectedModel(model);
      
      // Sort nature elements by input_order
      const sortedElements = (model.natureElements || [])
        .sort((a, b) => {
          const orderA = a.ModelNatureElement?.input_order ?? 0;
          const orderB = b.ModelNatureElement?.input_order ?? 0;
          return orderA - orderB;
        });
      
      setModelElements(sortedElements);
      
      // Initialize inputs with default values
      const initialInputs = {};
      sortedElements.forEach(element => {
        initialInputs[element.name] = 0;
      });
      setInputs(initialInputs);
    } else {
      setSelectedModel(null);
      setModelElements([]);
      setInputs({});
    }
  };

  useEffect(() => {
    if (user?.id) {
      setUserId(user.id);
    }
  }, [user]);

  useEffect(() => {
    const fetchAreas = async () => {
      try {
        const response = await axios.get('api/express/areas/all');
        setAreas(response.data.areas || []);
      } catch (error) {
        message.error('Error fetching areas:', error);
      }
    };
    fetchAreas();
  }, []);

  // Check for areaId in query params to auto-select area
  useEffect(() => {
    const params = new URLSearchParams(location.search);

    const areaId = params.get('areaId');
    console.log('selectedAreaId', selectedAreaId, 'areaId', areaId);

    if (areaId && !selectedAreaId && areas.length > 0) {
      // Fetch area data by ID and set it
      const fetchAreaAndSelect = async () => {
        try {
          const areaData = areas.find((a) => a.id === +areaId);
          if (!areaData) {
            message.error('Khu vực không tồn tại');
            return;
          }

          // Verify area belongs to user's region
          setSelectedAreaId(areaData.id);
          setAreaType(areaData.area_type || '');
          singleForm.setFieldsValue({ areaId: areaData.id });
        } catch (error) {
          console.error('Error fetching area:', error);
          message.error('Không thể tải thông tin khu vực');
        }
      };

      fetchAreaAndSelect();
    }
  }, [location.search, selectedAreaId, areas]);

  const handleCSVUpload = ({ file }) => {
    if (file.status === 'removed') {
      setCsvElements([]);
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const csvElements = text.split(/\r?\n/).filter(Boolean);
      setCsvElements(csvElements);
      console.log(csvElements);
    };
    reader.readAsText(file);
  };

  const handleExcelUpload = ({ file }) => {
    if (file.status === 'removed') {
      setExcelFile(null);
      return;
    }
    // antd Upload wraps the native File in file.originFileObj when beforeUpload returns false
    setExcelFile(file.originFileObj || file);
  };

  const handleExcelUpload2 = ({ file }) => {
    if (file.status === 'removed') {
      setExcelFile2(null);
      return;
    }
    setExcelFile2(file.originFileObj || file);
  };

  const handleSubmitBatch = async (values) => {
    setIsBatchLoading(true);
    setBatchProgress(0);
    try {
      const { userIdForm, areaId, modelName } = values;
      if (!areaId || !modelName)
        throw new Error('You need to select area and model');

      setBatchProgress(20);
      const headers = csvElements[0].split(',');
      const data = csvElements.slice(1).map((line) => {
        const parts = line.split(',');
        const obj = {};
        for (let i = 0; i < headers.length; i++) {
          obj[headers[i]] = parseFloat(parts[i]);
        }
        console.log('data', obj);

        return obj;
      });
      console.log('data', data);

      setBatchProgress(50);
      await axios.post('api/express/predictions/batch', {
        userId,
        areaId,
        modelName,
        data,
      });

      setBatchProgress(100);
      message.success(`Đã tạo thành công ${data.length} dự đoán từ file CSV!`);
      batchForm.resetFields();
      setCsvElements([]);
      navigate('/dashboard');
    } catch (error) {
      message.error(getApiErrorMessage(error, 'Không thể tạo dự đoán từ file CSV'));
    } finally {
      setIsBatchLoading(false);
      setBatchProgress(0);
    }
  };

  const handleSubmitExcel = async (values) => {
    console.log('values', values);

    setIsBatchLoading(true);
    setBatchProgress(0);
    try {
      const { areaId, modelName } = values;
      if (!areaId || !modelName) throw new Error('You need to select area and model');
      if (!excelFile) throw new Error('You need to upload an Excel file');

      const formData = new FormData();
      formData.append('userId', userId);
      formData.append('areaId', areaId);
      formData.append('modelName', modelName);
      formData.append('file', excelFile);

      setBatchProgress(30);
      const response = await axios.post('api/express/predictions/excel', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setBatchProgress(100);
      const { message: responseMessage, redirect } = response.data || {};
      message.success(responseMessage || 'Vui lòng đợi trong khi hệ thống đang xử lý và tạo dự đoán mới. Bạn có thể theo dõi tiến trình tại trang Jobs.');
      batchForm.resetFields();
      setExcelFile(null);
      setTimeout(() => {
        navigate(redirect || '/jobs');
      }, 1500);
    } catch (error) {
      message.error(getApiErrorMessage(error, 'Không thể tạo dự đoán từ file Excel'));
    } finally {
      setIsBatchLoading(false);
      setBatchProgress(0);
    }
  };

  const handleSubmitExcel2 = async (values) => {
    setIsBatchLoading(true);
    setBatchProgress(0);
    try {
      const { modelName } = values;
      if (!modelName) throw new Error('You need to select model');
      if (!excelFile2) throw new Error('You need to upload an Excel file');

      const formData = new FormData();
      formData.append('userId', userId);
      formData.append('modelName', modelName);
      formData.append('file', excelFile2);

      setBatchProgress(30);
      const response = await axios.post('api/express/predictions/excel2', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setBatchProgress(100);
      const { message: responseMessage, redirect } = response.data || {};
      message.success(responseMessage || 'Vui lòng đợi trong khi hệ thống đang xử lý và tạo dự đoán mới. Bạn có thể theo dõi tiến trình tại trang Jobs.');
      batchForm.resetFields();
      setExcelFile2(null);
      setTimeout(() => {
        navigate(redirect || '/jobs');
      }, 1500);
    } catch (error) {
      message.error(getApiErrorMessage(error, 'Không thể tạo dự đoán từ file Excel'));
    } finally {
      setIsBatchLoading(false);
      setBatchProgress(0);
    }
  };

  const handleSubmitSingle = async (values) => {
    setIsSingleLoading(true);
    try {
      const { userIdForm, areaId, modelName, ...inputValues } = values;
      await axios.post('api/express/predictions', {
        userId,
        areaId,
        modelName,
        inputs: inputValues,
      });
      message.success('Created single prediction successful!');
      singleForm.resetFields();
      navigate('/dashboard');
    } catch (e) {
      message.error(getApiErrorMessage(e, 'Không thể tạo dự đoán'));
    } finally {
      setIsSingleLoading(false);
    }
  };

  const filteredModels = areaType
    ? allModels.filter((m) => m.type === areaType)
    : [];

  return (
    <Card style={{ maxWidth: 700, margin: '0 auto', marginTop: 32 }}>
      <Title level={3} style={{ textAlign: 'center', marginBottom: 24 }}>
        {t('prediction_form.title')}
      </Title>
      <Spin
        spinning={isBatchLoading || isSingleLoading}
        tip={
          isBatchLoading
            ? `Đang xử lý dự đoán hàng loạt... ${batchProgress}%`
            : 'Đang tạo dự đoán...'
        }
      >
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          disabled={isBatchLoading || isSingleLoading}
          items={[
            {
              key: 'single',
              label: t('prediction_form.tabs.single'),
              children: (
                <Form
                  form={singleForm}
                  layout="vertical"
                  onFinish={handleSubmitSingle}
                  initialValues={{ userId }}
                  disabled={isSingleLoading}
                >
                  <Form.Item name="userIdForm" style={{ display: 'none' }}>
                    <Input type="hidden" value={userId} />
                  </Form.Item>
                  <Form.Item
                    label={t('prediction_form.select_area')}
                    name="areaId"
                    rules={[
                      {
                        required: true,
                        message: t('prediction_form.select_area'),
                      },
                    ]}
                  >
                    <Select
                      placeholder={t('prediction_form.select_area')}
                      onChange={(val) => {
                        setSelectedAreaId(val);
                        const area = areas.find((a) => a.id === +val);
                        setAreaType(area?.area_type);
                        singleForm.setFieldsValue({ modelName: undefined });
                      }}
                    >
                      {areas.map((area) => (
                        <Option key={area.id} value={area.id}>
                          {area.name}
                        </Option>
                      ))}
                    </Select>
                  </Form.Item>
                  <Form.Item
                    label={t('prediction_form.select_model')}
                    name="modelName"
                    rules={[
                      {
                        required: true,
                        message: t('prediction_form.select_model'),
                      },
                    ]}
                  >
                    <Select
                      placeholder={t('prediction_form.select_model')}
                      disabled={!areaType}
                      onChange={(value) => {
                        handleModelSelect(value);
                        setModelName(value);
                      }}
                    >
                      {filteredModels.map((model) => (
                        <Option key={model.value} value={model.value}>
                          {model.label}
                        </Option>
                      ))}
                    </Select>
                  </Form.Item>
                  
                  {selectedModel && modelElements.length > 0 && (
                    <>
                      <div style={{ 
                        marginBottom: 16, 
                        padding: 12, 
                        background: '#f0f2f5', 
                        borderRadius: 4 
                      }}>
                        <strong>Các yếu tố cần nhập ({modelElements.length}):</strong>
                      </div>
                      {modelElements.map((element) => (
                        <Form.Item
                          key={element.name}
                          label={
                            <span>
                              {element.name}
                              {element.ModelNatureElement?.is_required && (
                                <span style={{ color: 'red' }}> *</span>
                              )}
                              {element.unit && (
                                <span style={{ color: '#999', marginLeft: 4 }}>
                                  ({element.unit})
                                </span>
                              )}
                            </span>
                          }
                          name={element.name}
                          rules={[
                            { 
                              required: element.ModelNatureElement?.is_required ?? true, 
                              message: `${element.name} là bắt buộc`
                            },
                          ]}
                          extra={element.description}
                        >
                          <Input 
                            type="number" 
                            step="any"
                            placeholder={`Nhập giá trị ${element.name}`}
                          />
                        </Form.Item>
                      ))}
                    </>
                  )}
                  <Form.Item>
                    <Button
                      type="primary"
                      htmlType="submit"
                      block
                      loading={isSingleLoading}
                      disabled={isSingleLoading}
                    >
                      {isSingleLoading ? 'Đang tạo dự đoán...' : t('prediction_form.submit_single')}
                    </Button>
                  </Form.Item>
                </Form>
              ),
            },
            {
              key: 'batch',
              label: t('prediction_form.tabs.batch'),
              children: (
                <Form
                  form={batchForm}
                  layout="vertical"
                  onFinish={activeTab === 'batch' ? handleSubmitBatch : undefined}
                  initialValues={{ userId }}
                  disabled={isBatchLoading}
                >
                  <Form.Item name="userIdForm" style={{ display: 'none' }}>
                    <Input type="hidden" value={userId} />
                  </Form.Item>
                  <Form.Item
                    label={t('prediction_form.select_area')}
                    name="areaId"
                    rules={[
                      {
                        required: true,
                        message: t('prediction_form.select_area'),
                      },
                    ]}
                  >
                    <Select
                      placeholder={t('prediction_form.select_area')}
                      onChange={(val) => {
                        setSelectedAreaId(val);
                        const area = areas.find((a) => a.id === +val);
                        setAreaType(area?.area_type);
                        batchForm.setFieldsValue({ modelName: undefined });
                      }}
                    >
                      {areas.map((area) => (
                        <Option key={area.id} value={area.id}>
                          {area.name}
                        </Option>
                      ))}
                    </Select>
                  </Form.Item>
                  <Form.Item
                    label={t('prediction_form.select_model')}
                    name="modelName"
                    rules={[
                      {
                        required: true,
                        message: t('prediction_form.select_model'),
                      },
                    ]}
                  >
                    <Select
                      placeholder={t('prediction_form.select_model')}
                      disabled={!areaType}
                    >
                      {filteredModels.map((model) => (
                        <Option key={model.value} value={model.value}>
                          {model.label}
                        </Option>
                      ))}
                    </Select>
                  </Form.Item>
                  <Form.Item
                    label={t('prediction_form.upload_csv') || 'Upload CSV'}
                    name="csv"
                    rules={[
                      {
                        required: true,
                        message: t('prediction_form.upload_csv') || 'Upload CSV',
                      },
                    ]}
                  >
                    <Upload
                      accept=".csv"
                      beforeUpload={() => false}
                      onChange={handleCSVUpload}
                      maxCount={1}
                      fileList={
                        csvElements.length > 0
                          ? [{ name: 'data.csv', status: 'done' }]
                          : []
                      }
                    >
                      <Button icon={<UploadOutlined />}>
                        {t('prediction_form.upload_csv') || 'Upload CSV'}
                      </Button>
                    </Upload>
                  </Form.Item>
                  <Form.Item>
                    <Button
                      type="primary"
                      htmlType="submit"
                      block
                      loading={isBatchLoading}
                      disabled={isBatchLoading}
                    >
                      {isBatchLoading ? 'Đang tạo dự đoán hàng loạt...' : t('prediction_form.submit_batch')}
                    </Button>
                  </Form.Item>
                </Form>
              ),
            },
            {
              key: 'excel1',
              label: 'Mẫu 1',
              children: (
                <Form
                  form={batchForm}
                  layout="vertical"
                  onFinish={handleSubmitExcel}
                  initialValues={{ userId }}
                  disabled={isBatchLoading}
                >
                  <Form.Item name="userIdForm" style={{ display: 'none' }}>
                    <Input type="hidden" value={userId} />
                  </Form.Item>
                  <Form.Item
                    label={t('prediction_form.select_area')}
                    name="areaId"
                    rules={[
                      { required: true, message: t('prediction_form.select_area') },
                    ]}
                  >
                    <Select
                      placeholder={t('prediction_form.select_area')}
                      onChange={(val) => {
                        setSelectedAreaId(val);
                        const area = areas.find((a) => a.id === +val);
                        setAreaType(area?.area_type);
                        batchForm.setFieldsValue({ modelName: undefined });
                      }}
                    >
                      {areas.map((area) => (
                        <Option key={area.id} value={area.id}>
                          {area.name}
                        </Option>
                      ))}
                    </Select>
                  </Form.Item>
                  <Form.Item
                    label={t('prediction_form.select_model')}
                    name="modelName"
                    rules={[
                      { required: true, message: t('prediction_form.select_model') },
                    ]}
                  >
                    <Select
                      placeholder={t('prediction_form.select_model')}
                      disabled={!areaType}
                    >
                      {filteredModels.map((model) => (
                        <Option key={model.value} value={model.value}>
                          {model.label}
                        </Option>
                      ))}
                    </Select>
                  </Form.Item>
                  <Form.Item
                    label={'Upload Excel (.xlsx/.xls)'}
                  >
                    <Upload
                      accept=".xlsx,.xls"
                      beforeUpload={() => false}
                      onChange={handleExcelUpload}
                      maxCount={1}
                      fileList={excelFile ? [{ name: excelFile.name || 'excel.xlsx', status: 'done' }] : []}
                    >
                      <Button icon={<UploadOutlined />}>Upload Excel</Button>
                    </Upload>
                  </Form.Item>
                  <Form.Item>
                    <Button
                      type="primary"
                      htmlType="submit"
                      block
                      loading={isBatchLoading}
                      disabled={isBatchLoading}
                    >
                      {isBatchLoading ? 'Đang tạo dự đoán từ Excel (Mẫu 1)...' : 'Tạo dự đoán từ Excel (Mẫu 1)'}
                    </Button>
                  </Form.Item>
                </Form>
              ),
            },
            {
              key: 'excel2',
              label: 'Mẫu 2',
              children: (
                <Form
                  form={batchForm}
                  layout="vertical"
                  onFinish={handleSubmitExcel2}
                  initialValues={{ userId }}
                  disabled={isBatchLoading}
                >
                  <Form.Item name="userIdForm" style={{ display: 'none' }}>
                    <Input type="hidden" value={userId} />
                  </Form.Item>
                  <Form.Item
                    label={t('prediction_form.select_model')}
                    name="modelName"
                    rules={[
                      { required: true, message: t('prediction_form.select_model') },
                    ]}
                  >
                    <Select
                      placeholder={t('prediction_form.select_model')}
                    >
                      {allModels.map((model) => (
                        <Option key={model.value} value={model.value}>
                          {model.label}
                        </Option>
                      ))}
                    </Select>
                  </Form.Item>
                  <Form.Item
                    label={'Upload Excel (.xlsx/.xls)'}
                  >
                    <Upload
                      accept=".xlsx,.xls"
                      beforeUpload={() => false}
                      onChange={handleExcelUpload2}
                      maxCount={1}
                      fileList={excelFile2 ? [{ name: excelFile2.name || 'excel.xlsx', status: 'done' }] : []}
                    >
                      <Button icon={<UploadOutlined />}>Upload Excel</Button>
                    </Upload>
                  </Form.Item>
                  <Form.Item>
                    <Button
                      type="primary"
                      htmlType="submit"
                      block
                      loading={isBatchLoading}
                      disabled={isBatchLoading}
                    >
                      {isBatchLoading ? 'Đang tạo dự đoán từ Excel (Mẫu 2)...' : 'Tạo dự đoán từ Excel (Mẫu 2)'}
                    </Button>
                  </Form.Item>
                </Form>
              ),
            },
          ]}
        />
      </Spin>
    </Card>
  );
};

export default CreateNewPrediction;
