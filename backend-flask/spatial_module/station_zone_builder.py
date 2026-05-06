import math
import heapq
import json
import logging
import os
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from functools import lru_cache

import numpy as np
import pandas as pd
import geopandas as gpd
import rasterio
from rasterio import features
from rasterio.transform import from_origin
from shapely.geometry import shape
import fiona
from shapely.geometry import Polygon, MultiPolygon
import requests
from pyproj import Transformer
from scipy.spatial import cKDTree
from spatial_module.station_profile_assignment import (
    augment_spatial_features_with_depth,
    build_station_profile_audit_fields,
    extract_station_spatial_features,
)


# =========================================================
# 1) PATHS & CONFIG
# =========================================================
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
OUTPUT_DIR = BASE_DIR / "data" / "output_influence"
OUTPUT_DIR.mkdir(exist_ok=True)
CONFIG_DIR = Path(__file__).resolve().parent / "config"
THRESHOLD_CONFIG_PATH = CONFIG_DIR / "thresholds_by_area_type.json"

WATER_FILE = DATA_DIR / "water_aoi_5899.gpkg"

WATER_LAYER = None

CALC_CRS = "EPSG:5899"   # dùng để tính
WEB_CRS = "EPSG:4326"    # dùng để trả frontend

# Input từ Express / DB
COL_ID = "maHieu"
COL_NAME = "vitri"
COL_LAT = "latitude"
COL_LON = "longitude"
COL_AREA_TYPE = "area_type"
COL_PREDICTION_TEXT = "prediction_text"
COL_PREDICTION_CREATED_AT = "prediction_created_at"

# Raster resolution (m)
CELL_SIZE = 50.0

# 3 vòng ảnh hưởng (m)
R1 = 3000.0
R2 = 6000.0
R3 = 10000.0

# Bán kính snap nếu điểm hơi lệch khỏi nước
SNAP_MAX_RADIUS_CELLS = 30

# Metadata cho frontend
RING_WEIGHTS = {
    1: 1.0,
    2: 0.6,
    3: 0.3,
}

RING_LABELS = {
    1: "Mạnh",
    2: "Trung bình",
    3: "Ít ảnh hưởng",
}

RING_COLORS = {
    1: "#0d47a1",
    2: "#42a5f5",
    3: "#bbdefb",
}

RING_OPACITY = {
    1: 0.90,
    2: 0.55,
    3: 0.25,
}

BASE_SCORE_MAP = {
    1: 1.0,
    0: 0.6,
    -1: 0.25,
}

IMPACT_LABELS = {
    0: "thấp",
    1: "vừa",
    2: "cao",
}

IMPACT_FACTORS = {
    0: 0.9,
    1: 0.7,
    2: 0.4,
}
RISK_WEIGHTS = {
    "wind": 0.4,
    "rain": 0.2,
    "wave": 0.4,
}
COMPOSITE_RISK_THRESHOLDS = {
    "medium": 0.75,
    "high": 1.35,
}

FORECAST_TIMEZONE = "Asia/Bangkok"
FORECAST_WORKERS = 8
FORECAST_TIMEOUT = 15
# Default to enabled so rebuild/export paths produce real hourly metrics
# unless runtime explicitly disables forecast fetching.
FORECAST_ENABLED = os.getenv("STATION_FORECAST_ENABLED", "true").lower() == "true"
FORECAST_SUMMARY_PATH = OUTPUT_DIR / "station_forecast_summary.json"
ZONE_SUMMARY_PATH = OUTPUT_DIR / "zone_summary.json"
DEPTH_CACHE_PATH = OUTPUT_DIR / "depth_cache.json"
STATION_THRESHOLD_COMPARISON_PATH = OUTPUT_DIR / "station_threshold_comparison.csv"
REGION_HOURLY_SUMMARY_PATH = OUTPUT_DIR / "region_hourly_summary.csv"
TOP_ZONE_DROPS_PATH = OUTPUT_DIR / "top_zone_drops.csv"
STATION_PROFILE_AUTO_PATH = OUTPUT_DIR / "station_profile_auto.csv"
STATION_PROFILE_AUDIT_PATH = OUTPUT_DIR / "station_profile_audit.csv"
STATION_ZONES_WEB_CACHE_PATH = OUTPUT_DIR / "station_zones_latest_web.json"
KNOWN_DEPTH_DATASET_IDS = [8]
DEPTH_NEAREST_MAX_KM = 40.0
DEPTH_TRANSFORMER = Transformer.from_crs("EPSG:4326", CALC_CRS, always_xy=True)
DEPTH_RASTER_INFLUENCE_KM = 20.0
MIN_DEPTH_TRAVEL_FACTOR = 0.35
MISSING_PREDICTION_TEXT_SENTINEL = "__missing_prediction_text__"
MISSING_PREDICTION_CREATED_AT_SENTINEL = "__missing_prediction_created_at__"
STATION_REACH_FACTORS = {
    0: 1.0,   # low impact
    1: 0.85,  # medium impact
    2: 0.70,  # high impact
}
MAX_STATION_REACH_FACTOR = max(STATION_REACH_FACTORS.values())
LOGGER = logging.getLogger(__name__)

DEFAULT_THRESHOLD_CONFIG = {
    "default": {
        "wind_low_to_medium": 5.0,
        "wind_medium_to_high": 8.5,
        "rain_low_to_medium": 1.0,
        "rain_medium_to_high": 3.0,
    }
}

OLD_COMMON_THRESHOLD_CONFIG = {
    "wind_low_to_medium": 6.0,
    "wind_medium_to_high": 10.0,
    "rain_low_to_medium": 2.0,
    "rain_medium_to_high": 10.0,
}

WEB_HOURLY_FORECAST_KEYS = {
    "maHieu",
    "forecast_times",
    "impact_level_hourly",
    "impact_factor_hourly",
    "reach_factor_hourly",
    "risk_score_hourly",
    "wind_hourly_m_s",
    "rain_hourly_mm",
    "wave_hourly_m",
}


# =========================================================
# 2) HELPERS
# =========================================================
def read_vector(path, layer=None):
    path = str(path)
    if path.lower().endswith(".gpkg"):
        layers = fiona.listlayers(path)
        if layer is None:
            if len(layers) == 1:
                return gpd.read_file(path, layer=layers[0])
            raise ValueError(f"{path} có nhiều layer, hãy chỉ định layer.")
        return gpd.read_file(path, layer=layer)
    return gpd.read_file(path)


def xy_to_rowcol(x, y, transform):
    col, row = ~transform * (x, y)
    return int(np.floor(row)), int(np.floor(col))


def rowcol_to_xy(row, col, transform):
    x, y = transform * (col + 0.5, row + 0.5)
    return x, y


def snap_to_nearest_water(rr, cc, mask, max_radius=10):
    if 0 <= rr < mask.shape[0] and 0 <= cc < mask.shape[1] and mask[rr, cc] == 1:
        return rr, cc

    best = None
    best_d2 = None

    r0 = max(0, rr - max_radius)
    r1 = min(mask.shape[0], rr + max_radius + 1)
    c0 = max(0, cc - max_radius)
    c1 = min(mask.shape[1], cc + max_radius + 1)

    for r in range(r0, r1):
        for c in range(c0, c1):
            if mask[r, c] != 1:
                continue
            d2 = (r - rr) ** 2 + (c - cc) ** 2
            if best is None or d2 < best_d2:
                best = (r, c)
                best_d2 = d2

    return best


def snap_to_nearest_water_global(rr, cc, water_cell_tree, water_cells):
    if water_cell_tree is None or water_cells is None or len(water_cells) == 0:
        return None

    _, nearest_index = water_cell_tree.query(np.array([[rr, cc]], dtype=np.float64), k=1)
    snapped = water_cells[int(np.atleast_1d(nearest_index)[0])]
    return int(snapped[0]), int(snapped[1])


def save_raster(output_path, array, profile, dtype, nodata):
    profile_out = profile.copy()
    profile_out["dtype"] = dtype
    profile_out["nodata"] = nodata

    with rasterio.open(output_path, "w", **profile_out) as dst:
        dst.write(array.astype(dtype), 1)

def smooth_geometry_for_web(geom, distance=120):
    """
    Bo tròn biên để hiển thị web.
    distance tính theo mét trong EPSG:5899.
    """
    if geom is None or geom.is_empty:
        return geom
    try:
        g = geom.buffer(distance, join_style=1).buffer(-distance, join_style=1)
        if not g.is_valid:
            g = g.buffer(0)
        return g
    except Exception:
        return geom


def smooth_geometry_buffer(geom, distance=40):
    """
    Làm mượt nhẹ biên polygon bằng buffer ra rồi buffer vào.
    distance tính theo mét trong EPSG:5899.
    """
    if geom is None or geom.is_empty:
        return geom
    try:
        return geom.buffer(distance, join_style=1).buffer(-distance, join_style=1)
    except Exception:
        return geom


def classify_base_score(prediction_text):
    """
    Heuristic mapping from coarse prediction label to a base influence score.
    This is rule-based support logic, not a calibrated risk model.
    """
    try:
        prediction_value = int(prediction_text)
    except (TypeError, ValueError):
        prediction_value = None

    if prediction_value is None:
        return None, "chưa có dự báo", prediction_value

    if prediction_value == 1:
        return BASE_SCORE_MAP[1], "tốt", prediction_value
    if prediction_value == 0:
        return BASE_SCORE_MAP[0], "trung bình", prediction_value
    if prediction_value == -1:
        return BASE_SCORE_MAP[-1], "kém", prediction_value

    return None, "không xác định", prediction_value


def _normalize_area_type_key(area_type):
    if area_type is None:
        return "default"
    normalized = str(area_type).strip().lower()
    if not normalized:
        return "default"
    return normalized.replace("-", "_").replace(" ", "_")


@lru_cache(maxsize=1)
def load_threshold_config():
    """Load the pre-calibrated threshold config used by runtime only.

    This module does not create thresholds from live/runtime data. Thresholds
    are assumed to have been generated offline after historical data was first
    assigned `auto_profile` by the shared classifier in
    `station_profile_assignment.py`.

    Runtime only does three things:
    1. assign `auto_profile` to the current station
    2. load/select the already calibrated threshold profile from JSON
    3. apply that threshold to future forecast values
    """
    try:
        with THRESHOLD_CONFIG_PATH.open("r", encoding="utf-8") as file_obj:
            payload = json.load(file_obj)
        if not isinstance(payload, dict) or "default" not in payload:
            raise ValueError("threshold config must include default section")

        default_section = payload.get("default") or {}
        if not isinstance(default_section, dict):
            raise ValueError("threshold config default section must be an object")

        merged = {"default": {**DEFAULT_THRESHOLD_CONFIG["default"], **default_section}}
        for key, value in payload.items():
            if key == "default" or not isinstance(value, dict):
                continue
            merged[_normalize_area_type_key(key)] = {**merged["default"], **value}

        # Generic near-mainland coastal fallback currently reuses default thresholds.
        # This keeps the runtime honest: the profile name is neutral, while threshold
        # behavior stays stable until a dedicated calibrated profile is introduced.
        if "near_mainland_coastal" not in merged:
            merged["near_mainland_coastal"] = dict(merged["default"])

        return merged
    except Exception as exc:
        LOGGER.warning(
            "Failed to load threshold config from %s, using defaults: %s",
            THRESHOLD_CONFIG_PATH,
            exc,
        )
        return dict(DEFAULT_THRESHOLD_CONFIG)


def get_thresholds_for_area_type(area_type: str) -> dict:
    config = load_threshold_config()
    return dict(config.get(_normalize_area_type_key(area_type), config["default"]))


def resolve_threshold_profile_details(station_id, area_type=None, auto_profile=None):
    # Runtime threshold selection is fully automatic.
    # No station-specific manual labeling is used as a decision source here.
    # Important: runtime selects from an offline-calibrated config only.
    # It does not derive or update thresholds from current forecast inputs.
    thresholds_config = load_threshold_config()
    normalized_auto_profile = _normalize_area_type_key(auto_profile) if auto_profile is not None else "default"
    final_profile = normalized_auto_profile if normalized_auto_profile in thresholds_config else "default"
    profile_source = "auto_profile" if final_profile != "default" else "default"

    return {
        "final_profile": final_profile,
        "profile_source": profile_source,
        "raw_area_type": _normalize_area_type_key(area_type),
        "auto_profile": normalized_auto_profile if normalized_auto_profile in thresholds_config else "default",
        "manual_override_profile": None,
        "override_applied": False,
    }


def resolve_threshold_profile(station_id, area_type=None, auto_profile=None):
    return resolve_threshold_profile_details(
        station_id,
        area_type=area_type,
        auto_profile=auto_profile,
    )["final_profile"]


def classify_wind_severity_from_thresholds(max_wind, thresholds):
    if max_wind is None or np.isnan(max_wind):
        return 0
    if max_wind < thresholds["wind_low_to_medium"]:
        return 0
    if max_wind < thresholds["wind_medium_to_high"]:
        return 1
    return 2


def classify_rain_severity_from_thresholds(max_rain, thresholds):
    if max_rain is None or np.isnan(max_rain):
        return 0
    if max_rain < thresholds["rain_low_to_medium"]:
        return 0
    if max_rain < thresholds["rain_medium_to_high"]:
        return 1
    return 2


def classify_wind_severity(max_wind, area_type):
    return classify_wind_severity_from_thresholds(max_wind, get_thresholds_for_area_type(area_type))


def classify_rain_severity(max_rain, area_type=None):
    return classify_rain_severity_from_thresholds(max_rain, get_thresholds_for_area_type(area_type))


def classify_wave_severity(max_wave):
    if max_wave is None or np.isnan(max_wave):
        return 0
    if max_wave < 1:
        return 0
    if max_wave < 2:
        return 1
    return 2


def compute_composite_risk_score(wind_level, rain_level, wave_level):
    return (
        RISK_WEIGHTS["wind"] * float(wind_level)
        + RISK_WEIGHTS["rain"] * float(rain_level)
        + RISK_WEIGHTS["wave"] * float(wave_level)
    )


def composite_risk_score_to_level(risk_score):
    if risk_score >= COMPOSITE_RISK_THRESHOLDS["high"]:
        return 2
    if risk_score >= COMPOSITE_RISK_THRESHOLDS["medium"]:
        return 1
    return 0


def impact_component_name(level):
    return IMPACT_LABELS.get(level, "thấp")


def summarize_level_counts(levels):
    return {
        "low": int(sum(1 for level in levels if level == 0)),
        "medium": int(sum(1 for level in levels if level == 1)),
        "high": int(sum(1 for level in levels if level == 2)),
    }


def classify_depth_factor(depth_m):
    if depth_m is None or np.isnan(depth_m):
        return 1.0, "không có dữ liệu"
    if 3.0 <= depth_m <= 12.0:
        return 1.0, "độ sâu tối ưu"
    if 1.5 <= depth_m < 3.0 or 12.0 < depth_m <= 20.0:
        return 0.8, "độ sâu tương đối phù hợp"
    if 0.5 <= depth_m < 1.5 or 20.0 < depth_m <= 35.0:
        return 0.55, "độ sâu hạn chế"
    return 0.35, "độ sâu bất lợi"


def fetch_depth_sources():
    depth_points = []
    for dataset_id in KNOWN_DEPTH_DATASET_IDS:
        try:
            response = requests.get(
                f"http://103.12.77.146:8083/api/v1/public/province-geo-data/detail/{dataset_id}",
                timeout=FORECAST_TIMEOUT,
            )
            response.raise_for_status()
            payload = response.json().get("data") or {}
            table_name = payload.get("table_name")
            province_code = payload.get("province_code")

            for item in payload.get("geodata") or []:
                lon = item.get("lon")
                lat = item.get("lat")
                elev = item.get("elev", item.get("depth"))
                if lon is None or lat is None or elev is None:
                    geom = item.get("geom") or {}
                    coords = geom.get("coordinates") or []
                    if len(coords) >= 2:
                        lon = lon if lon is not None else coords[0]
                        lat = lat if lat is not None else coords[1]
                        if elev is None and len(coords) >= 3:
                            elev = coords[2]
                if lon is None or lat is None or elev is None:
                    continue

                x_5899, y_5899 = DEPTH_TRANSFORMER.transform(float(lon), float(lat))
                depth_points.append({
                    "dataset_id": dataset_id,
                    "table_name": table_name,
                    "province_code": province_code,
                    "lon": float(lon),
                    "lat": float(lat),
                    "elev": float(elev),
                    "depth_m": abs(float(elev)),
                    "x_5899": float(x_5899),
                    "y_5899": float(y_5899),
                })
        except Exception:
            continue

    return depth_points


def find_nearest_depth(station_x, station_y, depth_points):
    if not depth_points:
        return {
            "depth_m": None,
            "depth_factor": 1.0,
            "depth_label": "không có dữ liệu",
            "depth_source_table": None,
            "depth_distance_km": None,
        }

    best = None
    best_distance = None
    for point in depth_points:
        distance_m = math.sqrt((point["x_5899"] - station_x) ** 2 + (point["y_5899"] - station_y) ** 2)
        if best is None or distance_m < best_distance:
            best = point
            best_distance = distance_m

    if best is None or best_distance is None or best_distance / 1000.0 > DEPTH_NEAREST_MAX_KM:
        return {
            "depth_m": None,
            "depth_factor": 1.0,
            "depth_label": "ngoài phạm vi dữ liệu depth",
            "depth_source_table": None,
            "depth_distance_km": None,
        }

    depth_factor, depth_label = classify_depth_factor(best["depth_m"])
    return {
        "depth_m": best["depth_m"],
        "depth_factor": depth_factor,
        "depth_label": depth_label,
        "depth_source_table": best["table_name"],
        "depth_distance_km": best_distance / 1000.0,
    }


def build_depth_factor_raster(height, width, transform, water_mask, depth_points):
    depth_factor_raster = np.ones((height, width), dtype=np.float32)
    depth_known_mask = np.zeros((height, width), dtype=bool)

    if not depth_points:
        return depth_factor_raster, depth_known_mask

    point_coords = np.array([[p["x_5899"], p["y_5899"]] for p in depth_points], dtype=np.float64)
    point_depths = np.array([p["depth_m"] for p in depth_points], dtype=np.float64)
    tree = cKDTree(point_coords)

    rows, cols = np.where(water_mask == 1)
    if len(rows) == 0:
        return depth_factor_raster, depth_known_mask

    xs, ys = rasterio.transform.xy(transform, rows, cols, offset="center")
    query_points = np.column_stack([np.asarray(xs, dtype=np.float64), np.asarray(ys, dtype=np.float64)])
    distances, indices = tree.query(query_points, k=1)

    for row, col, distance_m, point_index in zip(rows, cols, distances, indices):
        if distance_m / 1000.0 > DEPTH_RASTER_INFLUENCE_KM:
            continue
        depth_m = float(point_depths[int(point_index)])
        depth_factor, _ = classify_depth_factor(depth_m)
        depth_factor_raster[row, col] = max(float(depth_factor), MIN_DEPTH_TRAVEL_FACTOR)
        depth_known_mask[row, col] = True

    return depth_factor_raster, depth_known_mask


def fetch_station_forecast(station_row):
    lat = station_row[COL_LAT]
    lon = station_row[COL_LON]
    area_type = station_row.get(COL_AREA_TYPE) or "oyster"
    station_id = str(station_row[COL_ID])
    auto_profile = station_row.get("auto_profile")
    profile_resolution = resolve_threshold_profile_details(
        station_id,
        area_type=area_type,
        auto_profile=auto_profile,
    )
    resolved_profile = profile_resolution["final_profile"]
    new_thresholds = get_thresholds_for_area_type(resolved_profile)
    old_thresholds = dict(OLD_COMMON_THRESHOLD_CONFIG)

    forecast_summary = {
        "maHieu": station_id,
        "raw_area_type": area_type,
        "auto_profile": profile_resolution["auto_profile"],
        "final_profile": resolved_profile,
        "profile_source": profile_resolution["profile_source"],
        "manual_override_profile": profile_resolution["manual_override_profile"],
        "override_applied": profile_resolution["override_applied"],
        "rule_triggered": station_row.get("rule_triggered", "default_fallback"),
        "rule_confidence": station_row.get("rule_confidence", "low"),
        "rule_reason": station_row.get("rule_reason", "default fallback"),
        "dist_to_mainland_km": station_row.get("dist_to_mainland_km"),
        "dist_to_nearest_island_km": station_row.get("dist_to_nearest_island_km"),
        "dist_to_shipping_channel_km": station_row.get("dist_to_shipping_channel_km"),
        "inside_harbor_bay": bool(station_row.get("inside_harbor_bay", False)),
        "depth_m_at_station": station_row.get("depth_m_at_station"),
        "nearshore_like_by_depth": station_row.get("nearshore_like_by_depth"),
        "offshore_like_by_depth": station_row.get("offshore_like_by_depth"),
        "resolved_profile": resolved_profile,
        "old_thresholds": sanitize_json_value(old_thresholds),
        "new_thresholds": sanitize_json_value(new_thresholds),
        "wind_max_m_s": None,
        "rain_max_mm": None,
        "wave_max_m": None,
        "forecast_times": [],
        "wind_hourly_m_s": [],
        "rain_hourly_mm": [],
        "wave_hourly_m": [],
        "impact_level_hourly": [],
        "impact_factor_hourly": [],
        "reach_factor_hourly": [],
        "risk_score_hourly": [],
        "wind_severity": 0,
        "rain_severity": 0,
        "wave_severity": 0,
        "risk_score_24h": 0.0,
        "impact_level_index": 0,
        "impact_level": IMPACT_LABELS[0],
        "impact_factor": IMPACT_FACTORS[0],
        "old_wind_severity": 0,
        "old_rain_severity": 0,
        "old_risk_score_24h": 0.0,
        "old_impact_level_index": 0,
        "old_impact_level": IMPACT_LABELS[0],
        "old_impact_factor": IMPACT_FACTORS[0],
        "old_impact_level_hourly": [],
        "old_impact_factor_hourly": [],
        "old_reach_factor_hourly": [],
        "old_risk_score_hourly": [],
        "old_wind_level_hourly": [],
        "old_rain_level_hourly": [],
        "new_wind_level_hourly": [],
        "new_rain_level_hourly": [],
        "comparison_counts": {},
        "forecast_error": None,
    }

    try:
        weather_res = requests.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": lat,
                "longitude": lon,
                "hourly": "wind_speed_10m,precipitation",
                "wind_speed_unit": "ms",
                "forecast_days": 1,
                "timezone": FORECAST_TIMEZONE,
            },
            timeout=FORECAST_TIMEOUT,
        )
        weather_res.raise_for_status()
        weather_data = weather_res.json().get("hourly", {})

        marine_res = requests.get(
            "https://marine-api.open-meteo.com/v1/marine",
            params={
                "latitude": lat,
                "longitude": lon,
                "hourly": "wave_height",
                "forecast_days": 1,
                "timezone": FORECAST_TIMEZONE,
            },
            timeout=FORECAST_TIMEOUT,
        )
        marine_res.raise_for_status()
        marine_data = marine_res.json().get("hourly", {})

        forecast_times = list(weather_data.get("time", [])[:24])
        wind_values = pd.Series(weather_data.get("wind_speed_10m", [])[:24], dtype="float64")
        rain_values = pd.Series(weather_data.get("precipitation", [])[:24], dtype="float64")
        wave_values = pd.Series(marine_data.get("wave_height", [])[:24], dtype="float64")

        hourly_count = max(len(forecast_times), len(wind_values), len(rain_values), len(wave_values))

        def value_at(series, index):
            if index >= len(series):
                return None
            value = series.iloc[index]
            return None if pd.isna(value) else float(value)

        impact_levels_hourly = []
        impact_factors_hourly = []
        reach_factors_hourly = []
        risk_scores_hourly = []
        old_impact_levels_hourly = []
        old_impact_factors_hourly = []
        old_reach_factors_hourly = []
        old_risk_scores_hourly = []
        wind_hourly = []
        rain_hourly = []
        wave_hourly = []
        wind_levels_hourly = []
        rain_levels_hourly = []
        old_wind_levels_hourly = []
        old_rain_levels_hourly = []

        for hour_index in range(hourly_count):
            wind_value = value_at(wind_values, hour_index)
            rain_value = value_at(rain_values, hour_index)
            wave_value = value_at(wave_values, hour_index)

            wind_hourly.append(wind_value)
            rain_hourly.append(rain_value)
            wave_hourly.append(wave_value)

            wind_level = classify_wind_severity_from_thresholds(wind_value, new_thresholds)
            rain_level = classify_rain_severity_from_thresholds(rain_value, new_thresholds)
            old_wind_level = classify_wind_severity_from_thresholds(wind_value, old_thresholds)
            old_rain_level = classify_rain_severity_from_thresholds(rain_value, old_thresholds)
            wave_level = classify_wave_severity(wave_value)
            risk_score = compute_composite_risk_score(wind_level, rain_level, wave_level)
            old_risk_score = compute_composite_risk_score(old_wind_level, old_rain_level, wave_level)
            hourly_level = composite_risk_score_to_level(risk_score)
            old_hourly_level = composite_risk_score_to_level(old_risk_score)

            wind_levels_hourly.append(wind_level)
            rain_levels_hourly.append(rain_level)
            old_wind_levels_hourly.append(old_wind_level)
            old_rain_levels_hourly.append(old_rain_level)
            risk_scores_hourly.append(risk_score)
            old_risk_scores_hourly.append(old_risk_score)
            impact_levels_hourly.append(IMPACT_LABELS[hourly_level])
            impact_factors_hourly.append(IMPACT_FACTORS[hourly_level])
            reach_factors_hourly.append(STATION_REACH_FACTORS[hourly_level])
            old_impact_levels_hourly.append(IMPACT_LABELS[old_hourly_level])
            old_impact_factors_hourly.append(IMPACT_FACTORS[old_hourly_level])
            old_reach_factors_hourly.append(STATION_REACH_FACTORS[old_hourly_level])

        if LOGGER.isEnabledFor(logging.DEBUG):
            LOGGER.debug(
                "station_forecast_thresholds station_id=%s raw_area_type=%s resolved_profile=%s wind_thresholds=(%s,%s) rain_thresholds=(%s,%s) wind_levels=%s rain_levels=%s",
                station_id,
                area_type,
                resolved_profile,
                new_thresholds["wind_low_to_medium"],
                new_thresholds["wind_medium_to_high"],
                new_thresholds["rain_low_to_medium"],
                new_thresholds["rain_medium_to_high"],
                wind_levels_hourly,
                rain_levels_hourly,
            )

        forecast_summary["wind_max_m_s"] = value_at(wind_values, int(wind_values.idxmax())) if wind_values.notna().any() else None
        forecast_summary["rain_max_mm"] = value_at(rain_values, int(rain_values.idxmax())) if rain_values.notna().any() else None
        forecast_summary["wave_max_m"] = value_at(wave_values, int(wave_values.idxmax())) if wave_values.notna().any() else None
        forecast_summary["forecast_times"] = forecast_times
        forecast_summary["wind_hourly_m_s"] = wind_hourly
        forecast_summary["rain_hourly_mm"] = rain_hourly
        forecast_summary["wave_hourly_m"] = wave_hourly
        forecast_summary["impact_level_hourly"] = impact_levels_hourly
        forecast_summary["impact_factor_hourly"] = impact_factors_hourly
        forecast_summary["reach_factor_hourly"] = reach_factors_hourly
        forecast_summary["risk_score_hourly"] = risk_scores_hourly
        forecast_summary["new_wind_level_hourly"] = wind_levels_hourly
        forecast_summary["new_rain_level_hourly"] = rain_levels_hourly
        forecast_summary["old_impact_level_hourly"] = old_impact_levels_hourly
        forecast_summary["old_impact_factor_hourly"] = old_impact_factors_hourly
        forecast_summary["old_reach_factor_hourly"] = old_reach_factors_hourly
        forecast_summary["old_risk_score_hourly"] = old_risk_scores_hourly
        forecast_summary["old_wind_level_hourly"] = old_wind_levels_hourly
        forecast_summary["old_rain_level_hourly"] = old_rain_levels_hourly
        forecast_summary["wind_severity"] = classify_wind_severity_from_thresholds(forecast_summary["wind_max_m_s"], new_thresholds)
        forecast_summary["rain_severity"] = classify_rain_severity_from_thresholds(forecast_summary["rain_max_mm"], new_thresholds)
        forecast_summary["wave_severity"] = classify_wave_severity(forecast_summary["wave_max_m"])
        forecast_summary["risk_score_24h"] = compute_composite_risk_score(
            forecast_summary["wind_severity"],
            forecast_summary["rain_severity"],
            forecast_summary["wave_severity"],
        )
        impact_level_index = composite_risk_score_to_level(forecast_summary["risk_score_24h"])
        forecast_summary["impact_level_index"] = impact_level_index
        forecast_summary["impact_level"] = IMPACT_LABELS[impact_level_index]
        forecast_summary["impact_factor"] = IMPACT_FACTORS[impact_level_index]
        forecast_summary["old_wind_severity"] = classify_wind_severity_from_thresholds(forecast_summary["wind_max_m_s"], old_thresholds)
        forecast_summary["old_rain_severity"] = classify_rain_severity_from_thresholds(forecast_summary["rain_max_mm"], old_thresholds)
        forecast_summary["old_risk_score_24h"] = compute_composite_risk_score(
            forecast_summary["old_wind_severity"],
            forecast_summary["old_rain_severity"],
            forecast_summary["wave_severity"],
        )
        old_impact_level_index = composite_risk_score_to_level(forecast_summary["old_risk_score_24h"])
        forecast_summary["old_impact_level_index"] = old_impact_level_index
        forecast_summary["old_impact_level"] = IMPACT_LABELS[old_impact_level_index]
        forecast_summary["old_impact_factor"] = IMPACT_FACTORS[old_impact_level_index]
        forecast_summary["comparison_counts"] = {
            "wind_old": summarize_level_counts(old_wind_levels_hourly),
            "wind_new": summarize_level_counts(wind_levels_hourly),
            "rain_old": summarize_level_counts(old_rain_levels_hourly),
            "rain_new": summarize_level_counts(rain_levels_hourly),
        }
    except Exception as exc:
        forecast_summary["forecast_error"] = str(exc)

    return station_id, sanitize_json_value(forecast_summary)


def json_default(value):
    if isinstance(value, (np.floating, np.integer)):
        return value.item()
    if pd.isna(value):
        return None
    return str(value)


def sanitize_json_value(value):
    if isinstance(value, dict):
        return {key: sanitize_json_value(item) for key, item in value.items()}
    if isinstance(value, list):
        return [sanitize_json_value(item) for item in value]
    if isinstance(value, tuple):
        return [sanitize_json_value(item) for item in value]
    if isinstance(value, (np.integer,)):
        return value.item()
    if isinstance(value, (np.floating, float)):
        if pd.isna(value) or not np.isfinite(value):
            return None
        return float(value)
    if pd.isna(value):
        return None
    return value


def build_latest_web_payload(payload):
    if not isinstance(payload, dict):
        return payload

    slim_payload = dict(payload)
    slim_payload.pop("hourly_zone_geometries", None)

    station_hourly_forecasts = slim_payload.get("station_hourly_forecasts") or {}
    slim_payload["station_hourly_forecasts"] = {
        str(station_id): {
            key: forecast.get(key)
            for key in WEB_HOURLY_FORECAST_KEYS
            if key in forecast
        }
        for station_id, forecast in station_hourly_forecasts.items()
        if isinstance(forecast, dict)
    }

    return slim_payload


def build_dissolved_zones_for_reach(
    dist,
    owner,
    transform,
    owner_code_to_station,
    reach_factor_by_station,
    stations_df,
):
    owner = owner.astype(np.int32, copy=False)
    max_owner_code = int(owner.max()) if owner.size else 0
    reach_lookup = np.zeros(max_owner_code + 1, dtype=np.float64)

    for owner_code, station_id in owner_code_to_station.items():
        reach_lookup[int(owner_code)] = float(
            reach_factor_by_station.get(str(station_id), MAX_STATION_REACH_FACTOR)
        )

    owner_reach_raster = reach_lookup[owner]
    ring1_limit = owner_reach_raster * R1
    ring2_limit = owner_reach_raster * R2
    ring3_limit = owner_reach_raster * R3
    valid = (
        (owner > 0)
        & np.isfinite(dist)
        & (dist <= ring3_limit)
    )

    ring = np.zeros(dist.shape, dtype=np.uint8)
    ring[valid & (dist <= ring1_limit)] = 1
    ring[valid & (dist > ring1_limit) & (dist <= ring2_limit)] = 2
    ring[valid & (dist > ring2_limit)] = 3

    zone_code = np.zeros(dist.shape, dtype=np.int32)
    zone_code[ring > 0] = owner[ring > 0] * 10 + ring[ring > 0]

    records = []
    shape_gen = features.shapes(
        zone_code,
        mask=zone_code > 0,
        transform=transform,
    )

    for geom, value in shape_gen:
        value = int(value)
        owner_code = value // 10
        ring_code = value % 10

        station_id = owner_code_to_station.get(owner_code)
        if station_id is None:
            continue

        records.append({
            COL_ID: station_id,
            "feature_id": f"{station_id}_{ring_code}",
            "owner_code": owner_code,
            "ring": ring_code,
            "weight": RING_WEIGHTS[ring_code],
            "influence_label": RING_LABELS[ring_code],
            "fill_hex": RING_COLORS[ring_code],
            "opacity": RING_OPACITY[ring_code],
            "geometry": shape(geom),
        })

    if not records:
        empty_columns = [
            COL_ID,
            COL_NAME,
            COL_AREA_TYPE,
            COL_PREDICTION_TEXT,
            COL_PREDICTION_CREATED_AT,
            "feature_id",
            "owner_code",
            "ring",
            "weight",
            "influence_label",
            "fill_hex",
            "opacity",
            "area_m2",
            "geometry",
        ]
        return gpd.GeoDataFrame(columns=empty_columns, geometry="geometry", crs=CALC_CRS), ring, zone_code

    zones = gpd.GeoDataFrame(records, crs=CALC_CRS)
    station_lookup = stations_df[[
        COL_ID,
        COL_NAME,
        COL_AREA_TYPE,
        COL_PREDICTION_TEXT,
        COL_PREDICTION_CREATED_AT,
    ]].drop_duplicates()
    zones = zones.merge(station_lookup, on=COL_ID, how="left")
    zones_for_dissolve = zones.copy()
    zones_for_dissolve[COL_PREDICTION_TEXT] = zones_for_dissolve[COL_PREDICTION_TEXT].fillna(
        MISSING_PREDICTION_TEXT_SENTINEL
    )
    zones_for_dissolve[COL_PREDICTION_CREATED_AT] = zones_for_dissolve[COL_PREDICTION_CREATED_AT].fillna(
        MISSING_PREDICTION_CREATED_AT_SENTINEL
    )

    zones_diss_5899 = zones_for_dissolve.dissolve(
        by=[
            COL_ID,
            COL_NAME,
            COL_AREA_TYPE,
            COL_PREDICTION_TEXT,
            COL_PREDICTION_CREATED_AT,
            "feature_id",
            "ring",
            "weight",
            "influence_label",
            "fill_hex",
            "opacity",
        ],
        as_index=False,
    )
    zones_diss_5899[COL_PREDICTION_TEXT] = zones_diss_5899[COL_PREDICTION_TEXT].replace(
        {MISSING_PREDICTION_TEXT_SENTINEL: None}
    )
    zones_diss_5899[COL_PREDICTION_CREATED_AT] = zones_diss_5899[COL_PREDICTION_CREATED_AT].replace(
        {MISSING_PREDICTION_CREATED_AT_SENTINEL: None}
    )
    zones_diss_5899["geometry"] = zones_diss_5899["geometry"].apply(
        lambda g: smooth_geometry_buffer(g, distance=60)
    )
    zones_diss_5899["area_m2"] = zones_diss_5899.geometry.area
    zones_diss_5899 = zones_diss_5899.sort_values([COL_ID, "ring"]).reset_index(drop=True)
    return zones_diss_5899, ring, zone_code


def compute_hourly_effective_area_metrics(hourly_zones_5899, station_base_lookup, impact_factor_by_station, impact_level_by_station):
    if len(hourly_zones_5899) == 0:
        return {
            "station_totals_m2": {},
            "feature_totals_m2": {},
            "total_effective_area_m2": 0.0,
            "high_risk_zone_count": 0,
        }

    zones = hourly_zones_5899.copy()
    zones["base_score"] = zones[COL_ID].map(
        lambda sid: station_base_lookup.get(str(sid), {}).get("base_score", 0.0)
    )
    zones["base_score"] = pd.to_numeric(zones["base_score"], errors="coerce").fillna(0.0)
    zones["impact_factor_hourly"] = zones[COL_ID].map(
        lambda sid: impact_factor_by_station.get(str(sid), IMPACT_FACTORS[0])
    )
    zones["impact_level_index"] = zones[COL_ID].map(
        lambda sid: impact_level_by_station.get(str(sid), 0)
    )
    zones["hourly_effective_area_m2"] = (
        zones["area_m2"] * zones["weight"] * zones["base_score"] * zones["impact_factor_hourly"]
    )

    return {
        "station_totals_m2": {
            str(key): float(value)
            for key, value in zones.groupby(COL_ID)["hourly_effective_area_m2"].sum().items()
        },
        "feature_totals_m2": {
            str(key): float(value)
            for key, value in zones.set_index("feature_id")["hourly_effective_area_m2"].items()
        },
        "total_effective_area_m2": float(zones["hourly_effective_area_m2"].sum()),
        # Counts high-risk zone features/rings, not distinct stations.
        "high_risk_zone_count": int((zones["impact_level_index"] == 2).sum()),
    }


def count_non_empty_forecast_items(forecast_lookup, key):
    return sum(
        1
        for item in forecast_lookup.values()
        if len(item.get(key, []) or []) > 0
    )


def summarize_region_hour_metrics(hour_index, forecast_time, metrics):
    feature_effective_areas_m2 = list((metrics or {}).get("feature_totals_m2", {}).values())
    total_effective_area_m2 = float(sum(feature_effective_areas_m2)) if feature_effective_areas_m2 else 0.0
    min_effective_area_m2 = float(min(feature_effective_areas_m2)) if feature_effective_areas_m2 else 0.0
    max_effective_area_m2 = float(max(feature_effective_areas_m2)) if feature_effective_areas_m2 else 0.0
    feature_count = len(feature_effective_areas_m2)

    LOGGER.debug(
        "region_hour_summary hour_index=%s feature_count=%s total_effective_area_km2=%s min_effective_area_km2=%s max_effective_area_km2=%s",
        hour_index,
        feature_count,
        total_effective_area_m2 / 1_000_000.0,
        min_effective_area_m2 / 1_000_000.0,
        max_effective_area_m2 / 1_000_000.0,
    )

    return {
        "hour_index": hour_index,
        "forecast_time": forecast_time,
        "total_effective_area_km2": float(total_effective_area_m2 / 1_000_000.0),
        "high_risk_zone_count": int((metrics or {}).get("high_risk_zone_count", 0)),
    }
# =========================================================
# 3) MAIN FUNCTION
# =========================================================
def build_station_influence(stations_df: pd.DataFrame):
    """
    stations_df đầu vào cần có các cột:
      - maHieu
      - vitri
      - latitude
      - longitude
    """
    required_cols = {COL_ID, COL_NAME, COL_LAT, COL_LON}
    missing = required_cols - set(stations_df.columns)
    if missing:
        raise ValueError(f"Thiếu cột trong stations_df: {missing}")

    if COL_AREA_TYPE not in stations_df.columns:
        stations_df[COL_AREA_TYPE] = "oyster"
    if COL_PREDICTION_TEXT not in stations_df.columns:
        stations_df[COL_PREDICTION_TEXT] = None
    if COL_PREDICTION_CREATED_AT not in stations_df.columns:
        stations_df[COL_PREDICTION_CREATED_AT] = None

    stations_df = stations_df.copy()
    stations_df[COL_ID] = stations_df[COL_ID].astype(str)

    # Đọc AOI dùng để tính toán
    # Read only the water AOI used by rasterization, snapping and propagation.
    # Land AOI is intentionally omitted because this pipeline does not use it.
    water = read_vector(WATER_FILE, WATER_LAYER).to_crs(CALC_CRS)

    water = water[~water.geometry.is_empty & water.geometry.notnull()].copy()
    water["geometry"] = water.buffer(0)

    # Input từ DB/Express là WGS84
    stations_wgs84 = gpd.GeoDataFrame(
        stations_df.copy(),
        geometry=gpd.points_from_xy(
            stations_df[COL_LON],  # x = longitude
            stations_df[COL_LAT]   # y = latitude
        ),
        crs=WEB_CRS
    )

    # Convert sang CRS mét để tính
    stations = stations_wgs84.to_crs(CALC_CRS)
    station_spatial_feature_lookup = extract_station_spatial_features(
        stations,
        station_id_col=COL_ID,
        station_name_col=COL_NAME,
    )
    depth_points = fetch_depth_sources()

    stations_lookup_5899 = {
        str(row[COL_ID]): row
        for _, row in stations.iterrows()
    }
    station_depth_lookup = {}
    station_profile_audit_lookup = {}
    for _, row in stations_df.iterrows():
        station_id = str(row[COL_ID])
        station_geom_row = stations_lookup_5899.get(station_id)
        if station_geom_row is not None:
            depth_summary = find_nearest_depth(
                station_geom_row.geometry.x,
                station_geom_row.geometry.y,
                depth_points,
            )
        else:
            depth_summary = {
                "depth_m": None,
                "depth_factor": 1.0,
            "depth_label": "không có dữ liệu",
                "depth_source_table": None,
                "depth_distance_km": None,
            }
        station_depth_lookup[station_id] = depth_summary

        spatial_features = augment_spatial_features_with_depth(
            station_spatial_feature_lookup.get(station_id, {
                "station_id": station_id,
                "station_name": row.get(COL_NAME),
                "dist_to_mainland_km": None,
                "dist_to_nearest_island_km": None,
                "dist_to_shipping_channel_km": None,
                "inside_harbor_bay": False,
                "depth_m_at_station": None,
                "representative_depth_m": None,
                "nearshore_like_by_depth": None,
                "offshore_like_by_depth": None,
            }),
            depth_m_at_station=depth_summary.get("depth_m"),
        )
        # Runtime auto_profile assignment only chooses which prebuilt threshold
        # profile to use. Threshold generation itself must already have been done
        # offline from historical -> auto_profile -> per-profile calibration.
        profile_audit = build_station_profile_audit_fields(spatial_features)
        profile_resolution = resolve_threshold_profile_details(
            station_id,
            area_type=row.get(COL_AREA_TYPE),
            auto_profile=profile_audit.get("auto_profile"),
        )
        station_profile_audit_lookup[station_id] = {
            **profile_audit,
            "final_profile": profile_resolution["final_profile"],
            "profile_source": profile_resolution["profile_source"],
            "manual_override_profile": profile_resolution["manual_override_profile"],
            "override_applied": profile_resolution["override_applied"],
        }

    stations_df["dist_to_mainland_km"] = stations_df[COL_ID].map(
        lambda sid: station_profile_audit_lookup.get(str(sid), {}).get("dist_to_mainland_km")
    )
    stations_df["dist_to_nearest_island_km"] = stations_df[COL_ID].map(
        lambda sid: station_profile_audit_lookup.get(str(sid), {}).get("dist_to_nearest_island_km")
    )
    stations_df["dist_to_shipping_channel_km"] = stations_df[COL_ID].map(
        lambda sid: station_profile_audit_lookup.get(str(sid), {}).get("dist_to_shipping_channel_km")
    )
    stations_df["inside_harbor_bay"] = stations_df[COL_ID].map(
        lambda sid: station_profile_audit_lookup.get(str(sid), {}).get("inside_harbor_bay", False)
    )
    stations_df["depth_m_at_station"] = stations_df[COL_ID].map(
        lambda sid: station_profile_audit_lookup.get(str(sid), {}).get("depth_m_at_station")
    )
    stations_df["nearshore_like_by_depth"] = stations_df[COL_ID].map(
        lambda sid: station_profile_audit_lookup.get(str(sid), {}).get("nearshore_like_by_depth")
    )
    stations_df["offshore_like_by_depth"] = stations_df[COL_ID].map(
        lambda sid: station_profile_audit_lookup.get(str(sid), {}).get("offshore_like_by_depth")
    )
    stations_df["auto_profile"] = stations_df[COL_ID].map(
        lambda sid: station_profile_audit_lookup.get(str(sid), {}).get("auto_profile", "default")
    )
    stations_df["rule_triggered"] = stations_df[COL_ID].map(
        lambda sid: station_profile_audit_lookup.get(str(sid), {}).get("rule_triggered", "default_fallback")
    )
    stations_df["rule_confidence"] = stations_df[COL_ID].map(
        lambda sid: station_profile_audit_lookup.get(str(sid), {}).get("rule_confidence", "low")
    )
    stations_df["rule_reason"] = stations_df[COL_ID].map(
        lambda sid: station_profile_audit_lookup.get(str(sid), {}).get("rule_reason", "default fallback")
    )
    stations_df["profile_source"] = stations_df[COL_ID].map(
        lambda sid: station_profile_audit_lookup.get(str(sid), {}).get("profile_source", "default")
    )
    stations_df["manual_override_profile"] = stations_df[COL_ID].map(
        lambda sid: station_profile_audit_lookup.get(str(sid), {}).get("manual_override_profile")
    )
    stations_df["override_applied"] = stations_df[COL_ID].map(
        lambda sid: station_profile_audit_lookup.get(str(sid), {}).get("override_applied", False)
    )
    stations_df["final_profile"] = stations_df[COL_ID].map(
        lambda sid: station_profile_audit_lookup.get(str(sid), {}).get("final_profile", "default")
    )

    auto_profile_counts = (
        pd.Series([item.get("auto_profile", "default") for item in station_profile_audit_lookup.values()])
        .value_counts()
        .to_dict()
    )
    final_profile_counts = (
        pd.Series([item.get("final_profile", "default") for item in station_profile_audit_lookup.values()])
        .value_counts()
        .to_dict()
    )
    low_confidence_count = int(sum(1 for item in station_profile_audit_lookup.values() if item.get("rule_confidence") == "low"))
    profile_mismatch_count = int(
        sum(1 for item in station_profile_audit_lookup.values() if item.get("auto_profile") != item.get("final_profile"))
    )
    profile_mismatch_examples = [
        {
            "station_id": item.get("station_id"),
            "station_name": item.get("station_name"),
            "auto_profile": item.get("auto_profile"),
            "final_profile": item.get("final_profile"),
        }
        for item in station_profile_audit_lookup.values()
        if item.get("auto_profile") != item.get("final_profile")
    ][:10]
    LOGGER.info(
        "station_profile_assignment_summary auto_profile_counts=%s final_profile_counts=%s low_confidence_count=%s profile_mismatch_count=%s",
        sanitize_json_value(auto_profile_counts),
        sanitize_json_value(final_profile_counts),
        low_confidence_count,
        profile_mismatch_count,
    )
    LOGGER.info(
        "station_profile_assignment_profile_mismatches samples=%s",
        sanitize_json_value(profile_mismatch_examples),
    )

    station_base_lookup = {}
    for _, row in stations_df.iterrows():
        station_id = str(row[COL_ID])
        base_score, prediction_label, prediction_value = classify_base_score(row.get(COL_PREDICTION_TEXT))
        profile_audit = station_profile_audit_lookup.get(station_id, {})
        depth_summary = station_depth_lookup.get(station_id, {
            "depth_m": None,
            "depth_factor": 1.0,
            "depth_label": "khong co du lieu",
            "depth_source_table": None,
            "depth_distance_km": None,
        })
        station_base_lookup[station_id] = {
            COL_AREA_TYPE: row.get(COL_AREA_TYPE) or "oyster",
            COL_PREDICTION_TEXT: row.get(COL_PREDICTION_TEXT),
            COL_PREDICTION_CREATED_AT: row.get(COL_PREDICTION_CREATED_AT),
            "base_score_raw": None if base_score is None else float(base_score),
            "base_score": None if base_score is None else float(base_score),
            "prediction_label": prediction_label,
            "prediction_value": prediction_value,
            "dist_to_mainland_km": profile_audit.get("dist_to_mainland_km"),
            "dist_to_nearest_island_km": profile_audit.get("dist_to_nearest_island_km"),
            "dist_to_shipping_channel_km": profile_audit.get("dist_to_shipping_channel_km"),
            "inside_harbor_bay": bool(profile_audit.get("inside_harbor_bay", False)),
            "depth_m_at_station": profile_audit.get("depth_m_at_station"),
            "nearshore_like_by_depth": profile_audit.get("nearshore_like_by_depth"),
            "offshore_like_by_depth": profile_audit.get("offshore_like_by_depth"),
            "auto_profile": profile_audit.get("auto_profile", "default"),
            "final_profile": profile_audit.get("final_profile", "default"),
            "rule_triggered": profile_audit.get("rule_triggered", "default_fallback"),
            "rule_confidence": profile_audit.get("rule_confidence", "low"),
            "rule_reason": profile_audit.get("rule_reason", "default fallback"),
            "profile_source": profile_audit.get("profile_source", "default"),
            "manual_override_profile": profile_audit.get("manual_override_profile"),
            "override_applied": profile_audit.get("override_applied", False),
            **depth_summary,
        }

    forecast_lookup = {}
    if FORECAST_ENABLED:
        with ThreadPoolExecutor(max_workers=FORECAST_WORKERS) as executor:
            futures = [
                executor.submit(fetch_station_forecast, row)
                for _, row in stations_df.iterrows()
            ]
        for future in as_completed(futures):
            station_id, forecast_summary = future.result()
            forecast_lookup[station_id] = forecast_summary
    else:
        for station_id in station_base_lookup:
            base_info = station_base_lookup.get(str(station_id), {})
            area_type = base_info.get(COL_AREA_TYPE) or "oyster"
            profile_resolution = resolve_threshold_profile_details(
                station_id,
                area_type=area_type,
                auto_profile=base_info.get("auto_profile"),
            )
            resolved_profile = profile_resolution["final_profile"]
            forecast_lookup[str(station_id)] = {
                "maHieu": str(station_id),
                "raw_area_type": area_type,
                "auto_profile": profile_resolution["auto_profile"],
                "final_profile": resolved_profile,
                "profile_source": profile_resolution["profile_source"],
                "manual_override_profile": profile_resolution["manual_override_profile"],
                "override_applied": profile_resolution["override_applied"],
                "rule_triggered": base_info.get("rule_triggered", "default_fallback"),
                "rule_confidence": base_info.get("rule_confidence", "low"),
                "rule_reason": base_info.get("rule_reason", "default fallback"),
                "dist_to_mainland_km": base_info.get("dist_to_mainland_km"),
                "dist_to_nearest_island_km": base_info.get("dist_to_nearest_island_km"),
                "dist_to_shipping_channel_km": base_info.get("dist_to_shipping_channel_km"),
                "inside_harbor_bay": bool(base_info.get("inside_harbor_bay", False)),
                "depth_m_at_station": base_info.get("depth_m_at_station"),
                "nearshore_like_by_depth": base_info.get("nearshore_like_by_depth"),
                "offshore_like_by_depth": base_info.get("offshore_like_by_depth"),
                "resolved_profile": resolved_profile,
                "old_thresholds": sanitize_json_value(dict(OLD_COMMON_THRESHOLD_CONFIG)),
                "new_thresholds": sanitize_json_value(get_thresholds_for_area_type(resolved_profile)),
                "wind_max_m_s": None,
                "rain_max_mm": None,
                "wave_max_m": None,
                "forecast_times": [],
                "wind_hourly_m_s": [],
                "rain_hourly_mm": [],
                "wave_hourly_m": [],
                "impact_level_hourly": [],
                "impact_factor_hourly": [],
                "reach_factor_hourly": [],
                "risk_score_hourly": [],
                "old_impact_level_hourly": [],
                "old_impact_factor_hourly": [],
                "old_reach_factor_hourly": [],
                "old_risk_score_hourly": [],
                "old_wind_level_hourly": [],
                "old_rain_level_hourly": [],
                "new_wind_level_hourly": [],
                "new_rain_level_hourly": [],
                "wind_severity": 0,
                "rain_severity": 0,
                "wave_severity": 0,
                "risk_score_24h": 0.0,
                "impact_level_index": 0,
                "impact_level": IMPACT_LABELS[0],
                "impact_factor": IMPACT_FACTORS[0],
                "old_wind_severity": 0,
                "old_rain_severity": 0,
                "old_risk_score_24h": 0.0,
                "old_impact_level_index": 0,
                "old_impact_level": IMPACT_LABELS[0],
                "old_impact_factor": IMPACT_FACTORS[0],
                "comparison_counts": {
                    "wind_old": {"low": 0, "medium": 0, "high": 0},
                    "wind_new": {"low": 0, "medium": 0, "high": 0},
                    "rain_old": {"low": 0, "medium": 0, "high": 0},
                    "rain_new": {"low": 0, "medium": 0, "high": 0},
                },
                "forecast_error": "Forecast disabled",
            }

    LOGGER.info(
        "station_forecast_pipeline_summary forecast_enabled=%s station_count=%s stations_with_forecast_times=%s stations_with_impact_factor_hourly=%s stations_with_reach_factor_hourly=%s",
        FORECAST_ENABLED,
        len(station_base_lookup),
        count_non_empty_forecast_items(forecast_lookup, "forecast_times"),
        count_non_empty_forecast_items(forecast_lookup, "impact_factor_hourly"),
        count_non_empty_forecast_items(forecast_lookup, "reach_factor_hourly"),
    )

    for station_id, base_info in station_base_lookup.items():
        impact_level_index = forecast_lookup.get(station_id, {}).get("impact_level_index", 0)
        old_impact_level_index = forecast_lookup.get(station_id, {}).get("old_impact_level_index", 0)
        base_info["station_reach_factor"] = STATION_REACH_FACTORS.get(int(impact_level_index), 1.0)
        base_info["old_station_reach_factor"] = STATION_REACH_FACTORS.get(int(old_impact_level_index), 1.0)

    # =====================================================
    # Build water mask raster
    # =====================================================
    minx, miny, maxx, maxy = water.total_bounds
    width = int(math.ceil((maxx - minx) / CELL_SIZE))
    height = int(math.ceil((maxy - miny) / CELL_SIZE))
    transform = from_origin(minx, maxy, CELL_SIZE, CELL_SIZE)

    water_mask = features.rasterize(
        [(geom, 1) for geom in water.geometry],
        out_shape=(height, width),
        transform=transform,
        fill=0,
        dtype="uint8",
        all_touched=False
    )

    profile = {
        "driver": "GTiff",
        "height": height,
        "width": width,
        "count": 1,
        "crs": CALC_CRS,
        "transform": transform,
        "compress": "lzw",
    }

    save_raster(
        OUTPUT_DIR / "water_mask.tif",
        water_mask,
        profile,
        dtype="uint8",
        nodata=0
    )

    depth_factor_raster, depth_known_mask = build_depth_factor_raster(
        height,
        width,
        transform,
        water_mask,
        depth_points,
    )
    save_raster(
        OUTPUT_DIR / "depth_factor_5899.tif",
        depth_factor_raster,
        profile,
        dtype="float32",
        nodata=np.nan,
    )

    # =====================================================
    # Snap stations to water
    # =====================================================
    station_points = []
    station_ids = []
    snapped_rows = []
    local_snap_count = 0
    global_snap_count = 0
    skipped_station_ids = []
    water_rows, water_cols = np.where(water_mask == 1)
    water_cells = np.column_stack([water_rows, water_cols]).astype(np.float64) if len(water_rows) else np.empty((0, 2), dtype=np.float64)
    water_cell_tree = cKDTree(water_cells) if len(water_cells) else None

    for _, row in stations.iterrows():
        sid = row[COL_ID]
        name = row[COL_NAME]
        x = row.geometry.x
        y = row.geometry.y

        rr, cc = xy_to_rowcol(x, y, transform)
        snapped = snap_to_nearest_water(rr, cc, water_mask, max_radius=SNAP_MAX_RADIUS_CELLS)

        if snapped is None:
            snapped = snap_to_nearest_water_global(rr, cc, water_cell_tree, water_cells)
            if snapped is None:
                skipped_station_ids.append(str(sid))
                continue
            global_snap_count += 1
        else:
            local_snap_count += 1

        srr, scc = snapped
        sx, sy = rowcol_to_xy(srr, scc, transform)

        station_points.append((srr, scc))
        station_ids.append(sid)

        snapped_rows.append({
            COL_ID: sid,
            COL_NAME: name,
            "x_snap_5899": sx,
            "y_snap_5899": sy,
            "row": srr,
            "col": scc,
            "geometry": row.geometry,
        })

    if len(station_ids) == 0:
        raise RuntimeError("Không có trạm nào snap được vào water mask.")

    LOGGER.info(
        "station_snap_summary input_station_count=%s snapped_station_count=%s local_snap_count=%s global_snap_count=%s skipped_station_count=%s skipped_station_ids=%s",
        len(stations_df),
        len(station_ids),
        local_snap_count,
        global_snap_count,
        len(skipped_station_ids),
        skipped_station_ids,
    )

    stations_snapped = gpd.GeoDataFrame(snapped_rows, crs=CALC_CRS)
    stations_snapped.to_file(
        OUTPUT_DIR / "stations_snapped_5899.gpkg",
        layer="stations_snapped",
        driver="GPKG"
    )

    # =====================================================
    # Multi-source Dijkstra
    # =====================================================
    owner_code_map = {sid: i + 1 for i, sid in enumerate(station_ids)}
    owner_code_to_station = {v: k for k, v in owner_code_map.items()}

    dist = np.full((height, width), np.inf, dtype=np.float64)
    owner = np.zeros((height, width), dtype=np.int32)
    station_max_reach_factor_by_code = {}

    moves = [
        (-1, -1, math.sqrt(2) * CELL_SIZE),
        (-1,  0, 1.0 * CELL_SIZE),
        (-1,  1, math.sqrt(2) * CELL_SIZE),
        ( 0, -1, 1.0 * CELL_SIZE),
        ( 0,  1, 1.0 * CELL_SIZE),
        ( 1, -1, math.sqrt(2) * CELL_SIZE),
        ( 1,  0, 1.0 * CELL_SIZE),
        ( 1,  1, math.sqrt(2) * CELL_SIZE),
    ]

    pq = []
    for sid, (rr, cc) in zip(station_ids, station_points):
        code = owner_code_map[sid]
        hourly_reach_factors = forecast_lookup.get(str(sid), {}).get("reach_factor_hourly", []) or []
        max_hourly_reach_factor = max(hourly_reach_factors) if hourly_reach_factors else station_base_lookup.get(str(sid), {}).get("station_reach_factor", 1.0)
        station_max_reach_factor_by_code[code] = max(
            float(max_hourly_reach_factor),
            float(station_base_lookup.get(str(sid), {}).get("station_reach_factor", 1.0)),
        )
        dist[rr, cc] = 0.0
        owner[rr, cc] = code
        heapq.heappush(pq, (0.0, code, rr, cc))

    while pq:
        cur_d, cur_owner, r, c = heapq.heappop(pq)

        if cur_d > dist[r, c]:
            continue
        max_station_range = R3 * station_max_reach_factor_by_code.get(cur_owner, MAX_STATION_REACH_FACTOR)
        if cur_d > max_station_range:
            continue

        for dr, dc, step_cost in moves:
            nr, nc = r + dr, c + dc
            if nr < 0 or nr >= height or nc < 0 or nc >= width:
                continue
            if water_mask[nr, nc] != 1:
                continue

            depth_travel_factor = float(depth_factor_raster[nr, nc]) if depth_known_mask[nr, nc] else 1.0
            nd = cur_d + (step_cost / max(depth_travel_factor, MIN_DEPTH_TRAVEL_FACTOR))
            if nd <= max_station_range and nd < dist[nr, nc]:
                dist[nr, nc] = nd
                owner[nr, nc] = cur_owner
                heapq.heappush(pq, (nd, cur_owner, nr, nc))

    # =====================================================
    # Build current zones and feature catalog from the weighted raster
    # =====================================================
    current_reach_factor_by_station = {
        str(station_id): float(base_info.get("station_reach_factor", 1.0))
        for station_id, base_info in station_base_lookup.items()
    }
    max_reach_factor_by_station = {
        str(owner_code_to_station[owner_code]): float(
            station_max_reach_factor_by_code.get(owner_code, MAX_STATION_REACH_FACTOR)
        )
        for owner_code in owner_code_to_station
    }

    current_zones_diss_5899, ring, zone_code = build_dissolved_zones_for_reach(
        dist,
        owner,
        transform,
        owner_code_to_station,
        current_reach_factor_by_station,
        stations_df,
    )
    feature_catalog_5899, _, _ = build_dissolved_zones_for_reach(
        dist,
        owner,
        transform,
        owner_code_to_station,
        max_reach_factor_by_station,
        stations_df,
    )

    if len(current_zones_diss_5899) == 0:
        raise RuntimeError("KhÃ´ng polygonize Ä‘Æ°á»£c zone hiá»‡n táº¡i.")
    if len(feature_catalog_5899) == 0:
        raise RuntimeError("KhÃ´ng polygonize Ä‘Æ°á»£c feature catalog cho zone.")

    # =====================================================
    # Save internal rasters in 5899
    # =====================================================
    save_raster(
        OUTPUT_DIR / "dist_to_nearest_station_water_5899.tif",
        np.where(np.isfinite(dist), dist, np.nan).astype("float32"),
        profile,
        dtype="float32",
        nodata=np.nan
    )
    save_raster(
        OUTPUT_DIR / "nearest_station_code_5899.tif",
        owner.astype("int32"),
        profile,
        dtype="int32",
        nodata=0
    )
    save_raster(
        OUTPUT_DIR / "ring_3class_water_5899.tif",
        ring.astype("uint8"),
        profile,
        dtype="uint8",
        nodata=0
    )
    save_raster(
        OUTPUT_DIR / "zone_code_station_ring_5899.tif",
        zone_code.astype("int32"),
        profile,
        dtype="int32",
        nodata=0
    )

    zones_diss_5899 = feature_catalog_5899.copy()
    current_area_m2_by_feature = {
        row["feature_id"]: float(row["area_m2"])
        for _, row in current_zones_diss_5899.iterrows()
    }

    zones_diss_5899["base_score"] = zones_diss_5899[COL_ID].map(
        lambda sid: station_base_lookup.get(str(sid), {}).get("base_score")
    )
    zones_diss_5899["base_score_raw"] = zones_diss_5899[COL_ID].map(
        lambda sid: station_base_lookup.get(str(sid), {}).get("base_score_raw")
    )
    zones_diss_5899["prediction_label"] = zones_diss_5899[COL_ID].map(
        lambda sid: station_base_lookup.get(str(sid), {}).get("prediction_label", "chưa có dự báo")
    )
    zones_diss_5899["prediction_value"] = zones_diss_5899[COL_ID].map(
        lambda sid: station_base_lookup.get(str(sid), {}).get("prediction_value")
    )
    zones_diss_5899["depth_m"] = zones_diss_5899[COL_ID].map(
        lambda sid: station_base_lookup.get(str(sid), {}).get("depth_m")
    )
    zones_diss_5899["depth_factor"] = zones_diss_5899[COL_ID].map(
        lambda sid: station_base_lookup.get(str(sid), {}).get("depth_factor", 1.0)
    )
    zones_diss_5899["depth_label"] = zones_diss_5899[COL_ID].map(
        lambda sid: station_base_lookup.get(str(sid), {}).get("depth_label", "không có dữ liệu")
    )
    zones_diss_5899["depth_source_table"] = zones_diss_5899[COL_ID].map(
        lambda sid: station_base_lookup.get(str(sid), {}).get("depth_source_table")
    )
    zones_diss_5899["depth_distance_km"] = zones_diss_5899[COL_ID].map(
        lambda sid: station_base_lookup.get(str(sid), {}).get("depth_distance_km")
    )
    zones_diss_5899["station_reach_factor"] = zones_diss_5899[COL_ID].map(
        lambda sid: station_base_lookup.get(str(sid), {}).get("station_reach_factor", 1.0)
    )
    zones_diss_5899["impact_level_24h"] = zones_diss_5899[COL_ID].map(
        lambda sid: forecast_lookup.get(str(sid), {}).get("impact_level", IMPACT_LABELS[0])
    )
    zones_diss_5899["impact_factor_24h"] = zones_diss_5899[COL_ID].map(
        lambda sid: forecast_lookup.get(str(sid), {}).get("impact_factor", IMPACT_FACTORS[0])
    )
    zones_diss_5899["risk_score_24h"] = zones_diss_5899[COL_ID].map(
        lambda sid: forecast_lookup.get(str(sid), {}).get("risk_score_24h", 0.0)
    )
    zones_diss_5899["wind_max_m_s_24h"] = zones_diss_5899[COL_ID].map(
        lambda sid: forecast_lookup.get(str(sid), {}).get("wind_max_m_s")
    )
    zones_diss_5899["rain_max_mm_24h"] = zones_diss_5899[COL_ID].map(
        lambda sid: forecast_lookup.get(str(sid), {}).get("rain_max_mm")
    )
    zones_diss_5899["wave_max_m_24h"] = zones_diss_5899[COL_ID].map(
        lambda sid: forecast_lookup.get(str(sid), {}).get("wave_max_m")
    )
    zones_diss_5899["area_current_m2"] = zones_diss_5899["feature_id"].map(
        lambda feature_id: current_area_m2_by_feature.get(feature_id, 0.0)
    )
    zones_diss_5899["base_score"] = pd.to_numeric(zones_diss_5899["base_score"], errors="coerce")
    zones_diss_5899["base_score_raw"] = pd.to_numeric(zones_diss_5899["base_score_raw"], errors="coerce")
    zones_diss_5899["s0"] = zones_diss_5899["base_score"] * zones_diss_5899["weight"]
    zones_diss_5899["s24"] = zones_diss_5899["s0"] * zones_diss_5899["impact_factor_24h"]
    # Effective area at baseline time t0: raw geometry area weighted by the base heuristic score.
    zones_diss_5899["area_t0_m2"] = zones_diss_5899["area_m2"] * zones_diss_5899["s0"]
    # Effective area at t24/current forecast view: current geometry area weighted by the forecast-adjusted score.
    zones_diss_5899["area_t24_m2"] = zones_diss_5899["area_current_m2"] * zones_diss_5899["s24"]
    zones_diss_5899["delta_area_m2"] = zones_diss_5899["area_t24_m2"] - zones_diss_5899["area_t0_m2"]
    zones_diss_5899 = zones_diss_5899.sort_values([COL_ID, "ring"]).reset_index(drop=True)

    # =====================================================
    # Export outputs
    # =====================================================
    gpkg_5899_path = OUTPUT_DIR / "stations_influence_3ring_5899.gpkg"
    geojson_wgs84_path = OUTPUT_DIR / "stations_influence_3ring_wgs84.geojson"

    # GPKG nội bộ ở 5899
    zones_diss_5899.to_file(
        gpkg_5899_path,
        layer="influence",
        driver="GPKG"
    )

    zones_web_5899 = zones_diss_5899.copy()
    zones_web_5899["geometry"] = zones_web_5899["geometry"].apply(
        lambda g: smooth_geometry_for_web(g, distance=120)
    )

    zones_diss_wgs84 = zones_web_5899.to_crs(WEB_CRS)
    zones_diss_wgs84["area_km2"] = zones_diss_5899["area_m2"] / 1_000_000.0
    zones_diss_wgs84["area_current_km2"] = zones_diss_5899["area_current_m2"] / 1_000_000.0
    # area_t0_km2 / area_t24_km2 are effective areas, not raw geometric areas.
    zones_diss_wgs84["area_t0_km2"] = zones_diss_5899["area_t0_m2"] / 1_000_000.0
    zones_diss_wgs84["area_t24_km2"] = zones_diss_5899["area_t24_m2"] / 1_000_000.0
    zones_diss_wgs84["delta_area_km2"] = zones_diss_5899["delta_area_m2"] / 1_000_000.0
    zones_diss_wgs84["risk_score_24h"] = zones_diss_5899["risk_score_24h"]
    zones_diss_wgs84["forecast_error"] = zones_diss_wgs84[COL_ID].map(
        lambda sid: forecast_lookup.get(str(sid), {}).get("forecast_error")
    )

    forecast_hours = []
    for forecast_item in forecast_lookup.values():
        if forecast_item.get("forecast_times"):
            forecast_hours = forecast_item["forecast_times"]
            break

    max_hour_count = max(
        [len(forecast_hours)] +
        [len(item.get("reach_factor_hourly", []) or []) for item in forecast_lookup.values()]
    )
    hourly_zone_geometries = {}
    region_hourly_summary_rows = []
    station_hourly_comparison = {
        str(station_id): {
            "old_total_effective_area_m2": [],
            "new_total_effective_area_m2": [],
        }
        for station_id in station_base_lookup
    }
    feature_baseline_rows = zones_diss_5899[[
        "feature_id",
        COL_ID,
        COL_NAME,
        "ring",
        "area_t0_m2",
    ]].copy()
    feature_baseline_rows["area_t0_m2"] = pd.to_numeric(feature_baseline_rows["area_t0_m2"], errors="coerce").fillna(0.0)
    feature_baseline_rows["area_t0_km2"] = feature_baseline_rows["area_t0_m2"] / 1_000_000.0
    feature_drop_tracker = {
        str(row["feature_id"]): {
            "feature_id": str(row["feature_id"]),
            "station_id": str(row[COL_ID]),
            "station_name": row[COL_NAME],
            "ring": int(row["ring"]),
            "base_effective_area_m2": float(row["area_t0_m2"]),
            "base_effective_area_km2": float(row["area_t0_km2"]),
            "min_effective_area_m2": None,
            "min_effective_area_km2": None,
            "delta_effective_area_m2": None,
            "delta_effective_area_km2": None,
            "min_hour_index": None,
            "min_forecast_time": None,
        }
        for _, row in feature_baseline_rows.iterrows()
    }

    for hour_index in range(max_hour_count):
        hour_reach_factor_by_station = {}
        old_hour_reach_factor_by_station = {}
        new_hour_impact_factor_by_station = {}
        new_hour_impact_level_by_station = {}
        old_hour_impact_factor_by_station = {}
        old_hour_impact_level_by_station = {}
        for station_id in station_base_lookup:
            hourly_reach_factors = forecast_lookup.get(str(station_id), {}).get("reach_factor_hourly", []) or []
            old_hourly_reach_factors = forecast_lookup.get(str(station_id), {}).get("old_reach_factor_hourly", []) or []
            hourly_impact_factors = forecast_lookup.get(str(station_id), {}).get("impact_factor_hourly", []) or []
            hourly_impact_levels = forecast_lookup.get(str(station_id), {}).get("impact_level_hourly", []) or []
            old_hourly_impact_factors = forecast_lookup.get(str(station_id), {}).get("old_impact_factor_hourly", []) or []
            old_hourly_impact_levels = forecast_lookup.get(str(station_id), {}).get("old_impact_level_hourly", []) or []
            if hour_index < len(hourly_reach_factors) and hourly_reach_factors[hour_index] is not None:
                hour_reach_factor_by_station[str(station_id)] = float(hourly_reach_factors[hour_index])
            else:
                hour_reach_factor_by_station[str(station_id)] = float(
                    station_base_lookup.get(str(station_id), {}).get("station_reach_factor", 1.0)
                )
            if hour_index < len(old_hourly_reach_factors) and old_hourly_reach_factors[hour_index] is not None:
                old_hour_reach_factor_by_station[str(station_id)] = float(old_hourly_reach_factors[hour_index])
            else:
                old_hour_reach_factor_by_station[str(station_id)] = float(
                    station_base_lookup.get(str(station_id), {}).get("old_station_reach_factor", 1.0)
                )
            if hour_index < len(hourly_impact_factors) and hourly_impact_factors[hour_index] is not None:
                new_hour_impact_factor_by_station[str(station_id)] = float(hourly_impact_factors[hour_index])
            else:
                new_hour_impact_factor_by_station[str(station_id)] = float(
                    forecast_lookup.get(str(station_id), {}).get("impact_factor", IMPACT_FACTORS[0])
                )
            if hour_index < len(hourly_impact_levels) and hourly_impact_levels[hour_index] is not None:
                new_hour_impact_level_by_station[str(station_id)] = int(
                    next((level for level, label in IMPACT_LABELS.items() if label == hourly_impact_levels[hour_index]), 0)
                )
            else:
                new_hour_impact_level_by_station[str(station_id)] = int(
                    forecast_lookup.get(str(station_id), {}).get("impact_level_index", 0)
                )
            if hour_index < len(old_hourly_impact_factors) and old_hourly_impact_factors[hour_index] is not None:
                old_hour_impact_factor_by_station[str(station_id)] = float(old_hourly_impact_factors[hour_index])
            else:
                old_hour_impact_factor_by_station[str(station_id)] = float(
                    forecast_lookup.get(str(station_id), {}).get("old_impact_factor", IMPACT_FACTORS[0])
                )
            if hour_index < len(old_hourly_impact_levels) and old_hourly_impact_levels[hour_index] is not None:
                old_hour_impact_level_by_station[str(station_id)] = int(
                    next((level for level, label in IMPACT_LABELS.items() if label == old_hourly_impact_levels[hour_index]), 0)
                )
            else:
                old_hour_impact_level_by_station[str(station_id)] = int(
                    forecast_lookup.get(str(station_id), {}).get("old_impact_level_index", 0)
                )

        hourly_zones_5899, _, _ = build_dissolved_zones_for_reach(
            dist,
            owner,
            transform,
            owner_code_to_station,
            hour_reach_factor_by_station,
            stations_df,
        )
        if len(hourly_zones_5899) == 0:
            hourly_zone_geometries[str(hour_index)] = {}
            old_hourly_zones_5899 = build_dissolved_zones_for_reach(
                dist,
                owner,
                transform,
                owner_code_to_station,
                old_hour_reach_factor_by_station,
                stations_df,
            )[0]
            old_metrics = compute_hourly_effective_area_metrics(
                old_hourly_zones_5899,
                station_base_lookup,
                old_hour_impact_factor_by_station,
                old_hour_impact_level_by_station,
            )
            for station_id in station_hourly_comparison:
                station_hourly_comparison[station_id]["old_total_effective_area_m2"].append(
                    float(old_metrics["station_totals_m2"].get(station_id, 0.0))
                )
                station_hourly_comparison[station_id]["new_total_effective_area_m2"].append(0.0)
            region_hourly_summary_rows.append(
                summarize_region_hour_metrics(
                    hour_index,
                    forecast_hours[hour_index] if hour_index < len(forecast_hours) else None,
                    {
                        "feature_totals_m2": {},
                        "high_risk_zone_count": 0,
                    },
                )
            )
            continue

        hourly_zones_web_5899 = hourly_zones_5899.copy()
        hourly_zones_web_5899["geometry"] = hourly_zones_web_5899["geometry"].apply(
            lambda g: smooth_geometry_for_web(g, distance=120)
        )
        hourly_zones_wgs84 = hourly_zones_web_5899.to_crs(WEB_CRS)
        hourly_zones_wgs84["area_km2"] = hourly_zones_5899["area_m2"] / 1_000_000.0
        hourly_zone_geometries[str(hour_index)] = {
            row["feature_id"]: {
                "geometry": row.geometry.__geo_interface__,
                "area_km2": float(row["area_km2"]),
            }
            for _, row in hourly_zones_wgs84.iterrows()
        }
        old_hourly_zones_5899, _, _ = build_dissolved_zones_for_reach(
            dist,
            owner,
            transform,
            owner_code_to_station,
            old_hour_reach_factor_by_station,
            stations_df,
        )
        new_metrics = compute_hourly_effective_area_metrics(
            hourly_zones_5899,
            station_base_lookup,
            new_hour_impact_factor_by_station,
            new_hour_impact_level_by_station,
        )
        old_metrics = compute_hourly_effective_area_metrics(
            old_hourly_zones_5899,
            station_base_lookup,
            old_hour_impact_factor_by_station,
            old_hour_impact_level_by_station,
        )
        for station_id in station_hourly_comparison:
            station_hourly_comparison[station_id]["old_total_effective_area_m2"].append(
                float(old_metrics["station_totals_m2"].get(station_id, 0.0))
            )
            station_hourly_comparison[station_id]["new_total_effective_area_m2"].append(
                float(new_metrics["station_totals_m2"].get(station_id, 0.0))
            )
        for feature_id, feature_info in feature_drop_tracker.items():
            current_effective_area_m2 = float(new_metrics["feature_totals_m2"].get(feature_id, 0.0))
            if feature_info["min_effective_area_m2"] is None or current_effective_area_m2 < feature_info["min_effective_area_m2"]:
                feature_info["min_effective_area_m2"] = current_effective_area_m2
                feature_info["min_effective_area_km2"] = current_effective_area_m2 / 1_000_000.0
                feature_info["delta_effective_area_m2"] = current_effective_area_m2 - feature_info["base_effective_area_m2"]
                feature_info["delta_effective_area_km2"] = feature_info["delta_effective_area_m2"] / 1_000_000.0
                feature_info["min_hour_index"] = hour_index
                feature_info["min_forecast_time"] = forecast_hours[hour_index] if hour_index < len(forecast_hours) else None
        region_hourly_summary_rows.append(
            summarize_region_hour_metrics(
                hour_index,
                forecast_hours[hour_index] if hour_index < len(forecast_hours) else None,
                new_metrics,
            )
        )

    LOGGER.info(
        "station_hourly_export_summary forecast_hours=%s hourly_zone_geometries=%s region_hourly_summary_rows=%s station_hourly_comparison_rows=%s feature_drop_candidates=%s",
        len(forecast_hours),
        len(hourly_zone_geometries),
        len(region_hourly_summary_rows),
        len(station_hourly_comparison),
        len(feature_drop_tracker),
    )

    zone_summaries = []
    for station_id, group in zones_diss_wgs84.groupby(COL_ID):
        summary = {
            COL_ID: station_id,
            COL_NAME: group[COL_NAME].iloc[0],
            COL_AREA_TYPE: group[COL_AREA_TYPE].iloc[0],
            "prediction_text": group[COL_PREDICTION_TEXT].iloc[0],
            "prediction_label": group["prediction_label"].iloc[0],
            "base_score_raw": None if pd.isna(group["base_score_raw"].iloc[0]) else float(group["base_score_raw"].iloc[0]),
            "depth_m": None if pd.isna(group["depth_m"].iloc[0]) else float(group["depth_m"].iloc[0]),
            "depth_factor": float(group["depth_factor"].iloc[0]),
            "depth_label": group["depth_label"].iloc[0],
            "depth_source_table": group["depth_source_table"].iloc[0],
            "depth_distance_km": None if pd.isna(group["depth_distance_km"].iloc[0]) else float(group["depth_distance_km"].iloc[0]),
            "station_reach_factor": float(group["station_reach_factor"].iloc[0]),
            "impact_level_24h": group["impact_level_24h"].iloc[0],
            "impact_factor_24h": float(group["impact_factor_24h"].iloc[0]),
            "risk_score_24h": float(group["risk_score_24h"].iloc[0]),
            "wind_max_m_s_24h": None if pd.isna(group["wind_max_m_s_24h"].iloc[0]) else float(group["wind_max_m_s_24h"].iloc[0]),
            "rain_max_mm_24h": None if pd.isna(group["rain_max_mm_24h"].iloc[0]) else float(group["rain_max_mm_24h"].iloc[0]),
            "wave_max_m_24h": None if pd.isna(group["wave_max_m_24h"].iloc[0]) else float(group["wave_max_m_24h"].iloc[0]),
            "forecast_error": group["forecast_error"].iloc[0],
            "area_t0_km2": None if group["area_t0_km2"].notna().sum() == 0 else float(group["area_t0_km2"].sum()),
            "area_t24_km2": None if group["area_t24_km2"].notna().sum() == 0 else float(group["area_t24_km2"].sum()),
            "delta_area_km2": None if group["delta_area_km2"].notna().sum() == 0 else float(group["delta_area_km2"].sum()),
        }

        for ring_code in (1, 2, 3):
            ring_rows = group[group["ring"] == ring_code]
            if ring_rows.empty:
                summary[f"S0_{ring_code}"] = None
                summary[f"S24_{ring_code}"] = None
                summary[f"area_ring_{ring_code}_km2"] = 0.0
            else:
                summary[f"S0_{ring_code}"] = None if pd.isna(ring_rows["s0"].iloc[0]) else float(ring_rows["s0"].iloc[0])
                summary[f"S24_{ring_code}"] = None if pd.isna(ring_rows["s24"].iloc[0]) else float(ring_rows["s24"].iloc[0])
                summary[f"area_ring_{ring_code}_km2"] = float(ring_rows["area_current_km2"].sum())

        zone_summaries.append(summary)

    station_profile_audit_rows = []
    for _, row in stations_df.iterrows():
        station_id = str(row[COL_ID])
        profile_resolution = resolve_threshold_profile_details(
            station_id,
            area_type=row.get(COL_AREA_TYPE),
            auto_profile=row.get("auto_profile"),
        )
        station_profile_audit_rows.append({
            "station_id": station_id,
            "station_name": row.get(COL_NAME),
            "dist_to_mainland_km": row.get("dist_to_mainland_km"),
            "dist_to_nearest_island_km": row.get("dist_to_nearest_island_km"),
            "dist_to_shipping_channel_km": row.get("dist_to_shipping_channel_km"),
            "inside_harbor_bay": bool(row.get("inside_harbor_bay", False)),
            "depth_m_at_station": row.get("depth_m_at_station"),
            "nearshore_like_by_depth": row.get("nearshore_like_by_depth"),
            "offshore_like_by_depth": row.get("offshore_like_by_depth"),
            "auto_profile": row.get("auto_profile", "default"),
            "final_profile": profile_resolution["final_profile"],
            "rule_triggered": row.get("rule_triggered", "default_fallback"),
            "rule_confidence": row.get("rule_confidence", "low"),
            "rule_reason": row.get("rule_reason", "default fallback"),
            "profile_source": profile_resolution["profile_source"],
            "manual_override_profile": profile_resolution["manual_override_profile"],
            "override_applied": profile_resolution["override_applied"],
        })

    station_threshold_comparison_rows = []
    for station_id, base_info in station_base_lookup.items():
        forecast_info = forecast_lookup.get(str(station_id), {})
        comparison_counts = forecast_info.get("comparison_counts", {})
        new_reach_factors = [value for value in (forecast_info.get("reach_factor_hourly", []) or []) if value is not None]
        old_reach_factors = [value for value in (forecast_info.get("old_reach_factor_hourly", []) or []) if value is not None]
        new_total_effective_area = station_hourly_comparison.get(str(station_id), {}).get("new_total_effective_area_m2", [])
        old_total_effective_area = station_hourly_comparison.get(str(station_id), {}).get("old_total_effective_area_m2", [])
        old_thresholds = forecast_info.get("old_thresholds", OLD_COMMON_THRESHOLD_CONFIG)
        new_thresholds = forecast_info.get("new_thresholds", DEFAULT_THRESHOLD_CONFIG["default"])

        station_threshold_comparison_rows.append({
            "station_id": str(station_id),
            "station_name": next((row[COL_NAME] for row in zone_summaries if str(row[COL_ID]) == str(station_id)), None),
            "raw_area_type": forecast_info.get("raw_area_type", base_info.get(COL_AREA_TYPE)),
            "resolved_profile": forecast_info.get("resolved_profile", "default"),
            "wind_low_to_medium_old": old_thresholds.get("wind_low_to_medium"),
            "wind_medium_to_high_old": old_thresholds.get("wind_medium_to_high"),
            "wind_low_to_medium_new": new_thresholds.get("wind_low_to_medium"),
            "wind_medium_to_high_new": new_thresholds.get("wind_medium_to_high"),
            "rain_low_to_medium_old": old_thresholds.get("rain_low_to_medium"),
            "rain_medium_to_high_old": old_thresholds.get("rain_medium_to_high"),
            "rain_low_to_medium_new": new_thresholds.get("rain_low_to_medium"),
            "rain_medium_to_high_new": new_thresholds.get("rain_medium_to_high"),
            "wind_low_hours_old": comparison_counts.get("wind_old", {}).get("low", 0),
            "wind_medium_hours_old": comparison_counts.get("wind_old", {}).get("medium", 0),
            "wind_high_hours_old": comparison_counts.get("wind_old", {}).get("high", 0),
            "wind_low_hours_new": comparison_counts.get("wind_new", {}).get("low", 0),
            "wind_medium_hours_new": comparison_counts.get("wind_new", {}).get("medium", 0),
            "wind_high_hours_new": comparison_counts.get("wind_new", {}).get("high", 0),
            "rain_low_hours_old": comparison_counts.get("rain_old", {}).get("low", 0),
            "rain_medium_hours_old": comparison_counts.get("rain_old", {}).get("medium", 0),
            "rain_high_hours_old": comparison_counts.get("rain_old", {}).get("high", 0),
            "rain_low_hours_new": comparison_counts.get("rain_new", {}).get("low", 0),
            "rain_medium_hours_new": comparison_counts.get("rain_new", {}).get("medium", 0),
            "rain_high_hours_new": comparison_counts.get("rain_new", {}).get("high", 0),
            "reach_factor_min_old": None if not old_reach_factors else float(min(old_reach_factors)),
            "reach_factor_max_old": None if not old_reach_factors else float(max(old_reach_factors)),
            "reach_factor_min_new": None if not new_reach_factors else float(min(new_reach_factors)),
            "reach_factor_max_new": None if not new_reach_factors else float(max(new_reach_factors)),
            "total_effective_area_min_km2_old": None if not old_total_effective_area else float(min(old_total_effective_area) / 1_000_000.0),
            "total_effective_area_max_km2_old": None if not old_total_effective_area else float(max(old_total_effective_area) / 1_000_000.0),
            "total_effective_area_min_km2_new": None if not new_total_effective_area else float(min(new_total_effective_area) / 1_000_000.0),
            "total_effective_area_max_km2_new": None if not new_total_effective_area else float(max(new_total_effective_area) / 1_000_000.0),
        })

    top_zone_drops_rows = sorted(
        feature_drop_tracker.values(),
        key=lambda item: (item["delta_effective_area_m2"] if item["delta_effective_area_m2"] is not None else float("inf"))
    )[:5]

    LOGGER.info(
        "station_hourly_export_rows station_threshold_comparison_rows=%s region_hourly_summary_rows=%s top_zone_drops_rows=%s",
        len(station_threshold_comparison_rows),
        len(region_hourly_summary_rows),
        len(top_zone_drops_rows),
    )

    zones_diss_wgs84.to_file(
        geojson_wgs84_path,
        driver="GeoJSON"
    )

    geojson_payload = json.loads(zones_diss_wgs84.to_json())
    geojson_payload["zone_summaries"] = zone_summaries
    geojson_payload["forecast_hours"] = forecast_hours
    geojson_payload["station_hourly_forecasts"] = forecast_lookup
    geojson_payload["hourly_zone_geometries"] = hourly_zone_geometries
    geojson_payload["station_threshold_comparison"] = station_threshold_comparison_rows
    geojson_payload["station_profile_auto"] = station_profile_audit_rows
    geojson_payload["station_profile_audit"] = station_profile_audit_rows
    geojson_payload["region_hourly_summary"] = region_hourly_summary_rows
    geojson_payload["top_zone_drops"] = top_zone_drops_rows
    geojson_payload["forecast_generated_at"] = pd.Timestamp.utcnow().isoformat()
    geojson_payload = sanitize_json_value(geojson_payload)
    web_geojson_payload = build_latest_web_payload(geojson_payload)
    forecast_export = sanitize_json_value(list(forecast_lookup.values()))
    zone_summary_export = sanitize_json_value(zone_summaries)
    depth_export = sanitize_json_value(depth_points)
    station_profile_audit_export = sanitize_json_value(station_profile_audit_rows)
    station_threshold_comparison_export = sanitize_json_value(station_threshold_comparison_rows)
    region_hourly_summary_export = sanitize_json_value(region_hourly_summary_rows)
    top_zone_drops_export = sanitize_json_value(top_zone_drops_rows)

    with open(geojson_wgs84_path, "w", encoding="utf-8") as geojson_file:
        json.dump(geojson_payload, geojson_file, ensure_ascii=False, default=json_default, allow_nan=False)

    with open(STATION_ZONES_WEB_CACHE_PATH, "w", encoding="utf-8") as web_geojson_file:
        json.dump(web_geojson_payload, web_geojson_file, ensure_ascii=False, default=json_default, allow_nan=False)

    with open(FORECAST_SUMMARY_PATH, "w", encoding="utf-8") as forecast_file:
        json.dump(forecast_export, forecast_file, ensure_ascii=False, indent=2, default=json_default, allow_nan=False)

    with open(ZONE_SUMMARY_PATH, "w", encoding="utf-8") as zone_file:
        json.dump(zone_summary_export, zone_file, ensure_ascii=False, indent=2, default=json_default, allow_nan=False)

    with open(DEPTH_CACHE_PATH, "w", encoding="utf-8") as depth_file:
        json.dump(depth_export, depth_file, ensure_ascii=False, indent=2, default=json_default, allow_nan=False)

    pd.DataFrame(station_profile_audit_export).to_csv(
        STATION_PROFILE_AUTO_PATH,
        index=False,
        encoding="utf-8-sig",
    )
    pd.DataFrame(station_profile_audit_export).to_csv(
        STATION_PROFILE_AUDIT_PATH,
        index=False,
        encoding="utf-8-sig",
    )
    pd.DataFrame(station_threshold_comparison_export).to_csv(
        STATION_THRESHOLD_COMPARISON_PATH,
        index=False,
        encoding="utf-8-sig",
    )
    pd.DataFrame(region_hourly_summary_export).to_csv(
        REGION_HOURLY_SUMMARY_PATH,
        index=False,
        encoding="utf-8-sig",
    )
    pd.DataFrame(top_zone_drops_export).to_csv(
        TOP_ZONE_DROPS_PATH,
        index=False,
        encoding="utf-8-sig",
    )

    sample_station_forecast = next(iter(forecast_lookup.values()), {})
    sample_region_hour = region_hourly_summary_rows[0] if region_hourly_summary_rows else {}
    sample_top_zone_drop = top_zone_drops_rows[0] if top_zone_drops_rows else {}

    LOGGER.info(
        "station_hourly_export_samples sample_station_forecast=%s sample_region_hour=%s sample_top_zone_drop=%s",
        sanitize_json_value(sample_station_forecast),
        sanitize_json_value(sample_region_hour),
        sanitize_json_value(sample_top_zone_drop),
    )

    return {
        "success": True,
        "station_count": int(len(stations_df)),
        "snapped_station_count": int(len(station_ids)),
        "geojson_path": str(geojson_wgs84_path),
        "gpkg_5899_path": str(gpkg_5899_path),
        "output_dir": str(OUTPUT_DIR),
        "calc_crs": CALC_CRS,
        "web_crs": WEB_CRS,
        "zone_summary_path": str(ZONE_SUMMARY_PATH),
        "forecast_summary_path": str(FORECAST_SUMMARY_PATH),
        "depth_cache_path": str(DEPTH_CACHE_PATH),
        "station_profile_auto_path": str(STATION_PROFILE_AUTO_PATH),
        "station_profile_audit_path": str(STATION_PROFILE_AUDIT_PATH),
        "station_zones_web_cache_path": str(STATION_ZONES_WEB_CACHE_PATH),
        "station_threshold_comparison_path": str(STATION_THRESHOLD_COMPARISON_PATH),
        "region_hourly_summary_path": str(REGION_HOURLY_SUMMARY_PATH),
        "top_zone_drops_path": str(TOP_ZONE_DROPS_PATH),
        "zone_summary_count": len(zone_summaries),
    }
