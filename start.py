#!/usr/bin/env python3
"""
Entry point for DataOne in Databricks Apps.
Sets environment variables and starts the FastAPI application.
"""
import os
import sys

# Set environment variables for Databricks deployment
os.environ["DATABASE_URL"] = "sqlite:///./dataone.db"
os.environ["CELERY_BROKER_URL"] = "memory://"
os.environ["CELERY_RESULT_BACKEND"] = "memory://"
os.environ["LOG_LEVEL"] = "INFO"
os.environ["SECRET_KEY"] = "databricks-dataone-secret-change-in-production"
os.environ["ADMIN_DEFAULT_PASSWORD"] = "admin123"
os.environ["BACKEND_URL"] = os.getenv("APP_URL", "http://localhost:8080")
os.environ["FRONTEND_URL"] = os.getenv("APP_URL", "http://localhost:8080")
os.environ["FRONTEND_LOGIN_URL"] = os.getenv("APP_URL", "http://localhost:8080") + "/login"
os.environ["DATABRICKS_NATIVE_MODE"] = "true"
os.environ["ENABLE_UNITY_CATALOG"] = "true"
os.environ["ENABLE_EXTERNAL_CONNECTORS"] = "true"
os.environ["DATABRICKS_USE_LLM"] = "false"
os.environ["OLLAMA_HOST"] = "http://localhost:11434"

print("=" * 60)
print("Starting DataOne in Databricks Apps mode")
print("=" * 60)
print(f"✅ Environment configured")
print(f"   Database: SQLite (file-based)")
print(f"   Backend URL: {os.environ['BACKEND_URL']}")
print(f"   Databricks Native Mode: {os.environ['DATABRICKS_NATIVE_MODE']}")
print()

# Add backend directory to Python path so imports work
backend_path = os.path.join(os.getcwd(), "backend")
sys.path.insert(0, backend_path)

# Change to backend directory (for relative file paths like database)
os.chdir("backend")

print("🚀 Starting FastAPI server on port 8080...")
print(f"   Python path: {backend_path}")
print(f"   Working dir: {os.getcwd()}")
print()

# Import and run uvicorn
try:
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8080,
        log_level="info"
    )
except ImportError as e:
    print(f"❌ Import Error: {e}")
    print(f"   Python sys.path: {sys.path}")
    sys.exit(1)
except Exception as e:
    print(f"❌ Failed to start server: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
