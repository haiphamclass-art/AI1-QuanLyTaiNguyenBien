import json

from flask import Blueprint, request, jsonify
import pandas as pd
from spatial_module.station_zone_builder import (
    OUTPUT_DIR,
    STATION_ZONES_WEB_CACHE_PATH,
    build_latest_web_payload,
    build_station_influence,
)

spatial_bp = Blueprint("spatial_bp", __name__, url_prefix="/spatial")

@spatial_bp.route("/ping", methods=["GET"])
def ping():
    return jsonify({"message": "spatial ok"}), 200

@spatial_bp.route("/rebuild-station-zones", methods=["POST"])
def rebuild_station_zones():
    try:
        data = request.get_json(force=True)
        stations = data.get("stations", [])

        if not stations:
            return jsonify({
                "success": False,
                "message": "Danh sách stations trống"
            }), 400

        stations_df = pd.DataFrame(stations)
        result = build_station_influence(stations_df)

        return jsonify(result), 200

    except Exception as e:
        return jsonify({
            "success": False,
            "message": str(e)
        }), 500


@spatial_bp.route("/station-zones/latest", methods=["GET"])
def get_latest_station_zones():
    try:
        if STATION_ZONES_WEB_CACHE_PATH.exists():
            with open(STATION_ZONES_WEB_CACHE_PATH, "r", encoding="utf-8") as geojson_file:
                payload = json.load(geojson_file)
            return jsonify(payload), 200

        geojson_path = OUTPUT_DIR / "stations_influence_3ring_wgs84.geojson"

        if not geojson_path.exists():
            return jsonify({
                "success": False,
                "message": "Chưa có dữ liệu phân vùng trạm"
            }), 404

        with open(geojson_path, "r", encoding="utf-8") as geojson_file:
            payload = json.load(geojson_file)

        slim_payload = build_latest_web_payload(payload)
        with open(STATION_ZONES_WEB_CACHE_PATH, "w", encoding="utf-8") as cache_file:
            json.dump(slim_payload, cache_file, ensure_ascii=False)

        return jsonify(slim_payload), 200
    except Exception as e:
        return jsonify({
            "success": False,
            "message": str(e)
        }), 500
