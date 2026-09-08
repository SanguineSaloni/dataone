"""Data Quality Observatory (Enterprise v2, E06)."""
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import require_role
from app.core.database import get_db
from app.models.user import User
from app.schemas.dq import ConnectionScorecard, DQSummary
from app.services.dq_service import DataQualityService

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/summary", response_model=DQSummary)
def get_dq_summary(
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "analyst")),
):
    logger.info("[dq] stage=summary_requested user=%s", user.email)
    return DataQualityService(db).get_all_scorecards_summary()


@router.get("/scorecard/{connection_id}", response_model=ConnectionScorecard)
def get_dq_scorecard(
    connection_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "analyst")),
):
    logger.info("[dq] stage=scorecard_requested user=%s connection_id=%s", user.email, connection_id)
    card = DataQualityService(db).get_scorecard(connection_id)
    if card is None:
        raise HTTPException(status_code=404, detail="Connection not found")
    return card
