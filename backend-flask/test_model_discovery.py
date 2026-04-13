#!/usr/bin/env python3
"""
Test script to verify model auto-discovery functionality
Run: python test_model_discovery.py
"""

from config import MODEL_PATHS, discover_model_paths

def test_discovery():
    print("=" * 60)
    print("TESTING MODEL AUTO-DISCOVERY")
    print("=" * 60)
    print()
    
    # Test discovery function
    print("Running discover_model_paths()...")
    print("-" * 60)
    models = discover_model_paths()
    print()
    
    # Display results
    print("=" * 60)
    print(f"TOTAL MODELS DISCOVERED: {len(models)}")
    print("=" * 60)
    print()
    
    if models:
        # Group by species
        species_groups = {}
        for model_key, path in sorted(models.items()):
            species = model_key.split('_')[0]
            if species not in species_groups:
                species_groups[species] = []
            species_groups[species].append((model_key, path))
        
        # Display grouped
        for species, model_list in sorted(species_groups.items()):
            print(f"[{species.upper()}]")
            print("-" * 60)
            for model_key, path in model_list:
                print(f"  * {model_key:25} -> {path}")
            print()
    else:
        print("WARNING: No models found!")
        print("Please check that model/ directory exists and contains .pkl files")
        print()
    
    # Verify expected models
    print("=" * 60)
    print("VERIFICATION")
    print("=" * 60)
    
    expected_models = [
        'cobia_ridge', 'cobia_gbr', 'cobia_xgboost', 'cobia_svr',
        'cobia_rf', 'cobia_lightgbm', 'cobia_stack',
        'oyster_ridge', 'oyster_gbr', 'oyster_xgboost', 'oyster_svr',
        'oyster_rf', 'oyster_lightgbm', 'oyster_stack',
    ]
    
    missing = [m for m in expected_models if m not in models]
    extra = [m for m in models if m not in expected_models]
    
    if not missing and not extra:
        print("[OK] All expected models found!")
    else:
        if missing:
            print(f"[MISSING] Models: {', '.join(missing)}")
        if extra:
            print(f"[INFO] Extra models: {', '.join(extra)}")
    
    print()
    print("=" * 60)
    print("TEST COMPLETE")
    print("=" * 60)

if __name__ == '__main__':
    test_discovery()

