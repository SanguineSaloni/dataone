# DataOne - Local Development Setup

This branch (`local-dev`) contains the **original Docker Compose setup** for running DataOne locally on your laptop.

## Quick Start

1. **Clone this branch:**
   ```bash
   git clone -b local-dev https://github.com/SanguineSaloni/dataone.git
   cd dataone
   ```

2. **Copy environment file:**
   ```bash
   cp .env.example .env
   ```

3. **Start all services:**
   ```bash
   docker compose up -d --build
   ```

4. **Access the application:**
   - **Frontend:** http://localhost:3011
   - **Backend API:** http://localhost:8011
   - **API Docs:** http://localhost:8011/docs

## Services

| Service | Port | Description |
|---------|------|-------------|
| Frontend | 3011 | React/Next.js web interface |
| Backend | 8011 | FastAPI backend |
| PostgreSQL | 5432 | Database (internal) |
| Redis | 6379 | Message broker (internal) |
| Worker | - | Celery background tasks |
| Beat | - | Celery scheduler |

## Default Login

- **Email:** `admin@dataplane.ai`
- **Password:** `admin123`

## Development Branches

- `local-dev` (this branch) - Original Docker Compose setup
- `main` - Databricks Apps backend deployment
- `frontend-deploy` - Databricks Apps frontend deployment

## Features Available Locally

✅ Full multi-service architecture
✅ PostgreSQL database with persistence
✅ Redis for background tasks
✅ Celery workers for async processing
✅ All connectors (Databricks, MySQL, PostgreSQL, etc.)
✅ Schema drift detection
✅ AI features (if Ollama is running)
✅ Complete web UI

---

For **Databricks Apps deployment**, switch to `main` or `frontend-deploy` branches.