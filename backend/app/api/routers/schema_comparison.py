"""Schema Comparison Mode (Enterprise v2, E12) — side-by-side schema diff."""
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import require_role
from app.core.database import get_db
from app.models.connection import DBConnection
from app.models.user import User
from app.schemas.schema_comparison import SchemaComparisonResult
from app.services.schema_comparison_service import SchemaComparisonService
from app.services.schema_service import SchemaService

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("", response_model=SchemaComparisonResult)
def compare_schemas(
    source_id: int,
    target_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_role("admin", "analyst")),
):
    source_conn = db.query(DBConnection).filter(DBConnection.id == source_id).first()
    target_conn = db.query(DBConnection).filter(DBConnection.id == target_id).first()
    if not source_conn or not target_conn:
        raise HTTPException(status_code=404, detail="Source or target connection not found")

    logger.info("[schema_comparison] stage=compare user=%s source_id=%s target_id=%s",
                user.email, source_id, target_id)

    try:
        source_schema = SchemaService.get_full_schema(source_conn)
        target_schema = SchemaService.get_full_schema(target_conn)
    except Exception as exc:  # noqa: BLE001 — a live connector failure should be a clean 502, not a 500 stack trace
        logger.warning("[schema_comparison] connector unreachable: %s", exc)
        raise HTTPException(status_code=502, detail=f"Could not read live schema: {exc}") from exc

    result = SchemaComparisonService.compare(source_schema, target_schema)
    return {
        "source_id": source_id, "source_name": source_conn.name,
        "target_id": target_id, "target_name": target_conn.name,
        **result,
    }
