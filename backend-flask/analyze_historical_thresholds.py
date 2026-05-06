from __future__ import annotations

import argparse
import math
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import pandas as pd
import requests


ARCHIVE_API_URL = "https://archive-api.open-meteo.com/v1/archive"
TIMEZONE = "Asia/Bangkok"
DEFAULT_OUTPUT_PATH = Path(__file__).resolve().parent.parent / "historical_threshold_analysis.csv"
THRESHOLD_SOURCE = "backend-flask/spatial_module/station_zone_builder.py"

# Current rules in code:
# wind: <6 => low, <10 => medium, >=10 => high
# rain: <2 => low, <10 => medium, >=10 => high
CURRENT_THRESHOLDS = {
    "wind_speed_10m": {
        "unit": "m/s",
        "api_raw_unit": "km/h",
        "low_to_medium_start": 6.0,
        "medium_to_high_start": 10.0,
        "round_step": 0.5,
    },
    "precipitation": {
        "unit": "mm",
        "api_raw_unit": "mm",
        "low_to_medium_start": 2.0,
        "medium_to_high_start": 10.0,
        "round_step": 1.0,
    },
}


@dataclass(frozen=True)
class Station:
    station_id: int
    station_name: str
    province_name: str
    area_type: str
    representative_group: str
    latitude: float
    longitude: float


@dataclass(frozen=True)
class Period:
    period_code: str
    period_label: str
    start_date: str
    end_date: str


SELECTED_STATIONS: tuple[Station, ...] = (
    Station(
        station_id=159,
        station_name="Luồng vào cảng Cái Lân tại cầu Bãi Cháy",
        province_name="Quảng Ninh",
        area_type="oyster",
        representative_group="harbor_bay",
        latitude=20.959162181938147,
        longitude=107.06615134258728,
    ),
    Station(
        station_id=182,
        station_name="Cảng Cửa Ông TP Cẩm Phả",
        province_name="Quảng Ninh",
        area_type="oyster",
        representative_group="industrial_east_coast",
        latitude=21.02775928111663,
        longitude=107.37514050208326,
    ),
    Station(
        station_id=183,
        station_name="Cảng Cái Rồng Vân Đồn",
        province_name="Quảng Ninh",
        area_type="oyster",
        representative_group="island_gateway",
        latitude=21.059577565589297,
        longitude=107.43054596447462,
    ),
    Station(
        station_id=248,
        station_name="Khu vực cảng Cô Tô",
        province_name="Quảng Ninh",
        area_type="oyster",
        representative_group="offshore_island",
        latitude=20.969457714167223,
        longitude=107.7619707778704,
    ),
    Station(
        station_id=259,
        station_name="Khu vực Bến Bèo – Cát Bà.",
        province_name="Hải Phòng",
        area_type="cobia",
        representative_group="island_coastal_tourism",
        latitude=20.763232231819238,
        longitude=107.07003169852317,
    ),
    Station(
        station_id=261,
        station_name="Trên luồng hàng hải Lạch Huyện - phao số 0.",
        province_name="Hải Phòng",
        area_type="cobia",
        representative_group="open_shipping_channel",
        latitude=20.68756251237311,
        longitude=106.99412214609157,
    ),
)

SELECTED_PERIODS: tuple[Period, ...] = (
    Period(
        period_code="2023_2024_ne_monsoon",
        period_label="Northeast monsoon 2023-2024",
        start_date="2023-11-01",
        end_date="2024-04-30",
    ),
    Period(
        period_code="2024_rainy",
        period_label="Rainy season 2024",
        start_date="2024-05-01",
        end_date="2024-10-31",
    ),
    Period(
        period_code="2024_2025_ne_monsoon",
        period_label="Northeast monsoon 2024-2025",
        start_date="2024-11-01",
        end_date="2025-04-30",
    ),
    Period(
        period_code="2025_rainy",
        period_label="Rainy season 2025",
        start_date="2025-05-01",
        end_date="2025-10-31",
    ),
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Analyze historical wind/rain thresholds from Open-Meteo archive."
    )
    parser.add_argument(
        "--output",
        default=str(DEFAULT_OUTPUT_PATH),
        help=f"CSV output path. Default: {DEFAULT_OUTPUT_PATH}",
    )
    parser.add_argument(
        "--pause-seconds",
        type=float,
        default=0.2,
        help="Sleep between API calls to keep requests polite.",
    )
    return parser.parse_args()


def configure_stdout() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def fetch_archive_hourly(
    session: requests.Session,
    station: Station,
    period: Period,
    pause_seconds: float,
) -> pd.DataFrame:
    params = {
        "latitude": station.latitude,
        "longitude": station.longitude,
        "start_date": period.start_date,
        "end_date": period.end_date,
        "hourly": "wind_speed_10m,precipitation",
        "timezone": TIMEZONE,
    }

    last_error: Exception | None = None
    for attempt in range(1, 4):
        try:
            response = session.get(ARCHIVE_API_URL, params=params, timeout=60)
            response.raise_for_status()
            payload = response.json()
            hourly = payload.get("hourly") or {}
            frame = pd.DataFrame(
                {
                    "time": hourly.get("time", []),
                    "wind_speed_10m": hourly.get("wind_speed_10m", []),
                    "precipitation": hourly.get("precipitation", []),
                }
            )
            if not frame.empty:
                frame["time"] = pd.to_datetime(frame["time"], errors="coerce")
                frame["wind_speed_10m"] = pd.to_numeric(frame["wind_speed_10m"], errors="coerce") / 3.6
                frame["precipitation"] = pd.to_numeric(frame["precipitation"], errors="coerce")
            if pause_seconds > 0:
                time.sleep(pause_seconds)
            return frame
        except Exception as exc:  # pragma: no cover - best effort network retries
            last_error = exc
            if attempt < 3:
                time.sleep(min(1.5 * attempt, 3.0))

    raise RuntimeError(
        f"Archive API failed for station {station.station_id} / period {period.period_code}: {last_error}"
    )


def percentile(series: pd.Series, q: float) -> float | None:
    if series.empty:
        return None
    return float(series.quantile(q))


def round_up_to_step(value: float | None, step: float) -> float | None:
    if value is None or math.isnan(value):
        return None
    return round(math.ceil(value / step) * step, 6)


def safe_float(value: float | None) -> float | None:
    if value is None:
        return None
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    return float(value)


def build_recommendation_text(
    current_low_medium: float,
    current_medium_high: float,
    proposed_low_medium: float | None,
    proposed_medium_high: float | None,
    step: float,
) -> str:
    if proposed_low_medium is None or proposed_medium_high is None:
        return "insufficient_data"

    same_low_medium = abs(proposed_low_medium - current_low_medium) < (step / 2.0)
    same_medium_high = abs(proposed_medium_high - current_medium_high) < (step / 2.0)
    if same_low_medium and same_medium_high:
        return "keep_current"

    parts: list[str] = []
    if not same_low_medium:
        direction = "increase" if proposed_low_medium > current_low_medium else "decrease"
        parts.append(f"{direction}_low_medium")
    if not same_medium_high:
        direction = "increase" if proposed_medium_high > current_medium_high else "decrease"
        parts.append(f"{direction}_medium_high")
    return ",".join(parts)


def stats_row(
    *,
    station: Station | None,
    period: Period | None,
    variable_name: str,
    series: pd.Series,
    scope_type: str,
    province_name: str,
    scope_name: str,
) -> dict[str, object]:
    thresholds = CURRENT_THRESHOLDS[variable_name]
    clean = series.dropna().astype("float64")
    total_hours = int(series.shape[0])
    valid_hours = int(clean.shape[0])
    missing_hours = total_hours - valid_hours

    current_low_medium = thresholds["low_to_medium_start"]
    current_medium_high = thresholds["medium_to_high_start"]
    step = thresholds["round_step"]

    if valid_hours:
        low_share = float((clean < current_low_medium).mean())
        medium_share = float(((clean >= current_low_medium) & (clean < current_medium_high)).mean())
        high_share = float((clean >= current_medium_high).mean())
    else:
        low_share = medium_share = high_share = None

    p75 = percentile(clean, 0.75)
    p95 = percentile(clean, 0.95)
    proposed_low_medium = round_up_to_step(p75, step)
    proposed_medium_high = round_up_to_step(p95, step)

    if (
        proposed_low_medium is not None
        and proposed_medium_high is not None
        and proposed_medium_high <= proposed_low_medium
    ):
        proposed_medium_high = round(proposed_low_medium + step, 6)

    return {
        "scope_type": scope_type,
        "province_name": province_name,
        "scope_name": scope_name,
        "station_id": station.station_id if station else None,
        "station_name": station.station_name if station else None,
        "area_type": station.area_type if station else None,
        "representative_group": station.representative_group if station else None,
        "latitude": station.latitude if station else None,
        "longitude": station.longitude if station else None,
        "period_code": period.period_code if period else "all_selected_periods",
        "period_label": period.period_label if period else "All selected periods",
        "start_date": period.start_date if period else None,
        "end_date": period.end_date if period else None,
        "variable_name": variable_name,
        "unit": thresholds["unit"],
        "api_raw_unit": thresholds["api_raw_unit"],
        "total_hours": total_hours,
        "valid_hours": valid_hours,
        "missing_hours": missing_hours,
        "min_value": safe_float(clean.min()) if valid_hours else None,
        "max_value": safe_float(clean.max()) if valid_hours else None,
        "mean_value": safe_float(clean.mean()) if valid_hours else None,
        "p50": percentile(clean, 0.50),
        "p75": p75,
        "p90": percentile(clean, 0.90),
        "p95": p95,
        "p99": percentile(clean, 0.99),
        "current_low_to_medium_start": current_low_medium,
        "current_medium_to_high_start": current_medium_high,
        "current_low_share": low_share,
        "current_medium_share": medium_share,
        "current_high_share": high_share,
        "current_medium_or_high_share": safe_float(
            (medium_share + high_share) if medium_share is not None and high_share is not None else None
        ),
        "proposed_low_to_medium_start": proposed_low_medium,
        "proposed_medium_to_high_start": proposed_medium_high,
        "proposal_basis": "p75/p95_hourly_distribution",
        "proposal_delta_low_to_medium": safe_float(
            proposed_low_medium - current_low_medium if proposed_low_medium is not None else None
        ),
        "proposal_delta_medium_to_high": safe_float(
            proposed_medium_high - current_medium_high if proposed_medium_high is not None else None
        ),
        "recommendation": build_recommendation_text(
            current_low_medium,
            current_medium_high,
            proposed_low_medium,
            proposed_medium_high,
            step,
        ),
        "threshold_source": THRESHOLD_SOURCE,
        "archive_api_url": ARCHIVE_API_URL,
        "archive_timezone": TIMEZONE,
    }


def build_rows(
    period_frames: dict[tuple[int, str], pd.DataFrame],
) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []

    for station in SELECTED_STATIONS:
        for period in SELECTED_PERIODS:
            frame = period_frames[(station.station_id, period.period_code)]
            for variable_name in ("wind_speed_10m", "precipitation"):
                rows.append(
                    stats_row(
                        station=station,
                        period=period,
                        variable_name=variable_name,
                        series=frame[variable_name],
                        scope_type="station_period",
                        province_name=station.province_name,
                        scope_name=f"{station.station_name} | {period.period_code}",
                    )
                )

    for period in SELECTED_PERIODS:
        period_frames_for_all = [
            period_frames[(station.station_id, period.period_code)] for station in SELECTED_STATIONS
        ]
        merged = pd.concat(period_frames_for_all, ignore_index=True)
        for variable_name in ("wind_speed_10m", "precipitation"):
            rows.append(
                stats_row(
                    station=None,
                    period=period,
                    variable_name=variable_name,
                    series=merged[variable_name],
                    scope_type="aggregate_selected_period",
                    province_name="ALL",
                    scope_name=f"ALL_SELECTED_STATIONS | {period.period_code}",
                )
            )

    all_frames = pd.concat(list(period_frames.values()), ignore_index=True)
    for variable_name in ("wind_speed_10m", "precipitation"):
        rows.append(
            stats_row(
                station=None,
                period=None,
                variable_name=variable_name,
                series=all_frames[variable_name],
                scope_type="aggregate_selected_all_periods",
                province_name="ALL",
                scope_name="ALL_SELECTED_STATIONS | ALL_SELECTED_PERIODS",
            )
        )

    return rows


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def main() -> int:
    configure_stdout()
    args = parse_args()
    output_path = Path(args.output).resolve()
    ensure_parent(output_path)

    session = requests.Session()
    period_frames: dict[tuple[int, str], pd.DataFrame] = {}

    for station in SELECTED_STATIONS:
        for period in SELECTED_PERIODS:
            frame = fetch_archive_hourly(session, station, period, pause_seconds=args.pause_seconds)
            period_frames[(station.station_id, period.period_code)] = frame

    rows = build_rows(period_frames)
    df = pd.DataFrame(rows)

    sort_columns = [
        "scope_type",
        "province_name",
        "station_id",
        "period_code",
        "variable_name",
    ]
    df = df.sort_values(sort_columns, na_position="last").reset_index(drop=True)
    df.to_csv(output_path, index=False, encoding="utf-8-sig")

    print(f"Wrote {len(df)} rows to {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
