# /project_flask_api/prediction_module/routes.py

from flask import Blueprint, request, jsonify, current_app
from datetime import datetime
import threading
from . import services
from .data_fetcher import run_daily_grid_retrieval

prediction_api = Blueprint('prediction_api', __name__)

def handle_prediction(species):
    """Hàm xử lý chung cho cả cobia và oyster."""
    try:
        user_data = request.get_json(silent=True)
        if user_data is None:
            user_data = {}

        if not isinstance(user_data, dict):
            return jsonify({
                "error": "Invalid JSON input",
                "message": "Invalid JSON input",
            }), 400

        query_model = request.args.get("model")
        if query_model and not user_data.get("model"):
            user_data["model"] = query_model

        if not user_data:
            return jsonify({
                "error": "Invalid JSON input",
                "message": "Invalid JSON input",
            }), 400
        
        # Lấy credentials từ config
        credentials = {
            'username': current_app.config['COPERNICUS_USERNAME'],
            'password': current_app.config['COPERNICUS_PASSWORD']
        }

        # Gọi service chính để xử lý
        prediction_result, status_code, final_features = services.process_prediction_request(
            user_data, species, credentials
        )

        # Tạo response hoàn chỉnh
        rounded_features = {
            key: round(value, 2) if isinstance(value, float) else value
            for key, value in final_features.items()
            if key in services.REQUIRED_FIELDS
        }

        if status_code >= 400:
            if isinstance(prediction_result, dict):
                error_message = prediction_result.get("error") or prediction_result.get("message") or "Prediction request failed"
                details = {
                    key: value
                    for key, value in prediction_result.items()
                    if key not in {"error", "message"}
                }
            else:
                error_message = str(prediction_result) or "Prediction request failed"
                details = {}

            error_payload = {
                "error": error_message,
                "message": error_message,
            }
            if details:
                error_payload["details"] = details
            if rounded_features:
                error_payload["final_features_used"] = rounded_features

            return jsonify(error_payload), status_code

        return jsonify({
            "prediction_result": prediction_result,
            "final_features_used": rounded_features,
        }), status_code

    except Exception as e:
        return jsonify({'error': str(e), 'message': str(e)}), 500


@prediction_api.route('/trigger_fetch', methods=['POST'])
def trigger_fetch_data():
    # Lấy secret key từ header của request
    incoming_secret = request.headers.get('X-FETCH-SECRET')
    
    # So sánh với secret key trong config
    if incoming_secret != current_app.config['FETCH_SECRET_KEY']:
        return jsonify({"error": "Unauthorized"}), 403 # Từ chối truy cập

    # Nếu key hợp lệ, chạy tác vụ trong một luồng riêng (chạy nền)
    # để không làm block server
    thread = threading.Thread(target=run_daily_grid_retrieval)
    thread.start()
    
    # Trả về response ngay lập tức
    return jsonify({"message": "Accepted. Data retrieval process started in the background."}), 202

@prediction_api.route('/status', methods=['GET'])
def home():
    """Enhanced status endpoint with detailed model information"""
    from .model_manager import get_model_info
    from .model_loader import model_loader
    
    model_info = get_model_info()
    loader_status = model_loader.get_status()
    
    # Calculate health status
    total_models = model_info.get('total_models', 0)
    is_loading = model_info.get('is_loading', False)
    
    # Count failed models
    failed_count = sum(1 for m in model_info.get('models', []) if m.get('status') == 'failed')
    
    # Determine overall health
    if is_loading:
        health = 'loading'
    elif total_models == 0:
        health = 'unhealthy'
    elif failed_count > 0:
        health = 'degraded'
    else:
        health = 'healthy'
    
    return jsonify({
        'status': 'running',
        'health': health,
        'message': 'Prediction module is running!',
        'model_loader': {
            'is_loading': is_loading,
            'total_models': total_models,
            'failed_models': failed_count,
            'available_models': services.get_available_models(),
        },
        'model_details': model_info.get('models', []),
        'timestamp': datetime.now().isoformat()
    })

@prediction_api.route('/health', methods=['GET'])
def health_check():
    """
    Simple health check endpoint for load balancers
    Returns 200 if ready, 503 if loading or unhealthy
    """
    from .model_manager import get_model_info
    
    model_info = get_model_info()
    total_models = model_info.get('total_models', 0)
    is_loading = model_info.get('is_loading', False)
    
    if is_loading:
        return jsonify({
            'status': 'loading',
            'ready': False,
            'message': 'Models are being loaded'
        }), 503
    
    if total_models == 0:
        return jsonify({
            'status': 'unhealthy',
            'ready': False,
            'message': 'No models loaded'
        }), 503
    
    return jsonify({
        'status': 'healthy',
        'ready': True,
        'total_models': total_models
    }), 200

@prediction_api.route('/reload_models', methods=['POST'])
def reload_models_endpoint():
    """
    Endpoint to reload all ML models without restarting Flask.
    Protected by secret key.
    """
    from .model_manager import reload_models
    
    # Check authorization
    incoming_secret = request.headers.get('X-RELOAD-SECRET')
    if incoming_secret != current_app.config.get('FETCH_SECRET_KEY'):
        return jsonify({"error": "Unauthorized"}), 403
    
    success, message, count = reload_models()
    
    if success:
        return jsonify({
            "success": True,
            "message": message,
            "total_models": count,
            "available_models": services.get_available_models()
        }), 200
    else:
        return jsonify({
            "success": False,
            "error": message
        }), 500

@prediction_api.route('/sync_models', methods=['POST'])
def sync_models_endpoint():
    """
    Endpoint to download a model from Google Drive and reload all models.
    Protected by secret key.
    """
    from .model_manager import reload_models
    from google_drive_downloader import sync_model_from_google_drive
    
    # Check authorization
    incoming_secret = request.headers.get('X-RELOAD-SECRET')
    if incoming_secret != current_app.config.get('FETCH_SECRET_KEY'):
        return jsonify({"error": "Unauthorized"}), 403
    
    try:
        data = request.get_json()
        file_id = data.get('file_id')
        file_name = data.get('file_name')
        download_link = data.get('download_link')
        
        if not file_id or not file_name:
            return jsonify({
                "success": False,
                "error": "file_id and file_name are required"
            }), 400
        
        # Download model from Google Drive
        print(f"Syncing model from Google Drive: {file_name}")
        success, local_path, message = sync_model_from_google_drive(
            file_id, file_name, download_link
        )
        
        if not success:
            return jsonify({
                "success": False,
                "error": message
            }), 500
        
        # Reload all models
        reload_success, reload_message, count = reload_models()
        
        if reload_success:
            return jsonify({
                "success": True,
                "message": f"Model synced and loaded successfully: {local_path}",
                "total_models": count,
                "available_models": services.get_available_models()
            }), 200
        else:
            return jsonify({
                "success": False,
                "error": f"Model downloaded but failed to reload: {reload_message}"
            }), 500
            
    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

@prediction_api.route('/predict/cobia', methods=['POST'])
def predict_cobia():
    return handle_prediction('cobia')

@prediction_api.route('/predict/oyster', methods=['POST'])
def predict_oyster():
    return handle_prediction('oyster')
