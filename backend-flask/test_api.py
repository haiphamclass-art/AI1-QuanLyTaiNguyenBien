from flask import Flask, request, jsonify
import pickle
import numpy as np

app = Flask(__name__)

# Paths to the saved models
MODEL_PATHS = {
    'cobia_ridge': 'model/cobia/ridge_model.pkl',
  'cobia_gbr': 'model/cobia/gbr_model.pkl',
  'cobia_xgboost': 'model/cobia/xgboost_model.pkl',
  'cobia_svr': 'model/cobia/svr_model.pkl',
  'cobia_rf': 'model/cobia/rf_model.pkl',
  'cobia_lightgbm': 'model/cobia/lightgbm_model.pkl',
  'cobia_stack': 'model/cobia/stack_gen_model.pkl',
  'oyster_ridge': 'model/oyster/ridge_model.pkl',
  'oyster_gbr': 'model/oyster/gbr_model.pkl',
  'oyster_xgboost': 'model/oyster/xgboost_model.pkl',
  'oyster_svr': 'model/oyster/svr_model.pkl',
  'oyster_rf': 'model/oyster/rf_model.pkl',
  'oyster_lightgbm': 'model/oyster/lightgbm_model.pkl',
  'oyster_stack': 'model/oyster/stack_gen_model.pkl',
}

# Load both models into memory
models = {}
for model_name, path in MODEL_PATHS.items():
    try:
        with open(path, 'rb') as file:
            models[model_name] = pickle.load(file)
        print(f"Model '{model_name}' loaded successfully from {path}")
    except Exception as e:
        print(f"Error loading model '{model_name}': {e}")

# List of required fields
REQUIRED_FIELDS = [
    'R_PO4','O2Sat','O2ml_L','STheta','Salnty','R_DYNHT','T_degC','R_Depth','Distance',
    'Wind_Spd','Wave_Ht','Wave_Prd','IntChl','Dry_T'
]

# Utility function to check for missing fields
def check_missing_fields(data):
    missing = [field for field in REQUIRED_FIELDS if field not in data]
    return missing

# Shared prediction logic
def make_prediction(data, default_model):
    # Check for missing fields
    missing_fields = check_missing_fields(data)
    if missing_fields:
        print(f"Missing fields in request: {missing_fields}")

    # Extract and preprocess features (set missing fields to default value 0)
    features = [data.get(field, 0) for field in REQUIRED_FIELDS]

    # Choose the model based on query parameter, default to the endpoint's default model
    model_name = request.args.get("model", default_model)
    if model_name not in models:
        return {"error": f"Model '{model_name}' not found"}, 400

    model = models[model_name]
    print(f"Using model: {model_name}")

    # Reshape and predict
    input_features = np.array(features).reshape(1, -1)
    print("hi1")
    prediction = model.predict(input_features)
    print(prediction)
    rounded_prediction = round(prediction[0])
    print(rounded_prediction)
    # Return the prediction
    return {"model_used": model_name, "prediction": rounded_prediction}

# Prediction route for Cobia
@app.route('/predict/cobia', methods=['POST'])
def predict_cobia():
    try:
        # Parse JSON input
        data = request.get_json()
        result = make_prediction(data, default_model="cobia_stack")
        print(result)
        if "error" in result:
            return jsonify(result), 400
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Prediction route for Oyster
@app.route('/predict/oyster', methods=['POST'])
def predict_oyster():
    try:
        # Parse JSON input
        data = request.get_json()
        result = make_prediction(data, default_model="oyster_stack")
        print(result)
        if "error" in result:
            return jsonify(result), 400
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Health check route
@app.route('/', methods=['GET'])
def home():
    return jsonify({
        'message': 'Flask Model API is running!',
        'available_models': list(models.keys())
    })

# Run the app
if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5001)
