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

# Try to get the app URL from multiple possible environment variables
app_url = (os.getenv("APP_URL") or 
          os.getenv("DATABRICKS_APP_URL") or 
          os.getenv("APPLICATION_URL") or
          os.getenv("PUBLIC_URL"))

is_databricks = bool(os.getenv("DATABRICKS_APP_PORT"))

# Deployed Databricks App URLs — backend and frontend are separate apps
BACKEND_APP_URL = "https://dataonetest-7474652115156015.aws.databricksapps.com"
FRONTEND_APP_URL = "https://dataonefrontend-7474652115156015.aws.databricksapps.com"

# For Databricks Apps, set the correct backend and frontend URLs
if is_databricks:
    backend_url = BACKEND_APP_URL
    # Frontend is a SEPARATE Databricks App — OAuth redirects must land there
    frontend_url = FRONTEND_APP_URL
    frontend_login_url = FRONTEND_APP_URL + "/login"
else:
    # Local development fallback
    backend_url = f"http://localhost:{databricks_port}"
    frontend_url = f"http://localhost:{databricks_port}"
    frontend_login_url = f"http://localhost:{databricks_port}/login"

# Set environment variables for Databricks deployment
os.environ["DATABASE_URL"] = "sqlite:///./dataone.db"

# For Databricks Apps, disable Redis/Celery-dependent features
if os.getenv("DATABRICKS_APP_PORT"):
    # Running in Databricks Apps - no Redis available
    os.environ["CELERY_BROKER_URL"] = "redis://disabled"  # Placeholder to avoid Redis health check
    os.environ["CELERY_RESULT_BACKEND"] = "disabled"
    os.environ["DISABLE_CELERY"] = "true"  # Flag to disable Celery features
else:
    # Local development
    os.environ["CELERY_BROKER_URL"] = "memory://"
    os.environ["CELERY_RESULT_BACKEND"] = "memory://"

os.environ["LOG_LEVEL"] = "INFO"
os.environ["SECRET_KEY"] = "databricks-dataone-secret-change-in-production"
os.environ["ADMIN_DEFAULT_PASSWORD"] = "veladmin123"
os.environ["BACKEND_URL"] = backend_url
os.environ["FRONTEND_URL"] = frontend_url
os.environ["FRONTEND_LOGIN_URL"] = frontend_login_url
os.environ["DATABRICKS_NATIVE_MODE"] = "true"
# Allow both the frontend app and the backend app origins for CORS
os.environ["CORS_ALLOWED_ORIGINS"] = f"{FRONTEND_APP_URL},{BACKEND_APP_URL}"
os.environ["ENABLE_UNITY_CATALOG"] = "true"
os.environ["ENABLE_EXTERNAL_CONNECTORS"] = "true"
os.environ["DATABRICKS_USE_LLM"] = "false"
os.environ["OLLAMA_HOST"] = "http://localhost:11434"

# Auto-configure Databricks connection when running as Databricks App
if os.getenv("DATABRICKS_APP_PORT"):
    # Running in Databricks Apps - set up auto-discovery
    os.environ["DATABRICKS_AUTO_DISCOVER"] = "true"
    
    # Try to detect workspace connection details from environment
    workspace_host = os.getenv("DATABRICKS_SERVER_HOSTNAME")
    workspace_token = os.getenv("DATABRICKS_TOKEN") 
    warehouse_path = os.getenv("DATABRICKS_HTTP_PATH")
    
    if workspace_host and workspace_token:
        os.environ["DATABRICKS_WORKSPACE_HOST"] = workspace_host
        os.environ["DATABRICKS_WORKSPACE_TOKEN"] = workspace_token
        if warehouse_path:
            os.environ["DATABRICKS_WAREHOUSE_PATH"] = warehouse_path

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

# Debug: Check for Databricks workspace environment variables
print("🔍 Databricks Environment Discovery:")
databricks_env_vars = [
    'DATABRICKS_HOST', 'DATABRICKS_TOKEN', 'DATABRICKS_WAREHOUSE_ID',
    'DATABRICKS_SERVER_HOSTNAME', 'DATABRICKS_HTTP_PATH',
    'WORKSPACE_URL', 'WORKSPACE_ID', 'CLUSTER_ID', 'DATABRICKS_RUNTIME_VERSION'
]
for var in databricks_env_vars:
    value = os.getenv(var)
    if value:
        print(f"   {var}: {value}")
    else:
        print(f"   {var}: (not set)")

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
