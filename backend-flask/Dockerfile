# Use Python 3.10 slim image for smaller size
FROM python:3.10-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV FLASK_APP=run.py
ENV FLASK_ENV=production

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    gcc \
    g++ \
    libhdf5-dev \
    libnetcdf-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create directories if they don't exist
RUN mkdir -p data shared_models

# Copy built-in models to app directory
# These will be loaded if shared_models is empty
RUN if [ -d model ]; then echo "Built-in models found"; else echo "WARNING: No built-in models"; fi

# Copy init script
COPY init_models.sh /app/init_models.sh
RUN chmod +x /app/init_models.sh

# Create a non-root user for security
RUN adduser --disabled-password --gecos '' appuser && \
    chown -R appuser:appuser /app
USER appuser

# Expose Flask port
EXPOSE 5001

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:5001/status || exit 1

# Start the Flask application
# First run init script to copy built-in models if shared_models is empty
CMD ["sh", "-c", "/app/init_models.sh && FLASK_APP=run.py flask run --host=0.0.0.0 --port=5001"]
