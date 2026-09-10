#!/usr/bin/env python3
"""
Entry point for DataOne Frontend in Databricks Apps.
Sets environment variables and starts the Next.js application.

IMPORTANT: Because next.config.ts uses `output: 'export'` (fully static),
all NEXT_PUBLIC_* env vars MUST be set before `npm run build` runs.
They are baked into the static bundle at build time and cannot be changed
at runtime.
"""
import os
import sys
import subprocess

# Backend API URL — the deployed Databricks Apps backend.
# Override by setting BACKEND_API_URL as an app environment variable in the
# Databricks Apps UI. Default points to the known backend deployment.
backend_url = os.getenv(
    "BACKEND_API_URL",
    "https://dataonetest-7474652115156015.aws.databricksapps.com"
)

# Whether to show the "Sign in with Databricks" button on the login page.
# Set to "true" when running as a Databricks App with OAuth enabled.
databricks_mode = os.getenv("NEXT_PUBLIC_DATABRICKS_MODE", "true")

print("=" * 60)
print("Starting DataOne Frontend in Databricks Apps mode")
print("=" * 60)
print(f"✅ Environment configured")
print(f"   Backend API URL: {backend_url}")
print(f"   Databricks Mode: {databricks_mode}")
print(f"   Frontend Port: 3000")
print()

# Set Next.js environment variables BEFORE the build so they are baked into
# the static bundle (required for output: 'export' static Next.js apps).
os.environ["NEXT_PUBLIC_API_URL"] = backend_url
os.environ["NEXT_PUBLIC_DATABRICKS_MODE"] = databricks_mode
os.environ["PORT"] = "3000"
os.environ["HOSTNAME"] = "0.0.0.0"

# Change to frontend directory
os.chdir("/app/python/source_code/frontend")

print("🏗️  Building Next.js application...")
print()

# Build the Next.js app (production build)
build_result = subprocess.run(
    ["npm", "run", "build"],
    capture_output=False,
    text=True
)

if build_result.returncode != 0:
    print("❌ Build failed!")
    sys.exit(1)

print()
print("✅ Build completed successfully!")
print()
print("🚀 Starting Next.js production server on port 3000...")
print()

# Start the Next.js production server
try:
    subprocess.run(
        ["npm", "run", "start"],
        check=True
    )
except KeyboardInterrupt:
    print("\n👋 Shutting down...")
    sys.exit(0)
except Exception as e:
    print(f"❌ Failed to start server: {e}")
    sys.exit(1)
