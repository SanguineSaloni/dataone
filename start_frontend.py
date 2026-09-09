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
print("📁 Serving static files from 'out' directory...")
print()

# Navigate to the output directory and serve static files
os.chdir("out")

print("🚀 Starting Python HTTP server on port 8080...")
print("   Expected URLs:")
print(f"   - Home: http://0.0.0.0:8080/")
print(f"   - Login: http://0.0.0.0:8080/login/") 
print()

# Start Python HTTP server to serve static files
try:
    import http.server
    import socketserver
    
    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=".", **kwargs)
        
        def end_headers(self):
            # Add CORS headers for API calls
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
            super().end_headers()
    
    with socketserver.TCPServer(("0.0.0.0", 8080), Handler) as httpd:
        print("✅ Server started successfully!")
        print("📡 Serving static files on http://0.0.0.0:8080")
        httpd.serve_forever()
        
except KeyboardInterrupt:
    print("\n👋 Shutting down...")
    sys.exit(0)
except Exception as e:
    print(f"❌ Failed to start server: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
