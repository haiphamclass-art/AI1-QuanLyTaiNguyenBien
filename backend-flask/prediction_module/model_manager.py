"""
Model Manager Module
Handles dynamic model loading and reloading with enhanced validation
"""

import os
from .model_loader import model_loader
from config import discover_model_paths

def reload_models():
    """
    Reload all models from the model directory using enhanced ModelLoader.
    This allows hot-reloading of models without restarting Flask.
    Thread-safe operation with validation and retry logic.
    
    Returns:
        tuple: (success: bool, message: str, model_count: int)
    """
    try:
        print("\n" + "="*60)
        print("Model Reload Requested")
        print("="*60)
        
        # Rediscover models from both directories
        new_model_paths = discover_model_paths(['model', 'shared_models'])
        
        if not new_model_paths:
            return False, "No models found in model directories", 0
        
        # Use ModelLoader's enhanced loading with validation, retry, and atomic swap
        success, message, model_count = model_loader.reload_models(new_model_paths)
        
        return success, message, model_count
        
    except Exception as e:
        error_msg = f"Error reloading models: {str(e)}"
        print(error_msg)
        return False, error_msg, 0

def get_model_info():
    """
    Get detailed information about currently loaded models.
    
    Returns:
        dict: Model information including paths, status, metadata, and loading state
    """
    from config import MODEL_PATHS
    
    # Get status from ModelLoader
    status = model_loader.get_status()
    
    model_info = []
    all_metadata = status.get('models', {})
    
    for model_name in status.get('available_models', []):
        metadata = all_metadata.get(model_name, {})
        path = metadata.get('path', MODEL_PATHS.get(model_name, 'Unknown'))
        file_exists = os.path.exists(path) if path != 'Unknown' else False
        
        info = {
            'name': model_name,
            'path': path,
            'loaded': True,
            'file_exists': file_exists,
            'status': metadata.get('status', 'unknown'),
            'loaded_at': metadata.get('loaded_at'),
            'file_size_mb': round(metadata.get('file_size', 0) / (1024 * 1024), 2),
        }
        
        # Add error info if failed
        if metadata.get('status') == 'failed':
            info['error'] = metadata.get('error', 'Unknown error')
        
        model_info.append(info)
    
    return {
        'total_models': status.get('total_models', 0),
        'is_loading': status.get('is_loading', False),
        'models': model_info,
    }


