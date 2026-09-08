#!/bin/bash
# Databricks Apps startup script for DataOne

set -e

echo "Starting DataOne in Databricks Apps mode..."

# Set environment variables for Databricks deployment
export DATABASE_URL="sqlite:///./dataone.db"
export CELERY_BROKER_URL="memory://"  # In-memory broker (no Redis needed)
export CELERY_RESULT_BACKEND="memory://"
export LOG_LEVEL="INFO"
export SECRET_KEY="databricks-dataone-secret-$(date +%s)"
export ADMIN_DEFAULT_PASSWORD="admin123"
export BACKEND_URL="${APP_URL:-http://localhost:8080}"
export FRONTEND_URL="${APP_URL:-http://localhost:8080}"
export OLLAMA_HOST="http://localhost:11434"

# Navigate to backend directory
cd backend

# Start the FastAPI application
exec uvicorn app.main:app --host 0.0.0.0 --port 8080
