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

// Palette mÃ u cÃ¢n báº±ng - khÃ´ng quÃ¡ chÃ³i, khÃ´ng quÃ¡ nháº¡t
const COLORS = [
    '#5b8ff9', // Xanh dÆ°Æ¡ng
    '#5ad8a6', // Xanh lÃ¡  
    '#f6bd16', // VÃ ng
    '#e86452', // Äá» cam
    '#6dc8ec', // Xanh cyan
    '#945fb9', // TÃ­m
    '#ff9845', // Cam
    '#1e9493', // Teal
    '#ff99c3', // Há»“ng
    '#269a99', // Xanh ngá»c
    '#9270ca', // TÃ­m lavender
    '#6aa9e8', // Xanh sky
];

// Palette cho Treemap - cÃ¹ng sáº¯c Ä‘á»™, trÃ¡nh mÃ u sÃ¡ng chÃ³i
const TREEMAP_COLORS = [
    '#3d7ea6', // Xanh dÆ°Æ¡ng Ä‘áº­m
    '#5a9e6f', // Xanh lÃ¡ Ä‘áº­m
    '#c4793a', // Cam Ä‘áº¥t
    '#8b6b9c', // TÃ­m Ä‘áº­m
    '#c75d5d', // Äá» gáº¡ch
    '#4a8f8f', // Teal Ä‘áº­m
    '#9c7a4a', // NÃ¢u vÃ ng
    '#6b8cae', // Xanh thÃ©p
    '#a67b8c', // Há»“ng Ä‘áº­m
    '#5d8a5d', // Xanh rÃªu
    '#8a7a6b', // NÃ¢u xÃ¡m
    '#7a6b8a', // TÃ­m xÃ¡m
];

// MÃ u cho káº¿t quáº£ dá»± Ä‘oÃ¡n (Tá»‘t/Ph? h?p/KÃ©m)
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

        // Set colors cho series thÃ´ng qua ColorSet
        series.get("colors").set("colors", colors.map(c => am5.color(c)));

        // Set data (khÃ´ng cáº§n map fill thá»§ cÃ´ng ná»¯a)
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

        // TÃ­nh toÃ¡n Ä‘á»ƒ giáº£m chÃªnh lá»‡ch tá»· lá»‡
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

        // Set colors thÃ´ng qua ColorSet
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

// Trend Line Chart - Xu hÆ°á»›ng theo chu ká»³ vá»›i 3 smooth lines (Tá»‘t/Ph? h?p/KÃ©m), khÃ´ng cÃ³ dot
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
                    labelText: `${name}: {valueY} vÃ¹ng ({${field}Percent}%)`,
                }),
            }));

            // Smooth stroke
            series.strokes.template.setAll({
                strokeWidth: 3,
            });

            // Fill area dÆ°á»›i Ä‘Æ°á»ng (nháº¹)
            series.fills.template.setAll({
                fillOpacity: 0.1,
                visible: true,
            });

            // KHÃ”NG thÃªm bullets (dots)

            series.data.setAll(data);
            return series;
        };

        createSeries('Ráº¥t phÃ¹ há»£p', 'good', '#73d13d');           // Xanh lÃ¡
        createSeries('PhÃ¹ há»£p', 'average', '#ffc53d'); // VÃ ng
        createSeries('Ráº¥t khÃ´ng phÃ¹ há»£p', 'poor', '#ff7a45');           // Cam Ä‘á»

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
        return <Empty description="ChÆ°a cÃ³ dá»¯ liá»‡u" />;
    }

    return <div ref={chartDivRef} style={{ width: '100%', height: '350px' }} />;
};

const LineChartComponent = ({ data, granularity = 'day' }) => {
    const chartRef = useRef(null);
    const chartDivRef = useRef(null);

    useEffect(() => {
        // Chá»‰ dispose chart khi thá»±c sá»± khÃ´ng cÃ³ dá»¯ liá»‡u vÃ  Ä‘Ã£ cÃ³ chart trÆ°á»›c Ä‘Ã³
        // KhÃ´ng dispose ngay khi data táº¡m thá»i empty Ä‘á»ƒ trÃ¡nh flicker
        if (!data || !Array.isArray(data) || data.length === 0) {
            // Chá»‰ dispose náº¿u Ä‘Ã£ cÃ³ chart vÃ  data thá»±c sá»± khÃ´ng cÃ³ (khÃ´ng pháº£i Ä‘ang loading)
            if (chartRef.current && (!data || data.length === 0)) {
                // Delay má»™t chÃºt Ä‘á»ƒ trÃ¡nh dispose khi Ä‘ang fetch
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

        // Táº¡o root
        const root = am5.Root.new(chartDivRef.current);
        root.setThemes([am5themes_Animated.new(root)]);

        // Táº¡o chart vá»›i pan/zoom
        const chart = root.container.children.push(am5xy.XYChart.new(root, {
            panX: true,
            panY: true,
            wheelX: 'panX',
            wheelY: 'zoomX',
            pinchZoomX: true,
            paddingLeft: 0,
        }));

        // Táº¡o DateAxis - Ä‘iá»u chá»‰nh theo granularity
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

        // Giá»›i háº¡n zoom out - tá»‘i Ä‘a 14 giÃ¡ trá»‹ (12 + 1 má»—i bÃªn)
        xAxis.events.on('selectionextremeschanged', () => {
            const selection = xAxis.get('selection');
            if (selection && chartData.length > 0) {
                const firstDate = chartData[0].date;
                const lastDate = chartData[chartData.length - 1].date;
                const totalRange = lastDate - firstDate;
                const maxRange = totalRange * (14 / 12); // Cho phÃ©p zoom out tá»‘i Ä‘a 14/12 láº§n

                const currentRange = selection.endDate.getTime() - selection.startDate.getTime();
                if (currentRange > maxRange) {
                    // Giá»›i háº¡n zoom out
                    const center = (selection.startDate.getTime() + selection.endDate.getTime()) / 2;
                    const newStart = new Date(center - maxRange / 2);
                    const newEnd = new Date(center + maxRange / 2);
                    xAxis.zoomToDates(newStart, newEnd);
                }
            }
        });

        // Táº¡o ValueAxis
        const yAxis = chart.yAxes.push(
            am5xy.ValueAxis.new(root, {
                maxDeviation: 1,
                renderer: am5xy.AxisRendererY.new(root, {
                    pan: 'zoom',
                }),
            })
        );

        // Táº¡o SmoothedXLineSeries - tá»± Ä‘á»™ng lÃ m mÆ°á»£t Ä‘Æ°á»ng line (KHÃ”NG cÃ³ dot)
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
                    labelText: 'Sá»‘ email Ä‘Äƒng kÃ½: {valueY}',
                }),
            })
        );

        // Cáº¥u hÃ¬nh stroke - smooth line
        series.strokes.template.setAll({
            strokeWidth: 3,
        });

        // Cáº¥u hÃ¬nh fill - area nháº¹
        series.fills.template.setAll({
            fillOpacity: 0.15,
            visible: true,
        });

        // KHÃ”NG thÃªm bullets (dots)

        // Parse vÃ  set data - chá»‰ láº¥y tá»‘i Ä‘a 12 Ä‘iá»ƒm cuá»‘i cÃ¹ng
        const limitedData = data.length > 12 ? data.slice(-12) : data;

        const chartData = limitedData
            .map((item, index) => {
                if (!item || !item.date) {
                    console.warn(`âš ï¸ [LineChart] Invalid item at index ${index}:`, item);
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
                    console.warn(`âš ï¸ [LineChart] Invalid date at index ${index}:`, dateStr);
                    return null;
                }

                const parsed = {
                    date: date.getTime(),
                    value: item.value,
                };

                // Log má»™t vÃ i item Ä‘áº§u vÃ  cuá»‘i Ä‘á»ƒ debug
                if (index < 2 || index >= limitedData.length - 2) {
                    console.log(`ðŸ“… [LineChart] Parsed item ${index}:`, {
                        originalDate: dateStr,
                        timestamp: parsed.date,
                        value: parsed.value,
                        dateObj: date.toISOString(),
                    });
                }

                return parsed;
            })
            .filter((item) => item !== null);

        console.log('ðŸ“Š [LineChart] Final chart data:', {
            originalLength: data.length,
            limitedLength: limitedData.length,
            finalLength: chartData.length,
            expected: 12,
            matches: chartData.length <= 12,
            firstFew: chartData.slice(0, 3),
            lastFew: chartData.slice(-3),
        });

        if (chartData.length > 12) {
            console.warn('âš ï¸ [LineChart] More than 12 data points, limiting to last 12');
        }

        series.data.setAll(chartData);

        // Set zoom Ä‘á»ƒ chá»‰ hiá»ƒn thá»‹ 12 Ä‘iá»ƒm cuá»‘i cÃ¹ng
        if (chartData.length > 0) {
            const firstDate = chartData[0].date;
            const lastDate = chartData[chartData.length - 1].date;
            const initialRange = lastDate - firstDate;

            // TÃ­nh toÃ¡n pháº¡m vi tá»‘i Ä‘a cho phÃ©p (14 Ä‘iá»ƒm = 12 + 1 má»—i bÃªn)
            // Náº¿u cÃ³ 12 Ä‘iá»ƒm, má»—i Ä‘iá»ƒm chiáº¿m 1 khoáº£ng, 14 Ä‘iá»ƒm = 13 khoáº£ng
            const maxRange = initialRange * (14 / 12);

            // Set zoom ban Ä‘áº§u
            xAxis.zoomToDates(new Date(firstDate), new Date(lastDate));

            // Láº¯ng nghe sá»± kiá»‡n zoom Ä‘á»ƒ giá»›i háº¡n
            xAxis.events.on('selectionextremeschanged', () => {
                const selection = xAxis.get('selection');
                if (selection && chartData.length > 0) {
                    const currentStart = selection.startDate.getTime();
                    const currentEnd = selection.endDate.getTime();
                    const currentRange = currentEnd - currentStart;

                    // Náº¿u zoom out quÃ¡ má»©c cho phÃ©p (vÆ°á»£t quÃ¡ 14 Ä‘iá»ƒm)
                    if (currentRange > maxRange) {
                        // TÃ­nh center cá»§a selection hiá»‡n táº¡i
                        const center = (currentStart + currentEnd) / 2;

                        // Giá»›i háº¡n vá» pháº¡m vi tá»‘i Ä‘a, giá»¯ nguyÃªn center
                        const newStart = new Date(center - maxRange / 2);
                        const newEnd = new Date(center + maxRange / 2);

                        // Äáº£m báº£o khÃ´ng vÆ°á»£t quÃ¡ pháº¡m vi dá»¯ liá»‡u
                        const minDate = chartData[0].date;
                        const maxDate = chartData[chartData.length - 1].date;

                        let finalStart = newStart.getTime();
                        let finalEnd = newEnd.getTime();

                        // Náº¿u vÆ°á»£t quÃ¡ biÃªn trÃ¡i, Ä‘iá»u chá»‰nh
                        if (finalStart < minDate) {
                            finalStart = minDate;
                            finalEnd = finalStart + maxRange;
                        }

                        // Náº¿u vÆ°á»£t quÃ¡ biÃªn pháº£i, Ä‘iá»u chá»‰nh
                        if (finalEnd > maxDate) {
                            finalEnd = maxDate;
                            finalStart = finalEnd - maxRange;
                        }

                        // Ãp dá»¥ng zoom giá»›i háº¡n
                        xAxis.zoomToDates(new Date(finalStart), new Date(finalEnd));
                    }
                }
            });
        }

        // Log sau khi set data Ä‘á»ƒ verify
        console.log('âœ… [LineChart] Data set to series, series dataItems count:', series.dataItems.length);

        // ThÃªm cursor vá»›i cáº¥u hÃ¬nh tá»‘t hÆ¡n
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
        areaTypeData: [], // PhÃ¢n bá»‘ theo loáº¡i vÃ¹ng (oyster/cobia)
        byTypePerProvince: [], // PhÃ¢n bá»‘ chi tiáº¿t theo loáº¡i vÃ  tá»‰nh
        emailSeriesRaw: [],
        // Thá»‘ng kÃª dá»± Ä‘oÃ¡n má»›i
        comparison: null, // So sÃ¡nh Ä‘á»£t má»›i nháº¥t vs Ä‘á»£t trÆ°á»›c
        consecutivePoor: null, // VÃ¹ng xáº¥u liÃªn tiáº¿p
        trendByBatch: null, // Xu hÆ°á»›ng theo Ä‘á»£t
        statsByAreaType: null, // Thá»‘ng kÃª theo loáº¡i vÃ¹ng vá»›i so sÃ¡nh
    });

    const [timeGranularity, setTimeGranularity] = useState('day');
    const [selectedDate, setSelectedDate] = useState(null); // Date filter cho prediction stats
    const [trendPeriod, setTrendPeriod] = useState('month'); // Chu ká»³ cho biá»ƒu Ä‘á»“ xu hÆ°á»›ng
    const [areaTypeFilter, setAreaTypeFilter] = useState(null); // Filter theo loáº¡i vÃ¹ng nuÃ´i: null (táº¥t cáº£), 'oyster', 'cobia'
    const [poorAreasExpanded, setPoorAreasExpanded] = useState(false); // Má»Ÿ rá»™ng danh sÃ¡ch vÃ¹ng xáº¥u
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

                // Fetch stats cÆ¡ báº£n (khÃ´ng phá»¥ thuá»™c date filter)
                const [areasCombinedRes, usersRes] = await Promise.all([
                    axios.get('/api/express/areas/stats/combined', { params: commonParams }),
                    axios.get('/api/express/auth/stats/summary', { params: { role, province } }),
                ]);

                // Láº¥y dá»¯ liá»‡u tá»« API combined
                const { totalAreas, byType, byProvince, byTypePerProvince } = areasCombinedRes.data || {};

                console.log('ðŸ“Š [AdminStats] Combined stats:', { totalAreas, byType, byProvince });

                // PhÃ¢n bá»‘ theo tá»‰nh
                const areaDistribution = (byProvince || []).map((item, index) => ({
                    name: item.provinceName || t('stats.unknownProvince'),
                    value: item.count || 0,
                    fill: COLORS[index % COLORS.length],
                }));

                // PhÃ¢n bá»‘ theo loáº¡i vÃ¹ng (tá»« API, khÃ´ng cáº§n tÃ­nh client-side)
                const areaTypeDistribution = (byType || []).map((item, index) => ({
                    name: item.name,
                    value: item.count,
                    fill: index === 0 ? COLORS[0] : COLORS[3], // Xanh lÃ¡ cho HÃ u, Xanh dÆ°Æ¡ng cho CÃ¡ giÃ²
                }));

                console.log('ðŸ“Š [AdminStats] Area type distribution:', areaTypeDistribution);

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

    // Fetch prediction stats riÃªng (phá»¥ thuá»™c vÃ o selectedDate)
    useEffect(() => {
        if (!decoded) return;
        if (predictionFetchingRef.current) return;

        const fetchPredictionStats = async () => {
            predictionFetchingRef.current = true;

            try {
                const { role, province, district } = decoded;
                const commonParams = { role, ...(province && { province }), ...(district && { district }) };

                // ThÃªm beforeDate náº¿u cÃ³ chá»n ngÃ y
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
                // Giá»¯ táº¥t cáº£ categories Ä‘á»ƒ mÃ u khÃ´ng bá»‹ lá»‡ch (Tá»‘t luÃ´n xanh, Ph? h?p luÃ´n vÃ ng, KÃ©m luÃ´n Ä‘á»)
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
                message.error('Lá»—i khi táº£i dá»¯ liá»‡u thá»‘ng kÃª dá»± Ä‘oÃ¡n');
            } finally {
                predictionFetchingRef.current = false;
            }
        };

        fetchPredictionStats();
    }, [decoded, selectedDate, trendPeriod, areaTypeFilter, t]);

    // Fetch email stats riÃªng (vÃ¬ cáº§n granularity vÃ  limit)
    // Sá»­ dá»¥ng ref riÃªng Ä‘á»ƒ trÃ¡nh conflict vá»›i fetchingRef chÃ­nh
    const emailFetchingRef = useRef(false);
    const emailLastFetchRef = useRef({ granularity: null, timestamp: 0 });

    useEffect(() => {
        if (!decoded) {
            // Reset ref khi decoded chÆ°a cÃ³ Ä‘á»ƒ Ä‘áº£m báº£o fetch láº¡i khi decoded cÃ³
            emailFetchingRef.current = false;
            emailLastFetchRef.current = { granularity: null, timestamp: 0 };
            return;
        }

        // á»ž láº§n Ä‘áº§u tiÃªn (granularity chÆ°a Ä‘Æ°á»£c fetch), luÃ´n fetch
        const lastFetch = emailLastFetchRef.current;
        const isFirstLoad = lastFetch.granularity === null;

        // Kiá»ƒm tra xem Ä‘Ã£ fetch vá»›i granularity nÃ y chÆ°a (trong vÃ²ng 1 giÃ¢y)
        // Chá»‰ check náº¿u khÃ´ng pháº£i láº§n Ä‘áº§u tiÃªn
        if (!isFirstLoad) {
            const now = Date.now();
            if (
                lastFetch.granularity === timeGranularity &&
                now - lastFetch.timestamp < 1000 &&
                emailFetchingRef.current
            ) {
                return; // ÄÃ£ fetch gáº§n Ä‘Ã¢y vá»›i cÃ¹ng granularity, bá» qua
            }
        }

        // Reset fetching ref khi granularity thay Ä‘á»•i (khÃ´ng pháº£i láº§n Ä‘áº§u)
        if (!isFirstLoad && emailFetchingRef.current && lastFetch.granularity !== timeGranularity) {
            emailFetchingRef.current = false;
        }

        if (emailFetchingRef.current && !isFirstLoad) {
            return; // Äang fetch, bá» qua (trá»« láº§n Ä‘áº§u tiÃªn)
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
                console.error('âŒ [AdminStats] Error fetching email stats:', error);
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

    // TÃ­nh toÃ¡n emailSeries trá»±c tiáº¿p tá»« state, khÃ´ng dÃ¹ng useMemo
    // Chá»‰ tÃ­nh toÃ¡n khi cÃ³ dá»¯ liá»‡u thá»±c sá»±
    const getEmailSeries = () => {
        if (!stats.emailSeriesRaw || !Array.isArray(stats.emailSeriesRaw) || stats.emailSeriesRaw.length === 0) {
            return [];
        }

        // Backend Ä‘Ã£ xá»­ lÃ½ vÃ  giá»›i háº¡n dá»¯ liá»‡u, chá»‰ cáº§n map láº¡i
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
                            {/* === PHáº¦N 1: Tá»”NG QUAN === */}
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
                                            title="VÃ¹ng xáº¥u liÃªn tiáº¿p"
                                            value={stats.consecutivePoor?.total || 0}
                                            prefix={<WarningOutlined />}
                                            valueStyle={{ color: stats.consecutivePoor?.total > 0 ? '#ff4d4f' : '#52c41a' }}
                                        />
                                    </Card>
                                </Col>
                                <Col xs={24} sm={12} lg={6}>
                                    <Card variant='borderless'>
                                        <Statistic
                                            title="VÃ¹ng cáº£i thiá»‡n"
                                            value={stats.comparison?.changes?.improved || 0}
                                            prefix={<ArrowUpOutlined />}
                                            valueStyle={{ color: '#52c41a' }}
                                            suffix={
                                                stats.comparison?.changes?.worsened > 0 && (
                                                    <Text type="danger" style={{ fontSize: 14 }}>
                                                        / {stats.comparison.changes.worsened} xáº¥u Ä‘i
                                                    </Text>
                                                )
                                            }
                                        />
                                    </Card>
                                </Col>
                            </Row>

                            {/* === Bá»˜ Lá»ŒC THá»œI GIAN CHO THá»NG KÃŠ Dá»° ÄOÃN === */}
                            <Card size="medium">
                                <Space wrap>
                                    <Text strong>Xem thá»‘ng kÃª dá»± Ä‘oÃ¡n táº¡i thá»i Ä‘iá»ƒm:</Text>
                                    <DatePicker
                                        value={selectedDate}
                                        onChange={(date) => setSelectedDate(date)}
                                        placeholder="Chá»n ngÃ y (máº·c Ä‘á»‹nh: hiá»‡n táº¡i)"
                                        format="DD/MM/YYYY"
                                        allowClear
                                        style={{ width: 200 }}
                                    />
                                    {selectedDate && (
                                        <Tag color="blue">
                                            Äang xem dá»¯ liá»‡u Ä‘áº¿n ngÃ y {selectedDate.format('DD/MM/YYYY')}
                                        </Tag>
                                    )}
                                </Space>
                                <Divider style={{ margin: '12px 0' }} />
                                <Space wrap>
                                    <Text strong>Lá»c theo loáº¡i vÃ¹ng nuÃ´i:</Text>
                                    <Segmented
                                        value={areaTypeFilter}
                                        onChange={(value) => setAreaTypeFilter(value)}
                                        options={[
                                            { label: 'Táº¥t cáº£', value: null },
                                            { label: 'HÃ u', value: 'oyster' },
                                            { label: 'CÃ¡ giÃ²', value: 'cobia' },
                                        ]}

                                    />
                                </Space>
                            </Card>

                            {/* === PHáº¦N 2: SO SÃNH Káº¾T QUáº¢ Äá»¢T Má»šI NHáº¤T VS Äá»¢T TRÆ¯á»šC === */}
                            {stats.comparison && (
                                <Card
                                    title={
                                        <Space direction="vertical" style={{ width: '100%' }}>
                                            <Space>
                                                <BarChartOutlined />
                                                <span>So sÃ¡nh káº¿t quáº£ Ä‘á»£t má»›i nháº¥t vá»›i Ä‘á»£t trÆ°á»›c</span>
                                                <Text type="secondary" style={{ fontSize: 12 }}>
                                                    (Theo chu ká»³: {trendPeriod === 'day' ? 'NgÃ y' : trendPeriod === 'week' ? 'Tuáº§n' : trendPeriod === 'month' ? 'ThÃ¡ng' : 'QuÃ½'})
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
                                                    { label: 'NgÃ y', value: 'day' },
                                                    { label: 'Tuáº§n', value: 'week' },
                                                    { label: 'ThÃ¡ng', value: 'month' },
                                                    { label: 'QuÃ½', value: 'quarter' },
                                                ]}
                                            />
                                        </Space>
                                    }
                                >
                                    <Row gutter={[24, 16]}>
                                        {/* Äá»£t hiá»‡n táº¡i */}
                                        <Col xs={24} md={8}>
                                            <div style={{ textAlign: 'center', padding: '16px', background: '#f6ffed', borderRadius: 8 }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                    <Text strong style={{ fontSize: 16 }}>Thá»i Ä‘iá»ƒm hiá»‡n táº¡i</Text>
                                                    <Text type="secondary" style={{ fontSize: 12 }}>({selectedDate?.format('DD/MM/YYYY') || new Date().toLocaleDateString('vi-VN')})</Text>
                                                </div>
                                                <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-around' }}>
                                                    <div>
                                                        <div style={{ fontSize: 28, fontWeight: 'bold', color: '#52c41a' }}>
                                                            {stats.comparison.current.good}
                                                        </div>
                                                        <Tag color="success">Ráº¥t phÃ¹ há»£p</Tag>
                                                    </div>
                                                    <div>
                                                        <div style={{ fontSize: 28, fontWeight: 'bold', color: '#faad14' }}>
                                                            {stats.comparison.current.average}
                                                        </div>
                                                        <Tag color="warning">Ph? h?p</Tag>
                                                    </div>
                                                    <div>
                                                        <div style={{ fontSize: 28, fontWeight: 'bold', color: '#ff4d4f' }}>
                                                            {stats.comparison.current.poor}
                                                        </div>
                                                        <Tag color="error">Ráº¥t khÃ´ng phÃ¹ há»£p</Tag>
                                                    </div>
                                                </div>
                                            </div>
                                        </Col>

                                        {/* Thay Ä‘á»•i */}
                                        <Col xs={24} md={8}>
                                            <div style={{ textAlign: 'center', padding: '16px', background: '#f5f5f5', borderRadius: 8 }}>
                                                <Text strong style={{ fontSize: 16 }}>Thay Ä‘á»•i so vá»›i {trendPeriod === 'day' ? 'ngÃ y' : trendPeriod === 'week' ? 'tuáº§n' : trendPeriod === 'month' ? 'thÃ¡ng' : 'quÃ½'} trÆ°á»›c</Text>
                                                <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-around' }}>
                                                    <Tooltip title="VÃ¹ng cáº£i thiá»‡n káº¿t quáº£">
                                                        <div>
                                                            <div style={{ fontSize: 28, fontWeight: 'bold', color: '#52c41a' }}>
                                                                <ArrowUpOutlined /> {stats.comparison.changes.improved}
                                                            </div>
                                                            <Text type="success">Cáº£i thiá»‡n</Text>
                                                        </div>
                                                    </Tooltip>
                                                    <Tooltip title="VÃ¹ng khÃ´ng Ä‘á»•i káº¿t quáº£">
                                                        <div>
                                                            <div style={{ fontSize: 28, fontWeight: 'bold', color: '#8c8c8c' }}>
                                                                <MinusOutlined /> {stats.comparison.changes.unchanged}
                                                            </div>
                                                            <Text type="secondary">KhÃ´ng Ä‘á»•i</Text>
                                                        </div>
                                                    </Tooltip>
                                                    <Tooltip title="VÃ¹ng káº¿t quáº£ xáº¥u Ä‘i">
                                                        <div>
                                                            <div style={{ fontSize: 28, fontWeight: 'bold', color: '#ff4d4f' }}>
                                                                <ArrowDownOutlined /> {stats.comparison.changes.worsened}
                                                            </div>
                                                            <Text type="danger">Xáº¥u Ä‘i</Text>
                                                        </div>
                                                    </Tooltip>
                                                </div>
                                            </div>
                                        </Col>

                                        {/* Äá»£t trÆ°á»›c */}
                                        <Col xs={24} md={8}>
                                            <div style={{ textAlign: 'center', padding: '16px', background: '#f0f0f0', borderRadius: 8 }}>
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                    <Text strong style={{ fontSize: 16, color: '#8c8c8c' }}>{trendPeriod === 'day' ? 'NgÃ y' : trendPeriod === 'week' ? 'Tuáº§n' : trendPeriod === 'month' ? 'ThÃ¡ng' : 'QuÃ½'} trÆ°á»›c</Text>
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
                                                        <Tag>Ráº¥t phÃ¹ há»£p</Tag>
                                                    </div>
                                                    <div>
                                                        <div style={{ fontSize: 28, fontWeight: 'bold', color: '#8c8c8c' }}>
                                                            {stats.comparison.previous.average}
                                                        </div>
                                                        <Tag>Ph? h?p</Tag>
                                                    </div>
                                                    <div>
                                                        <div style={{ fontSize: 28, fontWeight: 'bold', color: '#8c8c8c' }}>
                                                            {stats.comparison.previous.poor}
                                                        </div>
                                                        <Tag>Ráº¥t khÃ´ng phÃ¹ há»£p</Tag>
                                                    </div>
                                                </div>
                                            </div>
                                        </Col>
                                    </Row>

                                    {/* Chi tiáº¿t vÃ¹ng thay Ä‘á»•i */}
                                    {(stats.comparison.details?.improved?.length > 0 || stats.comparison.details?.worsened?.length > 0) && (
                                        <div style={{ marginTop: 16 }}>
                                            <Divider style={{ margin: '16px 0' }} />
                                            <Row gutter={[16, 16]}>
                                                {stats.comparison.details?.worsened?.length > 0 && (
                                                    <Col xs={24} md={12}>
                                                        <Text strong type="danger">
                                                            <CloseCircleOutlined /> VÃ¹ng xáº¥u Ä‘i ({stats.comparison.details.worsened.length})
                                                        </Text>
                                                        <div style={{ marginTop: 8 }}>
                                                            {stats.comparison.details.worsened.slice(0, 5).map((item, index) => (
                                                                <div key={index} style={{ padding: '6px 0', borderBottom: index < Math.min(stats.comparison.details.worsened.length, 5) - 1 ? '1px solid #f0f0f0' : 'none' }}>
                                                                    <Text>{item.areaName}</Text>
                                                                    <span style={{ marginLeft: 8 }}>
                                                                        <Tag color="blue">{item.fromText}</Tag>
                                                                        â†’
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
                                                            <CheckCircleOutlined /> VÃ¹ng cáº£i thiá»‡n ({stats.comparison.details.improved.length})
                                                        </Text>
                                                        <div style={{ marginTop: 8 }}>
                                                            {stats.comparison.details.improved.slice(0, 5).map((item, index) => (
                                                                <div key={index} style={{ padding: '6px 0', borderBottom: index < Math.min(stats.comparison.details.improved.length, 5) - 1 ? '1px solid #f0f0f0' : 'none' }}>
                                                                    <Text>{item.areaName}</Text>
                                                                    <span style={{ marginLeft: 8 }}>
                                                                        <Tag color="orange">{item.fromText}</Tag>
                                                                        â†’
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

                            {/* === PHáº¦N 3: Cáº¢NH BÃO VÃ™NG Xáº¤U LIÃŠN TIáº¾P === */}
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
                                                    Cáº£nh bÃ¡o: {stats.consecutivePoor.total} vÃ¹ng cÃ³ káº¿t quáº£ RẤT KHÔNG PHÙ HỢP liÃªn tiáº¿p â‰¥ {stats.consecutivePoor.minConsecutive} Ä‘á»£t
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
                                                            <>Thu gá»n <UpOutlined /></>
                                                        ) : (
                                                            <>Xem thÃªm {areas.length - 2} vÃ¹ng <DownOutlined /></>
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
                                                            count={`${item.consecutiveCount} Ä‘á»£t`}
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

                            {/* === PHáº¦N 4: XU HÆ¯á»šNG THEO CHU Ká»² === */}
                            <Card
                                title={
                                    <Space>
                                        <BarChartOutlined />
                                        <span>Xu hÆ°á»›ng káº¿t quáº£ theo chu ká»³</span>
                                        {stats.trendByBatch?.startDate && stats.trendByBatch?.endDate && (
                                            <Text type="secondary" style={{ fontSize: 12, fontWeight: 'normal' }}>
                                                ({stats.trendByBatch.startDate} â†’ {stats.trendByBatch.endDate})
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
                                                { label: 'NgÃ y', value: 'day' },
                                                { label: 'Tuáº§n', value: 'week' },
                                                { label: 'ThÃ¡ng', value: 'month' },
                                                { label: 'QuÃ½', value: 'quarter' },
                                            ]}
                                        />
                                    </Space>
                                }
                            >
                                <TrendLineChart data={stats.trendByBatch?.trend || []} />
                            </Card>

                            {/* === PHáº¦N 5: THá»NG KÃŠ THEO LOáº I VÃ™NG === */}
                            {stats.statsByAreaType?.byAreaType && (
                                <Card title={<><PieChartOutlined /> Thá»‘ng kÃª theo loáº¡i vÃ¹ng nuÃ´i</>}>
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
                                                            <Text type="secondary">({item.current.total} vÃ¹ng)</Text>
                                                        </Space>
                                                    }
                                                >
                                                    <Row gutter={8}>
                                                        <Col span={8}>
                                                            <Statistic
                                                                title="Ráº¥t phÃ¹ há»£p"
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
                                                                title="Ph? h?p"
                                                                value={item.current.average}
                                                                valueStyle={{ color: '#faad14', fontSize: 20 }}
                                                            />
                                                        </Col>
                                                        <Col span={8}>
                                                            <Statistic
                                                                title="Ráº¥t khÃ´ng phÃ¹ há»£p"
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

                            {/* === PHáº¦N 6: Káº¾T QUáº¢ Dá»° ÄOÃN Má»šI NHáº¤T + Tá»¶ Lá»† LOáº I VÃ™NG === */}
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
                                            title={<><PieChartOutlined /> Tá»· lá»‡ loáº¡i vÃ¹ng (HÃ u/CÃ¡ giÃ²)</>}
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

                            {/* === PHáº¦N 7: PHÃ‚N Bá» THEO Tá»ˆNH === */}
                            <Card
                                title={<><EnvironmentOutlined /> {t('stats.areaDistribution')}</>}
                                styles={{ body: { padding: 0 } }}
                            >
                                <TreemapComponent data={stats.areaDistributionData} colors={TREEMAP_COLORS} />
                            </Card>

                            {/* === PHáº¦N 9: EMAIL === */}
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

