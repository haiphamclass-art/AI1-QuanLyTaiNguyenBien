import React, { useState, useEffect } from 'react';
import {
  Card,
  Typography,
  Collapse,
  Tag,
  Space,
  Divider,
  Row,
  Col,
  Badge,
  Tooltip,
  Button,
  message,
  Spin,
  Alert,
  Descriptions,
  Table,
  Tabs,
  List,
  Avatar,
  Statistic,
  Input,
  Select,
  Drawer,
  Modal,
  Tree,
  Empty,
} from 'antd';
import {
  ApiOutlined,
  InfoCircleOutlined,
  CloudServerOutlined,
  SecurityScanOutlined,
  TagsOutlined,
  CodeOutlined,
  LinkOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  BookOutlined,
  GlobalOutlined,
  LockOutlined,
  UserOutlined,
  EnvironmentOutlined,
  SearchOutlined,
  EyeOutlined,
  CopyOutlined,
  PlayCircleOutlined,
  RightOutlined,
  DownOutlined,
  FileTextOutlined,
  DatabaseOutlined,
  CaretRightOutlined,
  CaretDownOutlined,
  PlusOutlined,
  MinusOutlined,
} from '@ant-design/icons';
import axiosInstance from '../axios';

const { Title, Text, Paragraph } = Typography;

const SwaggerViewer = () => {
  const [swaggerData, setSwaggerData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [expandedSchemas, setExpandedSchemas] = useState({});
  const [expandedAPIs, setExpandedAPIs] = useState({});
  const [selectedEndpoint, setSelectedEndpoint] = useState(null);
  const [exampleModalVisible, setExampleModalVisible] = useState(false);
  const [exampleData, setExampleData] = useState(null);

  useEffect(() => {
    fetchSwaggerData();
  }, []);

  useEffect(() => {
    // Inject custom CSS for List component width
    const style = document.createElement('style');
    style.innerHTML = `
      .ant-list {
        width: 100% !important;
        max-width: none !important;
      }
      .ant-list-item {
        width: 100% !important;
        max-width: none !important;
      }
      .ant-list-item-meta {
        width: 100% !important;
        max-width: none !important;
      }
      .ant-list-item-meta-content {
        width: 100% !important;
        max-width: none !important;
      }
      .ant-list-item-meta-description {
        width: 100% !important;
        max-width: none !important;
      }
      .ant-collapse {
        width: 100% !important;
        max-width: none !important;
      }
      .ant-collapse-item {
        width: 100% !important;
        max-width: none !important;
      }
      .ant-collapse-content {
        width: 100% !important;
        max-width: none !important;
      }
      .ant-collapse-content-box {
        width: 100% !important;
        max-width: none !important;
      }
      .ant-tabs {
        width: 100% !important;
        max-width: none !important;
      }
      .ant-tabs-content {
        width: 100% !important;
        max-width: none !important;
      }
      .ant-tabs-tabpane {
        width: 100% !important;
        max-width: none !important;
      }
      .ant-space {
        width: 100% !important;
        max-width: none !important;
      }
      .ant-space-item {
        width: 100% !important;
        max-width: none !important;
      }
      .ant-card {
        width: 100% !important;
        max-width: none !important;
      }
      .ant-card-body {
        width: 100% !important;
        max-width: none !important;
      }
      .ant-typography {
        width: 100% !important;
        max-width: none !important;
      }
      .ant-typography p {
        width: 100% !important;
        max-width: none !important;
      }
      .ant-typography div {
        width: 100% !important;
        max-width: none !important;
      }
      .ant-tag {
        flex-shrink: 0 !important;
      }
      pre {
        width: 100% !important;
        max-width: none !important;
        overflow-x: auto !important;
      }
      code {
        width: 100% !important;
        max-width: none !important;
        word-break: break-all !important;
      }
      .ant-input {
        width: 100% !important;
        max-width: none !important;
      }
      .ant-btn {
        flex-shrink: 0 !important;
      }
      .ant-row {
        width: 100% !important;
        max-width: none !important;
      }
      .ant-col {
        width: 100% !important;
        max-width: none !important;
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  const fetchSwaggerData = async () => {
    try {
      setLoading(true);
      const response = await axiosInstance.get('/api/express/swagger');
      setSwaggerData(response.data.data);
      setError(null);
    } catch (err) {
      console.error('Error fetching Swagger data:', err);
      setError('Không thể tải dữ liệu API documentation');
      message.error('Lỗi khi tải dữ liệu API');
    } finally {
      setLoading(false);
    }
  };

  const getEndpointsBySchema = (schemaName) => {
    if (!swaggerData?.paths) return [];

    const endpoints = [];
    Object.entries(swaggerData.paths).forEach(([path, methods]) => {
      Object.entries(methods).forEach(([method, details]) => {
        // Check if this endpoint uses the schema in request body or response
        const usesSchema =
          (details.requestBody?.content?.['application/json']?.schema?.$ref?.includes(schemaName)) ||
          (details.responses && Object.values(details.responses).some(response =>
            response.content?.['application/json']?.schema?.$ref?.includes(schemaName)
          )) ||
          (details.parameters && details.parameters.some(param =>
            param.schema?.$ref?.includes(schemaName)
          ));

        if (usesSchema) {
          endpoints.push({
            path,
            method: method.toUpperCase(),
            details,
            fullPath: `${swaggerData.servers?.[0]?.url || ''}${path}`,
            summary: details.summary || details.description || `${method.toUpperCase()} ${path}`,
            tags: details.tags || []
          });
        }
      });
    });
    return endpoints;
  };

  const generateExample = (schema) => {
    if (!schema) return {};

    // Handle simple types without properties
    if (!schema.properties) {
      switch (schema.type) {
        case 'string':
          if (schema.enum) {
            return schema.enum[0];
          } else if (schema.format === 'email') {
            return 'user@example.com';
          } else if (schema.format === 'date') {
            return '2024-01-01';
          } else if (schema.format === 'date-time') {
            return '2024-01-01T00:00:00Z';
          } else {
            return schema.example || 'Sample string';
          }
        case 'integer':
          return schema.example || schema.minimum || 1;
        case 'number':
          return schema.example || schema.minimum || 1.0;
        case 'boolean':
          return schema.example || true;
        case 'array':
          return schema.example || [];
        case 'object':
          return schema.example || {};
        default:
          return schema.example || null;
      }
    }

    const example = {};
    Object.entries(schema.properties).forEach(([key, prop]) => {
      switch (prop.type) {
        case 'string':
          if (prop.enum) {
            example[key] = prop.enum[0];
          } else if (prop.format === 'email') {
            example[key] = 'user@example.com';
          } else if (prop.format === 'date') {
            example[key] = '2024-01-01';
          } else if (prop.format === 'date-time') {
            example[key] = '2024-01-01T00:00:00Z';
          } else {
            example[key] = prop.example || prop.description || `Sample ${key}`;
          }
          break;
        case 'integer':
          example[key] = prop.example || prop.minimum || 1;
          break;
        case 'number':
          example[key] = prop.example || prop.minimum || 1.0;
          break;
        case 'boolean':
          example[key] = prop.example || true;
          break;
        case 'array':
          example[key] = prop.example || [];
          break;
        case 'object':
          example[key] = prop.example || {};
          break;
        default:
          example[key] = prop.example || null;
      }
    });
    return example;
  };

  const generateResponseExample = (content) => {
    if (!content || !content['application/json']) {
      return { message: "No response data available" };
    }

    const jsonContent = content['application/json'];

    // Check if there are examples first
    if (jsonContent.examples) {
      // Try to find any example (success, default, or first available)
      const exampleKey = jsonContent.examples.success ? 'success' :
        jsonContent.examples.default ? 'default' :
          Object.keys(jsonContent.examples)[0];

      if (exampleKey && jsonContent.examples[exampleKey] && jsonContent.examples[exampleKey].value) {
        return jsonContent.examples[exampleKey].value;
      }
    }

    // Fallback to schema generation
    if (!jsonContent.schema) {
      return { message: "No schema available" };
    }

    const schema = jsonContent.schema;

    // Handle specific response patterns
    if (schema.properties) {
      const example = {};

      // Handle paginated responses (areas, predictions, etc.)
      if (schema.properties.areas && schema.properties.total) {
        example.areas = [
          {
            id: 1,
            name: "Khu vực nuôi hàu A",
            latitude: 10.762622,
            longitude: 106.660172,
            area: 1000.5,
            province: "123e4567-e89b-12d3-a456-426614174000",
            district: "123e4567-e89b-12d3-a456-426614174001",
            area_type: "oyster"
          },
          {
            id: 2,
            name: "Khu vực nuôi cá cobia B",
            latitude: 10.800000,
            longitude: 106.700000,
            area: 1500.0,
            province: "123e4567-e89b-12d3-a456-426614174000",
            district: "123e4567-e89b-12d3-a456-426614174002",
            area_type: "cobia"
          }
        ];
        example.total = 25;
        return example;
      }

      // Handle predictions response (Sequelize findAndCountAll format)
      if (schema.properties.rows && schema.properties.count) {
        example.rows = [
          {
            id: 1,
            area_id: 1,
            user_id: 1,
            prediction_text: "Good conditions for oyster farming. Water quality parameters are within optimal ranges.",
            createdAt: "2024-01-01T00:00:00Z",
            updatedAt: "2024-01-01T00:00:00Z",
            Area: {
              id: 1,
              name: "Khu vực nuôi hàu A"
            }
          },
          {
            id: 2,
            area_id: 2,
            user_id: 1,
            prediction_text: "Moderate conditions for cobia farming. Monitor water temperature closely.",
            createdAt: "2024-01-01T00:00:00Z",
            updatedAt: "2024-01-01T00:00:00Z",
            Area: {
              id: 2,
              name: "Khu vực nuôi cá cobia B"
            }
          }
        ];
        example.count = 15;
        return example;
      }

      // Handle email subscriptions response
      if (schema.properties.subscriptions && schema.properties.total) {
        example.subscriptions = [
          {
            id: 1,
            email: "subscriber@example.com",
            area_id: 1,
            is_active: true,
            unsubscribe_token: "abc123def456ghi789",
            created_at: "2024-01-01T00:00:00Z",
            updated_at: "2024-01-01T00:00:00Z"
          }
        ];
        example.total = 5;
        return example;
      }

      // Handle natural elements response
      if (schema.properties.elements && schema.properties.total) {
        example.elements = [
          {
            id: 1,
            name: "Water Temperature",
            description: "Temperature of water in the aquaculture area",
            unit: "°C",
            category: "temperature"
          },
          {
            id: 2,
            name: "Salinity",
            description: "Salt concentration in water",
            unit: "ppt",
            category: "water_quality"
          }
        ];
        example.total = 20;
        example.page = 1;
        example.limit = 10;
        return example;
      }

      // Handle single object responses
      if (schema.properties.id && schema.properties.name) {
        return {
          id: 1,
          name: "Sample Object",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z"
        };
      }

      // Handle success responses
      if (schema.properties.success !== undefined) {
        return {
          success: true,
          message: "Operation completed successfully",
          data: schema.properties.data ? generateExample(schema.properties.data) : null
        };
      }

      // Generate from schema properties
      Object.entries(schema.properties).forEach(([key, prop]) => {
        example[key] = generateExample(prop);
      });

      return example;
    }

    // Handle array responses
    if (schema.type === 'array' && schema.items) {
      return [generateExample(schema.items)];
    }

    // Handle simple responses
    const simpleExample = generateExample(schema);
    return simpleExample;
  };

  // Fallback function to ensure we always return something
  const getResponseExample = (content) => {
    try {
      const result = generateResponseExample(content);
      return result;
    } catch (error) {
      return {
        error: "Failed to generate response example",
        message: "Please check the API documentation for response format"
      };
    }
  };

  const renderRequestBodyForm = (requestBody) => {
    if (!requestBody?.content?.['application/json']?.schema) {
      return (
        <pre style={{
          background: '#f5f5f5',
          padding: 16,
          borderRadius: 8,
          overflow: 'auto',
          maxHeight: '200px',
          width: '100%'
        }}>
          {JSON.stringify(requestBody, null, 2)}
        </pre>
      );
    }

    const schema = requestBody.content['application/json'].schema;

    // Generate example from schema properties
    const example = {};
    Object.entries(schema.properties || {}).forEach(([key, prop]) => {
      if (prop.example !== undefined) {
        example[key] = prop.example;
      } else {
        // Fallback to generated example if no example provided
        switch (prop.type) {
          case 'string':
            if (prop.enum) {
              example[key] = prop.enum[0];
            } else if (prop.format === 'email') {
              example[key] = 'user@example.com';
            } else if (prop.format === 'date') {
              example[key] = '2024-01-01';
            } else if (prop.format === 'date-time') {
              example[key] = '2024-01-01T00:00:00Z';
            } else {
              example[key] = prop.description || `Sample ${key}`;
            }
            break;
          case 'integer':
            example[key] = prop.minimum || 1;
            break;
          case 'number':
            example[key] = prop.minimum || 1.0;
            break;
          case 'boolean':
            example[key] = true;
            break;
          case 'array':
            example[key] = [];
            break;
          case 'object':
            example[key] = {};
            break;
          default:
            example[key] = null;
        }
      }
    });

    return (
      <div style={{ width: '100%' }}>
        <div style={{ marginBottom: 16 }}>
          <Text strong>Schema Properties:</Text>
        </div>
        <div style={{
          background: '#f8f9fa',
          padding: 16,
          borderRadius: 8,
          border: '1px solid #e9ecef'
        }}>
          {Object.entries(schema.properties || {}).map(([key, prop]) => (
            <div key={key} style={{
              marginBottom: 12,
              padding: 12,
              background: '#fff',
              borderRadius: 6,
              border: '1px solid #dee2e6'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
                <Text strong style={{ marginRight: 8 }}>{key}</Text>
                <Tag color="blue">{prop.type}</Tag>
                {schema.required?.includes(key) && <Tag color="red">Required</Tag>}
                {prop.format && <Tag color="green">{prop.format}</Tag>}
              </div>
              {prop.description && (
                <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                  {prop.description}
                </Text>
              )}
              <div style={{
                background: '#f8f9fa',
                padding: 8,
                borderRadius: 4,
                fontFamily: 'monospace',
                fontSize: 12
              }}>
                <Text type="secondary">Example: </Text>
                <Text code>{JSON.stringify(example[key])}</Text>
              </div>
              {prop.enum && (
                <div style={{ marginTop: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>Possible values: </Text>
                  <Space wrap>
                    {prop.enum.map((value) => (
                      <Tag key={value} size="medium">{value}</Tag>
                    ))}
                  </Space>
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 16 }}>
          <Text strong>Example JSON:</Text>
          <pre style={{
            background: '#f5f5f5',
            padding: 16,
            borderRadius: 8,
            overflow: 'auto',
            maxHeight: '200px',
            width: '100%',
            marginTop: 8
          }}>
            {JSON.stringify(example, null, 2)}
          </pre>
        </div>
      </div>
    );
  };

  const renderHeader = () => {
    if (!swaggerData?.info) return null;

    const { info, servers } = swaggerData;

    return (
      <div style={{
        background: '#007bff',
        color: '#fff',
        padding: '24px',
        marginBottom: '24px',
        borderRadius: '8px'
      }}>
        <Row gutter={[24, 24]} align="middle">
          <Col xs={24} md={16}>
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <div>
                <Title level={2} style={{ color: '#fff', margin: 0 }}>
                  <ApiOutlined style={{ marginRight: 12 }} />
                  {info.title}
                </Title>
                <Text style={{ color: '#e6f3ff', fontSize: 16 }}>
                  {info.description}
                </Text>
              </div>

              <Row gutter={[16, 16]}>
                <Col xs={12} sm={6}>
                  <Statistic
                    title="Version"
                    value={info.version}
                    valueStyle={{ color: '#fff' }}
                    prefix={<CodeOutlined />}
                  />
                </Col>
                <Col xs={12} sm={6}>
                  <Statistic
                    title="Servers"
                    value={servers?.length || 0}
                    valueStyle={{ color: '#fff' }}
                    prefix={<CloudServerOutlined />}
                  />
                </Col>
                <Col xs={12} sm={6}>
                  <Statistic
                    title="Tags"
                    value={swaggerData.tags?.length || 0}
                    valueStyle={{ color: '#fff' }}
                    prefix={<TagsOutlined />}
                  />
                </Col>
                <Col xs={12} sm={6}>
                  <Statistic
                    title="Schemas"
                    value={Object.keys(swaggerData.components?.schemas || {}).length}
                    valueStyle={{ color: '#fff' }}
                    prefix={<DatabaseOutlined />}
                  />
                </Col>
              </Row>
            </Space>
          </Col>
          <Col xs={24} md={8}>
            <Card
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: 8,
              }}
              styles={{ body: { padding: 16 } }}
            >
              <Space direction="vertical" size="medium" style={{ width: '100%' }}>
                <Text style={{ color: '#fff', fontWeight: 'bold' }}>
                  <GlobalOutlined style={{ marginRight: 8 }} />
                  Available Servers
                </Text>
                {servers?.map((server, index) => (
                  <div key={index} style={{ color: '#e6f3ff' }}>
                    <Text code style={{ color: '#fff', background: 'rgba(255,255,255,0.2)' }}>
                      {server.url}
                    </Text>
                    <br />
                    <Text style={{ fontSize: 12, color: '#e6f3ff' }}>
                      {server.description}
                    </Text>
                  </div>
                ))}
              </Space>
            </Card>
          </Col>
        </Row>
      </div>
    );
  };

  const getEndpointsByTag = () => {
    if (!swaggerData?.paths) return {};

    const endpointsByTag = {};
    Object.entries(swaggerData.paths).forEach(([path, methods]) => {
      Object.entries(methods).forEach(([method, details]) => {
        const tags = details.tags || ['Other'];
        tags.forEach(tag => {
          if (!endpointsByTag[tag]) {
            endpointsByTag[tag] = [];
          }
          const endpointSecurity = details.security || [];

          endpointsByTag[tag].push({
            path,
            method: method.toUpperCase(),
            details: {
              ...details,
              security: endpointSecurity
            },
            fullPath: `${swaggerData.servers?.[0]?.url || ''}${path}`,
            summary: details.summary || details.description || `${method.toUpperCase()} ${path}`,
            tags: details.tags || []
          });
        });
      });
    });
    return endpointsByTag;
  };

  const getSchemasWithEndpoints = () => {
    if (!swaggerData?.components?.schemas) return [];

    const schemas = swaggerData.components.schemas;
    return Object.entries(schemas).map(([name, schema]) => ({
      name,
      schema,
      endpoints: getEndpointsBySchema(name)
    }));
  };

  const renderEndpointContent = (endpoint) => (
    <div style={{ padding: 16, background: '#f5f5f5', borderRadius: 4 }}>
      <Space direction="vertical" size="medium" style={{ width: '100%' }}>
        <div>
          <Text strong>Summary:</Text>
          <Text style={{ marginLeft: 8 }}>{endpoint.summary}</Text>
        </div>

        {endpoint.details.description && (
          <div>
            <Text strong>Description:</Text>
            <Text style={{ marginLeft: 8 }}>{endpoint.details.description}</Text>
          </div>
        )}

        <div>
          <Text strong>Security:</Text>
          <div style={{ marginTop: 8 }}>
            {!endpoint.details.security || endpoint.details.security.length === 0 ? (
              <Tag color="green">Public (No authentication required)</Tag>
            ) : (
              endpoint.details.security.map((sec, secIndex) => (
                <div key={secIndex} style={{ marginBottom: 4 }}>
                  {Object.entries(sec).map(([scheme, scopes]) => (
                    <Space key={scheme}>
                      <LockOutlined />
                      <Tag color="red">{scheme}</Tag>
                      {scopes && scopes.length > 0 && (
                        <Text type="secondary">Scopes: {scopes.join(', ')}</Text>
                      )}
                    </Space>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>

        {endpoint.details.parameters && endpoint.details.parameters.length > 0 && (
          <div>
            <Text strong>Parameters:</Text>
            <div style={{ marginTop: 8 }}>
              {endpoint.details.parameters.map((param, paramIndex) => (
                <div key={paramIndex} style={{ marginBottom: 4 }}>
                  <Space>
                    <Text code>{param.name}</Text>
                    <Tag color="blue">{param.in}</Tag>
                    <Tag color="orange">{param.schema?.type}</Tag>
                    {param.required && <Tag color="red">Required</Tag>}
                    <Text type="secondary">{param.description}</Text>
                  </Space>
                </div>
              ))}
            </div>
          </div>
        )}

        {endpoint.details.requestBody && (
          <div>
            <Text strong>Request Body:</Text>
            <div style={{ marginTop: 8 }}>
              {renderRequestBodyForm(endpoint.details.requestBody)}
            </div>
          </div>
        )}

        {endpoint.details.responses && (
          <div>
            <Text strong>Responses:</Text>
            <div style={{ marginTop: 8 }}>
              <Tabs
                defaultActiveKey="0"
                size="medium"
                items={Object.entries(endpoint.details.responses).map(([code, response], idx) => ({
                  key: idx.toString(),
                  label: (
                    <Space>
                      <Tag color={code.startsWith('2') ? 'green' : code.startsWith('4') ? 'red' : 'orange'}>
                        {code}
                      </Tag>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {response.description}
                      </Text>
                    </Space>
                  ),
                  children: (
                    <div style={{ padding: '8px 0' }}>
                      <pre style={{
                        background: '#f5f5f5',
                        padding: 12,
                        borderRadius: 6,
                        fontSize: 12,
                        overflow: 'auto',
                        maxHeight: '200px',
                        margin: 0
                      }}>
                        {(() => {
                          if (response.content) {
                            const example = getResponseExample(response.content);
                            return JSON.stringify(example, null, 2);
                          } else {
                            let fallbackExample = {};
                            if (code.startsWith('2')) {
                              if (endpoint.path.includes('/areas')) {
                                fallbackExample = {
                                  areas: [{ id: 1, name: "Khu vực nuôi hàu A", latitude: 10.762622, longitude: 106.660172, area: 1000.5, province: "123e4567-e89b-12d3-a456-426614174000", district: "123e4567-e89b-12d3-a456-426614174001", area_type: "oyster" }],
                                  total: 25
                                };
                              } else if (endpoint.path.includes('/predictions')) {
                                fallbackExample = {
                                  rows: [{ id: 1, area_id: 1, user_id: 1, prediction_text: "Good conditions for oyster farming", createdAt: "2024-01-01T00:00:00Z", updatedAt: "2024-01-01T00:00:00Z", Area: { id: 1, name: "Khu vực nuôi hàu A" } }],
                                  count: 15
                                };
                              } else if (endpoint.path.includes('/emails')) {
                                fallbackExample = {
                                  subscriptions: [{ id: 1, email: "subscriber@example.com", area_id: 1, is_active: true, unsubscribe_token: "abc123def456ghi789", created_at: "2024-01-01T00:00:00Z", updated_at: "2024-01-01T00:00:00Z" }],
                                  total: 5
                                };
                              } else {
                                fallbackExample = { success: true, message: response.description || "Operation completed successfully", data: "Sample response data" };
                              }
                            } else if (code.startsWith('4')) {
                              fallbackExample = { error: response.description || "Bad request", message: "Please check your request parameters" };
                            } else {
                              fallbackExample = { message: response.description || "Response received", status: code };
                            }
                            return JSON.stringify(fallbackExample, null, 2);
                          }
                        })()}
                      </pre>
                    </div>
                  )
                }))}
              />
            </div>
          </div>
        )}

        <Button
          type="primary"
          size="medium"
          icon={<PlayCircleOutlined />}
          onClick={() => setSelectedEndpoint(endpoint)}
          style={{ marginTop: 8 }}
        >
          Try it out
        </Button>
      </Space>
    </div>
  );

  const renderAPIsByTag = () => {
    const endpointsByTag = getEndpointsByTag();
    const filteredTags = Object.keys(endpointsByTag).filter(tag =>
      tag.toLowerCase().includes(searchText.toLowerCase())
    );

    return (
      <div style={{ marginBottom: 0 }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16
        }}>
          <Title level={4} style={{ margin: 0 }}>
            <ApiOutlined style={{ marginRight: 8 }} />
            API Endpoints by Tag
          </Title>
          <Input
            placeholder="Search APIs..."
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 300 }}
          />
        </div>

        <Collapse
          ghost
          expandIcon={({ isActive }) => isActive ? <CaretDownOutlined /> : <CaretRightOutlined />}
          style={{ background: '#fafafa', marginBottom: 0 }}
          items={filteredTags.map(tag => ({
            key: tag,
            label: (
              <Space>
                <Text strong>{tag}</Text>
                <Badge count={endpointsByTag[tag].length} style={{ backgroundColor: '#007bff' }} />
              </Space>
            ),
            style: { marginBottom: 8 },
            children: (
              <div style={{ paddingLeft: 16 }}>
                {endpointsByTag[tag].map((endpoint, index) => (
                  <div key={index} style={{ marginBottom: 12 }}>
                    <Collapse
                      ghost
                      size="medium"
                      expandIcon={({ isActive }) => isActive ? <MinusOutlined /> : <PlusOutlined />}
                      items={[{
                        key: index.toString(),
                        label: (
                          <Space>
                            <Tag color={
                              endpoint.method === 'GET' ? 'green' :
                                endpoint.method === 'POST' ? 'blue' :
                                  endpoint.method === 'PUT' ? 'orange' :
                                    endpoint.method === 'DELETE' ? 'red' : 'default'
                            }>
                              {endpoint.method}
                            </Tag>
                            <Text code>{endpoint.path}</Text>
                            <Text type="secondary">{endpoint.summary}</Text>
                          </Space>
                        ),
                        children: renderEndpointContent(endpoint)
                      }]}
                    />
                  </div>
                ))}
              </div>
            )
          }))}
        />
      </div>
    );
  };

  const renderSecuritySchemes = () => {
    if (!swaggerData?.components?.securitySchemes) return null;

    const securitySchemes = swaggerData.components.securitySchemes;

    return (
      <div style={{ marginBottom: 24 }}>
        <Title level={4} style={{ margin: '0 0 16px 0' }}>
          <SecurityScanOutlined style={{ marginRight: 8 }} />
          Security Schemes
        </Title>
        <Collapse
          items={Object.entries(securitySchemes).map(([name, scheme]) => ({
            key: name,
            label: (
              <Space>
                <LockOutlined />
                <Text strong>{name}</Text>
                <Tag color="blue">{scheme.type}</Tag>
              </Space>
            ),
            children: (
              <Descriptions bordered size="medium">
                <Descriptions.Item label="Type" span={3}>
                  <Tag color="blue">{scheme.type}</Tag>
                </Descriptions.Item>
                {scheme.scheme && (
                  <Descriptions.Item label="Scheme" span={3}>
                    <Tag color="green">{scheme.scheme}</Tag>
                  </Descriptions.Item>
                )}
                {scheme.bearerFormat && (
                  <Descriptions.Item label="Bearer Format" span={3}>
                    <Tag color="orange">{scheme.bearerFormat}</Tag>
                  </Descriptions.Item>
                )}
                {scheme.description && (
                  <Descriptions.Item label="Description" span={3}>
                    <Text>{scheme.description}</Text>
                  </Descriptions.Item>
                )}
              </Descriptions>
            )
          }))}
        />
      </div>
    );
  };

  const renderSchemasList = () => {
    if (!swaggerData?.components?.schemas) return null;

    const schemasWithEndpoints = getSchemasWithEndpoints();
    const filteredSchemas = schemasWithEndpoints.filter(({ name }) =>
      name.toLowerCase().includes(searchText.toLowerCase())
    );

    return (
      <div style={{ marginBottom: 0 }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16
        }}>
          <Title level={4} style={{ margin: 0 }}>
            <DatabaseOutlined style={{ marginRight: 8 }} />
            Data Schemas ({schemasWithEndpoints.length})
          </Title>
          <Input
            placeholder="Search schemas..."
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 300 }}
          />
        </div>

        <Collapse
          ghost
          expandIcon={({ isActive }) => isActive ? <CaretDownOutlined /> : <CaretRightOutlined />}
          style={{ background: '#fafafa', marginBottom: 0 }}
          items={filteredSchemas.map(({ name, schema, endpoints }) => ({
            key: name,
            label: (
              <Space>
                <Text strong>{name}</Text>
                <Tag color="blue">{schema.type}</Tag>
                <Badge count={endpoints.length} style={{ backgroundColor: '#007bff' }} />
                <Text type="secondary">
                  {Object.keys(schema.properties || {}).length} properties
                </Text>
              </Space>
            ),
            style: { marginBottom: 8 },
            children: (
              <div style={{ paddingLeft: 16 }}>
                <div style={{ marginBottom: 16 }}>
                  <Text type="secondary">{schema.description || 'No description available'}</Text>
                </div>

                {Object.keys(schema.properties || {}).length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <Text strong>Properties:</Text>
                    <div style={{ marginTop: 8 }}>
                      {Object.entries(schema.properties).map(([propName, prop]) => (
                        <div key={propName} style={{ marginBottom: 8, padding: 8, background: '#f5f5f5', borderRadius: 4 }}>
                          <Space>
                            <Text strong>{propName}</Text>
                            <Tag color="blue">{prop.type}</Tag>
                            {schema.required?.includes(propName) && <Tag color="red">Required</Tag>}
                            {prop.format && <Tag color="green">{prop.format}</Tag>}
                          </Space>
                          {prop.description && (
                            <div style={{ marginTop: 4 }}>
                              <Text type="secondary" style={{ fontSize: 12 }}>{prop.description}</Text>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {endpoints.length > 0 && (
                  <div>
                    <Text strong>Related API Endpoints:</Text>
                    <div style={{ marginTop: 8 }}>
                      {endpoints.map((endpoint, index) => (
                        <div key={index} style={{ marginBottom: 8 }}>
                          <Collapse
                            ghost
                            size="medium"
                            expandIcon={({ isActive }) => isActive ? <MinusOutlined /> : <PlusOutlined />}
                            items={[{
                              key: index.toString(),
                              label: (
                                <Space>
                                  <Tag color={
                                    endpoint.method === 'GET' ? 'green' :
                                      endpoint.method === 'POST' ? 'blue' :
                                        endpoint.method === 'PUT' ? 'orange' :
                                          endpoint.method === 'DELETE' ? 'red' : 'default'
                                  }>
                                    {endpoint.method}
                                  </Tag>
                                  <Text code>{endpoint.path}</Text>
                                  <Text type="secondary">{endpoint.summary}</Text>
                                </Space>
                              ),
                              children: (
                                <div style={{ padding: 12, background: '#fff', borderRadius: 4, border: '1px solid #d9d9d9' }}>
                                  <Space direction="vertical" size="medium" style={{ width: '100%' }}>
                                    <div>
                                      <Text strong>Summary:</Text>
                                      <Text style={{ marginLeft: 8 }}>{endpoint.summary}</Text>
                                    </div>

                                    {endpoint.details.description && (
                                      <div>
                                        <Text strong>Description:</Text>
                                        <Text style={{ marginLeft: 8 }}>{endpoint.details.description}</Text>
                                      </div>
                                    )}

                                    <Button
                                      type="primary"
                                      size="medium"
                                      icon={<PlayCircleOutlined />}
                                      onClick={() => setSelectedEndpoint(endpoint)}
                                      style={{ marginTop: 8 }}
                                    >
                                      Try it out
                                    </Button>
                                  </Space>
                                </div>
                              )
                            }]}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <Button
                  type="dashed"
                  size="medium"
                  icon={<PlayCircleOutlined />}
                  onClick={() => {
                    setExampleData(generateExample(schema));
                    setExampleModalVisible(true);
                  }}
                  style={{ marginTop: 16 }}
                >
                  Generate Example
                </Button>
              </div>
            )
          }))}
        />
      </div>
    );
  };


  const renderEndpointModal = () => {
    if (!selectedEndpoint) return null;

    return (
      <Modal
        title={
          <Space>
            <Tag color={
              selectedEndpoint.method === 'GET' ? 'green' :
                selectedEndpoint.method === 'POST' ? 'blue' :
                  selectedEndpoint.method === 'PUT' ? 'orange' :
                    selectedEndpoint.method === 'DELETE' ? 'red' : 'default'
            }>
              {selectedEndpoint.method}
            </Tag>
            <Text code>{selectedEndpoint.path}</Text>
          </Space>
        }
        open={!!selectedEndpoint}
        onCancel={() => setSelectedEndpoint(null)}
        footer={[
          <Button key="close" onClick={() => setSelectedEndpoint(null)}>
            Close
          </Button>
        ]}
        width="95vw"
        style={{ top: 20 }}
        styles={{ body: { padding: '16px 24px', width: '100%' } }}
      >
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div>
            <Title level={5}>Summary</Title>
            <Text>{selectedEndpoint.summary}</Text>
          </div>

          {selectedEndpoint.details.description && (
            <div>
              <Title level={5}>Description</Title>
              <Text>{selectedEndpoint.details.description}</Text>
            </div>
          )}

          {selectedEndpoint.details.parameters && selectedEndpoint.details.parameters.length > 0 && (
            <div>
              <Title level={5}>Parameters</Title>
              <List
                dataSource={selectedEndpoint.details.parameters}
                style={{ width: '100%' }}
                renderItem={(param) => (
                  <List.Item style={{ width: '100%' }}>
                    <List.Item.Meta
                      style={{ width: '100%' }}
                      title={
                        <Space>
                          <Text strong>{param.name}</Text>
                          <Tag color="blue">{param.in}</Tag>
                          {param.required && <Tag color="red">Required</Tag>}
                        </Space>
                      }
                      description={
                        <Space direction="vertical" size="medium" style={{ width: '100%' }}>
                          <Text type="secondary">{param.description}</Text>
                          {param.schema && (
                            <Text code>Type: {param.schema.type}</Text>
                          )}
                        </Space>
                      }
                    />
                  </List.Item>
                )}
              />
            </div>
          )}

          {selectedEndpoint.details.requestBody && (
            <div>
              <Title level={5}>Request Body</Title>
              {renderRequestBodyForm(selectedEndpoint.details.requestBody)}
            </div>
          )}

          {selectedEndpoint.details.responses && (
            <div>
              <Title level={5}>Responses</Title>
              <Tabs
                defaultActiveKey="0"
                items={Object.entries(selectedEndpoint.details.responses).map(([code, response], index) => ({
                  key: index.toString(),
                  label: (
                    <Space>
                      <Tag color={code.startsWith('2') ? 'green' : code.startsWith('4') ? 'red' : 'orange'}>
                        {code}
                      </Tag>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {response.description}
                      </Text>
                    </Space>
                  ),
                  children: (
                    <div style={{ padding: '8px 0' }}>
                      {response.content ? (
                        <pre style={{
                          background: '#f5f5f5',
                          padding: 16,
                          borderRadius: 8,
                          fontSize: 12,
                          overflow: 'auto',
                          maxHeight: '300px',
                          margin: 0,
                          width: '100%'
                        }}>
                          {JSON.stringify(getResponseExample(response.content), null, 2)}
                        </pre>
                      ) : (
                        <Text type="secondary">No content available</Text>
                      )}
                    </div>
                  )
                }))}
              />
            </div>
          )}
        </Space>
      </Modal>
    );
  };

  const renderExampleModal = () => {
    return (
      <Modal
        title="Generated Example"
        open={exampleModalVisible}
        onCancel={() => setExampleModalVisible(false)}
        footer={[
          <Button
            key="copy"
            icon={<CopyOutlined />}
            onClick={() => {
              navigator.clipboard.writeText(JSON.stringify(exampleData, null, 2));
              message.success('Copied to clipboard!');
            }}
          >
            Copy JSON
          </Button>,
          <Button key="close" onClick={() => setExampleModalVisible(false)}>
            Close
          </Button>
        ]}
        width="95vw"
        style={{ top: 20 }}
        styles={{ body: { padding: '16px 24px', width: '100%' } }}
      >
        <pre style={{
          background: '#f5f5f5',
          padding: 16,
          borderRadius: 8,
          margin: 0,
          width: '100%'
        }}>
          {JSON.stringify(exampleData, null, 2)}
        </pre>
      </Modal>
    );
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <Spin size="large" />
        <div style={{ marginTop: 16 }}>
          <Text>Đang tải dữ liệu API documentation...</Text>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert
        message="Lỗi tải dữ liệu"
        description={error}
        type="error"
        showIcon
        action={
          <Button size="medium" onClick={fetchSwaggerData}>
            Thử lại
          </Button>
        }
      />
    );
  }

  return (
    <div style={{
      padding: '0',
      background: '#fafafa',
      minHeight: '100vh',
      width: '100%'
    }}>
      <div style={{
        maxWidth: '100%',
        margin: '0',
        background: '#fafafa',
        width: '100%'
      }}>
        {renderHeader()}

        <div style={{ padding: '0 24px', width: '100%' }}>
          <Tabs
            defaultActiveKey="apis"
            items={[
              {
                key: 'apis',
                label: (
                  <span>
                    <ApiOutlined />
                    API Endpoints
                  </span>
                ),
                children: (
                  <div style={{ padding: '16px 0', width: '100%' }}>
                    {renderAPIsByTag()}
                  </div>
                ),
              },
              {
                key: 'security',
                label: (
                  <span>
                    <SecurityScanOutlined />
                    Security
                  </span>
                ),
                children: (
                  <div style={{ padding: '16px 0', width: '100%' }}>
                    {renderSecuritySchemes()}
                  </div>
                ),
              },
              {
                key: 'schemas',
                label: (
                  <span>
                    <DatabaseOutlined />
                    Data Schemas
                  </span>
                ),
                children: (
                  <div style={{ padding: '16px 0', width: '100%' }}>
                    {renderSchemasList()}
                  </div>
                ),
              },
              {
                key: 'raw',
                label: (
                  <span>
                    <CodeOutlined />
                    Raw JSON
                  </span>
                ),
                children: (
                  <div style={{ padding: '16px 0', width: '100%' }}>
                    <Card style={{ margin: '16px 0' }}>
                      <pre style={{
                        background: '#f5f5f5',
                        padding: 16,
                        borderRadius: 8,
                        overflow: 'auto',
                        margin: 0,
                        maxHeight: '70vh'
                      }}>
                        {JSON.stringify(swaggerData, null, 2)}
                      </pre>
                    </Card>
                  </div>
                ),
              },
            ]}
            style={{
              background: '#fff',
              padding: '0 16px',
              borderRadius: '8px',
              marginBottom: '24px',
              width: '100%'
            }}
          />
        </div>

        {renderEndpointModal()}
        {renderExampleModal()}
      </div>
    </div>
  );
};

export default SwaggerViewer;
