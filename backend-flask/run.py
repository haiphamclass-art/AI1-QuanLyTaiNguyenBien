# /project_flask_api/run.py
import os
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

from prediction_module import create_app

# Tạo instance của ứng dụng bằng factory
app = create_app()

# Register the spatial blueprint only when its optional GIS dependencies are available.
try:
    from spatial_module.routes import spatial_bp
except ModuleNotFoundError as exc:
    missing_dependency = exc.name or str(exc)
    print(f"WARNING: Spatial module disabled because dependency is missing: {missing_dependency}")
else:
    app.register_blueprint(spatial_bp)


if __name__ == '__main__':
    # Chạy ứng dụng
    # host='0.0.0.0' để có thể truy cập từ bên ngoài
    debug = os.getenv("FLASK_DEBUG", "0").lower() in {"1", "true", "yes", "on"}
    app.run(debug=debug, use_reloader=False, host='0.0.0.0', port=5001)
