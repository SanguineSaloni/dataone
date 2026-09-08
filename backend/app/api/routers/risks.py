"""Risk & Compliance Center (Enterprise v2, E05).

One authenticated read endpoint aggregating existing risk signals into a
unified register. See RiskAggregationService for what it does and does
not detect — this router only exposes it.
"""
import logging

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import require_role
from app.core.database import get_db
from app.models.user import User
from app.schemas.risk import RiskCategory, RiskRegister, RiskSeverity
from app.services.risk_service import RiskAggregationService

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("", response_model=RiskRegister)
def get_risk_register(
    category: RiskCategory | None = Query(None),
    severity: RiskSeverity | None = Query(None),
    connection_id: int | None = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "analyst")),
):
    logger.info("[risk] stage=register_requested user=%s category=%s severity=%s", user.email, category, severity)
    return RiskAggregationService(db).get_register(
        category=category, severity=severity, connection_id=connection_id,
    )
