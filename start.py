#!/usr/bin/env python3
"""
Entry point for DataOne in Databricks Apps.
Sets environment variables and starts the FastAPI application.
"""
import os
import sys

# Get Databricks environment variables
# Try different possible port environment variable names
databricks_port = int(os.getenv("DATABRICKS_APP_PORT") or 
                     os.getenv("PORT") or 
                     os.getenv("APP_PORT") or 
                     "8080")
app_url = os.getenv("APP_URL")

# For Databricks Apps, construct the backend URL properly
if app_url:
    backend_url = app_url
    frontend_url = app_url
    frontend_login_url = app_url + "/login"
else:
    # Fallback for local development
    backend_url = f"http://localhost:{databricks_port}"
    frontend_url = f"http://localhost:{databricks_port}"
    frontend_login_url = f"http://localhost:{databricks_port}/login"

# Set environment variables for Databricks deployment
os.environ["DATABASE_URL"] = "sqlite:///./dataone.db"
os.environ["CELERY_BROKER_URL"] = "memory://"
os.environ["CELERY_RESULT_BACKEND"] = "memory://"
os.environ["LOG_LEVEL"] = "INFO"
os.environ["SECRET_KEY"] = "databricks-dataone-secret-change-in-production"
os.environ["ADMIN_DEFAULT_PASSWORD"] = "admin123"
os.environ["BACKEND_URL"] = backend_url
os.environ["FRONTEND_URL"] = frontend_url
os.environ["FRONTEND_LOGIN_URL"] = frontend_login_url
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
print(f"   Backend URL: {backend_url}")
print(f"   Databricks Port: {databricks_port}")
print(f"   APP_URL: {app_url}")
print(f"   PORT env: {os.getenv('PORT')}")
print(f"   DATABRICKS_APP_PORT env: {os.getenv('DATABRICKS_APP_PORT')}")
print(f"   APP_PORT env: {os.getenv('APP_PORT')}")
print(f"   Databricks Native Mode: {os.environ['DATABRICKS_NATIVE_MODE']}")
print()

# Add backend directory to Python path so imports work
backend_path = os.path.join(os.getcwd(), "backend")
sys.path.insert(0, backend_path)

# Change to backend directory (for relative file paths like database)
os.chdir("backend")

print(f"🚀 Starting FastAPI server on port {databricks_port}...")
print(f"   Python path: {backend_path}")
print(f"   Working dir: {os.getcwd()}")
print()

# Import and run uvicorn
try:
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=databricks_port,
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
