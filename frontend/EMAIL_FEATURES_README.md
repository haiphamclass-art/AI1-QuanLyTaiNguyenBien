# Email Features - Hệ thống Email

## Tổng quan

Hệ thống đã được thêm các tính năng quản lý email subscription với các route và component mới.

## Các tính năng đã thêm

### 1. Email Subscription (Đăng ký Email)

- **Route**: `/email-subscription/:areaId`
- **Component**: `EmailSubscription.jsx`
- **Mô tả**: Trang đăng ký nhận thông báo email cho một khu vực cụ thể
- **Truy cập**: Công khai (không cần đăng nhập)
- **Chức năng**:
  - Hiển thị thông tin khu vực
  - Form đăng ký email với xác thực OTP
  - Gửi mã OTP 6 số qua email
  - Xác thực OTP trước khi lưu vào DB
  - Mã OTP hết hạn sau 5 phút
  - Chức năng gửi lại mã OTP

### 2. Email List (Danh sách Email)

- **Route**: `/email-list`
- **Component**: `EmailList.jsx`
- **Mô tả**: Trang quản lý danh sách email subscription
- **Truy cập**: Chỉ Admin
- **Chức năng**:
  - Xem danh sách email subscription
  - Thêm/sửa/xóa subscription
  - Gửi email test
  - Phân trang
  - Tìm kiếm và lọc

### 3. Navigation

- **Menu Admin**: Thêm item "Email Subscriptions" vào sidebar cho admin
- **Area List**: Thêm button "Email" trong actions của mỗi khu vực
- **Prediction Page**: Thêm button "Subscribe to Email Notifications" trong trang prediction public

## Cách sử dụng

### Để đăng ký email:

1. **Từ Area List**: Vào trang Area List, click button "Email" bên cạnh khu vực muốn đăng ký
2. **Từ Prediction Page**: Vào trang prediction của khu vực, click button "Subscribe to Email Notifications"
3. Điền email và click "Gửi mã xác thực"
4. Kiểm tra email và nhập mã OTP 6 số
5. Click "Xác thực và đăng ký" để hoàn tất

### Để quản lý email (Admin):

1. Đăng nhập với tài khoản admin
2. Vào menu "Email Subscriptions" trong sidebar
3. Quản lý danh sách email subscription

## API Endpoints

- `POST /api/express/emails/send-otp` - Gửi mã OTP
- `POST /api/express/emails/verify-otp` - Xác thực OTP và đăng ký
- `POST /api/express/emails/subscribe` - Đăng ký email (legacy)
- `GET /api/express/emails` - Lấy danh sách email (admin)
- `PUT /api/express/emails/:id` - Cập nhật email (admin)
- `DELETE /api/express/emails/:id` - Xóa email (admin)
- `POST /api/express/emails/test` - Gửi email test (admin)
- `GET /api/express/emails/unsubscribe/:token` - Hủy đăng ký email
- `GET /api/express/areas/area/:id` - Lấy thông tin khu vực

## Translation

Đã thêm các translation cho:

- `sidebar.email_list`: "Email Subscriptions" / "Đăng ký Email"
- `userList.email`: "Email"
- `prediction.subscribeEmail`: "Subscribe to Email Notifications" / "Đăng ký nhận thông báo Email"
- Các thông báo lỗi và thành công

## API Fixes

Đã sửa các API endpoints:

- ✅ Sửa endpoint lấy area: `/api/express/areas/area/:id`
- ✅ Thêm chức năng test email: `/api/express/emails/test`
- ✅ Thêm route unsubscribe: `/unsubscribe/:token`
- ✅ Thêm UnsubscribePage component

## OTP Features

Đã thêm hệ thống xác thực OTP:

- ✅ Model OTP với migration
- ✅ API gửi OTP: `/api/express/emails/send-otp`
- ✅ API xác thực OTP: `/api/express/emails/verify-otp`
- ✅ Mã OTP 6 số, hết hạn sau 5 phút
- ✅ Email template đẹp cho OTP
- ✅ Form xác thực OTP trong frontend
- ✅ Chức năng gửi lại mã OTP

## Cấu trúc file

```
frontend/src/components/
├── EmailSubscription.jsx    # Component đăng ký email với OTP
├── EmailList.jsx           # Component quản lý email (admin)
├── AreaList.jsx            # Đã thêm button email
└── Prediction.jsx          # Đã thêm button email subscription

backend-express/src/
├── models/Otp.js           # Model OTP
├── controllers/emailController.js  # API OTP
└── config/migrations/      # Migration OTP

frontend/src/locales/
├── en.json                 # Translation tiếng Anh
└── vn.json                 # Translation tiếng Việt
```
