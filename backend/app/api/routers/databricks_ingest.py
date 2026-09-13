"""
Databricks Ingestion router.

POST /api/v1/databricks/ingest/trigger         — trigger ingestion for a source/target
GET  /api/v1/databricks/ingest/runs/{id}        — get run status
GET  /api/v1/databricks/ingest/runs             — list recent runs
GET  /api/v1/databricks/ingest/pipelines        — list pipeline catalog
POST /api/v1/databricks/ingest/genie            — Genie AI query
"""
import logging
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.routers.auth import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.models.ingestion_run import IngestionRun
from app.services.databricks_ingestion_service import DatabricksIngestionService
from app.services.audit_helper import record_audit

logger = logging.getLogger(__name__)
router = APIRouter()


class TriggerIngestionRequest(BaseModel):
    source_connection_id: int
    target_connection_id: Optional[int] = None


class GenieRequest(BaseModel):
    question: str
    space_id: Optional[str] = None


def _get_user_token(request: Request) -> Optional[str]:
    """Extract bearer token from request for pass-through to Databricks."""
    auth = request.headers.get("Authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:]
    return None


@router.post("/trigger", status_code=202)
def trigger_ingestion(
    req: TriggerIngestionRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Trigger a Databricks ingestion pipeline for the given source/target connection."""
    logger.info(
        "[databricks_ingest] stage=trigger source=%s target=%s actor=%s",
        req.source_connection_id, req.target_connection_id, user.email,
    )
    try:
        result = DatabricksIngestionService.trigger_ingestion(
            source_connection_id=req.source_connection_id,
            target_connection_id=req.target_connection_id,
            db=db,
            actor=user.email,
            user_token=_get_user_token(request),
        )
        record_audit(db, "ingestion_triggered", actor=user.email,
                     payload={"run_id": result.get("id"), "source_type": result.get("source_type")})
        db.commit()
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error("[databricks_ingest] stage=trigger_failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Failed to trigger ingestion: {str(e)}")


@router.get("/runs/{ingestion_run_id}")
def get_run_status(
    ingestion_run_id: int,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get the status of an ingestion run (polls Databricks for live status)."""
    try:
        return DatabricksIngestionService.get_run_status(
            ingestion_run_id=ingestion_run_id,
            db=db,
            user_token=_get_user_token(request),
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error("[databricks_ingest] stage=status_failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/runs")
def list_runs(
    limit: int = 20,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List recent ingestion runs."""
    from app.services.databricks_ingestion_service import _run_to_dict
    runs = db.query(IngestionRun).order_by(IngestionRun.created_at.desc()).limit(limit).all()
    return {"items": [_run_to_dict(r) for r in runs], "total": len(runs)}


@router.get("/pipelines")
def list_pipelines(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List all registered ingestion pipeline catalog entries."""
    return {"pipelines": DatabricksIngestionService.list_pipelines(db)}


@router.post("/genie")
def trigger_genie(
    req: GenieRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Trigger a Databricks Genie AI natural language query."""
    return DatabricksIngestionService.trigger_genie(
        question=req.question,
        db=db,
        actor=user.email,
        space_id=req.space_id,
        user_token=_get_user_token(request),
    )
