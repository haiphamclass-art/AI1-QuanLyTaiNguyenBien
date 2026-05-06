import argparse
import json
import sys
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen


DEFAULT_BASE_URL = "http://103.12.77.146:8000"
DEFAULT_X = 668902
DEFAULT_Y = 2263479
ENDPOINTS = {
    "wind24h": "/wind24h",
    "rain24h": "/rain24h",
    "wave24h": "/wave24h",
}


def configure_output() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")


def fetch_json(url: str) -> Any:
    with urlopen(url, timeout=30) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        return json.loads(response.read().decode(charset))


def build_url(base_url: str, path: str, x: float, y: float) -> str:
    query = urlencode({"x": x, "y": y})
    return f"{base_url.rstrip('/')}{path}?{query}"


def summarize_payload(name: str, payload: Any, sample_size: int) -> None:
    print(f"\n=== {name} ===")
    print(f"payload_type: {type(payload).__name__}")

    if not isinstance(payload, dict):
        preview = json.dumps(payload, ensure_ascii=False, indent=2)
        print(preview[:1000])
        return

    print("top_level_keys:", ", ".join(payload.keys()))
    for key, value in payload.items():
        value_type = type(value).__name__
        if isinstance(value, list):
            print(f"- {key}: list[{len(value)}]")
            for index, item in enumerate(value[:sample_size], start=1):
                sample = json.dumps(item, ensure_ascii=False)
                print(f"  sample_{index}: {sample}")
        else:
            printable = json.dumps(value, ensure_ascii=False)
            print(f"- {key}: {value_type} = {printable}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Đọc dữ liệu từ các API nguồn mở: wind24h, rain24h, wave24h."
    )
    parser.add_argument("--x", type=float, default=DEFAULT_X, help="Tọa độ X.")
    parser.add_argument("--y", type=float, default=DEFAULT_Y, help="Tọa độ Y.")
    parser.add_argument(
        "--base-url",
        default=DEFAULT_BASE_URL,
        help="Base URL của dịch vụ dự báo, mặc định là http://103.12.77.146:8000.",
    )
    parser.add_argument(
        "--endpoint",
        choices=["all", *ENDPOINTS.keys()],
        default="all",
        help="Chọn endpoint cần gọi.",
    )
    parser.add_argument(
        "--sample-size",
        type=int,
        default=3,
        help="Số phần tử đầu tiên của mảng data sẽ được in ra trong phần tóm tắt.",
    )
    parser.add_argument(
        "--raw-json",
        action="store_true",
        help="In toàn bộ JSON thay vì chỉ tóm tắt.",
    )
    return parser.parse_args()


def main() -> int:
    configure_output()
    args = parse_args()
    selected = ENDPOINTS.items() if args.endpoint == "all" else [(args.endpoint, ENDPOINTS[args.endpoint])]

    for name, path in selected:
        url = build_url(args.base_url, path, args.x, args.y)
        print(f"\nCalling: {url}")
        try:
            payload = fetch_json(url)
        except HTTPError as exc:
            print(f"HTTP error for {name}: {exc.code} {exc.reason}", file=sys.stderr)
            return 1
        except URLError as exc:
            print(f"Network error for {name}: {exc.reason}", file=sys.stderr)
            return 1
        except json.JSONDecodeError as exc:
            print(f"Invalid JSON for {name}: {exc}", file=sys.stderr)
            return 1

        if args.raw_json:
            print(json.dumps(payload, ensure_ascii=False, indent=2))
        else:
            summarize_payload(name, payload, max(args.sample_size, 0))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
