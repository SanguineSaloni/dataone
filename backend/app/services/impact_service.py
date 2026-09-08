"""Impact Analysis (Enterprise v2, E07) — v1 scope.

The spec's E07-1 calls for traversal "over the E02 lineage store"
(E02-9) — a persisted, tenant-scoped, multi-hop `lineage_edge` table.
E02-9 is `[!]` blocked on the tenant-isolation runtime foundation not
existing yet (see requirements-specs/enterprise_v2/E02_topology_lineage.md).

This is a deliberately narrower v1: a LIVE traversal directly over the
relational structure that already exists — published mappings
(FieldMapping), pipelines that execute a mapping, and semantic metrics
that read a catalog column — rather than a generalized lineage-edge
abstraction. It answers the real question ("what breaks if I change
this column?") for what's actually declared today; it does not claim to
find dependencies the platform has no record of.
"""
from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.orm import Session

from app.models.connection import DBConnection
from app.models.mapping import FieldMapping, Mapping
from app.models.pipeline import Pipeline
from app.models.schema_catalog import CatalogColumn, CatalogTable, ColumnClassification
from app.models.semantic import SemanticLineage, SemanticMetricDefinition

logger = logging.getLogger(__name__)


class ImpactAnalysisService:
    def __init__(self, db: Session):
        self.db = db

    def get_impact(self, connection_id: int, table: str, column: str | None = None) -> dict[str, Any] | None:
        conn = self.db.query(DBConnection).filter(DBConnection.id == connection_id).first()
        if conn is None:
            return None

        logger.info("[impact] stage=traverse connection_id=%s table=%s column=%s", connection_id, table, column)

        downstream_mappings = self._downstream_mappings(connection_id, table, column)
        upstream_mappings = self._upstream_mappings(connection_id, table, column)
        affected_pipelines = self._affected_pipelines([m["mapping_id"] for m in downstream_mappings])
        affected_metrics = self._affected_metrics(connection_id, table, column)
        is_pii = self._is_pii(connection_id, table, column) if column else False

        consumer_count = len(downstream_mappings) + len(affected_pipelines) + len(affected_metrics)
        risk_score = self._risk_score(consumer_count, is_pii, len(affected_pipelines))

        return {
            "connection_id": connection_id,
            "connection_name": conn.name,
            "table": table,
            "column": column,
            "upstream": upstream_mappings,
            "downstream": downstream_mappings,
            "affected_pipelines": affected_pipelines,
            "affected_metrics": affected_metrics,
            "affected_reports": [],   # no report/dashboard registry exists yet — honestly empty, not fabricated
            "affected_ml_models": [],  # no ML model registry exists yet — honestly empty, not fabricated
            "is_pii": is_pii,
            "risk_score": risk_score,
            "risk_score_explanation": (
                f"{consumer_count} declared consumer(s)"
                + (f", {len(affected_pipelines)} pipeline(s)" if affected_pipelines else "")
                + (", touches PII" if is_pii else "")
            ),
        }

    # ── Downstream: this table/column is a SOURCE for these mappings ──
    def _downstream_mappings(self, connection_id: int, table: str, column: str | None) -> list[dict[str, Any]]:
        rows = (
            self.db.query(Mapping, FieldMapping)
            .join(FieldMapping, FieldMapping.version_id == Mapping.current_version_id)
            .filter(
                Mapping.source_id == connection_id,
                Mapping.deleted_at.is_(None),
            )
            .all()
        )
        out = []
        for mapping, edge in rows:
            for src in (edge.sources or []):
                if src.get("table") != table:
                    continue
                if column is not None and src.get("column") != column:
                    continue
                out.append({
                    "mapping_id": mapping.id,
                    "mapping_name": mapping.name,
                    "target_table": edge.target_table,
                    "target_column": edge.target_column,
                    "source_column": src.get("column"),
                })
        return out

    # ── Upstream: this table/column is a TARGET of these mappings ─────
    def _upstream_mappings(self, connection_id: int, table: str, column: str | None) -> list[dict[str, Any]]:
        query = (
            self.db.query(Mapping, FieldMapping)
            .join(FieldMapping, FieldMapping.version_id == Mapping.current_version_id)
            .filter(
                Mapping.target_id == connection_id,
                Mapping.deleted_at.is_(None),
                FieldMapping.target_table == table,
            )
        )
        if column is not None:
            query = query.filter(FieldMapping.target_column == column)
        rows = query.all()
        out = []
        for mapping, edge in rows:
            for src in (edge.sources or []):
                out.append({
                    "mapping_id": mapping.id,
                    "mapping_name": mapping.name,
                    "source_table": src.get("table"),
                    "source_column": src.get("column"),
                    "target_column": edge.target_column,
                })
        return out

    def _affected_pipelines(self, mapping_ids: list[int]) -> list[dict[str, Any]]:
        if not mapping_ids:
            return []
        pipelines = (
            self.db.query(Pipeline)
            .filter(Pipeline.mapping_id.in_(mapping_ids), Pipeline.enabled.is_(True))
            .all()
        )
        return [{"pipeline_id": p.id, "pipeline_name": p.name, "mapping_id": p.mapping_id} for p in pipelines]

    def _affected_metrics(self, connection_id: int, table: str, column: str | None) -> list[dict[str, Any]]:
        query = (
            self.db.query(SemanticMetricDefinition, CatalogColumn, CatalogTable)
            .join(SemanticLineage, SemanticLineage.metric_id == SemanticMetricDefinition.id)
            .join(CatalogColumn, SemanticLineage.catalog_column_id == CatalogColumn.id)
            .join(CatalogTable, CatalogColumn.table_id == CatalogTable.id)
            .filter(CatalogTable.connection_id == connection_id, CatalogTable.table_name == table)
            .filter(SemanticMetricDefinition.status == "published")
        )
        if column is not None:
            query = query.filter(CatalogColumn.column_name == column)
        return [
            {"metric_id": metric.id, "metric_name": metric.name, "column": col.column_name}
            for metric, col, _table in query.all()
        ]

    def _is_pii(self, connection_id: int, table: str, column: str) -> bool:
        row = (
            self.db.query(ColumnClassification)
            .join(CatalogColumn, ColumnClassification.column_id == CatalogColumn.id)
            .join(CatalogTable, CatalogColumn.table_id == CatalogTable.id)
            .filter(
                CatalogTable.connection_id == connection_id,
                CatalogTable.table_name == table,
                CatalogColumn.column_name == column,
                ColumnClassification.label.in_(["PII", "Sensitive"]),
            )
            .first()
        )
        return row is not None

    def _risk_score(self, consumer_count: int, is_pii: bool, pipeline_count: int) -> int:
        """0-100, explainable — not a black box. Documented weights:
        each consumer +15 (capped), a pipeline dependency +10 extra
        (breaking a running pipeline is worse than an idle mapping),
        PII involvement +25."""
        score = min(60, consumer_count * 15) + min(20, pipeline_count * 10) + (25 if is_pii else 0)
        return min(100, score)
