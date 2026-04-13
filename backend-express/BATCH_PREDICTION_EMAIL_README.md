# Batch Prediction Email Notification

## Tổng quan
Hệ thống đã được cập nhật để gửi thông báo email cho cả dự đoán đơn lẻ và dự đoán hàng loạt (batch prediction).

## Tính năng mới

### 1. Email Notification cho Batch Prediction
- **Trước đây**: Chỉ gửi email cho dự đoán đơn lẻ
- **Bây giờ**: Gửi email cho cả dự đoán đơn lẻ và dự đoán hàng loạt

### 2. Email Template được cập nhật
- **Subject**: Khác nhau cho single vs batch prediction
- **Content**: Hiển thị số lượng dự đoán cho batch prediction
- **Button**: "Xem danh sách dự đoán" cho batch prediction

## Cách hoạt động

### Single Prediction
```javascript
// Gửi email với thông tin dự đoán đơn lẻ
await sendPredictionNotification(areaId, {
  result: "Môi trường phù hợp để phát triển",
  model: "oyster_lightgbm",
  predictionId: 123
});
```

### Batch Prediction
```javascript
// Gửi email với thông tin dự đoán hàng loạt
await sendPredictionNotification(areaId, {
  result: "Đã tạo 5 dự đoán mới",
  model: "oyster_lightgbm",
  predictionCount: 5,
  batchPrediction: true
});
```

## Email Template

### Single Prediction Email
```
Subject: Dự đoán mới cho khu vực: [Tên khu vực]

Thông báo dự đoán mới
Xin chào,
Có dự đoán mới cho khu vực [Tên khu vực] ([Loại khu vực]).

Thông tin dự đoán:
- Khu vực: [Tên khu vực]
- Loại khu vực: [Loại khu vực]
- Kết quả dự đoán: [Kết quả]
- Thời gian: [Thời gian]

[Xem chi tiết dự đoán]
```

### Batch Prediction Email
```
Subject: Dự đoán hàng loạt mới cho khu vực: [Tên khu vực]

Thông báo dự đoán hàng loạt mới
Xin chào,
Có dự đoán hàng loạt mới cho khu vực [Tên khu vực] ([Loại khu vực]).

Thông tin dự đoán:
- Khu vực: [Tên khu vực]
- Loại khu vực: [Loại khu vực]
- Số lượng dự đoán: [Số lượng]
- Mô tả: [Mô tả]
- Thời gian: [Thời gian]

[Xem danh sách dự đoán]
```

## API Endpoints

### 1. Single Prediction
**POST** `/api/express/predictions/`

**Body:**
```json
{
  "userId": 1,
  "areaId": 1,
  "inputs": {
    "R_PO4": 0.1,
    "O2Sat": 85.5,
    "O2ml_L": 6.2,
    "STheta": 28.3,
    "Salnty": 32.1,
    "R_DYNHT": 0.5,
    "T_degC": 28.5,
    "R_Depth": 5.0,
    "Distance": 2.3,
    "Wind_Spd": 3.2,
    "Wave_Ht": 0.8,
    "Wave_Prd": 4.5,
    "IntChl": 2.1,
    "Dry_T": 30.2
  },
  "modelName": "oyster_lightgbm"
}
```

### 2. Batch Prediction
**POST** `/api/express/predictions/batch`

**Body:**
```json
{
  "userId": 1,
  "areaId": 1,
  "modelName": "oyster_lightgbm",
  "data": [
    {
      "R_PO4": 0.1,
      "O2Sat": 85.5,
      "O2ml_L": 6.2,
      "STheta": 28.3,
      "Salnty": 32.1,
      "R_DYNHT": 0.5,
      "T_degC": 28.5,
      "R_Depth": 5.0,
      "Distance": 2.3,
      "Wind_Spd": 3.2,
      "Wave_Ht": 0.8,
      "Wave_Prd": 4.5,
      "IntChl": 2.1,
      "Dry_T": 30.2,
      "createdAt": "2024-01-15T10:30:00.000Z"
    },
    {
      "R_PO4": 0.15,
      "O2Sat": 88.2,
      "O2ml_L": 6.5,
      "STheta": 28.8,
      "Salnty": 31.8,
      "R_DYNHT": 0.6,
      "T_degC": 29.1,
      "R_Depth": 4.8,
      "Distance": 2.1,
      "Wind_Spd": 2.8,
      "Wave_Ht": 0.6,
      "Wave_Prd": 4.2,
      "IntChl": 2.3,
      "Dry_T": 30.8,
      "createdAt": "2024-01-15T10:35:00.000Z"
    }
  ]
}
```

## Testing

### Chạy test script
```bash
cd backend-express
node test_batch_prediction_email.js
```

### Kiểm tra email
1. Đảm bảo có email subscription cho area ID được test
2. Chạy test script
3. Kiểm tra email inbox để xem thông báo

## Cấu hình Email

### Environment Variables
```env
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
FRONTEND_URL=http://localhost:3000
```

### Email Service
- Sử dụng Gmail SMTP
- Cần tạo App Password cho Gmail
- Cấu hình trong `emailController.js`

## Lưu ý

1. **Email Subscription**: Chỉ gửi email cho những người đã đăng ký nhận thông báo cho khu vực đó
2. **Error Handling**: Nếu gửi email thất bại, không ảnh hưởng đến việc tạo dự đoán
3. **Performance**: Batch prediction gửi 1 email duy nhất cho tất cả dự đoán, không gửi riêng lẻ
4. **Template**: Email template được cập nhật để phân biệt single vs batch prediction

## Troubleshooting

### Email không được gửi
1. Kiểm tra cấu hình email trong `.env`
2. Kiểm tra có email subscription cho area ID không
3. Kiểm tra logs trong logger

### Email template không đúng
1. Kiểm tra `predictionData.batchPrediction` flag
2. Kiểm tra email template trong `emailController.js`

### Test không hoạt động
1. Đảm bảo server đang chạy
2. Đảm bảo có dữ liệu test hợp lệ
3. Kiểm tra kết nối database
