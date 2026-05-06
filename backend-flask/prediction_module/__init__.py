import os

from flask import Flask

from config import DATA_CACHE_PATH, MODEL_PATHS

from . import services


def create_app():
    """Create and configure the Flask application."""
    app = Flask(__name__)
    app.config.from_pyfile("../config.py")
    app.config["TRUSTED_HOSTS"] = app.config.get("TRUSTED_HOSTS", [])

    with app.app_context():
        if not os.path.exists(DATA_CACHE_PATH):
            print(f"Cache file not found at '{DATA_CACHE_PATH}'.")
            print("Skipping blocking initial data retrieval during startup.")
            print("Flask will start without cache and use fallback values until data is fetched later.")
        else:
            print(f"Found existing cache file at '{DATA_CACHE_PATH}'.")

        print("Loading machine learning models...")
        services.load_all_models(app.config["MODEL_PATHS"])
        print("All models loaded.")

        from .routes import prediction_api

        app.register_blueprint(prediction_api)

    return app
