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

# Check if uvicorn is available
echo "🔍 Checking for uvicorn..."
if ! python3 -c "import uvicorn" 2>/dev/null; then
    echo "⚠️  uvicorn not found - installing dependencies from requirements.txt"
    echo "This should have been done by Databricks build, but doing it now as fallback..."
    
    # Install to user site-packages (doesn't require root)
    python3 -m pip install --user --no-cache-dir -r requirements.txt
    
    # Add user site-packages to PATH
    export PATH="$HOME/.local/bin:$PATH"
    
    echo "✅ Dependencies installed"
else
    echo "✅ uvicorn found"
fi

# Navigate to backend directory
cd backend || { echo "❌ Backend directory not found"; exit 1; }

echo "🚀 Starting FastAPI server on port 8080..."
echo ""

# Try to start uvicorn (check as command first, then as module)
if command -v uvicorn &> /dev/null; then
    echo "Starting with: uvicorn app.main:app"
    exec uvicorn app.main:app --host 0.0.0.0 --port 8080 --log-level info
else
    echo "Starting with: python3 -m uvicorn app.main:app"
    exec python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8080 --log-level info
fi
