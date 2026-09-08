"""Impact Analysis (Enterprise v2, E07) — v1 live traversal over existing
mapping/pipeline/semantic relations. See impact_service.py for scope."""
import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import require_role
from app.core.database import get_db
from app.models.user import User
from app.schemas.impact import ImpactResult
from app.services.impact_service import ImpactAnalysisService

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("", response_model=ImpactResult)
def get_impact(
    connection_id: int = Query(...),
    table: str = Query(...),
    column: str | None = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "analyst")),
):
    logger.info("[impact] stage=requested user=%s connection_id=%s table=%s column=%s",
                user.email, connection_id, table, column)
    result = ImpactAnalysisService(db).get_impact(connection_id, table, column)
    if result is None:
        raise HTTPException(status_code=404, detail="Connection not found")
    return result
