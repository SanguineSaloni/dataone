#!/usr/bin/env python3
"""
Entry point for DataOne Frontend in Databricks Apps.
Sets environment variables and starts the Next.js application.
"""
import os
import sys
import subprocess

# Get backend API URL from environment or use default
backend_url = os.getenv("BACKEND_API_URL", "http://localhost:8080")

print("=" * 60)
print("Starting DataOne Frontend in Databricks Apps mode")
print("=" * 60)
print(f"✅ Environment configured")
print(f"   Backend API URL: {backend_url}")
print(f"   Frontend Port: 8080")
print()

# Set Next.js environment variables
os.environ["NEXT_PUBLIC_API_URL"] = backend_url
os.environ["PORT"] = "8080" 
os.environ["HOSTNAME"] = "0.0.0.0"

# Change to frontend directory
try:
    os.chdir("frontend")
except FileNotFoundError:
    # Already in the right directory or frontend is at root
    pass

print("🏗️  Installing Node.js dependencies...")
print()

# First, install npm packages
install_result = subprocess.run(
    ["npm", "install"],
    capture_output=False,
    text=True
)

if install_result.returncode != 0:
    print("❌ npm install failed!")
    sys.exit(1)

print()
print("✅ Dependencies installed!")
print()
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
print("🚀 Starting Next.js production server on port 8080...")
print()

# Start the Next.js production server
try:
    # Start with explicit host and port for Databricks Apps
    subprocess.run([
        "npm", "run", "start", "--", 
        "--hostname", "0.0.0.0",
        "--port", "8080"
    ], check=True)
except KeyboardInterrupt:
    print("\n👋 Shutting down...")
    sys.exit(0)
except Exception as e:
    print(f"❌ Failed to start server: {e}")
    sys.exit(1)
