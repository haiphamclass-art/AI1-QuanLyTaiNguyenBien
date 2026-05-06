"""Shared spatial auto-profile classifier for both offline and runtime flows.

This module is the single source of truth for automatic station profiling.
The same spatial rules defined here must be reused in both phases:

1. Offline historical calibration:
   historical observations/stations -> auto_profile -> per-profile thresholds
2. Runtime station processing:
   current station -> auto_profile -> lookup pre-calibrated thresholds

This module only assigns `auto_profile` and its audit fields
(`rule_triggered`, `rule_confidence`, `rule_reason`). It does not compute
thresholds. Threshold creation must happen offline after historical data has
already been profiled by these same rules.
"""

from functools import lru_cache
from pathlib import Path

import fiona
import geopandas as gpd
import numpy as np


BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"

LAND_FILE = DATA_DIR / "land_aoi_5899.gpkg"
LAND_LAYER = None

SHIPPING_CHANNEL_FILE = DATA_DIR / "shipping_channel_5899.gpkg"
SHIPPING_CHANNEL_LAYER = None

HARBOR_BAY_FILE = DATA_DIR / "harbor_bay_5899.gpkg"
HARBOR_BAY_LAYER = None

CALC_CRS = "EPSG:5899"

# Conceptual basis:
# - polygon containment is treated as stronger evidence than distance-to-edge
# - shipping channel proximity is a strong exposure signal
# - island/mainland geometry defines the main coastal context
# - depth only supports nearshore/offshore interpretation when available
# - current runtime assignment is fully automatic from available spatial features
# - no manual station-specific labeling is used in the decision path
# - the weak mainland fallback is a generic near-mainland coastal context,
#   not a verified harbor/bay class unless a true harbor polygon layer exists
#
# Operational thresholds below are tuned for this study area. They are pragmatic
# heuristics for Quang Ninh / Hai Phong and are not universal NOAA-style limits.
MAINLAND_AREA_THRESHOLD_KM2 = 500.0
NEAR_SHIPPING_CHANNEL_STRONG_KM = 2.0
NEAR_SHIPPING_CHANNEL_MODERATE_KM = 6.0
NEAR_ISLAND_KM = 5.0
FAR_MAINLAND_KM = 15.0
MID_MAINLAND_MIN_KM = 8.0
MID_MAINLAND_MAX_KM = 15.0
GATEWAY_MAINLAND_MIN_KM = 3.0
GATEWAY_MAINLAND_MAX_KM = 8.0
INDUSTRIAL_MAINLAND_KM = 2.0
INDUSTRIAL_ISLAND_EXCLUSION_KM = 3.0
INDUSTRIAL_CHANNEL_SUPPORT_KM = 8.0
MAINLAND_FALLBACK_KM = 3.0
MAINLAND_FALLBACK_ISLAND_EXCLUSION_KM = 5.0
DEPTH_NEARSHORE_MAX_M = 3.0
DEPTH_OFFSHORE_MIN_M = 12.0


def read_vector(path, layer=None):
    path = str(path)
    if path.lower().endswith(".gpkg"):
        layers = fiona.listlayers(path)
        if layer is None:
            if len(layers) == 1:
                return gpd.read_file(path, layer=layers[0])
            raise ValueError(f"{path} has multiple layers; specify layer explicitly.")
        return gpd.read_file(path, layer=layer)
    return gpd.read_file(path)


def read_optional_vector(path, layer=None):
    if not Path(path).exists():
        return None
    try:
        gdf = read_vector(path, layer=layer)
    except Exception:
        return None
    if gdf is None or len(gdf) == 0:
        return None
    return gdf.to_crs(CALC_CRS)


def _distance_km(point_geom, target_geom):
    if target_geom is None or target_geom.is_empty:
        return None
    return float(point_geom.distance(target_geom) / 1000.0)


def _distance_le(distance_km, threshold_km):
    return distance_km is not None and distance_km <= threshold_km


def _distance_gt(distance_km, threshold_km):
    return distance_km is not None and distance_km > threshold_km


def _distance_ge(distance_km, threshold_km):
    return distance_km is not None and distance_km >= threshold_km


def _distance_between(distance_km, lower_km, upper_km, lower_inclusive=True, upper_inclusive=False):
    if distance_km is None:
        return False
    lower_ok = distance_km >= lower_km if lower_inclusive else distance_km > lower_km
    upper_ok = distance_km <= upper_km if upper_inclusive else distance_km < upper_km
    return lower_ok and upper_ok


@lru_cache(maxsize=1)
def load_profile_assignment_context():
    land = read_vector(LAND_FILE, layer=LAND_LAYER).to_crs(CALC_CRS)
    land = land[~land.geometry.is_empty & land.geometry.notnull()].copy()
    land = land.explode(index_parts=False).reset_index(drop=True)
    land["geometry"] = land.buffer(0)
    land["area_km2"] = land.geometry.area / 1_000_000.0

    mainland = land[land["area_km2"] >= MAINLAND_AREA_THRESHOLD_KM2].copy()
    if mainland.empty:
        mainland = land.nlargest(1, "area_km2").copy()
    islands = land.drop(index=mainland.index, errors="ignore").copy()

    shipping_channel = read_optional_vector(SHIPPING_CHANNEL_FILE, layer=SHIPPING_CHANNEL_LAYER)
    harbor_bay = read_optional_vector(HARBOR_BAY_FILE, layer=HARBOR_BAY_LAYER)

    return {
        "mainland_geom": mainland.geometry.unary_union if len(mainland) else None,
        "island_geom": islands.geometry.unary_union if len(islands) else None,
        "shipping_channel_geom": (
            shipping_channel.geometry.unary_union
            if shipping_channel is not None and len(shipping_channel)
            else None
        ),
        "harbor_bay_geom": (
            harbor_bay.geometry.unary_union
            if harbor_bay is not None and len(harbor_bay)
            else None
        ),
    }


def extract_station_spatial_features(stations_gdf, station_id_col, station_name_col):
    context = load_profile_assignment_context()
    mainland_geom = context["mainland_geom"]
    island_geom = context["island_geom"]
    shipping_channel_geom = context["shipping_channel_geom"]
    harbor_bay_geom = context["harbor_bay_geom"]

    feature_lookup = {}
    for _, row in stations_gdf.iterrows():
        station_id = str(row[station_id_col])
        station_name = row.get(station_name_col)
        geom = row.geometry

        dist_to_mainland_km = _distance_km(geom, mainland_geom)
        dist_to_nearest_island_km = _distance_km(geom, island_geom)
        dist_to_shipping_channel_km = _distance_km(geom, shipping_channel_geom)
        inside_harbor_bay = False
        if harbor_bay_geom is not None and not harbor_bay_geom.is_empty:
            inside_harbor_bay = bool(geom.within(harbor_bay_geom) or geom.intersects(harbor_bay_geom))

        feature_lookup[station_id] = {
            "station_id": station_id,
            "station_name": station_name,
            "dist_to_mainland_km": dist_to_mainland_km,
            "dist_to_nearest_island_km": dist_to_nearest_island_km,
            "dist_to_shipping_channel_km": dist_to_shipping_channel_km,
            "inside_harbor_bay": inside_harbor_bay,
            "depth_m_at_station": None,
            "representative_depth_m": None,
            "nearshore_like_by_depth": None,
            "offshore_like_by_depth": None,
        }

    return feature_lookup


def augment_spatial_features_with_depth(spatial_features, depth_m_at_station=None, representative_depth_m=None):
    enriched = dict(spatial_features)
    representative_depth = representative_depth_m
    if representative_depth is None:
        representative_depth = depth_m_at_station

    if representative_depth is None or pd_isna(representative_depth):
        nearshore_like_by_depth = None
        offshore_like_by_depth = None
        representative_depth = None
    else:
        representative_depth = float(representative_depth)
        nearshore_like_by_depth = representative_depth <= DEPTH_NEARSHORE_MAX_M
        offshore_like_by_depth = representative_depth >= DEPTH_OFFSHORE_MIN_M

    enriched["depth_m_at_station"] = None if depth_m_at_station is None or pd_isna(depth_m_at_station) else float(depth_m_at_station)
    enriched["representative_depth_m"] = representative_depth
    enriched["nearshore_like_by_depth"] = nearshore_like_by_depth
    enriched["offshore_like_by_depth"] = offshore_like_by_depth
    return enriched


def pd_isna(value):
    try:
        return bool(np.isnan(value))
    except TypeError:
        return value is None


def is_inside_harbor_bay(spatial_features):
    return bool(spatial_features.get("inside_harbor_bay"))


def is_near_shipping_channel_strong(spatial_features):
    return _distance_le(spatial_features.get("dist_to_shipping_channel_km"), NEAR_SHIPPING_CHANNEL_STRONG_KM)


def is_near_shipping_channel_moderate(spatial_features):
    return _distance_between(
        spatial_features.get("dist_to_shipping_channel_km"),
        NEAR_SHIPPING_CHANNEL_STRONG_KM,
        NEAR_SHIPPING_CHANNEL_MODERATE_KM,
        lower_inclusive=False,
        upper_inclusive=True,
    )


def is_near_island(spatial_features):
    return _distance_le(spatial_features.get("dist_to_nearest_island_km"), NEAR_ISLAND_KM)


def is_far_mainland(spatial_features):
    return _distance_ge(spatial_features.get("dist_to_mainland_km"), FAR_MAINLAND_KM)


def is_near_mainland(spatial_features):
    return _distance_le(spatial_features.get("dist_to_mainland_km"), MAINLAND_FALLBACK_KM)


def is_mid_mainland(spatial_features):
    return _distance_between(
        spatial_features.get("dist_to_mainland_km"),
        MID_MAINLAND_MIN_KM,
        MID_MAINLAND_MAX_KM,
        lower_inclusive=True,
        upper_inclusive=False,
    )


def is_gateway_mainland_range(spatial_features):
    return _distance_between(
        spatial_features.get("dist_to_mainland_km"),
        GATEWAY_MAINLAND_MIN_KM,
        GATEWAY_MAINLAND_MAX_KM,
        lower_inclusive=False,
        upper_inclusive=False,
    )


def is_industrial_coastal_like(spatial_features):
    return (
        _distance_le(spatial_features.get("dist_to_mainland_km"), INDUSTRIAL_MAINLAND_KM)
        and not is_inside_harbor_bay(spatial_features)
        and (
            spatial_features.get("dist_to_nearest_island_km") is None
            or _distance_gt(spatial_features.get("dist_to_nearest_island_km"), INDUSTRIAL_ISLAND_EXCLUSION_KM)
        )
        and _distance_le(spatial_features.get("dist_to_shipping_channel_km"), INDUSTRIAL_CHANNEL_SUPPORT_KM)
    )


def is_island_tourism_like(spatial_features):
    return (
        is_near_island(spatial_features)
        and not is_inside_harbor_bay(spatial_features)
        and not is_near_shipping_channel_strong(spatial_features)
        and is_mid_mainland(spatial_features)
    )


def is_island_gateway_like(spatial_features):
    return (
        is_near_island(spatial_features)
        and (
            is_gateway_mainland_range(spatial_features)
            or is_near_shipping_channel_moderate(spatial_features)
        )
    )


def is_near_mainland_fallback(spatial_features):
    return (
        _distance_le(spatial_features.get("dist_to_mainland_km"), MAINLAND_FALLBACK_KM)
        and not is_inside_harbor_bay(spatial_features)
        and (
            spatial_features.get("dist_to_nearest_island_km") is None
            or _distance_gt(
                spatial_features.get("dist_to_nearest_island_km"),
                MAINLAND_FALLBACK_ISLAND_EXCLUSION_KM,
            )
        )
        and (
            spatial_features.get("dist_to_shipping_channel_km") is None
            or _distance_gt(
                spatial_features.get("dist_to_shipping_channel_km"),
                NEAR_SHIPPING_CHANNEL_STRONG_KM,
            )
        )
    )


def _make_profile_result(profile_name, rule_triggered, rule_confidence, rule_reason):
    return {
        "auto_profile": profile_name,
        "rule_triggered": rule_triggered,
        "rule_confidence": rule_confidence,
        "rule_reason": rule_reason,
    }


def evaluate_profile_rules(spatial_features):
    if is_inside_harbor_bay(spatial_features):
        return _make_profile_result(
            "harbor_bay",
            "inside_harbor_bay",
            "high",
            "inside_harbor_bay polygon",
        )

    if is_near_shipping_channel_strong(spatial_features):
        return _make_profile_result(
            "open_shipping_channel",
            "near_shipping_channel_strong",
            "high",
            "very close to shipping channel",
        )

    if is_near_island(spatial_features) and is_far_mainland(spatial_features):
        reason = "near island and far from mainland"
        if spatial_features.get("offshore_like_by_depth") is True:
            reason = f"{reason}; supported by offshore-like depth"
        elif spatial_features.get("nearshore_like_by_depth") is True:
            reason = f"{reason}; depth suggests shallower water but geometry remains dominant"
        return _make_profile_result(
            "offshore_island",
            "near_island_far_mainland",
            "high",
            reason,
        )

    if is_island_tourism_like(spatial_features):
        reason = "near island, mid-distance mainland, not strong channel exposure"
        if spatial_features.get("nearshore_like_by_depth") is True:
            reason = f"{reason}; supported by nearshore-like depth"
        return _make_profile_result(
            "island_coastal_tourism",
            "near_island_tourism_like",
            "medium",
            reason,
        )

    if is_island_gateway_like(spatial_features):
        return _make_profile_result(
            "island_gateway",
            "near_island_gateway_like",
            "medium",
            "near island with gateway-like mainland/channel access",
        )

    if is_industrial_coastal_like(spatial_features):
        return _make_profile_result(
            "industrial_east_coast",
            "near_mainland_industrial_like",
            "medium",
            "near mainland industrial/coastal corridor",
        )

    if is_near_mainland_fallback(spatial_features):
        return _make_profile_result(
            "near_mainland_coastal",
            "near_mainland_fallback",
            "low",
            "near mainland coastal fallback",
        )

    return _make_profile_result(
        "default",
        "default_fallback",
        "low",
        "default fallback",
    )


def build_station_profile_audit_fields(spatial_features):
    """Return the shared auto-profile decision plus audit metadata."""
    audit_fields = dict(spatial_features)
    audit_fields.update(evaluate_profile_rules(spatial_features))
    return audit_fields


def assign_station_profile_auto(spatial_features):
    audit_fields = build_station_profile_audit_fields(spatial_features)
    return audit_fields["auto_profile"], audit_fields["rule_triggered"]


def compute_station_spatial_features(stations_gdf, station_id_col, station_name_col):
    feature_lookup = extract_station_spatial_features(
        stations_gdf,
        station_id_col=station_id_col,
        station_name_col=station_name_col,
    )
    return {
        station_id: build_station_profile_audit_fields(features)
        for station_id, features in feature_lookup.items()
    }
