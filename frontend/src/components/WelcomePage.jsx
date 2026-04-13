import React, { useState, useEffect } from 'react';
import './WelcomePage.css';
import { useNavigate } from 'react-router-dom';
import axios from '../axios';
import { useTranslation } from 'react-i18next';
import { Select, Typography, Card, Space } from 'antd';

const { Title } = Typography;
const { Option } = Select;

const WelcomePage = () => {
  const { t } = useTranslation();
  const [areas, setAreas] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    axios
      .get('/api/express/areas')
      .then((response) => {
        setAreas(response.data.areas);
      })
      .catch((error) => console.error('Error fetching areas:', error));
  }, []);

  const handleAreaSelect = (areaId) => {
    navigate(`/predictions/${areaId}`);
  };

  const filterOption = (input, option) =>
    (option?.label ?? '').toLowerCase().includes(input.toLowerCase());

  return (
    <Card style={{ maxWidth: 800, margin: '32px auto', padding: '24px' }}>
      <Space direction="vertical" style={{ width: '100%' }} size="large">
        <Title level={2} style={{ textAlign: 'center', marginBottom: 32 }}>
          {t('welcomePage.title')}
        </Title>

        <Select
          showSearch
          placeholder={t('welcomePage.searchPlaceholder')}
          optionFilterProp="label"
          filterOption={filterOption}
          style={{ width: '100%' }}
          onChange={handleAreaSelect}
          options={areas.map((area) => ({
            value: area.id,
            label: `${area.Province?.name}, ${area.District?.name}, ${area.name}`,
          }))}
        />
      </Space>
    </Card>
  );
};

export default WelcomePage;
