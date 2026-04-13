
# /project_flask_api/prediction_module/data_fetcher.py

import os
import xarray as xr
from datetime import datetime, timedelta
import copernicusmarine
import warnings
import numpy as np

# Tắt các cảnh báo không cần thiết
warnings.filterwarnings("ignore", category=UserWarning)

# Import cấu hình từ file config.py ở thư mục gốc
# Cần thêm .. để đi lên một cấp thư mục
from config import COPERNICUS_USERNAME, COPERNICUS_PASSWORD, DATA_CACHE_PATH

# Định nghĩa vùng biển Việt Nam
VIETNAM_BBOX = {
    "min_lon": 102.0, "max_lon": 118.0,
    "min_lat": 7.0,   "max_lat": 24.0,
}

# Danh sách các bộ dữ liệu và biến cần lấy
DATASETS_TO_FETCH = {
    "temperature": {"id": "cmems_mod_glo_phy-thetao_anfc_0.083deg_P1D-m", "vars": ["thetao"]},
    "salinity": {"id": "cmems_mod_glo_phy-so_anfc_0.083deg_P1D-m", "vars": ["so"]},
    "nutrients": {"id": "cmems_mod_glo_bgc-nut_anfc_0.25deg_P1D-m", "vars": ["po4"]},
    "biology": {"id": "cmems_mod_glo_bgc-bio_anfc_0.25deg_P1D-m", "vars": ["o2"]},
    "phytoplankton": {"id": "cmems_mod_glo_bgc-pft_anfc_0.25deg_P1D-m", "vars": ["chl"]},
    "wave": {"id": "cmems_mod_glo_wav_anfc_0.083deg_PT3H-i", "vars": ["VHM0", "VTPK"]},
}

def run_daily_grid_retrieval():
    """
    Hàm chính để tải về và gộp dữ liệu dạng lưới cho vùng biển Việt Nam.
    """
    print(f"--- Starting daily GRID data retrieval at {datetime.now()} ---")
    
    request_date = (datetime.now() - timedelta(days=2)).strftime('%Y-%m-%d')
    request_datetime_noon = f"{request_date}T12:00:00"
    
    output_dir = "copernicus_temp_data"
    os.makedirs(output_dir, exist_ok=True)
    
    all_datasets = []

    for name, info in DATASETS_TO_FETCH.items():
        try:
            print(f"Fetching grid for: {name}...")
            filename = f"{name}_grid.nc"
            filepath = os.path.join(output_dir, filename)

            copernicusmarine.subset(
                dataset_id=info['id'],
                username=COPERNICUS_USERNAME, password=COPERNICUS_PASSWORD,
                minimum_longitude=VIETNAM_BBOX['min_lon'], maximum_longitude=VIETNAM_BBOX['max_lon'],
                minimum_latitude=VIETNAM_BBOX['min_lat'], maximum_latitude=VIETNAM_BBOX['max_lat'],
                start_datetime=request_datetime_noon, end_datetime=request_datetime_noon,
                variables=info['vars'],
                output_filename=filename, output_directory=output_dir,
            )
            
            ds = xr.open_dataset(filepath)
            all_datasets.append(ds)
            print(f"Success for {name}.")
        except Exception as e:
            print(f"ERROR fetching grid for {name}: {e}")

    if all_datasets:
        print("\nMerging all datasets into a single file...")
        merged_ds = xr.merge(all_datasets)
        os.makedirs(os.path.dirname(DATA_CACHE_PATH), exist_ok=True)
        merged_ds.to_netcdf(DATA_CACHE_PATH)
        print(f"Merged dataset saved to: {DATA_CACHE_PATH}")

        for ds in all_datasets:
            ds.close()

    print("Cleaning up temporary files...")
    for name in DATASETS_TO_FETCH.keys():
        filepath = os.path.join(output_dir, f"{name}_grid.nc")
        if os.path.exists(filepath):
            os.remove(filepath)
    if os.path.exists(output_dir):
        try: os.rmdir(output_dir)
        except OSError: pass

    print(f"\n--- Grid retrieval finished. ---")