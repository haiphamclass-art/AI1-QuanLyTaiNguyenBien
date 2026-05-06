import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle, GeoJSON } from 'react-leaflet';
import { LatLng } from 'leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import proj4 from 'proj4';
import 'proj4leaflet';
import './InteractiveMap.css';
import axios from '../axios';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
    Card,
    List,
    Typography,
    Button,
    Space,
    Input,
    Select,
    Row,
    Col,
    Tag,
    Badge,
    Spin,
    message,
    Tooltip,
    Collapse,
    Divider,
    Skeleton,
    Slider,
} from 'antd';
import InfiniteScroll from 'react-infinite-scroll-component';
import { LineChart, Line, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import {
    SearchOutlined,
    FilterOutlined,
    InfoCircleOutlined,
    ArrowRightOutlined,
    ArrowLeftOutlined,
    QuestionCircleOutlined,
} from '@ant-design/icons';
import PredictionBadge from './PredictionBadge';

const { Title, Text } = Typography;
const { Option } = Select;

// Fix for default markers in react-leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Compact tooltip for Recharts
function SmallTooltip({ active, payload, label, unit }) {
    if (active && payload && payload.length) {
        const value = payload[0]?.value;
        return (
            <div style={{
                background: '#fff',
                border: '1px solid #d9d9d9',
                borderRadius: 4,
                padding: '4px 6px',
                fontSize: 10,
                lineHeight: 1.2,
                maxWidth: 120
            }}>
                <div style={{ marginBottom: 2 }}>{label}</div>
                <div style={{ fontWeight: 600 }}>{`${value ?? 0} ${unit || ''}`}</div>
            </div>
        );
    }
    return null;
}

// Custom marker icons for different area types
const createCustomIcon = (color) => {
    return L.divIcon({
        className: 'custom-div-icon',
        html: `<div style="
      background-color: ${color};
      width: 20px;
      height: 20px;
      border-radius: 50%;
      border: 3px solid white;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    "></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
    });
};

const oysterIcon = createCustomIcon('#1890ff');
const cobiaIcon = createCustomIcon('#52c41a');

// VN2000 projection builder (TM lon0°, k0=0.9999)
const getVN2000Proj4 = (lon0) => `+proj=tmerc +lat_0=0 +lon_0=${lon0} +k=0.9999 +x_0=500000 +y_0=0 +ellps=WGS84 +towgs84=-191.904,-39.303,-111.450,0,0,0,0 +units=m +no_defs`;
const WGS84 = 'EPSG:4326';

// Helper: pick nearest VN2000 zone and convert WGS84 -> VN2000
const chooseVNZoneByLon = (lon) => {
    const zones = [105, 107, 109];
    let best = zones[0];
    let bestDiff = Infinity;
    for (const z of zones) {
        const d = Math.abs((lon || 0) - z);
        if (d < bestDiff) { best = z; bestDiff = d; }
    }
    return best;
};
const convertWGS84ToVN2000 = (lat, lon, zone) => {
    try {
        const z = zone || chooseVNZoneByLon(lon);
        const [x, y] = proj4(getVN2000Proj4(z), [lon, lat]);
        return { x, y, zone: z };
    } catch (_) {
        return null;
    }
};

// Component to update map view when area is selected
function MapUpdater({ center, zoom }) {
    const map = useMap();

    useEffect(() => {
        if (center) {
            map.setView(center, zoom || 15);
        }
    }, [center, zoom, map]);

    return null;
}

// Component to render GeoJSON labels
function GeoJSONLabels({ data, language }) {
    const map = useMap();
    const [currentZoom, setCurrentZoom] = useState(map.getZoom());

    useEffect(() => {
        const handleZoomEnd = () => {
            setCurrentZoom(map.getZoom());
            console.log('Current zoom:', map.getZoom());
        };

        map.on('zoomend', handleZoomEnd);

        return () => {
            map.off('zoomend', handleZoomEnd);
        };
    }, [map]);

    useEffect(() => {
        if (!data || !data.features) return;

        // Only show labels when zoomed in enough
        if (currentZoom < 6) return;

        const markers = [];

        // Calculate clustering distance based on zoom level
        // More zoom = smaller distance = more clusters
        const getClusterDistance = (zoom) => {
            if (zoom < 7) return Infinity; // Single cluster per name
            if (zoom < 8) return 2; // Large clusters (2 degrees)
            if (zoom < 9) return 1; // Medium clusters (1 degree)
            if (zoom < 10) return 0.5; // Smaller clusters (0.5 degrees)
            if (zoom < 11) return 0.2; // Very small clusters (0.2 degrees)
            if (zoom < 12) return 0.1; // Very very small clusters (0.1 degrees)
            return 0; // Each polygon gets its own label
        };

        const clusterDistance = getClusterDistance(currentZoom);

        // Group features by name first
        const groupedByName = {};

        data.features.forEach((feature) => {
            if (feature.geometry && feature.properties) {
                const { Name_VI, Name_EN } = feature.properties;
                const labelText = language === 'vi' ? Name_VI : Name_EN;

                if (!groupedByName[labelText]) {
                    groupedByName[labelText] = [];
                }
                groupedByName[labelText].push(feature);
            }
        });

        // For each name group, cluster by distance
        Object.entries(groupedByName).forEach(([labelText, features]) => {
            // Calculate center for each feature
            const featureCenters = features.map(feature => {
                let totalLat = 0, totalLng = 0, pointCount = 0;

                if (feature.geometry.type === 'MultiPolygon') {
                    feature.geometry.coordinates.forEach(polygon => {
                        const coords = polygon[0];
                        coords.forEach(coord => {
                            totalLng += coord[0];
                            totalLat += coord[1];
                            pointCount++;
                        });
                    });
                } else if (feature.geometry.type === 'Polygon') {
                    const coords = feature.geometry.coordinates[0];
                    coords.forEach(coord => {
                        totalLng += coord[0];
                        totalLat += coord[1];
                        pointCount++;
                    });
                }

                return {
                    lat: totalLat / pointCount,
                    lng: totalLng / pointCount,
                    feature: feature,
                    clusterId: null
                };
            });

            // Simple clustering algorithm
            const clusters = [];

            featureCenters.forEach(fc => {
                if (clusterDistance === Infinity) {
                    // All in one cluster
                    if (clusters.length === 0) {
                        clusters.push([fc]);
                    } else {
                        clusters[0].push(fc);
                    }
                } else {
                    // Find nearest cluster
                    let nearestCluster = null;
                    let minDistance = Infinity;

                    clusters.forEach((cluster, idx) => {
                        // Calculate cluster center
                        const clusterLat = cluster.reduce((sum, c) => sum + c.lat, 0) / cluster.length;
                        const clusterLng = cluster.reduce((sum, c) => sum + c.lng, 0) / cluster.length;

                        // Calculate distance
                        const distance = Math.sqrt(
                            Math.pow(fc.lat - clusterLat, 2) +
                            Math.pow(fc.lng - clusterLng, 2)
                        );

                        if (distance < minDistance && distance < clusterDistance) {
                            minDistance = distance;
                            nearestCluster = idx;
                        }
                    });

                    if (nearestCluster !== null) {
                        clusters[nearestCluster].push(fc);
                    } else {
                        clusters.push([fc]);
                    }
                }
            });

            // Create marker for each cluster
            clusters.forEach(cluster => {
                const clusterLat = cluster.reduce((sum, c) => sum + c.lat, 0) / cluster.length;
                const clusterLng = cluster.reduce((sum, c) => sum + c.lng, 0) / cluster.length;
                const center = [clusterLat, clusterLng];

                // Adjust font size based on zoom level (matching Leaflet's 12px base)
                const fontSize = Math.min(12 + (currentZoom - 6) * 1.5, 18);

                const textIcon = L.divIcon({
                    className: 'geojson-label',
                    html: `<div style="
                        color: #000000;
                        font-weight: bold;
                        font-size: ${fontSize}px;
                        white-space: nowrap;
                        text-align: center;
                        text-shadow:
                            -1px -1px 0 rgba(255, 255, 255, 0.5),
                            1px -1px 0 rgba(255, 255, 255, 0.5),
                            -1px 1px 0 rgba(255, 255, 255, 0.5),
                            1px 1px 0 rgba(255, 255, 255, 0.5),
                            0 0 3px rgba(255, 255, 255, 0.5);
                        pointer-events: none;
                        font-family: 'Helvetica Neue', Arial, Helvetica, sans-serif;
                    ">${labelText}</div>`,
                    iconSize: [150, 20],
                    iconAnchor: [75, 10]
                });

                const marker = L.marker(center, {
                    icon: textIcon,
                    interactive: false,
                    zIndexOffset: 1000
                }).addTo(map);

                markers.push(marker);
            });
        });

        console.log('Total labels rendered:', markers.length, 'at zoom:', currentZoom);

        // Cleanup on unmount or data change
        return () => {
            markers.forEach(marker => marker.remove());
        };
    }, [data, language, map, currentZoom]);

    return null;
}

// Component for prediction circles (only shown in detail view)
function PredictionCircle({ area, prediction }) {
    // Convert prediction_text (categorical: -1, 0, 1) to label/color
    const getPredictionInfo = () => {
        if (!prediction) {
            return { result: -2, color: '#1890ff', label: 'Chưa có dự báo' };
        }
        const value = Number.parseInt(prediction.prediction_text, 10);
        if (Number.isNaN(value)) {
            return { result: -2, color: '#1890ff', label: 'Chưa có dự báo' };
        }
        if (value === 1) return { result: 1, color: '#52c41a', label: 'Tốt' };
        if (value === 0) return { result: 0, color: '#faad14', label: 'Trung bình' };
        if (value === -1) return { result: -1, color: '#ff4d4f', label: 'Kém' };
        return { result: -2, color: '#1890ff', label: 'Chưa có dự báo' };
    };

    const predictionInfo = getPredictionInfo();
    // area.area is already in hectares, convert to radius (m) for circle display
    // 1 hectare = 10,000 m²
    const areaInHectares = area.area || 0;
    const circleRadius = areaInHectares > 0 ? Math.sqrt(areaInHectares * 10000 / Math.PI) * 0.1 : 50;

    return (
        <Circle
            center={[area.latitude, area.longitude]}
            radius={circleRadius}
            pathOptions={{
                fillColor: predictionInfo.color,
                fillOpacity: 0.3,
                color: predictionInfo.color,
                opacity: 0.8,
                weight: 2,
            }}
        />
    );
}

// Component for individual area markers with prediction circles
function AreaMarker({ area, prediction, onAreaClick, onViewDetails, selectedArea, navigate, isDetailView }) {
    const icon = area.area_type === 'oyster' ? oysterIcon : cobiaIcon;

    // Get prediction result and color from prediction_text (categorical)
    const getPredictionInfo = () => {
        if (!prediction) {
            return { result: -2, color: '#1890ff', label: 'Chưa có dự báo' };
        }

        const value = Number.parseInt(prediction.prediction_text, 10);
        if (Number.isNaN(value)) {
            return { result: -2, color: '#1890ff', label: 'Chưa có dự báo' };
        }
        if (value === 1) return { result: 1, color: '#52c41a', label: 'Tốt' };
        if (value === 0) return { result: 0, color: '#faad14', label: 'Trung bình' };
        if (value === -1) return { result: -1, color: '#ff4d4f', label: 'Kém' };
        return { result: -2, color: '#1890ff', label: 'Chưa có dự báo' };
    };

    const predictionInfo = getPredictionInfo();
    // area.area is already in hectares, convert to radius (m) for circle display
    // 1 hectare = 10,000 m²
    const areaInHectares = area.area || 0;

    return (
        <>
            {/* Marker */}
            <Marker
                position={[area.latitude, area.longitude]}
                icon={icon}
                eventHandlers={{
                    click: () => onAreaClick(area),
                }}
            >
                <Popup>
                    <div className="area-popup">
                        <Title level={5} style={{ margin: '0 0 8px 0' }}>
                            {area.name}
                        </Title>
                        <Space direction="vertical" size="medium" style={{ width: '100%' }}>
                            <div>
                                <Text strong>Loại: </Text>
                                <Tag color={area.area_type === 'oyster' ? 'blue' : 'green'}>
                                    {area.area_type === 'oyster' ? 'Oyster' : 'Cobia'}
                                </Tag>
                            </div>
                            <div>
                                <Text strong>Dự báo: </Text>
                                <Space direction="vertical" size="medium">
                                    <PredictionBadge prediction={prediction} />
                                </Space>
                            </div>
                            {prediction && (
                                <div>
                                    <Text strong>Ngày dự báo: </Text>
                                    <Text>{new Date(prediction.createdAt).toLocaleDateString('vi-VN')}</Text>
                                </div>
                            )}
                            <div>
                                <Text strong>Vị trí: </Text>
                                <Text>{area.latitude}, {area.longitude}</Text>
                            </div>
                            {area.area && (
                                <div>
                                    <Text strong>Diện tích: </Text>
                                    <Text>{area.area} ha</Text>
                                </div>
                            )}
                            {area.Province && (
                                <div>
                                    <Text strong>Địa chỉ: </Text>
                                    <Text>{area.Province.name}, {area.District?.name}</Text>
                                </div>
                            )}
                            <Space direction="vertical" style={{ width: '100%' }}>
                                {prediction && prediction.id && !(isDetailView && selectedArea && area.id === selectedArea.id) && (
                                    <Button
                                        type="primary"
                                        size="medium"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onViewDetails(area);
                                        }}
                                        style={{ width: '100%' }}
                                    >
                                        Xem chi tiết
                                    </Button>
                                )}
                                <Button
                                    type="default"
                                    size="medium"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        navigate(`/email-subscription/${area.id}`);
                                    }}
                                    style={{ width: '100%' }}
                                >
                                    Đăng ký email thông báo
                                </Button>
                            </Space>
                        </Space>
                    </div>
                </Popup>
            </Marker>
        </>
    );
}

function StationZoneLegend() {
    return (
        <div
            style={{
                position: 'absolute',
                bottom: 300,
                right: 20,
                zIndex: 1000,
                background: 'rgba(255,255,255,0.95)',
                padding: '10px 12px',
                borderRadius: 8,
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                fontSize: 12,
                lineHeight: 1.6,
            }}
        >
            <div style={{ fontWeight: 600, marginBottom: 6 }}>{'Ph\u00e2n v\u00f9ng ch\u1ea5t l\u01b0\u1ee3ng'}</div>
            <div><span style={{ display: 'inline-block', width: 14, height: 14, background: '#2e7d32', marginRight: 8 }} />{'T\u1ed1t'}</div>
            <div><span style={{ display: 'inline-block', width: 14, height: 14, background: '#f9a825', marginRight: 8 }} />{'Trung b\u00ecnh'}</div>
            <div><span style={{ display: 'inline-block', width: 14, height: 14, background: '#c62828', marginRight: 8 }} />{'K\u00e9m'}</div>
            <div style={{ marginTop: 6, fontSize: 11, color: '#666' }}>
                {'\u0110\u1eadm = g\u1ea7n tr\u1ea1m h\u01a1n, nh\u1ea1t = xa tr\u1ea1m h\u01a1n'}
            </div>
        </div>
    );
}

function StationZoneTimeControl({
    forecastHours,
    selectedForecastHour,
    onForecastHourChange,
    selectedForecastLabel,
}) {
    const hasHourlyForecast = Array.isArray(forecastHours) && forecastHours.length > 0;
    const sliderMax = hasHourlyForecast ? forecastHours.length - 1 : 0;

    return (
        <div
            style={{
                position: 'absolute',
                bottom: 165,
                right: 20,
                zIndex: 1000,
                background: 'rgba(255,255,255,0.96)',
                padding: '10px 12px',
                borderRadius: 8,
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                width: 320,
            }}
        >
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Biến động diện tích trong 24h</div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
                {hasHourlyForecast ? `M\u1ed1c \u0111ang xem: ${selectedForecastLabel}` : 'Ch\u01b0a c\u00f3 chu\u1ed7i d\u1ef1 b\u00e1o theo gi\u1edd'}
            </div>
            <Slider
                min={0}
                max={sliderMax}
                value={Math.min(selectedForecastHour, sliderMax)}
                onChange={onForecastHourChange}
                tooltip={{ formatter: (value) => hasHourlyForecast ? `${value}h` : 'N/A' }}
                marks={hasHourlyForecast ? { 0: '0h', [sliderMax]: `${sliderMax}h` } : { 0: '0h' }}
                disabled={!hasHourlyForecast}
            />
        </div>
    );
}

function scaleCoordinatePair(coord, center, factor) {
    if (!Array.isArray(coord) || coord.length < 2 || !center) return coord;
    const [cx, cy] = center;
    return [
        cx + (coord[0] - cx) * factor,
        cy + (coord[1] - cy) * factor,
        ...coord.slice(2),
    ];
}

function scaleGeometryCoordinates(coords, center, factor) {
    if (!Array.isArray(coords)) return coords;
    if (coords.length === 0) return coords;
    if (typeof coords[0] === 'number') {
        return scaleCoordinatePair(coords, center, factor);
    }
    return coords.map((item) => scaleGeometryCoordinates(item, center, factor));
}

function getGeometryCenter(coords) {
    const points = [];

    const walk = (value) => {
        if (!Array.isArray(value) || value.length === 0) return;
        if (typeof value[0] === 'number' && typeof value[1] === 'number') {
            points.push([value[0], value[1]]);
            return;
        }
        value.forEach(walk);
    };

    walk(coords);

    if (!points.length) return null;

    const [minX, maxX, minY, maxY] = points.reduce(
        (acc, [x, y]) => [
            Math.min(acc[0], x),
            Math.max(acc[1], x),
            Math.min(acc[2], y),
            Math.max(acc[3], y),
        ],
        [points[0][0], points[0][0], points[0][1], points[0][1]]
    );

    return [(minX + maxX) / 2, (minY + maxY) / 2];
}

const InteractiveMap = () => {
    const { t, i18n } = useTranslation();
    const { user, role, isAuthenticated } = useSelector((state) => state.auth);
    const navigate = useNavigate();
    const mapRef = useRef(null);
    const userRole = role;

    // State management
    const [areas, setAreas] = useState([]);
    const [filteredAreas, setFilteredAreas] = useState([]);
    const [predictions, setPredictions] = useState({}); // Store predictions by area ID
    const [loading, setLoading] = useState(true);
    const [selectedArea, setSelectedArea] = useState(null);
    const [historyByElement, setHistoryByElement] = useState({}); // key: element name/id -> [{date,value}]
    const [elementMeta, setElementMeta] = useState({}); // key: element name -> {unit, description}
    const [mapCenter, setMapCenter] = useState([10.762622, 106.660172]); // Vietnam center
    const [mapZoom, setMapZoom] = useState(6);
    const [hoangTruongSaGeoJSON, setHoangTruongSaGeoJSON] = useState(null);


    const [stationZonesGeoJSON, setStationZonesGeoJSON] = useState(null);
    const [displayedStationZonesGeoJSON, setDisplayedStationZonesGeoJSON] = useState(null);
    const [stationZonesLoading, setStationZonesLoading] = useState(false);
    const [showStationZones, setShowStationZones] = useState(true);
    const [selectedForecastHour, setSelectedForecastHour] = useState(0);


    // Filter states
    const [searchTerm, setSearchTerm] = useState('');
    const [areaType, setAreaType] = useState('');
    const [provinceFilter, setProvinceFilter] = useState('');
    const [districtFilter, setDistrictFilter] = useState('');
    const [filtersCollapsed, setFiltersCollapsed] = useState(false);
    const [isDetailView, setIsDetailView] = useState(false);
    const [isFilterCardVisible, setIsFilterCardVisible] = useState(false);
    const [isDetailCardVisible, setIsDetailCardVisible] = useState(true);
    const [initialQueryHandled, setInitialQueryHandled] = useState(false);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

    // Data for filters
    const [provinces, setProvinces] = useState([]);
    const [districts, setDistricts] = useState([]);
    const [filteredDistricts, setFilteredDistricts] = useState([]);
    const debouncedSearchTerm = useDebouncedValue(searchTerm, 500);
    const forecastHours = stationZonesGeoJSON?.forecast_hours || [];
    const stationHourlyForecasts = stationZonesGeoJSON?.station_hourly_forecasts || {};
    const hourlyZoneGeometries = stationZonesGeoJSON?.hourly_zone_geometries || {};

    const formatForecastHourLabel = (value, fallbackIndex = selectedForecastHour) => {
        if (!value) return `+${fallbackIndex}h`;
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return `+${fallbackIndex}h`;
        return date.toLocaleString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit',
            day: '2-digit',
            month: '2-digit',
        });
    };

    const getStationHourlyForecast = (stationId) =>
        stationHourlyForecasts?.[String(stationId)] ||
        stationHourlyForecasts?.[Number(stationId)] ||
        null;

    const getSelectedStationHourData = (stationId) => {
        const hourlyForecast = getStationHourlyForecast(stationId);
        const hourlyFactors = hourlyForecast?.impact_factor_hourly || [];
        const hourlyLabels = hourlyForecast?.impact_level_hourly || [];
        const hourlyReachFactors = hourlyForecast?.reach_factor_hourly || [];
        const hourlyRiskScores = hourlyForecast?.risk_score_hourly || [];
        const hourlyTimes = hourlyForecast?.forecast_times || [];
        const hourlyWind = hourlyForecast?.wind_hourly_m_s || [];
        const hourlyRain = hourlyForecast?.rain_hourly_mm || [];
        const hourlyWave = hourlyForecast?.wave_hourly_m || [];

        if (!hourlyFactors.length) {
            return {
                factor: null,
                label: null,
                reachFactor: null,
                riskScore: null,
                timeLabel: formatForecastHourLabel(null, selectedForecastHour),
                wind: null,
                rain: null,
                wave: null,
            };
        }

        const hourIndex = Math.max(0, Math.min(selectedForecastHour, hourlyFactors.length - 1));
        return {
            factor: hourlyFactors[hourIndex] ?? null,
            label: hourlyLabels[hourIndex] ?? null,
            reachFactor: hourlyReachFactors[hourIndex] ?? null,
            riskScore: hourlyRiskScores[hourIndex] ?? null,
            timeLabel: formatForecastHourLabel(hourlyTimes[hourIndex], hourIndex),
            wind: hourlyWind[hourIndex] ?? null,
            rain: hourlyRain[hourIndex] ?? null,
            wave: hourlyWave[hourIndex] ?? null,
        };
    };

    useEffect(() => {
        if (!forecastHours.length) {
            setSelectedForecastHour(0);
            return;
        }
        setSelectedForecastHour((prev) => Math.min(prev, forecastHours.length - 1));
    }, [forecastHours.length]);

    const selectedForecastLabel = formatForecastHourLabel(
        forecastHours[selectedForecastHour],
        selectedForecastHour
    );

    useEffect(() => {
        if (!stationZonesGeoJSON?.features?.length) {
            setDisplayedStationZonesGeoJSON(null);
            return;
        }

        const selectedHourlyZoneGeometryMap = hourlyZoneGeometries?.[String(selectedForecastHour)];
        if (selectedHourlyZoneGeometryMap && Object.keys(selectedHourlyZoneGeometryMap).length > 0) {
            const nextFeatures = stationZonesGeoJSON.features
                .map((feature) => {
                    const featureId = feature?.properties?.feature_id;
                    const hourlyFeature = featureId ? selectedHourlyZoneGeometryMap[featureId] : null;
                    if (!hourlyFeature?.geometry) return null;

                    return {
                        ...feature,
                        geometry: hourlyFeature.geometry,
                        properties: {
                            ...feature.properties,
                            area_km2: hourlyFeature.area_km2 ?? feature.properties?.area_km2,
                        },
                    };
                })
                .filter(Boolean);

            setDisplayedStationZonesGeoJSON({
                type: 'FeatureCollection',
                features: nextFeatures,
            });
            return;
        }

        const areaCenterLookup = new Map();
        (areas || []).forEach((area) => {
            const center = [Number(area.longitude), Number(area.latitude)];
            if (!Number.isFinite(center[0]) || !Number.isFinite(center[1])) return;
            areaCenterLookup.set(String(area.id), center);
            if (area.maHieu != null) {
                areaCenterLookup.set(String(area.maHieu), center);
            }
        });

        const nextFeatures = stationZonesGeoJSON.features.map((feature) => {
            const stationId = String(feature?.properties?.maHieu || '');
            const baseReachFactor = Number(feature?.properties?.station_reach_factor || 1);
            const hourlyView = getSelectedStationHourData(stationId);
            const nextReachFactor = Number(hourlyView?.reachFactor ?? baseReachFactor);
            const scaleFactor = baseReachFactor > 0 ? nextReachFactor / baseReachFactor : 1;
            const center = areaCenterLookup.get(stationId) || getGeometryCenter(feature?.geometry?.coordinates);

            if (!center || !feature?.geometry || !Number.isFinite(scaleFactor) || Math.abs(scaleFactor - 1) < 0.001) {
                return feature;
            }

            return {
                ...feature,
                geometry: {
                    ...feature.geometry,
                    coordinates: scaleGeometryCoordinates(feature.geometry.coordinates, center, scaleFactor),
                },
            };
        });

        setDisplayedStationZonesGeoJSON({
            type: 'FeatureCollection',
            features: nextFeatures,
        });
    }, [stationZonesGeoJSON, hourlyZoneGeometries, areas, selectedForecastHour]);


    const isWithinVietnam = (lat, lon) => lat >= 8 && lat <= 24 && lon >= 102 && lon <= 110;
    const getZoneColorByPredictionAndRing = (prediction, ring) => {
        const value = Number.parseInt(prediction?.prediction_text, 10);

        // tốt
        if (value === 1) {
            if (ring === 1) return { fillColor: '#2e7d32', fillOpacity: 0.85 };
            if (ring === 2) return { fillColor: '#66bb6a', fillOpacity: 0.55 };
            return { fillColor: '#c8e6c9', fillOpacity: 0.30 };
        }

        // trung bình
        if (value === 0) {
            if (ring === 1) return { fillColor: '#f9a825', fillOpacity: 0.85 };
            if (ring === 2) return { fillColor: '#ffd54f', fillOpacity: 0.55 };
            return { fillColor: '#fff9c4', fillOpacity: 0.30 };
        }

        // kém
        if (value === -1) {
            if (ring === 1) return { fillColor: '#c62828', fillOpacity: 0.85 };
            if (ring === 2) return { fillColor: '#ef5350', fillOpacity: 0.55 };
            return { fillColor: '#ffcdd2', fillOpacity: 0.30 };
        }

        // chưa có dự báo
        if (ring === 1) return { fillColor: '#0d47a1', fillOpacity: 0.85 };
        if (ring === 2) return { fillColor: '#42a5f5', fillOpacity: 0.55 };
        return { fillColor: '#bbdefb', fillOpacity: 0.30 };
    };

    const defaultZoneStyle = (ring) => {
        if (ring === 1) {
            return {
                color: '#0d47a1',
                weight: 0,
                fillColor: '#0d47a1',
                fillOpacity: 0.85,
            };
        }

        if (ring === 2) {
            return {
                color: '#42a5f5',
                weight: 0,
                fillColor: '#42a5f5',
                fillOpacity: 0.55,
            };
        }

        return {
            color: '#bbdefb',
            weight: 0,
            fillColor: '#bbdefb',
            fillOpacity: 0.30,
        };
    };

    const stationZoneStyle = (feature) => {
        const ring = feature?.properties?.ring;
        const stationId = feature?.properties?.maHieu;
        const prediction = predictions[Number(stationId)] || predictions[String(stationId)];
        const hourlyView = getSelectedStationHourData(stationId);

        const zoneColor = getZoneColorByPredictionAndRing(prediction, ring);
        const dynamicOpacityFactor = hourlyView?.reachFactor != null
            ? Math.max(0.45, Number(hourlyView.reachFactor))
            : 1;

        return {
            color: zoneColor.fillColor,
            weight: 0,
            fillColor: zoneColor.fillColor,
            fillOpacity: Math.min(1, zoneColor.fillOpacity * dynamicOpacityFactor),
        };
    };
    const onEachStationZoneFeature = (feature, layer) => {
        const props = feature?.properties || {};
        const ring = props.ring;
        const stationId = props.maHieu;

        const prediction =
            predictions?.[Number(stationId)] ||
            predictions?.[String(stationId)] ||
            (props.prediction_text != null ? { prediction_text: props.prediction_text } : null);

        const zoneColor = getZoneColorByPredictionAndRing(prediction, ring);
        const hasPredictionScore = props.prediction_text != null && props.prediction_text !== '';
        const predictionLabel = hasPredictionScore ? getPredictionLabel(prediction) : 'Ch\u01b0a c\u00f3 d\u1ef1 b\u00e1o';
        const predictionColor = getPredictionTextColor(prediction);
        const zoneArea = props.area_km2 != null ? Number(props.area_km2).toFixed(2) : '';
        const scoreBase = hasPredictionScore && props.s0 != null ? Number(props.s0).toFixed(3) : 'N/A';
        const impactFactor = props.impact_factor_24h != null ? Number(props.impact_factor_24h).toFixed(2) : '';
        const riskScore24 = props.risk_score_24h != null ? Number(props.risk_score_24h).toFixed(2) : 'N/A';
        const score24 = hasPredictionScore && props.s24 != null ? Number(props.s24).toFixed(3) : 'N/A';
        const areaT0 = hasPredictionScore && props.area_t0_km2 != null ? Number(props.area_t0_km2).toFixed(2) : 'N/A';
        const areaT24 = hasPredictionScore && props.area_t24_km2 != null ? Number(props.area_t24_km2).toFixed(2) : 'N/A';
        const deltaArea = hasPredictionScore && props.delta_area_km2 != null ? Number(props.delta_area_km2).toFixed(2) : 'N/A';
        const hasDepth = props.depth_m != null;
        const depthValue = hasDepth ? Number(props.depth_m).toFixed(2) : 'N/A';
        const depthFactor = hasDepth && props.depth_factor != null ? Number(props.depth_factor).toFixed(2) : 'N/A';
        const depthDistance = hasDepth && props.depth_distance_km != null ? Number(props.depth_distance_km).toFixed(1) : 'N/A';
        const reachFactor = props.station_reach_factor != null ? Number(props.station_reach_factor).toFixed(2) : 'N/A';
        const wind24 = props.wind_max_m_s_24h != null ? Number(props.wind_max_m_s_24h).toFixed(2) : 'N/A';
        const rain24 = props.rain_max_mm_24h != null ? Number(props.rain_max_mm_24h).toFixed(2) : 'N/A';
        const wave24 = props.wave_max_m_24h != null ? Number(props.wave_max_m_24h).toFixed(2) : 'N/A';
        const hourlyView = getSelectedStationHourData(stationId);
        const selectedTimeLabel = hourlyView?.timeLabel || formatForecastHourLabel(null, selectedForecastHour);
        const selectedImpactFactor = hourlyView?.factor != null ? Number(hourlyView.factor).toFixed(2) : impactFactor;
        const selectedImpactLabel = hourlyView?.label || props.impact_level_24h || '';
        const selectedReachFactor = hourlyView?.reachFactor != null ? Number(hourlyView.reachFactor).toFixed(2) : reachFactor;
        const selectedRiskScore = hourlyView?.riskScore != null ? Number(hourlyView.riskScore).toFixed(2) : riskScore24;
        const selectedWind = hourlyView?.wind != null ? Number(hourlyView.wind).toFixed(2) : wind24;
        const selectedRain = hourlyView?.rain != null ? Number(hourlyView.rain).toFixed(2) : rain24;
        const selectedWave = hourlyView?.wave != null ? Number(hourlyView.wave).toFixed(2) : wave24;
        const selectedScore = hasPredictionScore && props.s0 != null && hourlyView?.factor != null
            ? (Number(props.s0) * Number(hourlyView.factor)).toFixed(3)
            : score24;
        const selectedAreaAtHour = hasPredictionScore && props.s0 != null && props.area_km2 != null && hourlyView?.factor != null
            ? (Number(props.area_km2) * Number(props.s0) * Number(hourlyView.factor)).toFixed(2)
            : areaT24;
        const selectedDeltaArea = hasPredictionScore && props.area_t0_km2 != null && selectedAreaAtHour !== 'N/A'
            ? (Number(selectedAreaAtHour) - Number(props.area_t0_km2)).toFixed(2)
            : deltaArea;

        const popupContent = [
            '<div style="padding: 10px 12px; min-width: 320px; max-width: 380px; max-height: 320px; overflow-y: auto; text-align: left; line-height: 1.5;">',
            '<h2 style="margin: 0 0 8px 0; text-align: left;">Ph\u00e2n v\u00f9ng \u1ea3nh h\u01b0\u1edfng tr\u1ea1m</h2>',
            '<p style="margin: 4px 0; text-align: left;"><strong>M\u00e3 tr\u1ea1m:</strong> ' + (props.maHieu || '') + '</p>',
            '<p style="margin: 4px 0; text-align: left;"><strong>V\u1ecb tr\u00ed:</strong> ' + (props.vitri || '') + '</p>',
            '<p style="margin: 4px 0; text-align: left;"><strong>V\u00f2ng \u1ea3nh h\u01b0\u1edfng:</strong> ' + (props.ring || '') + '</p>',
            '<p style="margin: 4px 0; text-align: left;"><strong>M\u1ee9c \u1ea3nh h\u01b0\u1edfng:</strong> ' + (props.influence_label || '') + '</p>',
            '<p style="margin: 4px 0; text-align: left;"><strong>M\u1ed1c \u0111ang xem:</strong> ' + selectedTimeLabel + '</p>',
            '<p style="margin: 4px 0; text-align: left;"><strong>M\u1ee9c tham chi\u1ebfu t\u1eeb d\u1ef1 b\u00e1o tr\u1ea1m:</strong> <span style="color: ' + predictionColor + '; font-weight: 700;">' + predictionLabel + '</span></p>',
            '<p style="margin: 4px 0; text-align: left;"><strong>Di\u1ec7n t\u00edch h\u00ecnh h\u1ecdc c\u1ee7a v\u00f9ng t\u1ea1i gi\u1edd \u0111ang xem:</strong> ' + zoneArea + ' km2</p>',
            '<p style="margin: 4px 0; text-align: left;"><strong>Score n\u1ec1n tham chi\u1ebfu theo v\u00f2ng (S0):</strong> ' + scoreBase + '</p>',
            '<p style="margin: 0 0 6px 0; color: #666; font-size: 12px; text-align: left;">Score n\u1ec1n tham chi\u1ebfu \u0111\u01b0\u1ee3c suy ra t\u1eeb prediction c\u1ee7a tr\u1ea1m v\u00e0 tr\u1ecdng s\u1ed1 v\u00f2ng \u1ea3nh h\u01b0\u1edfng. \u0110\u1ed9 s\u00e2u kh\u00f4ng ph\u1ea1t tr\u1ef1c ti\u1ebfp v\u00e0o score n\u00e0y.</p>',
            '<p style="margin: 4px 0; text-align: left;"><strong>R\u1ee7i ro t\u1ed5ng h\u1ee3p t\u1ea1i gi\u1edd \u0111ang xem:</strong> ' + selectedImpactLabel + ' (risk=' + selectedRiskScore + ', F=' + selectedImpactFactor + ')</p>',
            '<p style="margin: 0 0 6px 0; color: #666; font-size: 12px; text-align: left;">R\u1ee7i ro n\u00e0y \u0111\u01b0\u1ee3c g\u1ed9p theo tr\u1ecdng s\u1ed1 g\u00f3 = 0.4, m\u01b0a = 0.2, s\u00f3ng = 0.4. Impact factor ch\u1ec9 l\u00e0m gi\u1ea3m score, kh\u00f4ng tr\u1ef1c ti\u1ebfp quy\u1ebft \u0111\u1ecbnh h\u00ecnh h\u1ecdc zone.</p>',
            '<p style="margin: 4px 0; text-align: left;"><strong>Gi\u00f3 t\u1ea1i gi\u1edd \u0111ang xem:</strong> ' + selectedWind + ' m/s</p>',
            '<p style="margin: 4px 0; text-align: left;"><strong>M\u01b0a t\u1ea1i gi\u1edd \u0111ang xem:</strong> ' + selectedRain + ' mm</p>',
            '<p style="margin: 4px 0; text-align: left;"><strong>S\u00f3ng t\u1ea1i gi\u1edd \u0111ang xem:</strong> ' + selectedWave + ' m</p>',
            '<p style="margin: 0 0 6px 0; color: #666; font-size: 12px; text-align: left;">Ba ch\u1ec9 s\u1ed1 n\u00e0y d\u00f9ng \u0111\u1ec3 suy ra risk score theo gi\u1edd, sau \u0111\u00f3 t\u00e1ch ra impact factor cho score v\u00e0 reach factor cho h\u00ecnh h\u1ecdc zone.</p>',
            '<p style="margin: 4px 0; text-align: left;"><strong>\u0110\u1ed9 s\u00e2u \u0111\u1ea1i di\u1ec7n:</strong> ' + depthValue + ' m</p>',
            '<p style="margin: 4px 0; text-align: left;"><strong>H\u1ec7 s\u1ed1 \u0111\u1ed9 s\u00e2u:</strong> ' + depthFactor + '</p>',
            '<p style="margin: 4px 0; text-align: left;"><strong>Kho\u1ea3ng c\u00e1ch \u0111\u1ebfn \u0111i\u1ec3m depth g\u1ea7n nh\u1ea5t:</strong> ' + depthDistance + ' km</p>',
            '<p style="margin: 0 0 6px 0; color: #666; font-size: 12px; text-align: left;">\u0110\u1ed9 s\u00e2u ch\u1ec9 tham gia v\u00e0o kh\u1ea3 n\u0103ng lan truy\u1ec1n v\u00e0 h\u00ecnh h\u1ecdc zone, kh\u00f4ng l\u00e0m gi\u1ea3m tr\u1ef1c ti\u1ebfp baseline score c\u1ee7a tr\u1ea1m.</p>',
            '<p style="margin: 4px 0; text-align: left;"><strong>Reach factor t\u1ea1i gi\u1edd \u0111ang xem:</strong> ' + selectedReachFactor + '</p>',
            '<p style="margin: 0 0 6px 0; color: #666; font-size: 12px; text-align: left;">Reach factor ch\u1ec9 \u0111i\u1ec1u khi\u1ec3n b\u00e1n k\u00ednh lan truy\u1ec1n `reach_t = R3 * reach_factor_t`, n\u00ean zone s\u1ebd co gi\u00e3n theo gi\u1edd tr\u00ean b\u1ea3n \u0111\u1ed3.</p>',
            '<p style="margin: 4px 0; text-align: left;"><strong>Score t\u1ea1i gi\u1edd \u0111ang xem:</strong> ' + selectedScore + '</p>',
            '<p style="margin: 0 0 6px 0; color: #666; font-size: 12px; text-align: left;">C\u00f4ng th\u1ee9c hi\u1ec7n t\u1ea1i: `S_t = S0 * impact_factor_t`. Impact factor l\u00e0m gi\u1ea3m score, c\u00f2n reach factor l\u00e0m thay \u0111\u1ed5i h\u00ecnh h\u1ecdc zone.</p>',
            '<p style="margin: 4px 0; text-align: left;"><strong>Di\u1ec7n t\u00edch hi\u1ec7u d\u1ee5ng tham chi\u1ebfu:</strong> ' + areaT0 + ' km2</p>',
            '<p style="margin: 0 0 6px 0; color: #666; font-size: 12px; text-align: left;">Di\u1ec7n t\u00edch hi\u1ec7u d\u1ee5ng tham chi\u1ebfu d\u1ef1a tr\u00ean baseline score v\u00e0 h\u00ecnh h\u1ecdc tham chi\u1ebfu c\u1ee7a zone.</p>',
            '<p style="margin: 4px 0; text-align: left;"><strong>Di\u1ec7n t\u00edch hi\u1ec7u d\u1ee5ng t\u1ea1i gi\u1edd \u0111ang xem:</strong> ' + selectedAreaAtHour + ' km2</p>',
            '<p style="margin: 0 0 6px 0; color: #666; font-size: 12px; text-align: left;">C\u00f4ng th\u1ee9c: `area_t = area_geometry_t * S_t`. V\u00ec v\u1eady gi\u00e1 tr\u1ecb n\u00e0y thay \u0111\u1ed5i theo c\u1ea3 shape zone l\u1eabn score theo gi\u1edd.</p>',
            '<p style="margin: 4px 0; text-align: left;"><strong>Bi\u1ebfn \u0111\u1ed9ng di\u1ec7n t\u00edch hi\u1ec7u d\u1ee5ng:</strong> ' + selectedDeltaArea + ' km2</p>',
            '<p style="margin: 0; color: #666; font-size: 12px; text-align: left;">So v\u1edbi m\u1ed1c tham chi\u1ebfu. S\u1ed1 \u00e2m l\u00e0 gi\u1ea3m, s\u1ed1 d\u01b0\u01a1ng l\u00e0 t\u0103ng. N\u1ebfu ch\u01b0a c\u00f3 d\u1ef1 b\u00e1o th\u00ec c\u00e1c gi\u00e1 tr\u1ecb n\u00e0y s\u1ebd l\u00e0 N/A.</p>',
            '</div>',
        ].join('');

        layer.bindPopup(popupContent, {
            maxWidth: 400,
            minWidth: 320,
            maxHeight: 340,
        });

        layer.on({
            mouseover: (e) => {
                e.target.setStyle({
                    color: zoneColor.fillColor,
                    weight: 1,
                    fillOpacity: Math.min(zoneColor.fillOpacity + 0.1, 1),
                });
                e.target.bringToFront();
            },
            mouseout: (e) => {
                e.target.setStyle(stationZoneStyle(feature));
            },
        });
    };

    const getPredictionTextColor = (prediction) => {
        const value = Number.parseInt(prediction?.prediction_text, 10);

        if (value === 1) return '#2e7d32';   // tốt
        if (value === 0) return '#f9a825';   // trung bình
        if (value === -1) return '#c62828';  // kém
        return '#1890ff';                    // chưa có dự báo
    };

    const getPredictionLabel = (prediction) => {
        const value = Number.parseInt(prediction?.prediction_text, 10);

        if (value === 1) return 'Tốt';
        if (value === 0) return 'Trung bình';
        if (value === -1) return 'Kém';
        return 'Chưa có dự báo';
    };



    // Fetch areas data (with latest predictions included)
    const fetchAreas = async () => {
        try {
            setLoading(true);
            const response = await axios.get('/api/express/areas/public/all', {
                params: {
                    search: debouncedSearchTerm,
                    area_type: areaType,
                    province: provinceFilter,
                    district: districtFilter,
                    include_prediction: true,
                },
            });

            const areasData = response.data.areas || [];
            setAreas(areasData);
            setFilteredAreas(areasData);

            // Extract predictions from areas data
            const predictionsMap = {};
            areasData.forEach((area) => {
                if (area.latestPrediction) {
                    predictionsMap[area.id] = area.latestPrediction;
                }
            });
            setPredictions(predictionsMap);

            // Set map center to first area if available
            if (areasData.length > 0) {
                const firstArea = areasData[0];
                setMapCenter([firstArea.latitude, firstArea.longitude]);
                setMapZoom(10);
            }
        } catch (error) {
            console.error('Error fetching areas:', error);
            message.error('Không thể tải dữ liệu khu vực');
        } finally {
            setLoading(false);
        }
    };

    const handleRebuildStationZones = async () => {
        try {
            setStationZonesLoading(true);
            await axios.post('/api/express/station-zones/rebuild');
            await fetchStationZones();
            message.success('Đã tính lại phân vùng trạm');
        } catch (error) {
            console.error('Error rebuilding station zones:', error);
            message.error('Không thể tính lại phân vùng trạm');
        } finally {
            setStationZonesLoading(false);
        }
    };

    // Debug function to check data
    const debugData = () => {
        console.log('Areas:', areas);
        console.log('Filtered Areas:', filteredAreas);
        console.log('Predictions:', predictions);
        console.log('Loading:', loading);
    };

    // Fetch provinces and districts
    const fetchLocationData = async () => {
        try {
            const [provincesRes, districtsRes] = await Promise.all([
                axios.get('/api/express/areas/public/provinces'),
                axios.get('/api/express/areas/public/districts'),
            ]);

            setProvinces(provincesRes.data || []);
            setDistricts(districtsRes.data || []);
            setFilteredDistricts(districtsRes.data || []);
        } catch (error) {
            console.error('Error fetching location data:', error);
        }
    };

    const fetchStationZones = async () => {
        try {
            setStationZonesLoading(true);
            const response = await axios.get('/api/express/station-zones/latest');
            setStationZonesGeoJSON(response.data);
        } catch (error) {
            console.error('Error fetching station zones:', error);
            message.error('Không thể tải phân vùng trạm');
        } finally {
            setStationZonesLoading(false);
        }
    };

    // Filter areas based on search and filters
    const filterAreas = () => {
        let filtered = areas;

        const normalizedSearch = debouncedSearchTerm.trim().toLowerCase();
        if (normalizedSearch) {
            filtered = filtered.filter(area =>
                area.name.toLowerCase().includes(normalizedSearch)
            );
        }

        if (areaType) {
            filtered = filtered.filter(area => area.area_type === areaType);
        }

        if (provinceFilter) {
            filtered = filtered.filter(area => area.province === provinceFilter);
        }

        if (districtFilter) {
            filtered = filtered.filter(area => area.district === districtFilter);
        }

        setFilteredAreas(filtered);
    };

    // Handle area selection from sidebar
    const handleAreaSelect = (area) => {
        console.log('handleAreaSelect called with area:', area);
        console.log('Central Meridian:', area?.Province?.central_meridian || 'Không có');
        console.log('Province Info:', area?.Province ? { id: area.Province.id, name: area.Province.name, central_meridian: area.Province.central_meridian } : 'Không có');
        setSelectedArea(area);
        setMapCenter([area.latitude, area.longitude]);
        setMapZoom(15);
        setIsDetailView(true);
        setIsFilterCardVisible(false);
        // fetch 2-week history for charts
        fetchHistory(area.id);
    };

    // Handle area click from map marker - only move map center, don't zoom or change selected area
    const handleAreaClick = (area) => {
        setMapCenter([area.latitude, area.longitude]);
        // Don't change zoom - keep current zoom level
    };

    // Handle area click from "Xem chi tiết" button - change selected area and switch to detail view
    const handleViewDetails = async (area) => {
        console.log('handleViewDetails called with area:', area);
        console.log('Central Meridian:', area?.Province?.central_meridian || 'Không có');
        console.log('Province Info:', area?.Province ? { id: area.Province.id, name: area.Province.name, central_meridian: area.Province.central_meridian } : 'Không có');
        setSelectedArea(area);
        setMapCenter([area.latitude, area.longitude]);
        setMapZoom(15);
        setIsDetailView(true);
        setIsFilterCardVisible(false);
        setIsDetailCardVisible(true); // Reset to show detail card when entering detail view

        // Fetch full prediction with NaturalElements for detail view
        try {
            const response = await axios.get(`/api/express/predictions/${area.id}/latest`);
            console.log('Latest prediction response:', response.data);
            console.log('NaturalElements:', response.data?.NaturalElements);
            if (response.data && response.data.id) {
                setPredictions(prev => {
                    const updated = {
                        ...prev,
                        [area.id]: response.data
                    };
                    console.log('Updated predictions state:', updated);
                    return updated;
                });
            }
        } catch (error) {
            console.error('Error fetching full prediction:', error);
        }

        // fetch 1 quarter history for charts
        fetchHistory(area.id);
    };
    const fetchHistory = async (areaId) => {
        try {
            console.log('Fetching history for area:', areaId);
            // Fetch 1 quarter of data using period param
            const res = await axios.get(`/api/express/predictions/${areaId}/history`, { params: { period: 'quarter' } });
            console.log('Full API response:', res);
            console.log('History API response data:', res.data);

            // Check if response has predictions array or is direct array
            let predictions = [];
            let latestPrediction = null;

            if (Array.isArray(res.data)) {
                predictions = res.data;
            } else if (res.data && Array.isArray(res.data.predictions)) {
                predictions = res.data.predictions;
                latestPrediction = res.data.latestPrediction; // Fallback from backend
            } else if (res.data && res.data.data && Array.isArray(res.data.data)) {
                predictions = res.data.data;
            }

            console.log('Parsed predictions array:', predictions);
            console.log('Number of predictions:', predictions.length);
            console.log('Latest prediction fallback:', latestPrediction);

            // If no predictions in period but have latestPrediction fallback, use it
            if (predictions.length === 0 && latestPrediction) {
                predictions = [latestPrediction];
                console.log('Using latestPrediction as fallback');
            }

            if (predictions.length === 0) {
                console.log('No predictions found, creating empty series');
                setHistoryByElement({});
                return;
            }

            // Create week range for last 13 weeks (1 quarter)
            const weekRange = [];
            for (let i = 12; i >= 0; i--) {
                const date = new Date();
                date.setDate(date.getDate() - (i * 7)); // Go back i weeks
                weekRange.push({
                    weekStart: new Date(date.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                    weekEnd: date.toISOString().split('T')[0],
                    displayDate: date.toISOString().split('T')[0] // Display end of week
                });
            }
            console.log('Week range:', weekRange);

            // Transform: for each element, build time series with 13 weeks
            const elementSeries = {};

            // First, collect all unique elements from predictions
            const allElements = new Set();
            const elementMeta = {}; // Store units and descriptions for each element
            predictions.forEach((p, index) => {
                console.log(`Processing prediction ${index}:`, p);
                if (p && p.NaturalElements && Array.isArray(p.NaturalElements)) {
                    p.NaturalElements.forEach((el) => {
                        if (el && el.name) {
                            allElements.add(el.name);
                            // Store metadata for each element (unit, description)
                            if (!elementMeta[el.name]) {
                                elementMeta[el.name] = {
                                    unit: el.unit || '',
                                    description: el.description || ''
                                };
                            }
                            console.log(`Found element: ${el.name}, value: ${el.PredictionNatureElement?.value}, description: ${el.description}`);
                        }
                    });
                }
            });

            console.log('All unique elements:', Array.from(allElements));

            // Sort predictions by date (newest first) for fallback logic
            const sortedPredictions = [...predictions].sort((a, b) =>
                new Date(b.createdAt) - new Date(a.createdAt)
            );

            // For each element, create 13-week series
            allElements.forEach(elementName => {
                elementSeries[elementName] = [];
                let lastKnownValue = null;
                let lastKnownUnit = elementMeta[elementName]?.unit || '';

                // Find the latest value for this element (for fallback)
                for (const p of sortedPredictions) {
                    if (p && p.NaturalElements) {
                        const el = p.NaturalElements.find(e => e && e.name === elementName);
                        if (el && el.PredictionNatureElement?.value !== undefined) {
                            lastKnownValue = parseFloat(el.PredictionNatureElement.value) || 0;
                            lastKnownUnit = el.unit || lastKnownUnit;
                            break;
                        }
                    }
                }

                weekRange.forEach(week => {
                    // Find the LATEST prediction within this week (filter all, take last one since sorted ASC)
                    const predictionsInWeek = predictions.filter(p => {
                        if (!p || !p.createdAt) return false;
                        const predictionDate = p.createdAt.split('T')[0];
                        return predictionDate >= week.weekStart && predictionDate <= week.weekEnd;
                    });
                    // Get the latest prediction in this week (last element since sorted by createdAt ASC)
                    const predictionForWeek = predictionsInWeek.length > 0 ? predictionsInWeek[predictionsInWeek.length - 1] : null;

                    if (predictionForWeek && predictionForWeek.NaturalElements) {
                        const element = predictionForWeek.NaturalElements.find(el => el && el.name === elementName);
                        if (element && element.PredictionNatureElement?.value !== undefined) {
                            const value = parseFloat(element.PredictionNatureElement.value) || 0;
                            lastKnownValue = value; // Update last known value
                            lastKnownUnit = element.unit || lastKnownUnit;
                            elementSeries[elementName].push({
                                date: week.displayDate,
                                value: value,
                                unit: lastKnownUnit
                            });
                        } else {
                            // Element not found in this prediction, use last known value
                            elementSeries[elementName].push({
                                date: week.displayDate,
                                value: lastKnownValue !== null ? lastKnownValue : 0,
                                unit: lastKnownUnit
                            });
                        }
                    } else {
                        // No prediction for this week, use last known value
                        elementSeries[elementName].push({
                            date: week.displayDate,
                            value: lastKnownValue !== null ? lastKnownValue : 0,
                            unit: lastKnownUnit
                        });
                    }
                });
            });

            console.log('Processed element series with 13 weeks:', elementSeries);
            console.log('Element metadata:', elementMeta);
            setHistoryByElement(elementSeries);
            setElementMeta(elementMeta);
        } catch (e) {
            console.error('Failed to fetch history', e);
            console.error('Error details:', e.response?.data || e.message);
        }
    };

    // Handle back button - return to search/list view
    const handleBackToList = () => {
        setIsDetailView(false);
        setSelectedArea(null);
        setIsDetailCardVisible(true); // Reset detail card visibility
    };

    // Handle province change
    const handleProvinceChange = (provinceId) => {
        setProvinceFilter(provinceId);
        setDistrictFilter('');

        if (provinceId) {
            const filtered = districts.filter(district => district.province_id === provinceId);
            setFilteredDistricts(filtered);
        } else {
            setFilteredDistricts(districts);
        }
    };

    // Load GeoJSON data
    useEffect(() => {
        const loadGeoJSON = async () => {
            try {
                const module = await import('../data/hoang_Truong_sa.json');
                const data = module.default || module;
                setHoangTruongSaGeoJSON(data);
                console.log('GeoJSON loaded successfully:', data.type, data.features?.length, 'features');
            } catch (error) {
                console.error('Error loading GeoJSON:', error);
            }
        };
        loadGeoJSON();
    }, []);

    // Initialize data
    useEffect(() => {
        fetchAreas();
        fetchLocationData();
        fetchStationZones();
    }, []);

    useEffect(() => {
        return () => {
            const map = mapRef.current;
            if (map && typeof map.remove === 'function') {
                try {
                    map.remove();
                } catch (error) {
                    console.warn('Failed to remove Leaflet map cleanly', error);
                }
            }

            document.querySelectorAll('.leaflet-container').forEach((element) => {
                try {
                    element.remove();
                } catch (error) {
                    console.warn('Failed to remove leftover Leaflet container', error);
                }
            });
        };
    }, []);

    // Deep-link support: /interactive-map?areaId=ID or ?lat=..&lon=..&zoom=..
    useEffect(() => {

        console.log('initialQueryHandled', initialQueryHandled);

        if (initialQueryHandled) return;
        const params = new URLSearchParams(window.location.search);
        const areaIdParam = params.get('areaId');
        const latParam = params.get('lat');
        const lonParam = params.get('lon');
        const zoomParam = params.get('zoom');

        console.log('areaIdParam', areaIdParam);
        console.log('latParam', latParam);
        console.log('lonParam', lonParam);
        console.log('zoomParam', zoomParam);

        const setZoomIf = (z) => {
            const n = Number(z);
            if (!Number.isNaN(n) && n > 0) setMapZoom(n);
        };

        if (areaIdParam) {
            console.log('areaIdParam', areaIdParam);
            (async () => {
                try {
                    const res = await axios.get(`/api/express/areas/public/area/${areaIdParam}`);
                    const area = res.data;
                    console.log('area', area);
                    if (area && area.latitude != null && area.longitude != null) {
                        handleAreaSelect(area);
                        setZoomIf(zoomParam || 15);
                    } else {
                        // Fallback to search/list view
                        setIsDetailView(false);
                    }
                } catch (e) {
                    setIsDetailView(false);
                } finally {
                    setInitialQueryHandled(true);
                }
            })();
            return;
        }

        if (latParam && lonParam) {
            const lat = Number(latParam);
            const lon = Number(lonParam);
            if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
                console.log('lat', lat);
                console.log('lon', lon);
                console.log('zoomParam', zoomParam);
                setMapCenter([lat, lon]);
                setZoomIf(zoomParam || 10);
            }
            setInitialQueryHandled(true);
        }
    }, [initialQueryHandled]);

    // Apply filters when they change
    useEffect(() => {
        filterAreas();
    }, [debouncedSearchTerm, areaType, provinceFilter, districtFilter, areas]);

    // Apply user role-based filtering (only if logged in)
    useEffect(() => {
        if (isAuthenticated && user?.role === 'manager') {
            const newProvince = user.province || '';
            const newDistrict = user.district || '';
            setProvinceFilter(newProvince);
            if (newProvince) {
                const filtered = districts.filter(d => d.province_id === newProvince);
                setFilteredDistricts(filtered);
                if (newDistrict && !filtered.some(d => d.id === newDistrict)) {
                    setDistrictFilter('');
                } else {
                    setDistrictFilter(newDistrict);
                }
                    } else {
                setFilteredDistricts(districts);
                setDistrictFilter(newDistrict);
            }
        }
    }, [districts, isAuthenticated, user]);

    return (
        <div className="map-with-sidebar-container">
            {isSidebarCollapsed && (
                <Tooltip placement="right" title={t('common.showSidebar') || 'Mở thanh bên'}>
                    <div
                        className="sidebar-handle"
                        onClick={() => setIsSidebarCollapsed(false)}
                        role="button"
                        aria-label="Expand sidebar"
                    >
                        <ArrowRightOutlined style={{ fontSize: 16 }} />
                    </div>
                </Tooltip>
            )}
            {/* Left Sidebar */}
            <div className={`left-sidebar${isSidebarCollapsed ? ' collapsed' : ''}`}>
                <Card className="sidebar-card">
                    {!isDetailView ? (
                        // Search and List View
                        <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <Button
                                    size="medium"
                                    onClick={() => setIsSidebarCollapsed(true)}
                                    icon={<ArrowLeftOutlined />}
                                >
                                    {t('common.hide') || 'Thu gọn'}
                                </Button>
                                <Button
                                    size="medium"
                                    onClick={() => setIsFilterCardVisible(!isFilterCardVisible)}
                                    className="filter-button"
                                    icon={<FilterOutlined />}
                                >
                                    {t('common.filter')}
                                </Button>
                            </div>


                            {/* Search */}
                            <Space direction="vertical" style={{ width: '100%', marginBottom: '16px' }}>
                                <Input
                                    placeholder={t('welcomePage.searchPlaceholder')}
                                    prefix={<SearchOutlined />}
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    allowClear
                                    size="large"
                                />

                                {/* Filters moved to right floating card */}

                                <div style={{ textAlign: 'center', marginTop: '8px' }}>
                                    <Text strong style={{ color: '#1890ff' }}>
                                        {filteredAreas.length} {t('area_list.title').toLowerCase()}
                                    </Text>
                                    {loading && <Spin size="medium" style={{ marginLeft: '8px' }} />}
                                    {window.location.hostname === 'localhost' && (
                                        <Button
                                            size="medium"
                                            onClick={debugData}
                                            style={{ marginLeft: '8px' }}
                                        >
                                            Debug
                                        </Button>
                                    )}
                                    <Button
                                        onClick={() => setShowStationZones(!showStationZones)}
                                        style={{ width: '100%', marginBottom: '12px', marginTop: '12px' }}
                                    >
                                        {showStationZones ? 'Ẩn phân vùng trạm' : 'Hiện phân vùng trạm'}
                                    </Button>
                                </div>
                            </Space>

                            {/* Areas List */}
                            <div id="scrollableDiv" className="areas-list">
                                {loading ? (
                                    <div style={{ textAlign: 'center', padding: '20px' }}>
                                        <Spin size="large" />
                                    </div>
                                ) : (
                                    <InfiniteScroll
                                        dataLength={filteredAreas.length}
                                        next={() => {
                                            fetchAreas();
                                        }}
                                        hasMore={filteredAreas.length < 50}
                                        loader={<Skeleton avatar paragraph={{ rows: 1 }} active />}
                                        endMessage={<Divider plain>Đã hết dữ liệu</Divider>}
                                        scrollableTarget="scrollableDiv"
                                    >
                                        <List
                                            dataSource={filteredAreas}
                                            renderItem={(area) => (
                                                <List.Item
                                                    className={`area-list-item ${selectedArea?.id === area.id ? 'selected' : ''}`}
                                                    onClick={() => handleAreaSelect(area)}

                                                >
                                                    <List.Item.Meta
                                                        avatar={
                                                            <div
                                                                className={`area-marker-icon ${area.area_type}`}
                                                            />
                                                        }
                                                        title={
                                                            <Space>
                                                                <Text strong style={{ fontSize: '14px' }}>
                                                                    {area.name}
                                                                </Text>
                                                                {predictions[area.id] && (
                                                                    <PredictionBadge
                                                                        prediction={predictions[area.id]}
                                                                        size="medium"
                                                                    />
                                                                )}
                                                            </Space>
                                                        }
                                                        description={
                                                            <Space direction="vertical" size="medium" style={{ width: '100%' }}>
                                                                <Text type="secondary" style={{ fontSize: '12px' }}>
                                                                    {area.Province?.name}, {area.District?.name}
                                                                </Text>
                                                                <Space>
                                                                    <Tag color={area.area_type === 'oyster' ? 'blue' : 'green'} size="medium">
                                                                        {area.area_type === 'oyster' ? t('common.oyster') : t('common.cobia')}
                                                                    </Tag>
                                                                    {area.area && (
                                                                        <Text type="secondary" style={{ fontSize: '11px' }}>
                                                                            {area.area} ha
                                                                        </Text>
                                                                    )}
                                                                </Space>
                                                                {predictions[area.id] && (
                                                                    <Text type="secondary" style={{ fontSize: '11px' }}>
                                                                        {t('detail.predictionLabel')}: {new Date(predictions[area.id].createdAt).toLocaleDateString('vi-VN')}
                                                                    </Text>
                                                                )}
                                                            </Space>
                                                        }
                                                    />
                                                </List.Item>
                                            )}
                                            locale={{ emptyText: t('area_list.noAreas') }}
                                        />
                                    </InfiniteScroll>
                                )}
                            </div>
                        </>
                    ) : (
                        // Detail View
                        <>
                            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
                                <Button
                                    type="text"
                                    icon={<ArrowLeftOutlined />}
                                    onClick={handleBackToList}
                                    style={{ marginRight: '8px' }}
                                >
                                    {t('common.back')}
                                </Button>
                                <Title level={4} style={{ margin: 0, flex: 1, textAlign: 'center' }}>
                                    {t('detail.infoTitle')}
                                </Title>
                            </div>

                            {selectedArea && (
                                <Card
                                    size="medium"
                                    style={{ marginBottom: '16px' }}
                                    title={
                                        <Space>
                                            <InfoCircleOutlined />
                                            <Text strong>{selectedArea.name}</Text>
                                        </Space>
                                    }
                                >
                                    <Space direction="vertical" style={{ width: '100%' }}>
                                        <div>
                                            <Text strong>{t('detail.typeLabel')}: </Text>
                                            <Tag color={selectedArea.area_type === 'oyster' ? 'blue' : 'green'}>
                                                {selectedArea.area_type === 'oyster' ? t('common.oyster') : t('common.cobia')}
                                            </Tag>
                                        </div>
                                        <div>
                                            <Text strong>{t('detail.predictionLabel')}: </Text>
                                            <PredictionBadge
                                                prediction={predictions[selectedArea.id]}
                                            />
                                        </div>
                                        {predictions[selectedArea.id] && (
                                            <div>
                                                <Text strong>{t('detail.predictionDate')}: </Text>
                                                <Text>{new Date(predictions[selectedArea.id].createdAt).toLocaleDateString('vi-VN')}</Text>
                                            </div>
                                        )}
                                        <div>
                                            <Text strong>{t('detail.location')}: </Text>
                                            <Space size="medium" wrap style={{ width: '100%', marginTop: '4px' }}>
                                                <Tag color="geekblue">WGS84: Lat {Number(selectedArea.latitude).toFixed(6)}°, Lon {Number(selectedArea.longitude).toFixed(6)}°</Tag>
                                                {(() => {
                                                    const res = convertWGS84ToVN2000(selectedArea.latitude, selectedArea.longitude);
                                                    if (!res) return null;
                                                    return <Tag color="purple">VN2000: X (E) {Math.round(res.x)} m, Y (N) {Math.round(res.y)} m (zone {res.zone}°)</Tag>;
                                                })()}
                                            </Space>
                                        </div>
                                        {selectedArea.area && (
                                            <div>
                                                <Text strong>{t('detail.area')}: </Text>
                                                <Text>{selectedArea.area} ha</Text>
                                            </div>
                                        )}
                                        <div>
                                            <Text strong>{t('detail.address')}: </Text>
                                            <Text>{selectedArea.Province?.name}, {selectedArea.District?.name}</Text>
                                        </div>
                                        <div style={{ marginTop: '12px' }}>
                                            <Space direction="vertical" style={{ width: '100%' }}>
                                                {predictions[selectedArea.id] && (predictions[selectedArea.id]?.NaturalElements?.length > 0 || Object.keys(historyByElement).length > 0) && (
                                                    <Button
                                                        size="large"
                                                        onClick={() => setIsDetailCardVisible(!isDetailCardVisible)}
                                                        type={isDetailCardVisible ? "default" : "primary"}
                                                        block
                                                    >
                                                        {isDetailCardVisible ? t('common.hideDetails') : t('common.showDetails')}
                                                    </Button>
                                                )}
                                                {(userRole === 'admin' || userRole === 'manager') && (
                                                    <Button
                                                        size="large"
                                                        onClick={() => {
                                                            navigate(`/areas?areaId=${selectedArea.id}&action=update`);
                                                        }}
                                                        type="primary"
                                                        block
                                                    >
                                                        {t('common.updateArea') || 'Cập nhật khu vực'}
                                                    </Button>
                                                )}
                                                {userRole === 'expert' && (
                                                    <Button
                                                        size="large"
                                                        onClick={() => {
                                                            navigate(`/create-prediction?areaId=${selectedArea.id}`);
                                                        }}
                                                        type="primary"
                                                        block
                                                    >
                                                        {t('common.createPrediction') || 'Tạo dự đoán mới'}
                                                    </Button>
                                                )}
                                                <Button
                                                    size="large"
                                                    onClick={() => navigate(`/email-subscription/${selectedArea.id}`)}
                                                    type="default"
                                                    block
                                                >
                                                    {t('common.subscribeEmail')}
                                                </Button>
                                            </Space>
                                        </div>
                                    </Space>
                                </Card>
                            )}
                        </>
                    )}
                </Card>
            </div>

            {/* Right Detail Card - only in detail view and when visible and has prediction */}
            {isDetailView && isDetailCardVisible && selectedArea && predictions[selectedArea.id] && (
                <div className="right-detail">
                    <Card size="medium" title="Chi tiết yếu tố môi trường">
                        <Space direction="vertical" style={{ width: '100%' }}>
                            {window.location.hostname === 'localhost' && (
                                <Button onClick={() => fetchHistory(selectedArea?.id)} type="dashed" size="medium">
                                    Test History API
                                </Button>
                            )}
                            {/* Debug info */}
                            {window.location.hostname === 'localhost' && (
                                <Text type="secondary" style={{ fontSize: '10px' }}>
                                    NaturalElements: {predictions[selectedArea.id]?.NaturalElements?.length || 0} |
                                    History keys: {Object.keys(historyByElement).length}
                                </Text>
                            )}
                            {/* Show message if no data */}
                            {!predictions[selectedArea.id]?.NaturalElements?.length && Object.keys(historyByElement).length === 0 && (
                                <div style={{ textAlign: 'center', padding: '20px' }}>
                                    <Spin size="medium" />
                                    <Text type="secondary" style={{ display: 'block', marginTop: '8px' }}>Đang tải dữ liệu...</Text>
                                </div>
                            )}
                            {/* Render from NaturalElements if available, otherwise from historyByElement keys */}
                            {(predictions[selectedArea.id]?.NaturalElements?.length > 0 || Object.keys(historyByElement).length > 0) &&
                                (predictions[selectedArea.id]?.NaturalElements?.length > 0
                                    ? predictions[selectedArea.id].NaturalElements
                                    : Object.keys(historyByElement).map(name => ({
                                        id: name,
                                        name,
                                        unit: elementMeta[name]?.unit || historyByElement[name]?.[0]?.unit || '',
                                        description: elementMeta[name]?.description || ''
                                    }))
                                ).map((el) => (
                                    <div key={el.id || el.name} style={{ marginBottom: '12px', padding: '8px', border: '1px solid #f0f0f0', borderRadius: '4px' }}>
                                        <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: '4px' }}>
                                            <Space size="medium">
                                                <Text strong>{el.name}</Text>
                                                {(el.description || elementMeta[el.name]?.description) && (
                                                    <Tooltip title={el.description || elementMeta[el.name]?.description} placement="top">
                                                        <QuestionCircleOutlined style={{ color: '#1890ff', cursor: 'pointer', fontSize: '14px' }} />
                                                    </Tooltip>
                                                )}
                                            </Space>
                                            <Text>{el.PredictionNatureElement?.value || historyByElement[el.name]?.slice(-1)[0]?.value || ''} {el.unit || elementMeta[el.name]?.unit || ''}</Text>
                                        </Space>
                                        {/* Chart */}
                                        <div style={{ height: 140 }}>
                                            {(() => {
                                                const elementData = historyByElement[el.name] || [];
                                                const chartData = elementData.map(d => ({
                                                    ...d,
                                                    dateLabel: new Date(d.date).toLocaleDateString('vi-VN'),
                                                    value: parseFloat(d.value) || 0
                                                }));
                                                console.log(`Chart data for ${el.name}:`, chartData);
                                                console.log('Raw historyByElement:', historyByElement[el.name]);

                                                return chartData.length > 0 ? (
                                                    <ResponsiveContainer width="100%" height="100%">
                                                        <LineChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                                                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                                            <XAxis
                                                                dataKey="dateLabel"
                                                                tick={{ fontSize: 10 }}
                                                                interval="preserveStartEnd"
                                                                angle={-45}
                                                                textAnchor="end"
                                                                height={60}
                                                            />
                                                            <YAxis
                                                                tick={{ fontSize: 10 }}
                                                                width={50}
                                                                domain={['auto', 'auto']}
                                                                allowDecimals={false}
                                                                tickFormatter={(value) => Math.round(value)}
                                                            />
                                                            <RTooltip content={<SmallTooltip unit={el.unit} />} />
                                                            <Line
                                                                type="monotone"
                                                                dataKey="value"
                                                                stroke="#1890ff"
                                                                strokeWidth={2}
                                                                dot={false}
                                                                activeDot={{ r: 4, stroke: '#1890ff', strokeWidth: 2 }}
                                                            />
                                                        </LineChart>
                                                    </ResponsiveContainer>
                                                ) : (
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', background: '#f9f9f9', borderRadius: '4px' }}>
                                                        <Text type="secondary" style={{ fontSize: '11px' }}>Chưa có dữ liệu lịch sử</Text>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                ))}
                        </Space>
                    </Card>
                </div>
            )
            }

            {/* Map */}
            <div className="map-container">
                {showStationZones && <StationZoneLegend />}
                {showStationZones && (
                    <StationZoneTimeControl
                        forecastHours={forecastHours}
                        selectedForecastHour={selectedForecastHour}
                        onForecastHourChange={setSelectedForecastHour}
                        selectedForecastLabel={selectedForecastLabel}
                    />
                )}
                <MapContainer
                    center={mapCenter}
                    zoom={mapZoom}
                    style={{ height: '100%', width: '100%' }}
                    ref={mapRef}
                    crs={L.CRS.EPSG3857}
                >
                    <TileLayer
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    />

                    <MapUpdater center={mapCenter} zoom={mapZoom} />
                    {showStationZones && (displayedStationZonesGeoJSON || stationZonesGeoJSON) && (
                        <GeoJSON
                            key={`station-zones-${selectedForecastHour}-${forecastHours.length}`}
                            data={displayedStationZonesGeoJSON || stationZonesGeoJSON}
                            style={stationZoneStyle}
                            onEachFeature={onEachStationZoneFeature}
                        />
                    )}

                    {filteredAreas.map((area) => (
                        <AreaMarker
                            key={area.id}
                            area={area}
                            prediction={predictions[area.id]}
                            onAreaClick={handleAreaClick}
                            onViewDetails={handleViewDetails}
                            selectedArea={selectedArea}
                            navigate={navigate}
                            isDetailView={isDetailView}
                        />
                    ))}

                    {/* Prediction Circles - only show in detail view */}
                    {isDetailView && selectedArea && (
                        <PredictionCircle
                            area={selectedArea}
                            prediction={predictions[selectedArea.id]}
                        />
                    )}

                    {/* GeoJSON Layer for Hoang Sa and Truong Sa */}
                    {hoangTruongSaGeoJSON && (
                        <>
                            <GeoJSON
                                data={hoangTruongSaGeoJSON}
                                style={{
                                    fillColor: '#3388ff',
                                    weight: 1,
                                    opacity: 0.8,
                                    color: '#0078A8',
                                    fillOpacity: 0.4
                                }}
                                onEachFeature={(feature, layer) => {
                                    if (feature.properties) {
                                        const { Name_VI, Name_EN, ISO3166_2_ } = feature.properties;
                                        layer.bindPopup(`
                                            <div style="padding: 8px;">
                                                <h4 style="margin: 0 0 8px 0;">${Name_VI}</h4>
                                                <p style="margin: 0;"><strong>English:</strong> ${Name_EN}</p>
                                                <p style="margin: 4px 0 0 0;"><strong>Code:</strong> ${ISO3166_2_}</p>
                                            </div>
                                        `);
                                    }
                                }}
                            />
                            <GeoJSONLabels
                                data={hoangTruongSaGeoJSON}
                                language={i18n.language || 'vi'}
                            />
                        </>
                    )}

                </MapContainer>
            </div>

            {/* Right Floating Filter Card */}
            {!isDetailView && isFilterCardVisible && (
                <div className="right-filter">
                    <Card size="medium" title={t('common.filter')}>
                        <Space direction="vertical" style={{ width: '100%' }}>
                            <div>
                                <Text strong style={{ fontSize: '12px', color: '#666' }}>{t('filter.areaType')}</Text>
                                <Select
                                    placeholder={t('filter.areaTypePlaceholder')}
                                    value={areaType}
                                    onChange={setAreaType}
                                    style={{ width: '100%', marginTop: '4px' }}
                                    allowClear
                                    size="medium"
                                >
                                    <Option value="oyster">{t('common.oyster')}</Option>
                                    <Option value="cobia">{t('common.cobia')}</Option>
                                </Select>
                            </div>

                            <div>
                                <Text strong style={{ fontSize: '12px', color: '#666' }}>{t('filter.province')}</Text>
                                <Select
                                    placeholder={t('filter.provincePlaceholder')}
                                    value={provinceFilter}
                                    onChange={handleProvinceChange}
                                    style={{ width: '100%', marginTop: '4px' }}
                                    allowClear
                                    size="medium"
                                    disabled={userRole === 'manager'}
                                >
                                    {provinces.map(province => (
                                        <Option key={province.id} value={province.id}>
                                            {province.name}
                                        </Option>
                                    ))}
                                </Select>
                            </div>

                            <div>
                                <Text strong style={{ fontSize: '12px', color: '#666' }}>{t('filter.district')}</Text>
                                <Select
                                    placeholder={t('filter.districtPlaceholder')}
                                    value={districtFilter}
                                    onChange={setDistrictFilter}
                                    style={{ width: '100%', marginTop: '4px' }}
                                    allowClear
                                    size="medium"
                                    disabled={userRole === 'manager' && user?.district}
                                >
                                    {filteredDistricts.map(district => (
                                        <Option key={district.id} value={district.id}>
                                            {district.name}
                                        </Option>
                                    ))}
                                </Select>
                            </div>

                            <Button
                                size="medium"
                                onClick={() => setIsFilterCardVisible(false)}
                                style={{ width: '100%', marginTop: '8px' }}
                            >
                                {t('common.close')}
                            </Button>
                        </Space>
                    </Card>
                </div>
            )}
        </div>
    );
};

export default InteractiveMap;
