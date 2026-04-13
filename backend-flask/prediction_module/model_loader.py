"""
Enhanced Model Loader with validation, retry, and thread-safe operations
"""

import os
import time
import builtins
import joblib
import threading
from typing import Dict, Tuple, Optional
from datetime import datetime

try:
    import _loss  # noqa: F401
except Exception:
    _loss = None

try:
    import link  # noqa: F401
except Exception:
    link = None

try:
    import xgboost_compat  # noqa: F401
except Exception:
    xgboost_compat = None


def _safe_console_print(*args, **kwargs):
    normalized_args = []
    for arg in args:
        text = str(arg)
        text = text.replace('\u2713', '[OK]').replace('\u2714', '[OK]')
        text = text.replace('\u2715', '[ERROR]').replace('\u2717', '[ERROR]')
        text = text.replace('âœ“', '[OK]').replace('âœ”', '[OK]')
        text = text.replace('âœ—', '[ERROR]').replace('âœ•', '[ERROR]')
        normalized_args.append(text.encode('ascii', errors='replace').decode('ascii'))

    builtins.print(*normalized_args, **kwargs)


print = _safe_console_print


def _safe_console_print_ascii(*args, **kwargs):
    normalized_args = []
    for arg in args:
        text = str(arg)
        text = text.replace('\u2713', '[OK]').replace('\u2714', '[OK]')
        text = text.replace('\u2715', '[ERROR]').replace('\u2717', '[ERROR]')
        normalized_args.append(text.encode('ascii', errors='replace').decode('ascii'))

    builtins.print(*normalized_args, **kwargs)


print = _safe_console_print_ascii

class ModelLoader:
    """Thread-safe model loader with validation and retry logic"""
    
    def __init__(self):
        self.models: Dict[str, any] = {}
        self.model_metadata: Dict[str, dict] = {}
        self._lock = threading.RLock()
        self._loading = False
        
    def is_loading(self) -> bool:
        """Check if models are currently being loaded"""
        with self._lock:
            return self._loading
    
    def get_model(self, model_name: str) -> Optional[any]:
        """Thread-safe model retrieval"""
        with self._lock:
            return self.models.get(model_name)
    
    def get_available_models(self) -> list:
        """Get list of available model names"""
        with self._lock:
            return list(self.models.keys())
    
    def get_model_metadata(self, model_name: str) -> Optional[dict]:
        """Get metadata for a specific model"""
        with self._lock:
            return self.model_metadata.get(model_name)
    
    def get_all_metadata(self) -> dict:
        """Get all model metadata"""
        with self._lock:
            return self.model_metadata.copy()
    
    def validate_model_file(self, path: str) -> Tuple[bool, str]:
        """
        Validate model file before loading
        
        Returns:
            tuple: (is_valid: bool, error_message: str)
        """
        # Check file exists
        if not os.path.exists(path):
            return False, f"File not found: {path}"
        
        # Check file extension
        if not path.endswith('.pkl'):
            return False, f"Invalid file extension: {path}"
        
        # Check file size (not empty, not too large)
        file_size = os.path.getsize(path)
        if file_size == 0:
            return False, f"File is empty: {path}"
        
        if file_size > 500 * 1024 * 1024:  # 500MB limit
            return False, f"File too large ({file_size / (1024*1024):.2f} MB): {path}"
        
        # Try to open file (basic corruption check)
        try:
            with open(path, 'rb') as f:
                # Read first few bytes to check if it's a valid pickle
                header = f.read(10)
                if not header:
                    return False, f"Cannot read file header: {path}"
        except Exception as e:
            return False, f"Cannot open file: {str(e)}"
        
        return True, ""
    
    def load_single_model(self, model_name: str, path: str, max_retries: int = 3) -> Tuple[bool, str, Optional[any]]:
        """
        Load a single model with retry logic
        
        Args:
            model_name: Name of the model
            path: Path to model file
            max_retries: Maximum number of retry attempts
        
        Returns:
            tuple: (success: bool, message: str, model: Optional[any])
        """
        # Validate file first
        is_valid, error_msg = self.validate_model_file(path)
        if not is_valid:
            return False, f"Validation failed: {error_msg}", None
        
        # Try loading with retry
        for attempt in range(max_retries):
            try:
                print(f"Loading model '{model_name}' from {path} (attempt {attempt + 1}/{max_retries})")
                
                with open(path, 'rb') as file:
                    model = joblib.load(file)
                
                # Basic model validation (check if it has predict method)
                if not hasattr(model, 'predict'):
                    return False, f"Model does not have 'predict' method", None
                
                print(f"✓ Model '{model_name}' loaded successfully")
                return True, "Success", model
                
            except Exception as e:
                error_msg = f"Error loading model (attempt {attempt + 1}/{max_retries}): {str(e)}"
                print(f"✗ {error_msg}")
                
                if attempt < max_retries - 1:
                    # Exponential backoff
                    wait_time = 0.5 * (2 ** attempt)
                    print(f"Retrying in {wait_time}s...")
                    time.sleep(wait_time)
                else:
                    return False, error_msg, None
        
        return False, "Max retries reached", None
    
    def load_all_models(self, model_paths: Dict[str, str]) -> Tuple[bool, str, int]:
        """
        Load all models using swap strategy (thread-safe)
        
        Instead of clearing existing models, load new models into temporary dict
        then swap atomically to avoid race conditions
        
        Returns:
            tuple: (success: bool, message: str, model_count: int)
        """
        with self._lock:
            self._loading = True
        
        try:
            print(f"\n{'='*60}")
            print(f"Starting model loading process...")
            print(f"Models to load: {len(model_paths)}")
            print(f"{'='*60}\n")
            
            if not model_paths:
                return False, "No model paths provided", 0
            
            # Load models into temporary storage
            new_models = {}
            new_metadata = {}
            failed_models = []
            
            start_time = time.time()
            
            for model_name, path in model_paths.items():
                success, message, model = self.load_single_model(model_name, path)
                
                if success:
                    new_models[model_name] = model
                    new_metadata[model_name] = {
                        'path': path,
                        'loaded_at': datetime.now().isoformat(),
                        'file_size': os.path.getsize(path),
                        'status': 'loaded'
                    }
                else:
                    failed_models.append({
                        'name': model_name,
                        'path': path,
                        'error': message
                    })
                    # Add to metadata as failed
                    new_metadata[model_name] = {
                        'path': path,
                        'loaded_at': datetime.now().isoformat(),
                        'file_size': os.path.getsize(path) if os.path.exists(path) else 0,
                        'status': 'failed',
                        'error': message
                    }
            
            load_time = time.time() - start_time
            
            # Atomic swap - replace old models with new ones
            with self._lock:
                self.models = new_models
                self.model_metadata = new_metadata
            
            # Prepare result message
            success_count = len(new_models)
            failed_count = len(failed_models)
            
            print(f"\n{'='*60}")
            print(f"Model loading completed in {load_time:.2f}s")
            print(f"✓ Successfully loaded: {success_count} model(s)")
            if failed_count > 0:
                print(f"✗ Failed to load: {failed_count} model(s)")
                for failed in failed_models:
                    print(f"  - {failed['name']}: {failed['error']}")
            print(f"{'='*60}\n")
            
            if success_count == 0:
                return False, "Failed to load any models", 0
            
            message = f"Successfully loaded {success_count} model(s)"
            if failed_count > 0:
                message += f", {failed_count} failed"
            
            return True, message, success_count
            
        except Exception as e:
            error_msg = f"Critical error during model loading: {str(e)}"
            print(f"✗ {error_msg}")
            return False, error_msg, 0
            
        finally:
            with self._lock:
                self._loading = False
    
    def reload_models(self, model_paths: Dict[str, str]) -> Tuple[bool, str, int]:
        """
        Reload models - alias for load_all_models for backward compatibility
        """
        return self.load_all_models(model_paths)
    
    def get_status(self) -> dict:
        """
        Get detailed status of model loader
        
        Returns:
            dict: Status information including loading state, model count, metadata
        """
        with self._lock:
            return {
                'is_loading': self._loading,
                'total_models': len(self.models),
                'available_models': list(self.models.keys()),
                'models': self.model_metadata.copy()
            }


# Global instance
model_loader = ModelLoader()
