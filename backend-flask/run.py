# /project_flask_api/run.py

from prediction_module import create_app

# Tạo instance của ứng dụng bằng factory
app = create_app()

if __name__ == '__main__':
    # Chạy ứng dụng
    # host='0.0.0.0' để có thể truy cập từ bên ngoài
    app.run(debug=True, host='0.0.0.0', port=5001)