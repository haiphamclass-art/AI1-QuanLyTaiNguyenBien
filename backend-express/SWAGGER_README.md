# 📚 Swagger API Documentation

## 🚀 Cài đặt và chạy

### 1. Cài đặt dependencies
```bash
cd backend-express
npm install
```

### 2. Chạy server
```bash
npm run dev
```

### 3. Truy cập Swagger UI
Mở trình duyệt và truy cập: **http://localhost:5000/api-docs**

## 📖 Tính năng Swagger

### ✨ **API Documentation hoàn chỉnh:**
- **Authentication APIs** - Đăng nhập, quản lý người dùng
- **Area Management APIs** - Quản lý khu vực nuôi trồng
- **Email Subscription APIs** - Đăng ký email thông báo
- **Prediction APIs** - Dự đoán và phân tích
- **Nature Elements APIs** - Quản lý yếu tố tự nhiên

### 🔧 **Tính năng Swagger UI:**
- **Interactive API Testing** - Test API trực tiếp trên giao diện
- **JWT Authentication** - Hỗ trợ Bearer token authentication
- **Request/Response Examples** - Ví dụ chi tiết cho mỗi API
- **Schema Validation** - Validation dữ liệu đầu vào/ra
- **Filter & Search** - Tìm kiếm API theo tag hoặc keyword

### 🎯 **Cách sử dụng:**

#### 1. **Xem danh sách API:**
- Truy cập http://localhost:5000/api-docs
- Browse các API theo categories (Authentication, Areas, Emails, etc.)

#### 2. **Test API với Authentication:**
- Click vào nút "Authorize" (🔒) ở góc trên bên phải
- Nhập JWT token: `Bearer YOUR_JWT_TOKEN`
- Click "Authorize" để lưu token

#### 3. **Test API endpoints:**
- Click vào API endpoint muốn test
- Click "Try it out"
- Điền thông tin request body (nếu có)
- Click "Execute" để gửi request
- Xem response và status code

#### 4. **Xem Schema definitions:**
- Scroll xuống phần "Schemas" để xem cấu trúc dữ liệu
- Các schema chính: User, Area, Prediction, EmailSubscription

## 🔐 **Authentication**

### **JWT Token:**
- Lấy token từ API `/auth/login`
- Format: `Bearer <token>`
- Token có thời hạn và cần refresh khi hết hạn

### **Roles & Permissions:**
- **Admin**: Full access to all APIs
- **Manager**: Access to areas, emails, predictions in their province
- **Expert**: Read-only access to predictions and areas

## 📝 **API Examples**

### **1. Login:**
```json
POST /api/express/auth/login
{
  "email": "admin@example.com",
  "password": "password123"
}
```

### **2. Get Areas:**
```json
GET /api/express/areas?page=1&limit=10&province=1
```

### **3. Subscribe to Email:**
```json
POST /api/express/emails/send-otp
{
  "email": "user@example.com",
  "area_id": 1
}
```

## 🛠️ **Development**

### **Thêm API mới:**
1. Thêm JSDoc comments vào route file
2. Cập nhật schema trong `src/config/swagger.js` nếu cần
3. Restart server để cập nhật documentation

### **Customize Swagger UI:**
- Chỉnh sửa options trong `app.js`:
```javascript
swaggerUi.setup(swaggerSpecs, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Your API Title',
  swaggerOptions: {
    persistAuthorization: true,
    displayRequestDuration: true,
    // ... more options
  }
})
```

## 🐛 **Troubleshooting**

### **Lỗi thường gặp:**
1. **"Cannot read property 'swagger' of undefined"**
   - Kiểm tra file swagger.js có đúng cú pháp không
   - Restart server

2. **API không hiển thị trong Swagger UI**
   - Kiểm tra JSDoc comments có đúng format không
   - Đảm bảo file route được include trong swagger config

3. **Authentication không hoạt động**
   - Kiểm tra JWT token có hợp lệ không
   - Đảm bảo format: `Bearer <token>`

## 📞 **Support**

Nếu gặp vấn đề, hãy kiểm tra:
1. Server đang chạy trên port 5000
2. Dependencies đã được cài đặt đầy đủ
3. JSDoc comments đúng format
4. Database connection hoạt động

---
**Happy Coding! 🎉**
