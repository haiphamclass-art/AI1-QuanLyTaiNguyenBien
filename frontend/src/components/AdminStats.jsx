import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useSelector } from 'react-redux';
import axios from '../axios';
import { useTranslation } from 'react-i18next';
import {
    Card, Row, Col, Statistic, Typography, Space, Segmented, Spin, message, Empty, Result, Alert, Tag, Badge, Tooltip, Divider, DatePicker, Skeleton
} from 'antd';
import {
    EnvironmentOutlined, UserOutlined, PieChartOutlined, BarChartOutlined,
    ArrowUpOutlined, ArrowDownOutlined, MinusOutlined, WarningOutlined,
    CheckCircleOutlined, CloseCircleOutlined,
    DownOutlined, UpOutlined
} from '@ant-design/icons';
import * as am5 from '@amcharts/amcharts5';
import * as am5xy from '@amcharts/amcharts5/xy';
import * as am5percent from '@amcharts/amcharts5/percent';
import * as am5hierarchy from '@amcharts/amcharts5/hierarchy';
import am5themes_Animated from '@amcharts/amcharts5/themes/Animated';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

// Palette màu cân bằng - không quá chói, không quá nhạt
const COLORS = [
    '#5b8ff9', // Xanh dương
    '#5ad8a6', // Xanh lá  
    '#f6bd16', // Vàng
    '#e86452', // Đỏ cam
    '#6dc8ec', // Xanh cyan
    '#945fb9', // Tím
    '#ff9845', // Cam
    '#1e9493', // Teal
    '#ff99c3', // Hồng
    '#269a99', // Xanh ngọc
    '#9270ca', // Tím lavender
    '#6aa9e8', // Xanh sky
];

// Palette cho Treemap - cùng sắc độ, tránh màu sáng chói
const TREEMAP_COLORS = [
    '#3d7ea6', // Xanh dương đậm
    '#5a9e6f', // Xanh lá đậm
    '#c4793a', // Cam đất
    '#8b6b9c', // Tím đậm
    '#c75d5d', // Đỏ gạch
    '#4a8f8f', // Teal đậm
    '#9c7a4a', // Nâu vàng
    '#6b8cae', // Xanh thép
    '#a67b8c', // Hồng đậm
    '#5d8a5d', // Xanh rêu
    '#8a7a6b', // Nâu xám
    '#7a6b8a', // Tím xám
];

// Màu cho kết quả dự đoán (Tốt/TB/Kém)
const PREDICTION_RESULT_COLORS = ['#73d13d', '#ffc53d', '#ff7a45']; // Green, Yellow, Orange-Red

// Pie Chart Component
const PieChartComponent = ({ data, colors }) => {
    const chartRef = useRef(null);
    const chartDivRef = useRef(null);

    useEffect(() => {
        if (!data || data.length === 0) return;

        const root = am5.Root.new(chartDivRef.current);
        root.setThemes([am5themes_Animated.new(root)]);

        // Set ColorSet cho theme
        root.interfaceColors.set("grid", am5.color(0xffffff));

        const chart = root.container.children.push(
            am5percent.PieChart.new(root, {
                layout: root.verticalLayout,
            })
        );

        const series = chart.series.push(
            am5percent.PieSeries.new(root, {
                valueField: 'value',
                categoryField: 'category',
            })
        );

        // Set colors cho series thông qua ColorSet
        series.get("colors").set("colors", colors.map(c => am5.color(c)));

        // Set data (không cần map fill thủ công nữa)
        series.data.setAll(
            data.map((item) => ({
                category: item.name,
                value: item.value,
            }))
        );

        series.slices.template.setAll({
            stroke: am5.color('#fff'),
            strokeWidth: 2,
        });

        series.labels.template.setAll({
            text: '{category}: {value}',
            fontSize: 12,
        });

        series.ticks.template.setAll({
            disabled: true,
        });

        const legend = chart.children.push(
            am5.Legend.new(root, {
                centerX: am5.percent(50),
                x: am5.percent(50),
                marginTop: 15,
                marginBottom: 15,
            })
        );

        legend.data.setAll(series.dataItems);

        chartRef.current = root;

        return () => {
            root.dispose();
        };
    }, [data, colors]);

    if (!data || data.length === 0) {
        return <Empty description="No data" />;
    }

    return <div ref={chartDivRef} style={{ width: '100%', height: '320px' }} />;
};

// Treemap Component
const TreemapComponent = ({ data, colors = COLORS }) => {
    const chartRef = useRef(null);
    const chartDivRef = useRef(null);

    useEffect(() => {
        if (!data || data.length === 0) return;

        const root = am5.Root.new(chartDivRef.current);
        root.setThemes([am5themes_Animated.new(root)]);

        const container = root.container.children.push(
            am5.Container.new(root, {
                width: am5.percent(100),
                height: am5.percent(100),
                layout: root.verticalLayout,
                paddingTop: 10,
                paddingBottom: 10,
                paddingLeft: 10,
                paddingRight: 10,
            })
        );

        // Tính toán để giảm chênh lệch tỷ lệ
        const values = data.map(item => item.value).filter(v => v > 0);
        if (values.length === 0) {
            return;
        }

        const minValue = Math.min(...values);
        const maxValue = Math.max(...values);
        const ratio = maxValue / minValue;

        const minPercent = 0.03;
        const adjustedData = ratio > 15
            ? data.map((item) => ({
                name: item.name,
                value: Math.max(item.value, maxValue * minPercent),
                originalValue: item.value,
            }))
            : data.map((item) => ({
                name: item.name,
                value: item.value,
                originalValue: item.value,
            }));

        // Wrap data trong children array cho treemap
        const treemapData = {
            name: 'root',
            children: adjustedData,
        };

        const series = container.children.push(
            am5hierarchy.Treemap.new(root, {
                singleBranchOnly: false,
                downDepth: 1,
                upDepth: 0,
                initialDepth: 1,
                valueField: 'originalValue',
                categoryField: 'name',
                childDataField: "children",
            })
        );

        // Set colors thông qua ColorSet
        series.get("colors").set("colors", colors.map(c => am5.color(c)));

        series.data.setAll([treemapData]);

        // Label settings
        series.labels.template.setAll({
            fontSize: 12,
            fill: am5.color('#fff'),
            text: '{name}\n{value}',
            minFontSize: 10,
            maxFontSize: 16,
            oversizedBehavior: 'hide',
        });

        series.rectangles.template.setAll({
            stroke: am5.color('#fff'),
            strokeWidth: 2,
            cornerRadiusTL: 10,
            cornerRadiusTR: 10,
            cornerRadiusBL: 10,
            cornerRadiusBR: 10,
        });

        chartRef.current = root;

        return () => {
            root.dispose();
        };
    }, [data, colors]);

    if (!data || data.length === 0) {
        return <Empty description="No data" />;
    }

    return <div ref={chartDivRef} style={{ width: '100%', height: '320px' }} />;
};

// Trend Line Chart - Xu hướng theo chu kỳ với 3 smooth lines (Tốt/TB/Kém), không có dot
const TrendLineChart = ({ data }) => {
    const chartRef = useRef(null);
    const chartDivRef = useRef(null);

    useEffect(() => {
        if (!data || !Array.isArray(data) || data.length === 0) {
            if (chartRef.current) {
                chartRef.current.dispose();
                chartRef.current = null;
            }
            return;
        }

        const root = am5.Root.new(chartDivRef.current);
        root.setThemes([am5themes_Animated.new(root)]);

        const chart = root.container.children.push(am5xy.XYChart.new(root, {
            panX: true,
            panY: false,
            wheelX: 'panX',
            wheelY: 'zoomX',
            paddingLeft: 0,
            layout: root.verticalLayout,
        }));

        // X Axis - Category
        const xAxis = chart.xAxes.push(am5xy.CategoryAxis.new(root, {
            categoryField: 'label',
            renderer: am5xy.AxisRendererX.new(root, {
                minGridDistance: 60,
                cellStartLocation: 0.1,
                cellEndLocation: 0.9,
            }),
            tooltip: am5.Tooltip.new(root, {}),
        }));
        xAxis.data.setAll(data);

        // Y Axis
        const yAxis = chart.yAxes.push(am5xy.ValueAxis.new(root, {
            renderer: am5xy.AxisRendererY.new(root, {}),
            min: 0,
        }));

        // Create smooth series for each result type (NO dots)
        const createSeries = (name, field, color) => {
            const series = chart.series.push(am5xy.SmoothedXLineSeries.new(root, {
                name: name,
                xAxis: xAxis,
                yAxis: yAxis,
                valueYField: field,
                categoryXField: 'label',
                stroke: am5.color(color),
                fill: am5.color(color),
                tooltip: am5.Tooltip.new(root, {
                    labelText: `${name}: {valueY} vùng ({${field}Percent}%)`,
                }),
            }));

            // Smooth stroke
            series.strokes.template.setAll({
                strokeWidth: 3,
            });

            // Fill area dưới đường (nhẹ)
            series.fills.template.setAll({
                fillOpacity: 0.1,
                visible: true,
            });

            // KHÔNG thêm bullets (dots)

            series.data.setAll(data);
            return series;
        };

        createSeries('Tốt', 'good', '#73d13d');           // Xanh lá
        createSeries('Trung bình', 'average', '#ffc53d'); // Vàng
        createSeries('Kém', 'poor', '#ff7a45');           // Cam đỏ

        // Legend
        const legend = chart.children.push(am5.Legend.new(root, {
            centerX: am5.percent(50),
            x: am5.percent(50),
        }));
        legend.data.setAll(chart.series.values);

        // Cursor
        const cursor = chart.set('cursor', am5xy.XYCursor.new(root, {
            behavior: 'none',
            xAxis: xAxis,
        }));
        cursor.lineY.set('visible', false);

        chartRef.current = root;

        return () => {
            root.dispose();
        };
    }, [data]);

    if (!data || data.length === 0) {
        return <Empty description="Chưa có dữ liệu" />;
    }

    return <div ref={chartDivRef} style={{ width: '100%', height: '350px' }} />;
};

const LineChartComponent = ({ data, granularity = 'day' }) => {
    const chartRef = useRef(null);
    const chartDivRef = useRef(null);

    useEffect(() => {
        // Chỉ dispose chart khi thực sự không có dữ liệu và đã có chart trước đó
        // Không dispose ngay khi data tạm thời empty để tránh flicker
        if (!data || !Array.isArray(data) || data.length === 0) {
            // Chỉ dispose nếu đã có chart và data thực sự không có (không phải đang loading)
            if (chartRef.current && (!data || data.length === 0)) {
                // Delay một chút để tránh dispose khi đang fetch
                const timeoutId = setTimeout(() => {
                    if (chartRef.current && (!data || !Array.isArray(data) || data.length === 0)) {
                        chartRef.current.dispose();
                        chartRef.current = null;
                    }
                }, 500);
                return () => clearTimeout(timeoutId);
            }
            return;
        }

        // Tạo root
        const root = am5.Root.new(chartDivRef.current);
        root.setThemes([am5themes_Animated.new(root)]);

        // Tạo chart với pan/zoom
        const chart = root.container.children.push(am5xy.XYChart.new(root, {
            panX: true,
            panY: true,
            wheelX: 'panX',
            wheelY: 'zoomX',
            pinchZoomX: true,
            paddingLeft: 0,
        }));

        // Tạo DateAxis - điều chỉnh theo granularity
        const xAxis = chart.xAxes.push(
            am5xy.DateAxis.new(root, {
                maxDeviation: 0.05,
                baseInterval: granularity === 'month'
                    ? { timeUnit: 'month', count: 1 }
                    : { timeUnit: 'day', count: 1 },
                renderer: am5xy.AxisRendererX.new(root, {
                    minGridDistance: 80,
                    minorGridEnabled: true,
                    pan: 'zoom',
                }),
                tooltip: am5.Tooltip.new(root, {}),
            })
        );

        // Giới hạn zoom out - tối đa 14 giá trị (12 + 1 mỗi bên)
        xAxis.events.on('selectionextremeschanged', () => {
            const selection = xAxis.get('selection');
            if (selection && chartData.length > 0) {
                const firstDate = chartData[0].date;
                const lastDate = chartData[chartData.length - 1].date;
                const totalRange = lastDate - firstDate;
                const maxRange = totalRange * (14 / 12); // Cho phép zoom out tối đa 14/12 lần

                const currentRange = selection.endDate.getTime() - selection.startDate.getTime();
                if (currentRange > maxRange) {
                    // Giới hạn zoom out
                    const center = (selection.startDate.getTime() + selection.endDate.getTime()) / 2;
                    const newStart = new Date(center - maxRange / 2);
                    const newEnd = new Date(center + maxRange / 2);
                    xAxis.zoomToDates(newStart, newEnd);
                }
            }
        });

        // Tạo ValueAxis
        const yAxis = chart.yAxes.push(
            am5xy.ValueAxis.new(root, {
                maxDeviation: 1,
                renderer: am5xy.AxisRendererY.new(root, {
                    pan: 'zoom',
                }),
            })
        );

        // Tạo SmoothedXLineSeries - tự động làm mượt đường line (KHÔNG có dot)
        const series = chart.series.push(
            am5xy.SmoothedXLineSeries.new(root, {
                name: 'Subscriptions',
                xAxis: xAxis,
                yAxis: yAxis,
                valueYField: 'value',
                valueXField: 'date',
                stroke: am5.color('#722ed1'),
                fill: am5.color('#722ed1'),
                tooltip: am5.Tooltip.new(root, {
                    labelText: 'Số email đăng ký: {valueY}',
                }),
            })
        );

        // Cấu hình stroke - smooth line
        series.strokes.template.setAll({
            strokeWidth: 3,
        });

        // Cấu hình fill - area nhẹ
        series.fills.template.setAll({
            fillOpacity: 0.15,
            visible: true,
        });

        // KHÔNG thêm bullets (dots)

        // Parse và set data - chỉ lấy tối đa 12 điểm cuối cùng
        const limitedData = data.length > 12 ? data.slice(-12) : data;

        const chartData = limitedData
            .map((item, index) => {
                if (!item || !item.date) {
                    console.warn(`⚠️ [LineChart] Invalid item at index ${index}:`, item);
                    return null;
                }

                // Parse date string 'YYYY-MM-DD'
                const dateStr = item.date;
                let date;

                if (typeof dateStr === 'string' && dateStr.includes('-')) {
                    const parts = dateStr.split('-');
                    if (parts.length === 3) {
                        const year = parseInt(parts[0], 10);
                        const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed
                        const day = parseInt(parts[2], 10);
                        date = new Date(year, month, day);
                    } else {
                        date = new Date(dateStr);
                    }
                } else {
                    date = new Date(dateStr);
                }

                if (isNaN(date.getTime())) {
                    console.warn(`⚠️ [LineChart] Invalid date at index ${index}:`, dateStr);
                    return null;
                }

                const parsed = {
                    date: date.getTime(),
                    value: item.value,
                };

                // Log một vài item đầu và cuối để debug
                if (index < 2 || index >= limitedData.length - 2) {
                    console.log(`📅 [LineChart] Parsed item ${index}:`, {
                        originalDate: dateStr,
                        timestamp: parsed.date,
                        value: parsed.value,
                        dateObj: date.toISOString(),
                    });
                }

                return parsed;
            })
            .filter((item) => item !== null);

        console.log('📊 [LineChart] Final chart data:', {
            originalLength: data.length,
            limitedLength: limitedData.length,
            finalLength: chartData.length,
            expected: 12,
            matches: chartData.length <= 12,
            firstFew: chartData.slice(0, 3),
            lastFew: chartData.slice(-3),
        });

        if (chartData.length > 12) {
            console.warn('⚠️ [LineChart] More than 12 data points, limiting to last 12');
        }

        series.data.setAll(chartData);

        // Set zoom để chỉ hiển thị 12 điểm cuối cùng
        if (chartData.length > 0) {
            const firstDate = chartData[0].date;
            const lastDate = chartData[chartData.length - 1].date;
            const initialRange = lastDate - firstDate;

            // Tính toán phạm vi tối đa cho phép (14 điểm = 12 + 1 mỗi bên)
            // Nếu có 12 điểm, mỗi điểm chiếm 1 khoảng, 14 điểm = 13 khoảng
            const maxRange = initialRange * (14 / 12);

            // Set zoom ban đầu
            xAxis.zoomToDates(new Date(firstDate), new Date(lastDate));

            // Lắng nghe sự kiện zoom để giới hạn
            xAxis.events.on('selectionextremeschanged', () => {
                const selection = xAxis.get('selection');
                if (selection && chartData.length > 0) {
                    const currentStart = selection.startDate.getTime();
                    const currentEnd = selection.endDate.getTime();
                    const currentRange = currentEnd - currentStart;

                    // Nếu zoom out quá mức cho phép (vượt quá 14 điểm)
                    if (currentRange > maxRange) {
                        // Tính center của selection hiện tại
                        const center = (currentStart + currentEnd) / 2;

                        // Giới hạn về phạm vi tối đa, giữ nguyên center
                        const newStart = new Date(center - maxRange / 2);
                        const newEnd = new Date(center + maxRange / 2);

                        // Đảm bảo không vượt quá phạm vi dữ liệu
                        const minDate = chartData[0].date;
                        const maxDate = chartData[chartData.length - 1].date;

                        let finalStart = newStart.getTime();
                        let finalEnd = newEnd.getTime();

                        // Nếu vượt quá biên trái, điều chỉnh
                        if (finalStart < minDate) {
                            finalStart = minDate;
                            finalEnd = finalStart + maxRange;
                        }

                        // Nếu vượt quá biên phải, điều chỉnh
                        if (finalEnd > maxDate) {
                            finalEnd = maxDate;
                            finalStart = finalEnd - maxRange;
                        }

                        // Áp dụng zoom giới hạn
                        xAxis.zoomToDates(new Date(finalStart), new Date(finalEnd));
                    }
                }
            });
        }

        // Log sau khi set data để verify
        console.log('✅ [LineChart] Data set to series, series dataItems count:', series.dataItems.length);

        // Thêm cursor với cấu hình tốt hơn
        const cursor = chart.set('cursor', am5xy.XYCursor.new(root, {
            behavior: 'none',
        }));
        cursor.lineY.set('visible', false);

        chartRef.current = root;

        return () => {
            root.dispose();
        };
    }, [data, granularity]);

    if (!data || !Array.isArray(data) || data.length === 0) {
        return <Empty description="No data" />;
    }

    return <div ref={chartDivRef} style={{ width: '100%', height: '320px' }} />;
};

const AdminStats = () => {
    const { t } = useTranslation();
    const { user } = useSelector((state) => state.auth);

    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        areaCount: 0,
        userCount: 0,
        predictionPieData: [],
        areaDistributionData: [],
        areaTypeData: [], // Phân bố theo loại vùng (oyster/cobia)
        byTypePerProvince: [], // Phân bố chi tiết theo loại và tỉnh
        emailSeriesRaw: [],
        // Thống kê dự đoán mới
        comparison: null, // So sánh đợt mới nhất vs đợt trước
        consecutivePoor: null, // Vùng xấu liên tiếp
        trendByBatch: null, // Xu hướng theo đợt
        statsByAreaType: null, // Thống kê theo loại vùng với so sánh
    });

    const [timeGranularity, setTimeGranularity] = useState('day');
    const [selectedDate, setSelectedDate] = useState(null); // Date filter cho prediction stats
    const [trendPeriod, setTrendPeriod] = useState('month'); // Chu kỳ cho biểu đồ xu hướng
    const [areaTypeFilter, setAreaTypeFilter] = useState(null); // Filter theo loại vùng nuôi: null (tất cả), 'oyster', 'cobia'
    const [poorAreasExpanded, setPoorAreasExpanded] = useState(false); // Mở rộng danh sách vùng xấu
    const fetchingRef = useRef(false);
    const predictionFetchingRef = useRef(false);

    const decoded = useMemo(() => user || null, [user]);

    useEffect(() => {
        if (!decoded) {
            setLoading(false);
            return;
        }
        if (fetchingRef.current) return;

        const fetchStats = async () => {
            fetchingRef.current = true;
            setLoading(true);

            try {
                const { role, province, district } = decoded;
                const commonParams = { role, ...(province && { province }), ...(district && { district }) };

                // Fetch stats cơ bản (không phụ thuộc date filter)
                const [areasCombinedRes, usersRes] = await Promise.all([
                    axios.get('/api/express/areas/stats/combined', { params: commonParams }),
                    axios.get('/api/express/auth/stats/summary', { params: { role, province } }),
                ]);

                // Lấy dữ liệu từ API combined
                const { totalAreas, byType, byProvince, byTypePerProvince } = areasCombinedRes.data || {};

                console.log('📊 [AdminStats] Combined stats:', { totalAreas, byType, byProvince });

                // Phân bố theo tỉnh
                const areaDistribution = (byProvince || []).map((item, index) => ({
                    name: item.provinceName || t('stats.unknownProvince'),
                    value: item.count || 0,
                    fill: COLORS[index % COLORS.length],
                }));

                // Phân bố theo loại vùng (từ API, không cần tính client-side)
                const areaTypeDistribution = (byType || []).map((item, index) => ({
                    name: item.name,
                    value: item.count,
                    fill: index === 0 ? COLORS[0] : COLORS[3], // Xanh lá cho Hàu, Xanh dương cho Cá giò
                }));

                console.log('📊 [AdminStats] Area type distribution:', areaTypeDistribution);

                setStats(prev => ({
                    ...prev,
                    areaCount: totalAreas || 0,
                    userCount: usersRes.data?.totalUsers || 0,
                    areaDistributionData: areaDistribution,
                    areaTypeData: areaTypeDistribution,
                    byTypePerProvince: byTypePerProvince || [],
                }));

            } catch (error) {
                console.error('Error fetching stats:', error);
                message.error(t('stats.loadError'));
            } finally {
                setLoading(false);
                fetchingRef.current = false;
            }
        };

        fetchStats();
    }, [decoded, t]);

    // Fetch prediction stats riêng (phụ thuộc vào selectedDate)
    useEffect(() => {
        if (!decoded) return;
        if (predictionFetchingRef.current) return;

        const fetchPredictionStats = async () => {
            predictionFetchingRef.current = true;

            try {
                const { role, province, district } = decoded;
                const commonParams = { role, ...(province && { province }), ...(district && { district }) };

                // Thêm beforeDate nếu có chọn ngày
                if (selectedDate) {
                    commonParams.beforeDate = selectedDate.format('YYYY-MM-DD');
                }

                const [predictionsRes, comparisonRes, consecutivePoorRes, trendByBatchRes, statsByAreaTypeRes] = await Promise.all([
                    axios.get('/api/express/predictions/stats/latest-ratio', { params: { ...commonParams, ...(areaTypeFilter && { areaType: areaTypeFilter }) } }),
                    axios.get('/api/express/predictions/stats/comparison', { params: { ...commonParams, period: trendPeriod, ...(areaTypeFilter && { areaType: areaTypeFilter }) } }),
                    axios.get('/api/express/predictions/stats/consecutive-poor', { params: { ...commonParams, minConsecutive: 2, ...(areaTypeFilter && { areaType: areaTypeFilter }) } }),
                    axios.get('/api/express/predictions/stats/trend-by-batch', { params: { ...commonParams, limit: 12, period: trendPeriod, ...(areaTypeFilter && { areaType: areaTypeFilter }) } }),
                    axios.get('/api/express/predictions/stats/by-area-type', { params: commonParams }),
                ]);

                const { good = 0, average = 0, poor = 0 } = predictionsRes.data || {};
                // Giữ tất cả categories để màu không bị lệch (Tốt luôn xanh, TB luôn vàng, Kém luôn đỏ)
                const pieData = [
                    { name: t('detail.good'), value: good },
                    { name: t('detail.average'), value: average },
                    { name: t('detail.poor'), value: poor },
                ];

                setStats(prev => ({
                    ...prev,
                    predictionPieData: pieData,
                    comparison: comparisonRes.data || null,
                    consecutivePoor: consecutivePoorRes.data || null,
                    trendByBatch: trendByBatchRes.data || null,
                    statsByAreaType: statsByAreaTypeRes.data || null,
                }));
            } catch (error) {
                console.error('Error fetching prediction stats:', error);
                message.error('Lỗi khi tải dữ liệu thống kê dự đoán');
            } finally {
                predictionFetchingRef.current = false;
            }
        };

        fetchPredictionStats();
    }, [decoded, selectedDate, trendPeriod, areaTypeFilter, t]);

    // Fetch email stats riêng (vì cần granularity và limit)
    // Sử dụng ref riêng để tránh conflict với fetchingRef chính
    const emailFetchingRef = useRef(false);
    const emailLastFetchRef = useRef({ granularity: null, timestamp: 0 });

    useEffect(() => {
        if (!decoded) {
            // Reset ref khi decoded chưa có để đảm bảo fetch lại khi decoded có
            emailFetchingRef.current = false;
            emailLastFetchRef.current = { granularity: null, timestamp: 0 };
            return;
        }

        // Ở lần đầu tiên (granularity chưa được fetch), luôn fetch
        const lastFetch = emailLastFetchRef.current;
        const isFirstLoad = lastFetch.granularity === null;

        // Kiểm tra xem đã fetch với granularity này chưa (trong vòng 1 giây)
        // Chỉ check nếu không phải lần đầu tiên
        if (!isFirstLoad) {
            const now = Date.now();
            if (
                lastFetch.granularity === timeGranularity &&
                now - lastFetch.timestamp < 1000 &&
                emailFetchingRef.current
            ) {
                return; // Đã fetch gần đây với cùng granularity, bỏ qua
            }
        }

        // Reset fetching ref khi granularity thay đổi (không phải lần đầu)
        if (!isFirstLoad && emailFetchingRef.current && lastFetch.granularity !== timeGranularity) {
            emailFetchingRef.current = false;
        }

        if (emailFetchingRef.current && !isFirstLoad) {
            return; // Đang fetch, bỏ qua (trừ lần đầu tiên)
        }

        const fetchEmailStats = async () => {
            emailFetchingRef.current = true;
            emailLastFetchRef.current = { granularity: timeGranularity, timestamp: Date.now() };

            try {
                const { role, province, district } = decoded;
                const emailParams = {
                    is_active: true,
                    granularity: timeGranularity,
                    limit: 12,
                    role,
                    ...(province && { province }),
                    ...(district && { district }),
                };

                const emailsRes = await axios.get('/api/express/emails/stats/subscriptions', { params: emailParams });

                if (emailsRes.data?.series && Array.isArray(emailsRes.data.series)) {
                    setStats(prev => ({
                        ...prev,
                        emailSeriesRaw: emailsRes.data.series
                    }));
                } else {
                    setStats(prev => ({
                        ...prev,
                        emailSeriesRaw: []
                    }));
                }
            } catch (error) {
                console.error('❌ [AdminStats] Error fetching email stats:', error);
                setStats(prev => ({
                    ...prev,
                    emailSeriesRaw: []
                }));
            } finally {
                emailFetchingRef.current = false;
            }
        };

        fetchEmailStats();
    }, [timeGranularity, decoded]);

    // Tính toán emailSeries trực tiếp từ state, không dùng useMemo
    // Chỉ tính toán khi có dữ liệu thực sự
    const getEmailSeries = () => {
        if (!stats.emailSeriesRaw || !Array.isArray(stats.emailSeriesRaw) || stats.emailSeriesRaw.length === 0) {
            return [];
        }

        // Backend đã xử lý và giới hạn dữ liệu, chỉ cần map lại
        return stats.emailSeriesRaw
            .filter(item => item && item.date && item.value !== undefined)
            .map(item => ({
                date: item.date,
                value: item.value,
            }));
    };

    const emailSeries = getEmailSeries();

    if (!decoded) return <Result status="403" title="Access Denied" />;

    return (
        <div style={{ width: '100%' }}>
            <Card style={{ width: '100%', borderRadius: 12 }} styles={{ body: { padding: 24 } }}>
                <Space direction="vertical" style={{ width: '100%' }} size="large">
                    <Title level={3}>{t('stats.title')}</Title>

                    <Spin spinning={loading} tip={t('common.loading')}>
                        <Space direction="vertical" style={{ width: '100%' }} size="large">
                            {/* === PHẦN 1: TỔNG QUAN === */}
                            <Row gutter={[16, 16]}>
                                <Col xs={24} sm={12} lg={6}>
                                    <Card variant='borderless'>
                                        <Statistic
                                            title={t('stats.totalAreas')}
                                            value={stats.areaCount}
                                            prefix={<EnvironmentOutlined />}
                                        />
                                    </Card>
                                </Col>
                                <Col xs={24} sm={12} lg={6}>
                                    <Card variant='borderless'>
                                        <Statistic
                                            title={t('stats.totalUsers')}
                                            value={stats.userCount}
                                            prefix={<UserOutlined />}
                                        />
                                    </Card>
                                </Col>
                                <Col xs={24} sm={12} lg={6}>
                                    <Card variant='borderless'>
                                        <Statistic
                                            title="Vùng xấu liên tiếp"
                                            value={stats.consecutivePoor?.total || 0}
                                            prefix={<WarningOutlined />}
                                            valueStyle={{ color: stats.consecutivePoor?.total > 0 ? '#ff4d4f' : '#52c41a' }}
                                        />
                                    </Card>
                                </Col>
                                <Col xs={24} sm={12} lg={6}>
                                    <Card variant='borderless'>
                                        <Statistic
                                            title="Vùng cải thiện"
                                            value={stats.comparison?.changes?.improved || 0}
                                            prefix={<ArrowUpOutlined />}
                                            valueStyle={{ color: '#52c41a' }}
                                            suffix={
                                                stats.comparison?.changes?.worsened > 0 && (
                                                    <Text type="danger" style={{ fontSize: 14 }}>
                                                        / {stats.comparison.changes.worsened} xấu đi
                                                    </Text>
                                                )
                                            }
                                        />
                                    </Card>
                                </Col>
                            </Row>

                            {/* === BỘ LỌC THỜI GIAN CHO THỐNG KÊ DỰ ĐOÁN === */}
                            <Card size="medium">
                                <Space wrap>
                                    <Text strong>Xem thống kê dự đoán tại thời điểm:</Text>
                                    <DatePicker
                                        value={selectedDate}
                                        onChange={(date) => setSelectedDate(date)}
                                        placeholder="Chọn ngày (mặc định: hiện tại)"
                                        format="DD/MM/YYYY"
                                        allowClear
                                        style={{ width: 200 }}
                                    />
                                    {selectedDate && (
                                        <Tag color="blue">
                                            Đang xem dữ liệu đến ngày {selectedDate.format('DD/MM/YYYY')}
                                        </Tag>
                                    )}
                                </Space>
                                <Divider style={{ margin: '12px 0' }} />
                                <Space wrap>
                                    <Text strong>Lọc theo loại vùng nuôi:</Text>
                                    <Segmented
                                        value={areaTypeFilter}
                                        onChange={(value) => setAreaTypeFilter(value)}
                                        options={[
                                            { label: 'Tất cả', value: null },
                                            { label: 'Hàu', value: 'oyster' },
                                            { label: 'Cá giò', value: 'cobia' },
                                        ]}

                                    />
                                </Space>
                            </Card>

                            {/* === PHẦN 2: SO SÁNH KẾT QUẢ ĐỢT MỚI NHẤT VS ĐỢT TRƯỚC === */}
                            {stats.comparison && (
                                <Card
                                    title={
                                        <Space direction="vertical" style={{ width: '100%' }}>
                                            <Space>
                                                <BarChartOutlined />
                                                <span>So sánh kết quả đợt mới nhất với đợt trước</span>
                                                <Text type="secondary" style={{ fontSize: 12 }}>
                                                    (Theo chu kỳ: {trendPeriod === 'day' ? 'Ngày' : trendPeriod === 'week' ? 'Tuần' : trendPeriod === 'month' ? 'Tháng' : 'Quý'})
                                                </Text>
                                            </Space>
                                        </Space>
                                    }
                                    extra={
                                        <Space>
                                            <Segmented
                                                size="medium"
                                                value={trendPeriod}
                                                onChange={(val) => setTrendPeriod(val)}
                                                options={[
                                                    { label: 'Ngày', value: 'day' },
                                                    { label: 'Tuần', value: 'week' },
                                                    { label: 'Tháng', value: 'month' },
                                                    { label: 'Quý', value: 'quarter' },
                                                ]}
                                            />
                                        </Space>
                                    }
                                >
                                    <Row gutter={[24, 16]}>
                                        {/* Đợt hiện tại */}
                                        <Col xs={24} md={8}>
                                            <div style={{ textAlign: 'center', padding: '16px', background: '#f6ffed', borderRadius: 8 }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                    <Text strong style={{ fontSize: 16 }}>Thời điểm hiện tại</Text>
                                                    <Text type="secondary" style={{ fontSize: 12 }}>({selectedDate?.format('DD/MM/YYYY') || new Date().toLocaleDateString('vi-VN')})</Text>
                                                </div>
                                                <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-around' }}>
                                                    <div>
                                                        <div style={{ fontSize: 28, fontWeight: 'bold', color: '#52c41a' }}>
                                                            {stats.comparison.current.good}
                                                        </div>
                                                        <Tag color="success">Tốt</Tag>
                                                    </div>
                                                    <div>
                                                        <div style={{ fontSize: 28, fontWeight: 'bold', color: '#faad14' }}>
                                                            {stats.comparison.current.average}
                                                        </div>
                                                        <Tag color="warning">TB</Tag>
                                                    </div>
                                                    <div>
                                                        <div style={{ fontSize: 28, fontWeight: 'bold', color: '#ff4d4f' }}>
                                                            {stats.comparison.current.poor}
                                                        </div>
                                                        <Tag color="error">Kém</Tag>
                                                    </div>
                                                </div>
                                            </div>
                                        </Col>

                                        {/* Thay đổi */}
                                        <Col xs={24} md={8}>
                                            <div style={{ textAlign: 'center', padding: '16px', background: '#f5f5f5', borderRadius: 8 }}>
                                                <Text strong style={{ fontSize: 16 }}>Thay đổi so với {trendPeriod === 'day' ? 'ngày' : trendPeriod === 'week' ? 'tuần' : trendPeriod === 'month' ? 'tháng' : 'quý'} trước</Text>
                                                <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-around' }}>
                                                    <Tooltip title="Vùng cải thiện kết quả">
                                                        <div>
                                                            <div style={{ fontSize: 28, fontWeight: 'bold', color: '#52c41a' }}>
                                                                <ArrowUpOutlined /> {stats.comparison.changes.improved}
                                                            </div>
                                                            <Text type="success">Cải thiện</Text>
                                                        </div>
                                                    </Tooltip>
                                                    <Tooltip title="Vùng không đổi kết quả">
                                                        <div>
                                                            <div style={{ fontSize: 28, fontWeight: 'bold', color: '#8c8c8c' }}>
                                                                <MinusOutlined /> {stats.comparison.changes.unchanged}
                                                            </div>
                                                            <Text type="secondary">Không đổi</Text>
                                                        </div>
                                                    </Tooltip>
                                                    <Tooltip title="Vùng kết quả xấu đi">
                                                        <div>
                                                            <div style={{ fontSize: 28, fontWeight: 'bold', color: '#ff4d4f' }}>
                                                                <ArrowDownOutlined /> {stats.comparison.changes.worsened}
                                                            </div>
                                                            <Text type="danger">Xấu đi</Text>
                                                        </div>
                                                    </Tooltip>
                                                </div>
                                            </div>
                                        </Col>

                                        {/* Đợt trước */}
                                        <Col xs={24} md={8}>
                                            <div style={{ textAlign: 'center', padding: '16px', background: '#f0f0f0', borderRadius: 8 }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                    <Text strong style={{ fontSize: 16, color: '#8c8c8c' }}>{trendPeriod === 'day' ? 'Ngày' : trendPeriod === 'week' ? 'Tuần' : trendPeriod === 'month' ? 'Tháng' : 'Quý'} trước</Text>
                                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                                        {trendPeriod === 'quarter' ?
                                                            `(${dayjs(selectedDate || new Date()).subtract(1, 'quarter').format('Q/YYYY')})` :
                                                            `(${dayjs(selectedDate || new Date()).subtract(1, trendPeriod).format('DD/MM/YYYY')})`
                                                        }
                                                    </Text>
                                                </div>
                                                <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-around' }}>
                                                    <div>
                                                        <div style={{ fontSize: 28, fontWeight: 'bold', color: '#8c8c8c' }}>
                                                            {stats.comparison.previous.good}
                                                        </div>
                                                        <Tag>Tốt</Tag>
                                                    </div>
                                                    <div>
                                                        <div style={{ fontSize: 28, fontWeight: 'bold', color: '#8c8c8c' }}>
                                                            {stats.comparison.previous.average}
                                                        </div>
                                                        <Tag>TB</Tag>
                                                    </div>
                                                    <div>
                                                        <div style={{ fontSize: 28, fontWeight: 'bold', color: '#8c8c8c' }}>
                                                            {stats.comparison.previous.poor}
                                                        </div>
                                                        <Tag>Kém</Tag>
                                                    </div>
                                                </div>
                                            </div>
                                        </Col>
                                    </Row>

                                    {/* Chi tiết vùng thay đổi */}
                                    {(stats.comparison.details?.improved?.length > 0 || stats.comparison.details?.worsened?.length > 0) && (
                                        <div style={{ marginTop: 16 }}>
                                            <Divider style={{ margin: '16px 0' }} />
                                            <Row gutter={[16, 16]}>
                                                {stats.comparison.details?.worsened?.length > 0 && (
                                                    <Col xs={24} md={12}>
                                                        <Text strong type="danger">
                                                            <CloseCircleOutlined /> Vùng xấu đi ({stats.comparison.details.worsened.length})
                                                        </Text>
                                                        <div style={{ marginTop: 8 }}>
                                                            {stats.comparison.details.worsened.slice(0, 5).map((item, index) => (
                                                                <div key={index} style={{ padding: '6px 0', borderBottom: index < Math.min(stats.comparison.details.worsened.length, 5) - 1 ? '1px solid #f0f0f0' : 'none' }}>
                                                                    <Text>{item.areaName}</Text>
                                                                    <span style={{ marginLeft: 8 }}>
                                                                        <Tag color="blue">{item.fromText}</Tag>
                                                                        →
                                                                        <Tag color="red">{item.toText}</Tag>
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </Col>
                                                )}
                                                {stats.comparison.details?.improved?.length > 0 && (
                                                    <Col xs={24} md={12}>
                                                        <Text strong type="success">
                                                            <CheckCircleOutlined /> Vùng cải thiện ({stats.comparison.details.improved.length})
                                                        </Text>
                                                        <div style={{ marginTop: 8 }}>
                                                            {stats.comparison.details.improved.slice(0, 5).map((item, index) => (
                                                                <div key={index} style={{ padding: '6px 0', borderBottom: index < Math.min(stats.comparison.details.improved.length, 5) - 1 ? '1px solid #f0f0f0' : 'none' }}>
                                                                    <Text>{item.areaName}</Text>
                                                                    <span style={{ marginLeft: 8 }}>
                                                                        <Tag color="orange">{item.fromText}</Tag>
                                                                        →
                                                                        <Tag color="green">{item.toText}</Tag>
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </Col>
                                                )}
                                            </Row>
                                        </div>
                                    )}
                                </Card>
                            )}

                            {/* === PHẦN 3: CẢNH BÁO VÙNG XẤU LIÊN TIẾP === */}
                            {stats.consecutivePoor && stats.consecutivePoor.total > 0 && (() => {
                                const areas = stats.consecutivePoor.areas || [];
                                const hasMore = areas.length > 2;
                                const displayAreas = poorAreasExpanded ? areas : areas.slice(0, 2);

                                return (
                                    <Alert
                                        type="error"
                                        showIcon
                                        icon={<WarningOutlined />}
                                        message={
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <Text strong>
                                                    Cảnh báo: {stats.consecutivePoor.total} vùng có kết quả KÉM liên tiếp ≥ {stats.consecutivePoor.minConsecutive} đợt
                                                </Text>
                                                {hasMore && (
                                                    <span
                                                        onClick={() => setPoorAreasExpanded(!poorAreasExpanded)}
                                                        style={{
                                                            cursor: 'pointer',
                                                            color: '#ff4d4f',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: 4,
                                                            fontSize: 13
                                                        }}
                                                    >
                                                        {poorAreasExpanded ? (
                                                            <>Thu gọn <UpOutlined /></>
                                                        ) : (
                                                            <>Xem thêm {areas.length - 2} vùng <DownOutlined /></>
                                                        )}
                                                    </span>
                                                )}
                                            </div>
                                        }
                                        description={
                                            <div style={{ marginTop: 8 }}>
                                                {displayAreas.map((item, index) => (
                                                    <div key={index} style={{ padding: '8px 0', borderBottom: index < displayAreas.length - 1 ? '1px solid #ffccc7' : 'none' }}>
                                                        <Badge
                                                            count={`${item.consecutiveCount} đợt`}
                                                            style={{ backgroundColor: '#ff4d4f' }}
                                                        />
                                                        <Text strong style={{ marginLeft: 12 }}>{item.areaName}</Text>
                                                        <Tag style={{ marginLeft: 8 }}>{item.areaTypeName}</Tag>
                                                        <Text type="secondary" style={{ marginLeft: 8 }}>
                                                            {item.province}{item.district ? `, ${item.district}` : ''}
                                                        </Text>
                                                    </div>
                                                ))}
                                            </div>
                                        }
                                    />
                                );
                            })()}

                            {/* === PHẦN 4: XU HƯỚNG THEO CHU KỲ === */}
                            <Card
                                title={
                                    <Space>
                                        <BarChartOutlined />
                                        <span>Xu hướng kết quả theo chu kỳ</span>
                                        {stats.trendByBatch?.startDate && stats.trendByBatch?.endDate && (
                                            <Text type="secondary" style={{ fontSize: 12, fontWeight: 'normal' }}>
                                                ({stats.trendByBatch.startDate} → {stats.trendByBatch.endDate})
                                            </Text>
                                        )}
                                    </Space>
                                }
                                extra={
                                    <Space>
                                        <Segmented
                                            size="medium"
                                            value={trendPeriod}
                                            onChange={(val) => setTrendPeriod(val)}
                                            options={[
                                                { label: 'Ngày', value: 'day' },
                                                { label: 'Tuần', value: 'week' },
                                                { label: 'Tháng', value: 'month' },
                                                { label: 'Quý', value: 'quarter' },
                                            ]}
                                        />
                                    </Space>
                                }
                            >
                                <TrendLineChart data={stats.trendByBatch?.trend || []} />
                            </Card>

                            {/* === PHẦN 5: THỐNG KÊ THEO LOẠI VÙNG === */}
                            {stats.statsByAreaType?.byAreaType && (
                                <Card title={<><PieChartOutlined /> Thống kê theo loại vùng nuôi</>}>
                                    <Row gutter={[16, 16]}>
                                        {stats.statsByAreaType.byAreaType.map(item => (
                                            <Col xs={24} md={12} key={item.type}>
                                                <Card
                                                    size="medium"
                                                    title={
                                                        <Space>
                                                            <Tag color={item.type === 'oyster' ? 'green' : 'blue'}>
                                                                {item.name}
                                                            </Tag>
                                                            <Text type="secondary">({item.current.total} vùng)</Text>
                                                        </Space>
                                                    }
                                                >
                                                    <Row gutter={8}>
                                                        <Col span={8}>
                                                            <Statistic
                                                                title="Tốt"
                                                                value={item.current.good}
                                                                valueStyle={{ color: '#52c41a', fontSize: 20 }}
                                                                suffix={
                                                                    item.changes.improved > 0 && (
                                                                        <Text type="success" style={{ fontSize: 12 }}>
                                                                            <ArrowUpOutlined />{item.changes.improved}
                                                                        </Text>
                                                                    )
                                                                }
                                                            />
                                                        </Col>
                                                        <Col span={8}>
                                                            <Statistic
                                                                title="TB"
                                                                value={item.current.average}
                                                                valueStyle={{ color: '#faad14', fontSize: 20 }}
                                                            />
                                                        </Col>
                                                        <Col span={8}>
                                                            <Statistic
                                                                title="Kém"
                                                                value={item.current.poor}
                                                                valueStyle={{ color: '#ff4d4f', fontSize: 20 }}
                                                                suffix={
                                                                    item.changes.worsened > 0 && (
                                                                        <Text type="danger" style={{ fontSize: 12 }}>
                                                                            <ArrowDownOutlined />{item.changes.worsened}
                                                                        </Text>
                                                                    )
                                                                }
                                                            />
                                                        </Col>
                                                    </Row>
                                                </Card>
                                            </Col>
                                        ))}
                                    </Row>
                                </Card>
                            )}

                            {/* === PHẦN 6: KẾT QUẢ DỰ ĐOÁN MỚI NHẤT + TỶ LỆ LOẠI VÙNG === */}
                            <Row gutter={[16, 16]}>
                                <Col xs={24} lg={12}>
                                    <Card
                                        title={<><PieChartOutlined /> {t('stats.latestPredictionPie')}</>}
                                        styles={{ body: { padding: 0 } }}
                                    >
                                        <PieChartComponent
                                            data={stats.predictionPieData}
                                            colors={PREDICTION_RESULT_COLORS}
                                        />
                                    </Card>
                                </Col>
                                {stats.areaTypeData && stats.areaTypeData.length > 0 && (
                                    <Col xs={24} lg={12}>
                                        <Card
                                            title={<><PieChartOutlined /> Tỷ lệ loại vùng (Hàu/Cá giò)</>}
                                            styles={{ body: { padding: 0 } }}
                                        >
                                            <PieChartComponent
                                                data={stats.areaTypeData}
                                                colors={[COLORS[0], COLORS[3]]}
                                            />
                                        </Card>
                                    </Col>
                                )}
                            </Row>

                            {/* === PHẦN 7: PHÂN BỐ THEO TỈNH === */}
                            <Card
                                title={<><EnvironmentOutlined /> {t('stats.areaDistribution')}</>}
                                styles={{ body: { padding: 0 } }}
                            >
                                <TreemapComponent data={stats.areaDistributionData} colors={TREEMAP_COLORS} />
                            </Card>

                            {/* === PHẦN 9: EMAIL === */}
                            <Card
                                title={t('stats.emailCumulative')}
                                extra={
                                    <Segmented
                                        size="medium"
                                        value={timeGranularity}
                                        onChange={(val) => setTimeGranularity(val)}
                                        options={[
                                            { label: t('stats.byDay'), value: 'day' },
                                            { label: t('stats.byMonth'), value: 'month' },
                                        ]}
                                    />
                                }
                                styles={{ body: { padding: 0 } }}
                            >
                                <LineChartComponent data={emailSeries} granularity={timeGranularity} />
                            </Card>
                        </Space>
                    </Spin>
                </Space>
            </Card>
        </div>
    );
};

export default AdminStats;
