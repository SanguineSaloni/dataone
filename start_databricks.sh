#!/bin/bash
# Databricks Apps startup script for DataOne

set -e

echo "========================================="
echo "Starting DataOne in Databricks Apps mode"
echo "========================================="

# Core application settings - use SQLite instead of PostgreSQL
export DATABASE_URL="sqlite:///./dataone.db"

# Use memory broker instead of Redis (Celery won't actually work but won't crash)
export CELERY_BROKER_URL="memory://"
export CELERY_RESULT_BACKEND="memory://"

# Basic security settings
export SECRET_KEY="databricks-dataone-secret-change-in-production-$(openssl rand -hex 16)"
export ADMIN_DEFAULT_PASSWORD="admin123"

# Logging
export LOG_LEVEL="INFO"

# URLs
export BACKEND_URL="${APP_URL:-http://localhost:8080}"
export FRONTEND_URL="${APP_URL:-http://localhost:8080}"
export FRONTEND_LOGIN_URL="${APP_URL:-http://localhost:8080}/login"

# Databricks settings
export DATABRICKS_NATIVE_MODE="true"
export ENABLE_UNITY_CATALOG="true"
export ENABLE_EXTERNAL_CONNECTORS="true"

# Disable optional integrations that require external services
export DATABRICKS_USE_LLM="false"
export OLLAMA_HOST="http://localhost:11434"

echo "✅ Environment configured"
echo ""

# Navigate to backend directory
cd backend || { echo "❌ Backend directory not found"; exit 1; }

echo "🚀 Starting FastAPI server..."
echo ""

# Try to find uvicorn - it might be in ~/.local/bin or virtualenv
# Databricks installs packages but sometimes they're not in the module path
if command -v uvicorn &> /dev/null; then
    echo "Found uvicorn command"
    exec uvicorn app.main:app --host 0.0.0.0 --port 8080 --log-level info
elif python3 -c "import uvicorn" 2>/dev/null; then
    echo "Found uvicorn module"
    exec python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8080 --log-level info
else
    echo "⚠️  uvicorn not found, installing..."
    pip3 install --user uvicorn[standard] fastapi
    exec python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8080 --log-level info
fi
