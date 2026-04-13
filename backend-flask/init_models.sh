#!/bin/bash
# Initialize shared models volume with built-in models if empty

SHARED_DIR="/app/shared_models"
BUILTIN_DIR="/app/model"

echo "Checking shared_models directory..."

# Count files in shared_models
FILE_COUNT=$(find "$SHARED_DIR" -name "*.pkl" 2>/dev/null | wc -l)

if [ "$FILE_COUNT" -eq 0 ]; then
    echo "Shared models directory is empty. Copying built-in models..."
    
    if [ -d "$BUILTIN_DIR" ]; then
        # Copy all built-in models to shared directory
        cp -r "$BUILTIN_DIR"/* "$SHARED_DIR"/ 2>/dev/null || true
        
        # Count copied files
        COPIED_COUNT=$(find "$SHARED_DIR" -name "*.pkl" 2>/dev/null | wc -l)
        echo "Copied $COPIED_COUNT model files to shared_models"
    else
        echo "WARNING: Built-in model directory not found at $BUILTIN_DIR"
    fi
else
    echo "Shared models directory already contains $FILE_COUNT model files. Skipping initialization."
fi

echo "Model initialization complete."


