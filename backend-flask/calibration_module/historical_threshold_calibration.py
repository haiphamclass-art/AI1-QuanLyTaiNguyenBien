"""Offline threshold calibration pipeline for historical weather data.

Thresholds must be calibrated only after historical data has already been
assigned `auto_profile` by the shared spatial classifier in
`spatial_module.station_profile_assignment`.

The intended methodology is:

1. Load historical observations.
2. Assign `auto_profile`, `rule_triggered`, and `rule_confidence` to the
   historical rows/stations using the shared spatial rules.
3. Group historical observations by `auto_profile`.
4. Compute per-profile thresholds from historical distributions.
5. Build a runtime-compatible JSON config.
6. Save the generated config without overwriting the runtime config unless an
   explicit flag is provided.

Runtime is deliberately different:

- Runtime does not compute thresholds from live data.
- Runtime only assigns `auto_profile` to the current station.
- Runtime then loads thresholds that were pre-calibrated offline.
- Runtime finally applies those prebuilt thresholds to score future forecasts.

Formulas used in this module:

- T_low_medium = P75(X | profile)
- T_medium_high = P90(X | profile)

where X is the historical variable being calibrated, currently mandatory for
`wind` and `rain`, with optional scaffold support for `wave`.

Example flow:

```python
historical_df = load_historical_weather_data("historical_weather.csv")
profiled_df = assign_profiles_to_historical_data(historical_df)
thresholds_by_profile = compute_thresholds_by_profile(profiled_df)
threshold_config = build_threshold_config(
    thresholds_by_profile,
    profiled_historical_df=profiled_df,
)
save_threshold_config(threshold_config)
```
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import geopandas as gpd
import numpy as np
import pandas as pd

from spatial_module.station_profile_assignment import (
    CALC_CRS,
    augment_spatial_features_with_depth,
    build_station_profile_audit_fields,
    extract_station_spatial_features,
)


BASE_DIR = Path(__file__).resolve().parent.parent
RUNTIME_THRESHOLD_CONFIG_PATH = BASE_DIR / "spatial_module" / "config" / "thresholds_by_area_type.json"
DEFAULT_GENERATED_THRESHOLD_PATH = (
    BASE_DIR / "spatial_module" / "config" / "thresholds_by_area_type.generated.json"
)
WEB_CRS = "EPSG:4326"

MANDATORY_HISTORICAL_COLUMNS = (
    "station_id",
    "latitude",
    "longitude",
    "wind",
    "rain",
)
MANDATORY_THRESHOLD_KEYS = (
    "wind_low_to_medium",
    "wind_medium_to_high",
    "rain_low_to_medium",
    "rain_medium_to_high",
)


def _read_tabular_historical_source(source: str | Path | pd.DataFrame) -> pd.DataFrame:
    if isinstance(source, pd.DataFrame):
        return source.copy()

    path = Path(source)
    suffix = path.suffix.lower()
    if suffix == ".csv":
        return pd.read_csv(path)
    if suffix == ".json":
        return pd.read_json(path)
    if suffix == ".parquet":
        return pd.read_parquet(path)
    if suffix in {".xlsx", ".xls"}:
        return pd.read_excel(path)

    raise ValueError(
        f"Unsupported historical data format for {path}. "
        "Use csv, json, parquet, xlsx/xls, or pass a pandas DataFrame."
    )


def _pick_first_non_null(series: pd.Series) -> Any:
    for value in series:
        if pd.notna(value):
            return value
    return None


def _normalize_profile_key(profile_name: Any) -> str:
    if profile_name is None:
        return "default"
    normalized = str(profile_name).strip().lower()
    if not normalized:
        return "default"
    return normalized.replace("-", "_").replace(" ", "_")


def _coerce_numeric_columns(frame: pd.DataFrame, columns: list[str]) -> pd.DataFrame:
    for column in columns:
        if column in frame.columns:
            frame[column] = pd.to_numeric(frame[column], errors="coerce")
    return frame


def _validate_required_columns(frame: pd.DataFrame, required_columns: tuple[str, ...]) -> None:
    missing = [column for column in required_columns if column not in frame.columns]
    if missing:
        raise ValueError(f"Historical data is missing required columns: {missing}")


def _build_station_catalog(historical_df: pd.DataFrame) -> pd.DataFrame:
    _validate_required_columns(historical_df, ("station_id", "latitude", "longitude"))

    coordinate_candidates = historical_df.loc[
        historical_df["latitude"].notna() & historical_df["longitude"].notna(),
        ["station_id", "latitude", "longitude"],
    ].copy()
    if not coordinate_candidates.empty:
        coordinate_candidates["latitude"] = coordinate_candidates["latitude"].round(6)
        coordinate_candidates["longitude"] = coordinate_candidates["longitude"].round(6)
        coordinate_conflicts = (
            coordinate_candidates.drop_duplicates()
            .groupby("station_id")
            .size()
        )
        conflicting_station_ids = coordinate_conflicts[coordinate_conflicts > 1].index.tolist()
        if conflicting_station_ids:
            raise ValueError(
                "Historical data contains multiple latitude/longitude pairs for the same "
                f"station_id: {conflicting_station_ids}"
            )

    aggregation_map: dict[str, Any] = {
        "latitude": _pick_first_non_null,
        "longitude": _pick_first_non_null,
    }
    for optional_column in (
        "station_name",
        "depth_m_at_station",
        "representative_depth_m",
    ):
        if optional_column in historical_df.columns:
            aggregation_map[optional_column] = _pick_first_non_null

    station_catalog = (
        historical_df.groupby("station_id", as_index=False)
        .agg(aggregation_map)
        .copy()
    )
    station_catalog["station_id"] = station_catalog["station_id"].astype(str)

    missing_coordinates = station_catalog["latitude"].isna() | station_catalog["longitude"].isna()
    if missing_coordinates.any():
        missing_station_ids = station_catalog.loc[missing_coordinates, "station_id"].tolist()
        raise ValueError(
            "Historical data cannot be auto-profiled because these station_ids do not "
            f"have usable coordinates: {missing_station_ids}"
        )

    if "station_name" not in station_catalog.columns:
        station_catalog["station_name"] = None

    return station_catalog


def _build_station_profile_lookup(station_catalog: pd.DataFrame) -> pd.DataFrame:
    stations_wgs84 = gpd.GeoDataFrame(
        station_catalog.copy(),
        geometry=gpd.points_from_xy(station_catalog["longitude"], station_catalog["latitude"]),
        crs=WEB_CRS,
    )
    stations_calc_crs = stations_wgs84.to_crs(CALC_CRS)

    spatial_feature_lookup = extract_station_spatial_features(
        stations_calc_crs,
        station_id_col="station_id",
        station_name_col="station_name",
    )

    profile_rows: list[dict[str, Any]] = []
    for _, station_row in station_catalog.iterrows():
        station_id = str(station_row["station_id"])
        spatial_features = spatial_feature_lookup.get(
            station_id,
            {
                "station_id": station_id,
                "station_name": station_row.get("station_name"),
                "dist_to_mainland_km": None,
                "dist_to_nearest_island_km": None,
                "dist_to_shipping_channel_km": None,
                "inside_harbor_bay": False,
                "depth_m_at_station": None,
                "representative_depth_m": None,
                "nearshore_like_by_depth": None,
                "offshore_like_by_depth": None,
            },
        )
        spatial_features = augment_spatial_features_with_depth(
            spatial_features,
            depth_m_at_station=station_row.get("depth_m_at_station"),
            representative_depth_m=station_row.get("representative_depth_m"),
        )
        profile_rows.append(build_station_profile_audit_fields(spatial_features))

    profile_lookup = pd.DataFrame(profile_rows)
    if profile_lookup.empty:
        raise ValueError("No station profile assignments could be created from historical data.")

    profile_lookup["station_id"] = profile_lookup["station_id"].astype(str)
    return profile_lookup[
        [
            "station_id",
            "auto_profile",
            "rule_triggered",
            "rule_confidence",
            "rule_reason",
        ]
    ].copy()


def _clean_series(values: pd.Series) -> pd.Series:
    clean = pd.to_numeric(values, errors="coerce").dropna()
    if clean.empty:
        return clean
    return clean.astype(float)


def _percentile(series: pd.Series, percentile_value: float) -> float | None:
    clean = _clean_series(series)
    if clean.empty:
        return None
    return float(np.percentile(clean.to_numpy(dtype=float), percentile_value))


def _compute_metric_thresholds(frame: pd.DataFrame) -> dict[str, float | None]:
    thresholds = {
        # T_low_medium = P75(X | profile)
        "wind_low_to_medium": _percentile(frame["wind"], 75.0),
        # T_medium_high = P90(X | profile)
        "wind_medium_to_high": _percentile(frame["wind"], 90.0),
        # T_low_medium = P75(X | profile)
        "rain_low_to_medium": _percentile(frame["rain"], 75.0),
        # T_medium_high = P90(X | profile)
        "rain_medium_to_high": _percentile(frame["rain"], 90.0),
    }
    if "wave" in frame.columns:
        thresholds["wave_low_to_medium"] = _percentile(frame["wave"], 75.0)
        thresholds["wave_medium_to_high"] = _percentile(frame["wave"], 90.0)
    return thresholds


def _sanitize_threshold_value(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (np.floating, float)) and not np.isfinite(value):
        return None
    if isinstance(value, (np.integer, int, np.floating, float)):
        return float(value)
    return None


def _finalize_profile_thresholds(
    raw_thresholds: dict[str, Any],
    fallback_thresholds: dict[str, float | None] | None = None,
) -> dict[str, float]:
    finalized: dict[str, float] = {}
    fallback_thresholds = fallback_thresholds or {}

    for key in MANDATORY_THRESHOLD_KEYS:
        value = _sanitize_threshold_value(raw_thresholds.get(key))
        if value is None:
            value = _sanitize_threshold_value(fallback_thresholds.get(key))
        if value is None:
            raise ValueError(
                f"Missing mandatory threshold value for '{key}'. "
                "Historical data must provide enough wind/rain observations to calibrate runtime thresholds."
            )
        finalized[key] = value

    for wave_key in ("wave_low_to_medium", "wave_medium_to_high"):
        value = _sanitize_threshold_value(raw_thresholds.get(wave_key))
        if value is None:
            value = _sanitize_threshold_value(fallback_thresholds.get(wave_key))
        if value is not None:
            finalized[wave_key] = value

    return finalized


def load_historical_weather_data(source: str | Path | pd.DataFrame) -> pd.DataFrame:
    """Load historical weather data for offline threshold calibration.

    Required columns:
    - station_id
    - latitude
    - longitude
    - wind
    - rain

    Optional columns preserved when present:
    - wave
    - timestamp
    - station_name
    - depth_m_at_station
    - representative_depth_m
    """

    historical_df = _read_tabular_historical_source(source)
    _validate_required_columns(historical_df, MANDATORY_HISTORICAL_COLUMNS)

    historical_df = historical_df.copy()
    if historical_df["station_id"].isna().any():
        raise ValueError("Historical data contains missing station_id values.")

    historical_df["station_id"] = historical_df["station_id"].astype(str).str.strip()
    historical_df = _coerce_numeric_columns(
        historical_df,
        [
            "latitude",
            "longitude",
            "wind",
            "rain",
            "wave",
            "depth_m_at_station",
            "representative_depth_m",
        ],
    )

    if "timestamp" in historical_df.columns:
        historical_df["timestamp"] = pd.to_datetime(historical_df["timestamp"], errors="coerce")
    if "station_name" not in historical_df.columns:
        historical_df["station_name"] = None

    invalid_station_ids = historical_df["station_id"].eq("") | historical_df["station_id"].str.lower().eq("nan")
    if invalid_station_ids.any():
        raise ValueError("Historical data contains empty station_id values.")

    return historical_df


def assign_profiles_to_historical_data(historical_df: pd.DataFrame) -> pd.DataFrame:
    """Assign shared spatial `auto_profile` metadata to historical observations.

    Threshold calibration must happen after this step. Every historical row
    inherits the profile of its station so later aggregation is explicitly
    `historical -> auto_profile -> thresholds_by_profile`.
    """

    historical_df = historical_df.copy()
    historical_df["station_id"] = historical_df["station_id"].astype(str)

    station_catalog = _build_station_catalog(historical_df)
    profile_lookup = _build_station_profile_lookup(station_catalog)

    profiled_historical_df = historical_df.merge(
        profile_lookup,
        on="station_id",
        how="left",
        validate="many_to_one",
    )

    missing_profiles = profiled_historical_df["auto_profile"].isna()
    if missing_profiles.any():
        missing_station_ids = (
            profiled_historical_df.loc[missing_profiles, "station_id"]
            .drop_duplicates()
            .tolist()
        )
        raise ValueError(
            "Historical data still contains rows without auto_profile after shared "
            f"classification: {missing_station_ids}"
        )

    return profiled_historical_df


def compute_thresholds_by_profile(profiled_historical_df: pd.DataFrame) -> dict[str, dict[str, Any]]:
    """Compute percentile-based thresholds per auto_profile from historical data."""

    required_columns = ("station_id", "auto_profile", "wind", "rain")
    _validate_required_columns(profiled_historical_df, required_columns)

    thresholds_by_profile: dict[str, dict[str, Any]] = {}
    grouped = profiled_historical_df.groupby("auto_profile", dropna=False)
    for raw_profile_name, profile_frame in grouped:
        profile_name = _normalize_profile_key(raw_profile_name)
        profile_thresholds = _compute_metric_thresholds(profile_frame)
        profile_thresholds["sample_count"] = int(len(profile_frame))
        profile_thresholds["station_count"] = int(profile_frame["station_id"].astype(str).nunique())
        thresholds_by_profile[profile_name] = profile_thresholds

    return dict(sorted(thresholds_by_profile.items()))


def build_threshold_config(
    thresholds_by_profile: dict[str, dict[str, Any]],
    profiled_historical_df: pd.DataFrame | None = None,
) -> dict[str, dict[str, float]]:
    """Build JSON payload compatible with `thresholds_by_area_type.json`.

    The runtime config must contain a `default` section. If historical data does
    not produce an explicit `default` auto_profile group, this function derives
    the runtime fallback from all profiled historical samples.
    """

    normalized_thresholds_by_profile = {
        _normalize_profile_key(profile_name): dict(profile_thresholds)
        for profile_name, profile_thresholds in thresholds_by_profile.items()
    }

    global_fallback_thresholds: dict[str, float | None] | None = None
    if profiled_historical_df is not None:
        global_fallback_thresholds = _compute_metric_thresholds(profiled_historical_df)

    default_source = normalized_thresholds_by_profile.get("default") or {}
    default_section = _finalize_profile_thresholds(
        default_source,
        fallback_thresholds=global_fallback_thresholds,
    )

    threshold_config: dict[str, dict[str, float]] = {"default": default_section}
    for profile_name in sorted(normalized_thresholds_by_profile):
        if profile_name == "default":
            continue
        threshold_config[profile_name] = _finalize_profile_thresholds(
            normalized_thresholds_by_profile[profile_name],
            fallback_thresholds=default_section,
        )

    return threshold_config


def save_threshold_config(
    threshold_config: dict[str, dict[str, float]],
    output_path: str | Path | None = None,
    *,
    overwrite_runtime_config: bool = False,
) -> Path:
    """Persist the generated threshold config.

    By default this writes to `thresholds_by_area_type.generated.json`.
    Overwriting the runtime file `thresholds_by_area_type.json` requires the
    explicit `overwrite_runtime_config=True` flag.
    """

    if output_path is None:
        target_path = (
            RUNTIME_THRESHOLD_CONFIG_PATH
            if overwrite_runtime_config
            else DEFAULT_GENERATED_THRESHOLD_PATH
        )
    else:
        target_path = Path(output_path)

    if target_path.resolve() == RUNTIME_THRESHOLD_CONFIG_PATH.resolve() and not overwrite_runtime_config:
        raise ValueError(
            "Refusing to overwrite thresholds_by_area_type.json without "
            "overwrite_runtime_config=True."
        )

    target_path.parent.mkdir(parents=True, exist_ok=True)
    with target_path.open("w", encoding="utf-8") as file_obj:
        json.dump(threshold_config, file_obj, ensure_ascii=False, indent=2)
        file_obj.write("\n")
    return target_path


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Offline threshold calibration: historical -> auto_profile -> "
            "thresholds_by_profile -> generated JSON"
        )
    )
    parser.add_argument(
        "historical_data",
        help="Path to historical data file (csv/json/parquet/xlsx/xls).",
    )
    parser.add_argument(
        "--output",
        default=str(DEFAULT_GENERATED_THRESHOLD_PATH),
        help=(
            "Output JSON path. Defaults to thresholds_by_area_type.generated.json. "
            "Use --overwrite-runtime-config to replace thresholds_by_area_type.json."
        ),
    )
    parser.add_argument(
        "--overwrite-runtime-config",
        action="store_true",
        help="Allow overwriting spatial_module/config/thresholds_by_area_type.json.",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()

    historical_df = load_historical_weather_data(args.historical_data)
    profiled_historical_df = assign_profiles_to_historical_data(historical_df)
    thresholds_by_profile = compute_thresholds_by_profile(profiled_historical_df)
    threshold_config = build_threshold_config(
        thresholds_by_profile,
        profiled_historical_df=profiled_historical_df,
    )
    output_path = args.output
    if args.overwrite_runtime_config and output_path == str(DEFAULT_GENERATED_THRESHOLD_PATH):
        output_path = None

    saved_path = save_threshold_config(
        threshold_config,
        output_path=output_path,
        overwrite_runtime_config=args.overwrite_runtime_config,
    )

    summary = {
        "saved_path": str(saved_path),
        "profile_count": len(threshold_config),
        "profiles": list(threshold_config.keys()),
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
