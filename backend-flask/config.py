# /project_flask_api/config.py

import os
import glob

# AUTO-DISCOVER MODEL PATHS
# Automatically scan and load all .pkl files from model/ directory
def discover_model_paths(base_dirs=['model', 'shared_models']):
    """
    Automatically discover all .pkl model files in multiple model directories.
    Returns a dictionary with model names as keys and file paths as values.
    
    Searches in:
    - 'model/' - Built-in models from Docker image
    - 'shared_models/' - Models uploaded via Express (shared volume)
    
    Naming convention:
    - model/species/algorithm_model.pkl -> 'species_algorithm'
    - model/species/stack_gen_model.pkl -> 'species_stack'
    
    Examples:
    - model/cobia/ridge_model.pkl -> 'cobia_ridge'
    - shared_models/oyster/custom_model.pkl -> 'oyster_custom'
    """
    model_paths = {}
    
    # Support both string and list input
    if isinstance(base_dirs, str):
        base_dirs = [base_dirs]
    
    for base_dir in base_dirs:
        if not os.path.exists(base_dir):
            print(f"INFO: Model directory '{base_dir}' not found, skipping.")
            continue
        
        discover_in_directory(base_dir, model_paths)
    
    if not model_paths:
        print(f"WARNING: No .pkl files found in any model directories.")
    else:
        print(f"Total models discovered: {len(model_paths)}")
    
    return model_paths

def discover_in_directory(base_dir, model_paths):
    """
    Helper function to discover models in a specific directory.
    Updates model_paths dict in place.
    
    Supports 2 naming conventions:
    1. Folder structure: model/cobia/ridge_model.pkl -> 'cobia_ridge'
    2. Flat structure: model/cobia__ridge_regression_model.pkl -> 'cobia_ridge_regression'
    """
    if not os.path.exists(base_dir):
        return model_paths
    
    # Search for all .pkl files in subdirectories
    pattern = os.path.join(base_dir, '**', '*.pkl')
    pkl_files = glob.glob(pattern, recursive=True)
    
    for pkl_file in pkl_files:
        # Extract species and algorithm from path
        rel_path = os.path.relpath(pkl_file, base_dir)
        parts = rel_path.split(os.sep)
        filename = parts[-1]
        
        # Check if filename uses flat naming: species__algorithm_model.pkl
        if '__' in filename:
            # FLAT STRUCTURE (from Google Drive uploads)
            # Example: cobia__ridge_regression_model.pkl
            parts_name = filename.replace('_model.pkl', '').replace('.pkl', '').split('__')
            
            if len(parts_name) >= 2:
                species = parts_name[0]  # e.g., 'cobia'
                algorithm = parts_name[1]  # e.g., 'ridge_regression'
                
                if algorithm == 'stack_gen':
                    algorithm = 'stack'
                
                # Model key: species_algorithm
                model_key = f"{species}_{algorithm}"
                
                # Check for duplicate
                if model_key in model_paths:
                    print(f"WARNING: Duplicate model key '{model_key}'")
                    print(f"  Existing: {model_paths[model_key]}")
                    print(f"  New: {pkl_file}")
                    print(f"  Keeping existing model.")
                else:
                    model_paths[model_key] = pkl_file
                    print(f"Discovered (flat): {model_key} -> {pkl_file}")
        
        elif len(parts) >= 2:
            # FOLDER STRUCTURE (legacy)
            # Example: model/cobia/ridge_model.pkl
            species = parts[0]  # e.g., 'cobia' or 'oyster'
            
            # Extract algorithm name from filename
            # ridge_model.pkl -> ridge
            # stack_gen_model.pkl -> stack
            algorithm = filename.replace('_model.pkl', '').replace('.pkl', '')
            if algorithm == 'stack_gen':
                algorithm = 'stack'
            
            # Remove species prefix from algorithm if it starts with it
            # e.g., cobia_ridge_regression -> ridge_regression (when species is cobia)
            species_prefix = species + '_'
            if algorithm.startswith(species_prefix):
                algorithm = algorithm[len(species_prefix):]
            
            # Create model key: species_algorithm
            # e.g., cobia_ridge, oyster_xgboost
            model_key = f"{species}_{algorithm}"
            
            # Only add if not already exists (priority: first found wins)
            if model_key not in model_paths:
                model_paths[model_key] = pkl_file
                print(f"Discovered model: {model_key} -> {pkl_file}")
            else:
                print(f"Skipping duplicate model: {model_key} (already loaded from {model_paths[model_key]})")

# Generate MODEL_PATHS dynamically
MODEL_PATHS = discover_model_paths()

# Fallback to manual configuration if auto-discovery fails
# (Uncomment and use this if you encounter issues with auto-discovery)
# MODEL_PATHS = {
#     'cobia_ridge': 'model/cobia/ridge_model.pkl',
#     'cobia_gbr': 'model/cobia/gbr_model.pkl',
#     'cobia_xgboost': 'model/cobia/xgboost_model.pkl',
#     'cobia_svr': 'model/cobia/svr_model.pkl',
#     'cobia_rf': 'model/cobia/rf_model.pkl',
#     'cobia_lightgbm': 'model/cobia/lightgbm_model.pkl',
#     'cobia_stack': 'model/cobia/stack_gen_model.pkl',
#     'oyster_ridge': 'model/oyster/ridge_model.pkl',
#     'oyster_gbr': 'model/oyster/gbr_model.pkl',
#     'oyster_xgboost': 'model/oyster/xgboost_model.pkl',
#     'oyster_svr': 'model/oyster/svr_model.pkl',
#     'oyster_rf': 'model/oyster/rf_model.pkl',
#     'oyster_lightgbm': 'model/oyster/lightgbm_model.pkl',
#     'oyster_stack': 'model/oyster/stack_gen_model.pkl',
# }

DATA_CACHE_PATH = 'data/latest_grid.nc'
# List of required fields for prediction
REQUIRED_FIELDS = [
    'R_PO4','O2Sat','O2ml_L','STheta','Salnty','R_DYNHT','T_degC','R_Depth','Distance',
    'Wind_Spd','Wave_Ht','Wave_Prd','IntChl','Dry_T'
]


DEFAULT_FALLBACK_VALUES = {
    'T_degC': 29.0,       # Nhiệt độ lý tưởng
    'Salnty': 30.0,       # Độ mặn lý tưởng
    'O2ml_L': 5.0,        # Oxy hòa tan
    'R_PO4': 0.5,         # Phosphate
    'IntChl': 0.2,        # Chlorophyll
    'Wave_Ht': 0.8,       # Chiều cao sóng thấp
    'Wave_Prd': 7.0,      # Chu kỳ sóng trung bình
    'Wind_Spd': 5.0,      # Tốc độ gió nhẹ (m/s)
    'O2Sat': 95.0,        # Độ bão hòa Oxy
    'STheta': 22.0,       # Mật độ nước biển
    'R_DYNHT': 0,         # Các giá trị này thường là 0 hoặc giá trị mặc định
    'R_Depth': 10,
    'Distance': -50,
    'Dry_T': 28,
}

FETCH_SECRET_KEY = 'your-very-secret-and-random-string-12345'

# === COPERNICUS API CREDENTIALS ===
# Thay thế bằng thông tin đăng nhập Copernicus của bạn
COPERNICUS_USERNAME = 'nghiem.eo.bua.18@gmail.com'
COPERNICUS_PASSWORD = 'Quenmatroi1!'