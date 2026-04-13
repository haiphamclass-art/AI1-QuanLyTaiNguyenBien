# Chart API Documentation

## Tổng quan
API này cung cấp dữ liệu dự đoán được định dạng sẵn để sử dụng cho các biểu đồ (charts) trong frontend. API bao gồm 2 endpoint chính:

1. **GET /api/predictions/chart/data** - Lấy dữ liệu dự đoán cho một khu vực cụ thể
2. **GET /api/predictions/chart/all** - Lấy dữ liệu dự đoán cho tất cả các khu vực

## API Endpoints

### 1. Lấy dữ liệu dự đoán cho khu vực cụ thể

**Endpoint:** `GET /api/predictions/chart/data`

**Query Parameters:**
- `areaId` (required): ID của khu vực
- `limit` (optional): Số lượng dự đoán tối đa (mặc định: 10)

**Ví dụ:**
```bash
GET /api/predictions/chart/data?areaId=1&limit=5
```

**Response:**
```json
{
  "success": true,
  "data": {
    "predictions": [
      {
        "id": 1,
        "prediction_text": "Kết quả dự đoán",
        "date": "2024-01-15T10:30:00.000Z",
        "area": {
          "id": 1,
          "name": "Khu vực A",
          "area_type": "nuoi_tom"
        },
        "indicators": {
          "pH": 7.2,
          "DO": 6.5,
          "Temperature": 28.5,
          "Salinity": 32.1
        },
        "isLatest": true,
        "timeAgo": "2 giờ trước"
      }
    ],
    "trends": {
      "pH": {
        "change": 0.1,
        "changePercent": 1.4,
        "trend": "up"
      },
      "DO": {
        "change": -0.2,
        "changePercent": -3.0,
        "trend": "down"
      }
    },
    "summary": {
      "totalPredictions": 5,
      "latestPredictionDate": "2024-01-15T10:30:00.000Z",
      "area": {
        "id": 1,
        "name": "Khu vực A",
        "area_type": "nuoi_tom"
      },
      "indicators": [
        {
          "id": 1,
          "name": "pH"
        },
        {
          "id": 2,
          "name": "DO"
        }
      ]
    }
  }
}
```

### 2. Lấy dữ liệu dự đoán cho tất cả khu vực

**Endpoint:** `GET /api/predictions/chart/all`

**Query Parameters:**
- `limit` (optional): Số lượng dự đoán tối đa (mặc định: 5)

**Ví dụ:**
```bash
GET /api/predictions/chart/all?limit=10
```

**Response:**
```json
{
  "success": true,
  "data": {
    "areas": [
      {
        "area": {
          "id": 1,
          "name": "Khu vực A",
          "area_type": "nuoi_tom",
          "province": "Cà Mau",
          "district": "Ngọc Hiển",
          "Province": {
            "id": 1,
            "name": "Cà Mau"
          },
          "District": {
            "id": 1,
            "name": "Ngọc Hiển"
          }
        },
        "latestPrediction": {
          "id": 1,
          "prediction_text": "Kết quả dự đoán",
          "date": "2024-01-15T10:30:00.000Z",
          "timeAgo": "2 giờ trước"
        },
        "indicators": {
          "pH": 7.2,
          "DO": 6.5,
          "Temperature": 28.5,
          "Salinity": 32.1
        },
        "trends": {
          "pH": {
            "change": 0.1,
            "changePercent": 1.4,
            "trend": "up"
          }
        },
        "totalPredictions": 3
      }
    ],
    "summary": {
      "totalAreas": 1,
      "totalPredictions": 3,
      "indicators": [
        {
          "id": 1,
          "name": "pH"
        },
        {
          "id": 2,
          "name": "DO"
        }
      ]
    }
  }
}
```

## Cấu trúc dữ liệu

### Prediction Object
- `id`: ID của dự đoán
- `prediction_text`: Kết quả dự đoán
- `date`: Thời gian tạo dự đoán
- `area`: Thông tin khu vực
- `indicators`: Các chỉ số môi trường (pH, DO, Temperature, v.v.)
- `isLatest`: Đánh dấu dự đoán mới nhất (chỉ có trong endpoint đầu tiên)
- `timeAgo`: Thời gian tương đối (ví dụ: "2 giờ trước")

### Trends Object
- `change`: Thay đổi tuyệt đối so với dự đoán trước
- `changePercent`: Thay đổi phần trăm
- `trend`: Xu hướng ("up", "down", "stable")

### Area Object
- `id`: ID khu vực
- `name`: Tên khu vực
- `area_type`: Loại khu vực
- `province`: Tỉnh
- `district`: Quận/huyện
- `Province`: Thông tin chi tiết tỉnh
- `District`: Thông tin chi tiết quận/huyện

## Sử dụng cho Frontend

### 1. Biểu đồ theo thời gian
Sử dụng endpoint `/chart/data` để tạo biểu đồ hiển thị sự thay đổi của các chỉ số theo thời gian:

```javascript
// Lấy dữ liệu cho biểu đồ
const response = await fetch('/api/predictions/chart/data?areaId=1&limit=10');
const data = await response.json();

// Tạo dữ liệu cho Chart.js
const chartData = {
  labels: data.data.predictions.map(p => p.date),
  datasets: [
    {
      label: 'pH',
      data: data.data.predictions.map(p => p.indicators.pH),
      borderColor: 'rgb(75, 192, 192)',
      tension: 0.1
    },
    {
      label: 'DO',
      data: data.data.predictions.map(p => p.indicators.DO),
      borderColor: 'rgb(255, 99, 132)',
      tension: 0.1
    }
  ]
};
```

### 2. Dashboard tổng quan
Sử dụng endpoint `/chart/all` để tạo dashboard hiển thị tất cả các khu vực:

```javascript
// Lấy dữ liệu cho dashboard
const response = await fetch('/api/predictions/chart/all?limit=20');
const data = await response.json();

// Hiển thị danh sách khu vực với chỉ số mới nhất
data.data.areas.forEach(area => {
  logger.log(`${area.area.name}: pH = ${area.indicators.pH}, DO = ${area.indicators.DO}`);
});
```

### 3. Hiển thị xu hướng
Sử dụng object `trends` để hiển thị xu hướng thay đổi:

```javascript
// Hiển thị xu hướng pH
const pHTrend = data.data.trends.pH;
if (pHTrend) {
  const trendIcon = pHTrend.trend === 'up' ? '↗️' : pHTrend.trend === 'down' ? '↘️' : '➡️';
  logger.log(`pH: ${pHTrend.changePercent.toFixed(1)}% ${trendIcon}`);
}
```

## Error Handling

API trả về các mã lỗi sau:
- `400`: Thiếu tham số bắt buộc (areaId)
- `404`: Không tìm thấy dữ liệu dự đoán
- `500`: Lỗi server

Ví dụ response lỗi:
```json
{
  "error": "areaId is required"
}
```

## Testing

Chạy file test để kiểm tra API:
```bash
node test_chart_api.js
```

Đảm bảo server đang chạy trên `http://localhost:3000` trước khi chạy test.
