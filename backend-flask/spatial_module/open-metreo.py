from fastapi import FastAPI, Query
import requests
import pandas as pd
from pyproj import Transformer

app = FastAPI()

# 🔹 VN2000 → WGS84
transformer = Transformer.from_crs("EPSG:3405", "EPSG:4326", always_xy=True)


def vn2000_to_wgs84(x, y):
    lon, lat = transformer.transform(x, y)
    return lat, lon

def classify_rain_cobia(rain):
    if rain == 0:
        return "Không mưa (ổn định)"
    elif rain < 2:
        return "Mưa nhỏ (không ảnh hưởng)"
    elif rain < 10:
        return "Mưa vừa (giảm nhẹ độ mặn, cần theo dõi)"
    elif rain < 30:
        return "Mưa to (cá dễ sốc, giảm ăn)"
    else:
        return "Mưa rất to (nguy hiểm, có thể chết cá)"

# 🔥 Hàm phân loại sóng
def classify_wave(w):
    if w < 1.0:
        return "Tốt"
    elif w < 2.0:
        return "Chấp nhận"
    elif w < 3.0:
        return "Nguy cơ"
    else:
        return "Nguy hiểm"
def classify_wind_oyster(wind):
    if wind < 3:
        return "Gió nhẹ (ổn định)"
    elif wind < 6:
        return "Gió vừa (ảnh hưởng nhẹ)"
    elif wind < 10:
        return "Gió mạnh (nước đục, giảm lọc)"
    else:
        return "Gió rất mạnh (nguy hiểm, có thể bong giá thể )"
def classify_wind_cobia(wind):
    if wind < 3:
        return "Gió nhẹ (ổn định)"
    elif wind < 6:
        return "Gió vừa (có sóng nhẹ)"
    elif wind < 10:
        return "Gió mạnh (cá stress, giảm ăn)"
    else:
        return "Gió rất mạnh (nguy hiểm, hỏng lồng)"

# 🔹 API chính
@app.get("/wave24h")
def get_wave_24h(
    x: float = Query(..., description="VN2000 X"),
    y: float = Query(..., description="VN2000 Y")
):
    lat, lon = vn2000_to_wgs84(x, y)
    
    
    url = "https://marine-api.open-meteo.com/v1/marine"

    params = {
        "latitude": lat,
        "longitude": lon,
        "hourly": "wave_height",
        "forecast_days": 1,
        "timezone": "Asia/Bangkok"
    }

    res = requests.get(url, params=params, timeout=5)
    data = res.json()

    df = pd.DataFrame({
        "time": data["hourly"]["time"],
        "wave_height_m": data["hourly"]["wave_height"]
    })

    df_24h = df.head(24)

    # 🔥 Thêm cột phân loại
    df_24h["level"] = df_24h["wave_height_m"].apply(classify_wave)

    # 🔥 Thống kê tổng
    max_wave = float(df_24h["wave_height_m"].max())
    avg_wave = float(df_24h["wave_height_m"].mean())

    result = {
        "source":"Hỗ trợ cảnh báo từ nguồn mở về độ cao sóng, người dân cần kết hợp tham khảo bản tin dự báo, số liệu trạm đo gần nhất và các quan sát bằng mắt thường",
        "lat": lat,
        "lon": lon,
        "max_wave": max_wave,
        "max_level": classify_wave(max_wave),
        "avg_wave": avg_wave,
        "data": df_24h.to_dict(orient="records")
    }

    return result

@app.get("/rain24h")
def get_rain24h_cobia(
    x: float = Query(..., description="VN2000 X"),
    y: float = Query(..., description="VN2000 Y")
):
    lat, lon = vn2000_to_wgs84(x, y)

    url = "https://api.open-meteo.com/v1/forecast"

    params = {
        "latitude": lat,
        "longitude": lon,
        "hourly": "precipitation",
        "forecast_days": 1,
        "timezone": "Asia/Bangkok"
    }

    res = requests.get(url, params=params, timeout=5)
    data = res.json()

    # 🔹 DataFrame
    df = pd.DataFrame({
        "time": data["hourly"]["time"],
        "rain_mm": data["hourly"]["precipitation"]
    })

    df_24h = df.head(24)

    # 🔥 Áp dụng ngưỡng cá giò
    df_24h["level"] = df_24h["rain_mm"].apply(classify_rain_cobia)

    # 🔥 Thống kê quan trọng
    total_rain = float(df_24h["rain_mm"].sum())
    max_rain = float(df_24h["rain_mm"].max())

    result = {
        "source": "Cảnh báo mưa 24h phục vụ nuôi thuỷ sản (nguồn dữ liệu Open-Meteo). Cần kết hợp quan trắc thực tế.",
        "lat": lat,
        "lon": lon,
        "total_rain_mm_24h": total_rain,
        "max_rain_mm": max_rain,
        "max_level": classify_rain_cobia(max_rain),
        "data": df_24h.to_dict(orient="records")
    }

    return result
    
@app.get("/wind24h")
def get_wind24h(
    x: float = Query(..., description="VN2000 X"),
    y: float = Query(..., description="VN2000 Y")
):
    lat, lon = vn2000_to_wgs84(x, y)

    url = "https://api.open-meteo.com/v1/forecast"

    params = {
        "latitude": lat,
        "longitude": lon,
        "hourly": "wind_speed_10m,wind_direction_10m",
        "wind_speed_unit": "ms",
        "forecast_days": 1,
        "timezone": "Asia/Bangkok"
    }

    res = requests.get(url, params=params, timeout=5)
    data = res.json()

    #DataFrame
    df = pd.DataFrame({
        "time": data["hourly"]["time"],
        "wind_speed": data["hourly"]["wind_speed_10m"],
        "wind_direction": data["hourly"]["wind_direction_10m"]
    })

    df_24h = df.head(24)

    # Phân loại theo đối tượng nuôi
    df_24h["level_cobia"] = df_24h["wind_speed"].apply(classify_wind_cobia)
    df_24h["level_oyster"] = df_24h["wind_speed"].apply(classify_wind_oyster)

    #Thống kê
    max_wind = float(df_24h["wind_speed"].max())
    avg_wind = float(df_24h["wind_speed"].mean())

    result = {
        "source": "Cảnh báo gió 24h từ Open-Meteo (mô hình dự báo). Nên kết hợp quan sát thực tế để ra quyết định.",
        "lat": lat,
        "lon": lon,
        "max_wind_m_s": max_wind,
        "max_level_cobia": classify_wind_cobia(max_wind),
        "max_level_oyster": classify_wind_oyster(max_wind),
        "avg_wind_m_s": avg_wind,
        "data": df_24h.to_dict(orient="records")
    }

    return result
