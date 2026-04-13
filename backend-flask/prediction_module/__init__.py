import os
from flask import Flask
from . import services

# Import các cấu hình
from config import MODEL_PATHS, DATA_CACHE_PATH

# Import hàm lấy dữ liệu
from .data_fetcher import run_daily_grid_retrieval


def get_default_trusted_hosts():
    raw_value = os.environ.get('FLASK_TRUSTED_HOSTS')
    if raw_value:
        return [host.strip() for host in raw_value.split(',') if host.strip()]

    return [
        'localhost',
        'localhost:5001',
        '127.0.0.1',
        '127.0.0.1:5001',
        'flask_backend',
        'flask_backend:5001',
    ]

def create_app():
    """
    Hàm khởi tạo và cấu hình ứng dụng Flask (Application Factory).
    """
    app = Flask(__name__)
    app.config.from_pyfile('../config.py')
    app.config['TRUSTED_HOSTS'] = app.config.get('TRUSTED_HOSTS') or get_default_trusted_hosts()
    
    with app.app_context():
        # SỬA ĐỔI: Kiểm tra file cache khi khởi động
        if not os.path.exists(DATA_CACHE_PATH):
            print(f"Cache file not found at '{DATA_CACHE_PATH}'.")
            print("Starting initial data retrieval... This may take several minutes.")
            try:
                run_daily_grid_retrieval()
            except Exception as e:
                print(f"FATAL: Initial data retrieval failed: {e}")
                print("Please run 'python fetch_grid_cron.py' manually to create the cache file.")
        else:
            print(f"Found existing cache file at '{DATA_CACHE_PATH}'.")

        print("Loading machine learning models...")
        services.load_all_models(app.config['MODEL_PATHS'])
        print("All models loaded.")

        from .routes import prediction_api
        app.register_blueprint(prediction_api)

    return app
