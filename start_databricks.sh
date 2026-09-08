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

# Databricks Apps installs packages in a virtualenv during build
# We need to find and activate it, or add it to PATH
# Common locations: /databricks/python3, /.venv, /app/.venv, or installed globally

# Try to find the virtualenv
if [ -d "/.venv" ]; then
    echo "Found virtualenv at /.venv"
    source /.venv/bin/activate
elif [ -d "/app/.venv" ]; then
    echo "Found virtualenv at /app/.venv"
    source /app/.venv/bin/activate
elif [ -d "/databricks/python3" ]; then
    echo "Found Databricks Python at /databricks/python3"
    export PATH="/databricks/python3/bin:$PATH"
fi

# Also check for user-installed packages
export PATH="$HOME/.local/bin:$PATH"
export PYTHONPATH="/app:$PYTHONPATH"

# Now try to start uvicorn
echo "Looking for uvicorn..."
which uvicorn || echo "uvicorn not in PATH"
which python3 || echo "python3 not in PATH"

# Start the server - by now uvicorn should be available
if command -v uvicorn &> /dev/null; then
    echo "✅ Starting with uvicorn command"
    exec uvicorn app.main:app --host 0.0.0.0 --port 8080 --log-level info
else
    echo "✅ Starting with python3 -m uvicorn"
    exec python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8080 --log-level info
fi
