# Loading States trong Frontend

## Tổng quan
Frontend đã được cập nhật để thêm loading states cho các thao tác tạo dự đoán, giúp cải thiện trải nghiệm người dùng và tránh việc người dùng ấn nhiều lần.

## Tính năng Loading States

### 1. Single Prediction Loading
- **Loading State**: Hiển thị spinner và disable form khi đang tạo dự đoán đơn lẻ
- **Button Text**: Thay đổi từ "Gửi Dự Đoán Cá Nhân" thành "Đang tạo dự đoán..."
- **Form Disable**: Tất cả form fields bị disable khi đang loading

### 2. Batch Prediction Loading
- **Loading State**: Hiển thị spinner với progress percentage
- **Progress Tracking**: Hiển thị tiến độ xử lý (0% → 20% → 50% → 100%)
- **Button Text**: Thay đổi từ "Gửi Dự Đoán Hàng Loạt" thành "Đang tạo dự đoán hàng loạt..."
- **Form Disable**: Tất cả form fields bị disable khi đang loading

### 3. Global Loading Overlay
- **Spin Component**: Bao quanh toàn bộ form với loading overlay
- **Tab Disable**: Không thể chuyển tab khi đang loading
- **Visual Feedback**: Hiển thị loading spinner và text mô tả

## Cấu trúc Code

### State Management
```javascript
const [isBatchLoading, setIsBatchLoading] = useState(false);
const [isSingleLoading, setIsSingleLoading] = useState(false);
const [batchProgress, setBatchProgress] = useState(0);
```

### Loading Functions
```javascript
// Single Prediction
const handleSubmitSingle = async (values) => {
  setIsSingleLoading(true);
  try {
    // API call
    await axios.post('api/express/predictions', data);
    message.success('Created single prediction successful!');
  } catch (error) {
    message.error(`${error}`);
  } finally {
    setIsSingleLoading(false);
  }
};

// Batch Prediction
const handleSubmitBatch = async (values) => {
  setIsBatchLoading(true);
  setBatchProgress(0);
  try {
    setBatchProgress(20);
    // Parse CSV data
    setBatchProgress(50);
    // API call
    await axios.post('api/express/predictions/batch', data);
    setBatchProgress(100);
    message.success(`Đã tạo thành công ${data.length} dự đoán từ file CSV!`);
  } catch (error) {
    message.error(`${error}`);
  } finally {
    setIsBatchLoading(false);
    setBatchProgress(0);
  }
};
```

### UI Components
```javascript
// Loading Button
<Button 
  type="primary" 
  htmlType="submit" 
  block 
  loading={isBatchLoading}
  disabled={isBatchLoading}
>
  {isBatchLoading ? 'Đang tạo dự đoán hàng loạt...' : t('prediction_form.submit_batch')}
</Button>

// Loading Overlay
<Spin 
  spinning={isBatchLoading || isSingleLoading} 
  tip={
    isBatchLoading 
      ? `Đang xử lý dự đoán hàng loạt... ${batchProgress}%` 
      : 'Đang tạo dự đoán...'
  }
>
  <Tabs disabled={isBatchLoading || isSingleLoading}>
    {/* Form content */}
  </Tabs>
</Spin>
```

## Progress Tracking cho Batch Prediction

### Các bước xử lý:
1. **0%**: Bắt đầu xử lý
2. **20%**: Parse CSV data thành công
3. **50%**: Gửi request đến API
4. **100%**: Hoàn thành và hiển thị kết quả

### Code Implementation:
```javascript
setBatchProgress(0);   // Bắt đầu
setBatchProgress(20);  // Parse CSV
setBatchProgress(50);  // Gửi API
setBatchProgress(100); // Hoàn thành
```

## User Experience Improvements

### 1. Visual Feedback
- **Spinner Animation**: Hiển thị loading spinner
- **Progress Percentage**: Hiển thị tiến độ cho batch prediction
- **Button States**: Button hiển thị loading state
- **Text Changes**: Text thay đổi để thông báo trạng thái

### 2. Interaction Prevention
- **Form Disable**: Tất cả form fields bị disable
- **Tab Disable**: Không thể chuyển tab
- **Button Disable**: Button submit bị disable
- **Overlay**: Loading overlay ngăn tương tác

### 3. Error Handling
- **Try-Catch**: Bắt lỗi và hiển thị message
- **Finally Block**: Đảm bảo loading state được reset
- **User Feedback**: Hiển thị thông báo lỗi rõ ràng

## Styling và UI

### Ant Design Components
- **Spin**: Loading overlay component
- **Button**: Loading state cho buttons
- **Form**: Disable state cho forms
- **Tabs**: Disable state cho tabs

### CSS Classes
```css
/* Loading states được handle bởi Ant Design */
.ant-spin-container {
  position: relative;
}

.ant-spin-blur {
  opacity: 0.5;
  pointer-events: none;
}
```

## Testing

### Manual Testing
1. **Single Prediction**:
   - Điền form và submit
   - Kiểm tra loading state hiển thị
   - Kiểm tra form bị disable
   - Kiểm tra button text thay đổi

2. **Batch Prediction**:
   - Upload CSV file
   - Submit batch prediction
   - Kiểm tra progress percentage
   - Kiểm tra loading overlay
   - Kiểm tra success message

### Edge Cases
- **Network Error**: Kiểm tra error handling
- **Empty CSV**: Kiểm tra validation
- **Large CSV**: Kiểm tra performance
- **Multiple Clicks**: Kiểm tra prevent double submission

## Best Practices

### 1. Loading State Management
- Luôn reset loading state trong finally block
- Sử dụng separate loading states cho different actions
- Provide clear visual feedback

### 2. User Experience
- Disable tất cả interactive elements khi loading
- Hiển thị progress cho long-running operations
- Provide clear error messages

### 3. Performance
- Sử dụng loading states để prevent multiple submissions
- Optimize API calls với proper error handling
- Clean up loading states khi component unmount

## Troubleshooting

### Loading State không reset
- Kiểm tra finally block trong try-catch
- Kiểm tra error handling
- Kiểm tra component unmount

### Progress không hiển thị
- Kiểm tra setBatchProgress calls
- Kiểm tra state updates
- Kiểm tra re-renders

### Form không disable
- Kiểm tra disabled prop
- Kiểm tra loading state
- Kiểm tra form configuration
