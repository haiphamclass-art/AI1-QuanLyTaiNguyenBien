# /project_flask_api/prediction_module/services.py

import joblib
import numpy as np
import os
import threading
from datetime import datetime, timedelta
import copernicusmarine
import xarray as xr
import gsw

from config import REQUIRED_FIELDS,DEFAULT_FALLBACK_VALUES, DATA_CACHE_PATH
from .data_fetcher import run_daily_grid_retrieval
from .model_loader import model_loader

# Backward compatibility - expose model_loader's models dict
models = model_loader.models


# Enhanced load_all_models using ModelLoader
def load_all_models(model_paths):
    """Load all models using enhanced ModelLoader with validation and retry"""
    success, message, count = model_loader.load_all_models(model_paths)
    if not success:
        print(f"Warning: {message}")
    return model_loader.models

def get_available_models():
    """Get list of available model names"""
    return model_loader.get_available_models()
def get_ocean_data(existing_data, target_depth, username, password):
    """
    Lấy dữ liệu hải dương học (Tối ưu: chỉ lấy những gì còn thiếu ở độ sâu chỉ định).
    """
    lat = existing_data.get('lat')
    lon = existing_data.get('lon')
    
    if lat is None or lon is None:
        return {}, "lat/lon are required to fetch missing data."

    # ... (các biến thời gian, thư mục giữ nguyên) ...
    request_date = (datetime.now() - timedelta(days=2)).strftime('%Y-%m-%d')
    request_datetime_noon = f"{request_date}T12:00:00"
    output_dir = "copernicus_temp_data"
    os.makedirs(output_dir, exist_ok=True)
    
    newly_fetched_data = {}
    
    # 1A. LẤY NHIỆT ĐỘ
    if 'T_degC' not in existing_data:
        try:
            print(f"Fetching temperature data at depth ~{target_depth}m...")
            temp_dataset_id = "cmems_mod_glo_phy-thetao_anfc_0.083deg_P1D-m"
            temp_filename = "temp_subset.nc"
            temp_filepath = os.path.join(output_dir, temp_filename)
            copernicusmarine.subset(
                dataset_id=temp_dataset_id, username=username, password=password,
                minimum_longitude=lon, maximum_longitude=lon,
                minimum_latitude=lat, maximum_latitude=lat,
                start_datetime=request_datetime_noon, end_datetime=request_datetime_noon,
                variables=["thetao"], output_filename=temp_filename, output_directory=output_dir
            )
            with xr.open_dataset(temp_filepath) as ds:
                # SỬA ĐỔI: Dùng .sel() để chọn theo độ sâu target_depth
                temp_c = ds['thetao'].sel(time=request_datetime_noon, depth=target_depth, method='nearest').values.item()
                if not np.isnan(temp_c):
                    newly_fetched_data['T_degC'] = temp_c
            os.remove(temp_filepath)
        except Exception as e:
            print(f"ERROR fetching temperature data: {e}")
            return None, f"Error fetching temperature data: {e}"

    # 1B. LẤY ĐỘ MẶN
    if 'Salnty' not in existing_data:
        try:
            print(f"Fetching salinity data at depth ~{target_depth}m...")
            salt_dataset_id = "cmems_mod_glo_phy-so_anfc_0.083deg_P1D-m"
            salt_filename = "salt_subset.nc"
            salt_filepath = os.path.join(output_dir, salt_filename)
            copernicusmarine.subset(
                dataset_id=salt_dataset_id, username=username, password=password,
                minimum_longitude=lon, maximum_longitude=lon,
                minimum_latitude=lat, maximum_latitude=lat,
                start_datetime=request_datetime_noon, end_datetime=request_datetime_noon,
                variables=["so"], output_filename=salt_filename, output_directory=output_dir
            )
            with xr.open_dataset(salt_filepath) as ds:
                # SỬA ĐỔI: Dùng .sel() để chọn theo độ sâu target_depth
                salinity_val = ds['so'].sel(time=request_datetime_noon, depth=target_depth, method='nearest').values.item()
                if not np.isnan(salinity_val):
                    newly_fetched_data['Salnty'] = salinity_val
            os.remove(salt_filepath)
        except Exception as e:
            print(f"ERROR fetching salinity data: {e}")
            return None, f"Error fetching salinity data: {e}"

    # 2A. LẤY DINH DƯỠНГ (po4)
    if 'R_PO4' not in existing_data:
        try:
            print(f"Fetching nutrients data at depth ~{target_depth}m...")
            nut_dataset_id = "cmems_mod_glo_bgc-nut_anfc_0.25deg_P1D-m"
            nut_filename = "nut_subset.nc"
            nut_filepath = os.path.join(output_dir, nut_filename)
            copernicusmarine.subset(
                dataset_id=nut_dataset_id, username=username, password=password,
                minimum_longitude=lon, maximum_longitude=lon,
                minimum_latitude=lat, maximum_latitude=lat,
                start_datetime=request_datetime_noon, end_datetime=request_datetime_noon,
                variables=["po4"], output_filename=nut_filename, output_directory=output_dir
            )
            with xr.open_dataset(nut_filepath) as ds:
                # SỬA ĐỔI: Dùng .sel() để chọn theo độ sâu target_depth
                po4_val = ds['po4'].sel(time=request_datetime_noon, depth=target_depth, method='nearest').values.item()
                if not np.isnan(po4_val):
                    newly_fetched_data['R_PO4'] = po4_val * 1e3
            os.remove(nut_filepath)
        except Exception as e:
            print(f"WARN: Could not fetch nutrients data: {e}")
            
    # ... (Áp dụng tương tự cho o2 và chl) ...
    # 2B. LẤY DỮ LIỆU SINH HỌC (o2)
    if 'O2ml_L' not in existing_data:
        try:
            print(f"Fetching biology data at depth ~{target_depth}m...")
            bio_dataset_id = "cmems_mod_glo_bgc-bio_anfc_0.25deg_P1D-m"
            bio_filename = "bio_subset.nc"
            bio_filepath = os.path.join(output_dir, bio_filename)
            copernicusmarine.subset(
                dataset_id=bio_dataset_id, username=username, password=password,
                minimum_longitude=lon, maximum_longitude=lon,
                minimum_latitude=lat, maximum_latitude=lat,
                start_datetime=request_datetime_noon, end_datetime=request_datetime_noon,
                variables=["o2"], output_filename=bio_filename, output_directory=output_dir
            )
            with xr.open_dataset(bio_filepath) as ds:
                o2_val = ds['o2'].sel(time=request_datetime_noon, depth=target_depth, method='nearest').values.item()
                if not np.isnan(o2_val):
                    newly_fetched_data['O2ml_L'] = o2_val * 22.4
            os.remove(bio_filepath)
        except Exception as e:
            print(f"WARN: Could not fetch biology data: {e}")

    # 2C. LẤY DỮ LIỆU THỰC VẬT PHÙ DU (chl)
    if 'IntChl' not in existing_data:
        try:
            print(f"Fetching phytoplankton data at depth ~{target_depth}m...")
            pft_dataset_id = "cmems_mod_glo_bgc-pft_anfc_0.25deg_P1D-m"
            pft_filename = "pft_subset.nc"
            pft_filepath = os.path.join(output_dir, pft_filename)
            copernicusmarine.subset(
                dataset_id=pft_dataset_id, username=username, password=password,
                minimum_longitude=lon, maximum_longitude=lon,
                minimum_latitude=lat, maximum_latitude=lat,
                start_datetime=request_datetime_noon, end_datetime=request_datetime_noon,
                variables=["chl"], output_filename=pft_filename, output_directory=output_dir
            )
            with xr.open_dataset(pft_filepath) as ds:
                chl_val = ds['chl'].sel(time=request_datetime_noon, depth=target_depth, method='nearest').values.item()
                if not np.isnan(chl_val):
                    newly_fetched_data['IntChl'] = chl_val
            os.remove(pft_filepath)
        except Exception as e:
            print(f"WARN: Could not fetch phytoplankton data: {e}")

    # 3. LẤY DỮ LIỆU SÓNG (Không có chiều depth)
    if 'Wave_Ht' not in existing_data or 'Wave_Prd' not in existing_data:
        try:
            print("Fetching wave data (Surface)...")
            wav_dataset_id = "cmems_mod_glo_wav_anfc_0.083deg_PT3H-i"
            # ... (phần còn lại của khối try wave giữ nguyên, vì nó không có depth)
            wav_filename = "wav_subset.nc"
            wav_filepath = os.path.join(output_dir, wav_filename)
            copernicusmarine.subset(
                dataset_id=wav_dataset_id, username=username, password=password,
                minimum_longitude=lon, maximum_longitude=lon,
                minimum_latitude=lat, maximum_latitude=lat,
                start_datetime=request_datetime_noon, end_datetime=request_datetime_noon,
                variables=["VHM0", "VTPK"], output_filename=wav_filename, output_directory=output_dir
            )
            with xr.open_dataset(wav_filepath) as ds:
                wave_ht_val = ds['VHM0'].isel(time=0).values.item()
                if not np.isnan(wave_ht_val):
                    newly_fetched_data['Wave_Ht'] = wave_ht_val
                
                wave_prd_val = ds['VTPK'].isel(time=0).values.item()
                if not np.isnan(wave_prd_val):
                    newly_fetched_data['Wave_Prd'] = wave_prd_val
            os.remove(wav_filepath)
        except Exception as e:
            print(f"WARN: Could not fetch wave data: {e}")
            
    if os.path.exists(output_dir):
        try: os.rmdir(output_dir)
        except OSError: pass
            
    return newly_fetched_data, None
# def process_prediction_request(user_data, species, credentials):
#     """
#     Hàm chính xử lý yêu cầu dự đoán (Cập nhật: truyền target_depth vào get_ocean_data).
#     """
#     final_features = user_data.copy()
#     api_call_made = False
    
#     # SỬA ĐỔI: Xác định độ sâu mục tiêu trước khi gọi API
#     target_depth = final_features.get('R_Depth', DEFAULT_FALLBACK_VALUES.get('R_Depth', 10))
#     # Đảm bảo R_Depth có trong final_features để không bị fetch lại
#     final_features['R_Depth'] = target_depth
    
#     # 1. Kiểm tra và gọi API nếu cần
#     missing_fields = [field for field in REQUIRED_FIELDS if field not in final_features]
#     if missing_fields and 'lat' in final_features and 'lon' in final_features:
#         print(f"Missing fields detected: {missing_fields}. Attempting to fetch from API at depth ~{target_depth}m.")
        
#         # SỬA ĐỔI: Truyền target_depth vào hàm get_ocean_data
#         newly_fetched_data, error = get_ocean_data(
#             final_features, target_depth, credentials['username'], credentials['password']
#         )
#         api_call_made = True
#         if error:
#             return {"error": error}, 500, {}
        
#         final_features.update(newly_fetched_data)

#     # ... (phần còn lại của hàm từ Bước 2. Tính toán giá trị phái sinh... giữ nguyên)
#     temp_ok = 'T_degC' in final_features and final_features.get('T_degC') is not None and 0 < final_features['T_degC'] < 40
#     sal_ok = 'Salnty' in final_features and final_features.get('Salnty') is not None and 10 < final_features['Salnty'] < 45

#     if temp_ok and sal_ok:
#         print("Calculating derived features (STheta, O2Sat)...")
#         pressure = target_depth # Áp suất bây giờ phụ thuộc vào độ sâu
#         lat = final_features.get('lat', 10)
#         lon = final_features.get('lon', 107)
#         SA = gsw.SA_from_SP(final_features['Salnty'], pressure, lon, lat)
#         CT = gsw.CT_from_t(SA, final_features['T_degC'], pressure)
#         final_features['STheta'] = gsw.sigma0(SA, CT)
        
#         if 'O2ml_L' in final_features and final_features.get('O2ml_L') is not None and np.isfinite(final_features['O2ml_L']):
#             O2_sat_m3 = gsw.O2sol(SA, CT, pressure, lon, lat)
#             if O2_sat_m3 > 0:
#                 O2_sat_ml_L = O2_sat_m3 / 44.66
#                 if O2_sat_ml_L > 0:
#                     final_features['O2Sat'] = (final_features['O2ml_L'] / O2_sat_ml_L) * 100
#     else:
#         print("WARN: Skipping GSW calculations due to out-of-range input for Salnty or T_degC.")

#     # ... (phần còn lại của hàm dự đoán giữ nguyên)
#     model_name_from_req = user_data.get("model")
#     default_model = f"{species}_stack"
#     model_name = model_name_from_req or default_model
    
#     prediction_input_list = []
#     print("\n--- Finalizing features with fallback values ---")
#     final_input_dict = {}
#     for field in REQUIRED_FIELDS:
#         value = final_features.get(field)
#         if value is None or (isinstance(value, (float, int)) and not np.isfinite(value)):
#             fallback_value = DEFAULT_FALLBACK_VALUES.get(field, 0)
#             final_input_dict[field] = fallback_value
#             print(f"Field '{field}': Missing/NaN. Using fallback: {fallback_value}")
#         else:
#             final_input_dict[field] = value

#     print("\n--- Final features prepared for model ---")
#     for key, value in sorted(final_input_dict.items()):
#         print(f"  {key}: {value:.2f}" if isinstance(value, float) else f"  {key}: {value}")
#     print("-----------------------------------------\n")
    
#     prediction_input_list = [final_input_dict[field] for field in REQUIRED_FIELDS]

#     model = models.get(model_name)
#     if not model:
#         return {"error": f"Model '{model_name}' not found"}, 404, final_features

#     input_array = np.array(prediction_input_list).reshape(1, -1)
#     prediction_val = model.predict(input_array)
#     rounded_prediction = round(prediction_val[0])

#     result = {
#         "model_used": model_name, 
#         "prediction": rounded_prediction,
#         "api_call_made": api_call_made
#     }
#     debug_features = {key: final_input_dict.get(key) for key in REQUIRED_FIELDS}
#     return result, 200, debug_features

# /project_flask_api/services.py

# Thêm import xarray và các import khác
import json
import numpy as np
import xarray as xr
import gsw
from datetime import datetime

# ... (các hàm và biến không liên quan giữ nguyên) ...
from config import REQUIRED_FIELDS, DEFAULT_FALLBACK_VALUES, DATA_CACHE_PATH

# Helper: find nearest non-NaN value for a variable around a target lat/lon
def _find_nearest_valid_value(ds: xr.Dataset, var_name: str, lat: float, lon: float):
    if var_name not in ds:
        return None
    da = ds[var_name]
    # Prefer time=0 when time exists
    if 'time' in da.dims:
        try:
            da = da.isel(time=0)
        except Exception:
            pass
    # Build candidate depths: nearest to 0 first, then a few shallow indices
    depth_candidates = [None]
    if 'depth' in da.dims:
        try:
            nearest_depth = float(da['depth'].sel(depth=0, method='nearest').values)
            depth_candidates = [nearest_depth]
        except Exception:
            depth_candidates = []
        # add a few shallow indices as fallback
        for idx in [0, 1, 2, 5]:
            try:
                depth_candidates.append(float(da['depth'].isel(depth=idx).values))
            except Exception:
                pass
        # ensure uniqueness
        depth_candidates = [d for i, d in enumerate(depth_candidates) if d is not None and d not in depth_candidates[:i]] or [None]

    radii = [0.05, 0.1, 0.2, 0.3, 0.5, 1.0]
    # Always include r=0 selection first
    radii = [0.0] + radii
    for r in radii:
        try:
            if r == 0.0:
                sub = da.sel(latitude=lat, longitude=lon, method='nearest')
            else:
                sub = da.sel(latitude=slice(lat - r, lat + r), longitude=slice(lon - r, lon + r))
        except Exception:
            continue

        # Iterate depths
        for d in depth_candidates:
            try:
                cur = sub
                if d is not None and 'depth' in cur.dims:
                    cur = cur.sel(depth=d, method='nearest')
                val = cur.values
                # Reduce to scalar if it's an array
                if isinstance(val, np.ndarray):
                    # if window, take nearest by simple center or first finite
                    finite = np.isfinite(val)
                    if finite.any():
                        return float(val[finite][0])
                    else:
                        continue
                else:
                    if np.isfinite(val):
                        return float(val)
            except Exception:
                continue
    return None


def process_prediction_request(user_data, species, credentials):
    """
    Hàm chính xử lý yêu cầu dự đoán.
    (Nâng cấp: Luôn trả về dự đoán, kể cả khi cache không tồn tại)
    """
    final_features = {}
    api_call_triggered = False # Đổi tên biến để rõ nghĩa hơn

    # Bước 1: Kiểm tra xem người dùng đã cung cấp đủ dữ liệu chưa
    is_user_data_complete = set(REQUIRED_FIELDS).issubset(user_data.keys())

    if is_user_data_complete:
        print("User provided all required features. Skipping cache.")
        final_features = user_data.copy()
    else:
        # Bước 2: Nếu dữ liệu không đủ, mới thực hiện logic đọc cache
        lat = user_data.get('lat')
        lon = user_data.get('lon')

        if lat is None or lon is None:
            return {"error": "Incomplete features and no lat/lon provided to fetch them."}, 400, {}

        try:
            # Thử đọc file cache
            with xr.open_dataset(DATA_CACHE_PATH) as ds:
                print(f"Reading from cache file for coordinates ({lat}, {lon})...")
                point_data = ds.sel(latitude=lat, longitude=lon, method='nearest')
                
                # Nearest non-NaN per feature
                t_val = _find_nearest_valid_value(ds, 'thetao', lat, lon)
                s_val = _find_nearest_valid_value(ds, 'so', lat, lon)
                po4_val = _find_nearest_valid_value(ds, 'po4', lat, lon)
                o2_val = _find_nearest_valid_value(ds, 'o2', lat, lon)
                chl_val = _find_nearest_valid_value(ds, 'chl', lat, lon)
                vhm0_val = _find_nearest_valid_value(ds, 'VHM0', lat, lon)
                vtpk_val = _find_nearest_valid_value(ds, 'VTPK', lat, lon)

                base_features = {
                    'T_degC': t_val,
                    'Salnty': s_val,
                    'R_PO4': (po4_val * 1e3) if (po4_val is not None and np.isfinite(po4_val)) else None,
                    'O2ml_L': (o2_val * 22.4) if (o2_val is not None and np.isfinite(o2_val)) else None,
                    'IntChl': chl_val,
                    'Wave_Ht': vhm0_val,
                    'Wave_Prd': vtpk_val,
                }

        # SỬA ĐỔI: Xử lý khi không tìm thấy file cache
        except FileNotFoundError:
            print("WARN: Data cache not found. Serving prediction with default values and triggering background fetch.")
            # Khởi động tác vụ lấy dữ liệu trong nền
            thread = threading.Thread(target=run_daily_grid_retrieval)
            thread.start()
            api_call_triggered = True # Ghi nhận rằng một tác vụ nền đã được kích hoạt
            
            # Sử dụng bộ giá trị mặc định để tiếp tục thực hiện dự đoán
            base_features = DEFAULT_FALLBACK_VALUES.copy()

        except Exception as e:
            return {"error": f"Error reading cache file: {e}"}, 500, {}
        
        # Gộp dữ liệu nền (từ cache hoặc default) với dữ liệu người dùng
        final_features = base_features.copy()
        final_features.update(user_data)

    # --- Phần còn lại của hàm (tính toán phái sinh và dự đoán) giữ nguyên ---

    # 3. Tính toán các giá trị phái sinh
    temp_ok = 'T_degC' in final_features and final_features.get('T_degC') is not None and 0 < final_features['T_degC'] < 40
    sal_ok = 'Salnty' in final_features and final_features.get('Salnty') is not None and 10 < final_features['Salnty'] < 45

    if temp_ok and sal_ok:
        target_depth = final_features.get('R_Depth', 10)
        pressure = gsw.p_from_z(-abs(target_depth), final_features.get('lat', 10))
        SA = gsw.SA_from_SP(final_features['Salnty'], pressure, final_features.get('lon', 107), final_features.get('lat', 10))
        CT = gsw.CT_from_t(SA, final_features['T_degC'], pressure)
        final_features['STheta'] = gsw.sigma0(SA, CT)
        if 'O2ml_L' in final_features and final_features.get('O2ml_L') is not None and np.isfinite(final_features['O2ml_L']):
            O2_sat_m3 = gsw.O2sol(SA, CT, pressure, final_features.get('lon', 107), final_features.get('lat', 10))
            if O2_sat_m3 > 0:
                O2_sat_ml_L = O2_sat_m3 / 44.66
                if O2_sat_ml_L > 0:
                    final_features['O2Sat'] = (final_features['O2ml_L'] / O2_sat_ml_L) * 100
    
    # 4. Check if models are currently being loaded
    if model_loader.is_loading():
        return {
            "error": "Models are currently being reloaded. Please try again in a moment.",
            "retry_after": 5  # seconds
        }, 503, final_features
    
    # 5. Thực hiện dự đoán
    model_name_from_req = user_data.get("model")
    default_model = f"{species}_stack"
    model_name = model_name_from_req or default_model
    final_input_dict = {}
    for field in REQUIRED_FIELDS:
        value = final_features.get(field)
        if value is None or (isinstance(value, (float, int)) and not np.isfinite(value)):
            fallback_value = DEFAULT_FALLBACK_VALUES.get(field, 0)
            final_input_dict[field] = fallback_value
        else:
            final_input_dict[field] = value
    prediction_input_list = [final_input_dict[field] for field in REQUIRED_FIELDS]
    
    # Use thread-safe model retrieval
    model = model_loader.get_model(model_name)
    if not model:
        # Provide helpful error with available models
        available = model_loader.get_available_models()
        return {
            "error": f"Model '{model_name}' not found",
            "available_models": available,
            "suggestion": f"Try using one of: {', '.join(available[:3])}" if available else "No models loaded"
        }, 404, final_features
    
    # Verify model is loaded correctly
    model_meta = model_loader.get_model_metadata(model_name)
    if model_meta and model_meta.get('status') == 'failed':
        return {
            "error": f"Model '{model_name}' failed to load",
            "details": model_meta.get('error', 'Unknown error')
        }, 500, final_features
    
    input_array = np.array(prediction_input_list).reshape(1, -1)
    prediction_val = model.predict(input_array)
    rounded_prediction = round(prediction_val[0])
    result = {
        "model_used": model_name, 
        "prediction": rounded_prediction,
        "background_fetch_triggered": api_call_triggered
    }
    debug_features = {key: final_input_dict.get(key) for key in REQUIRED_FIELDS}
    return result, 200, debug_features
