import joblib
path = r"model\oyster\stack_gen_model.pkl"
m = joblib.load(path)
print("Loaded:", type(m))
print(m)