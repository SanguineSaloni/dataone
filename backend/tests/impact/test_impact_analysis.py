"""Tests for GET /api/v1/impact and ImpactAnalysisService (Enterprise v2, E07)."""
from __future__ import annotations

from sqlalchemy import event

from app.models.pipeline import Pipeline
from app.models.schema_catalog import CatalogColumn, CatalogTable, ColumnClassification
from app.models.semantic import SemanticLineage, SemanticMetricDefinition
from app.services.impact_service import ImpactAnalysisService


class TestImpactAPI:
    def test_mapping_traversal_uses_one_query_per_direction(
        self, db, engine, connections, published_mapping,
    ):
        src, tgt = connections
        source_id, target_id = src.id, tgt.id
        statements = []
        listener = lambda *args: statements.append(args[2])
        event.listen(engine, "before_cursor_execute", listener)
        try:
            service = ImpactAnalysisService(db)
            service._downstream_mappings(source_id, "users", "email")
            downstream_count = len([
                statement for statement in statements
                if statement.lstrip().upper().startswith("SELECT")
            ])
            statements.clear()
            service._upstream_mappings(target_id, "customers", "contact_email")
            upstream_count = len([
                statement for statement in statements
                if statement.lstrip().upper().startswith("SELECT")
            ])
        finally:
            event.remove(engine, "before_cursor_execute", listener)
        assert downstream_count == 1
        assert upstream_count == 1

    def test_anonymous_returns_401(self, make_client, connections):
        src, _ = connections
        assert make_client(None).get(f"/api/v1/impact?connection_id={src.id}&table=users").status_code == 401

    def test_viewer_forbidden(self, make_client, viewer, connections):
        src, _ = connections
        assert make_client(viewer).get(f"/api/v1/impact?connection_id={src.id}&table=users").status_code == 403

    def test_unknown_connection_returns_404(self, client):
        assert client.get("/api/v1/impact?connection_id=999999&table=users").status_code == 404

    def test_downstream_traversal_finds_the_real_mapping(self, client, connections, published_mapping):
        src, _ = connections
        data = client.get(f"/api/v1/impact?connection_id={src.id}&table=users&column=email").json()
        assert len(data["downstream"]) == 1
        assert data["downstream"][0]["target_table"] == "customers"
        assert data["downstream"][0]["target_column"] == "contact_email"
        assert data["upstream"] == []

    def test_upstream_traversal_finds_the_real_mapping(self, client, connections, published_mapping):
        _, tgt = connections
        data = client.get(f"/api/v1/impact?connection_id={tgt.id}&table=customers&column=contact_email").json()
        assert len(data["upstream"]) == 1
        assert data["upstream"][0]["source_table"] == "users"
        assert data["upstream"][0]["source_column"] == "email"
        assert data["downstream"] == []

    def test_unrelated_column_has_no_impact(self, client, connections, published_mapping):
        src, _ = connections
        data = client.get(f"/api/v1/impact?connection_id={src.id}&table=users&column=unrelated_col").json()
        assert data["downstream"] == []
        assert data["risk_score"] == 0

    def test_affected_pipeline_surfaces(self, client, db, connections, published_mapping):
        src, tgt = connections
        mapping, version = published_mapping
        pipeline = Pipeline(name="Nightly Sync", source_connection_id=src.id, target_connection_id=tgt.id,
                            mapping_id=mapping.id, mapping_version_id=version.id, created_by="test")
        db.add(pipeline)
        db.commit()

        data = client.get(f"/api/v1/impact?connection_id={src.id}&table=users&column=email").json()
        assert len(data["affected_pipelines"]) == 1
        assert data["affected_pipelines"][0]["pipeline_name"] == "Nightly Sync"

    def test_disabled_pipeline_is_excluded(self, client, db, connections, published_mapping):
        src, tgt = connections
        mapping, version = published_mapping
        pipeline = Pipeline(name="Retired Sync", source_connection_id=src.id, target_connection_id=tgt.id,
                            mapping_id=mapping.id, mapping_version_id=version.id, created_by="test",
                            enabled=False)
        db.add(pipeline)
        db.commit()

        data = client.get(f"/api/v1/impact?connection_id={src.id}&table=users&column=email").json()
        assert data["affected_pipelines"] == []

    def test_affected_metric_surfaces(self, client, db, connections):
        src, _ = connections
        table = CatalogTable(connection_id=src.id, table_name="orders")
        db.add(table)
        db.flush()
        col = CatalogColumn(table_id=table.id, column_name="amount", data_type="DECIMAL")
        db.add(col)
        db.flush()
        metric = SemanticMetricDefinition(name="Total Revenue", status="published", definition={})
        db.add(metric)
        db.flush()
        db.add(SemanticLineage(metric_id=metric.id, catalog_column_id=col.id, role="measure"))
        db.commit()

        data = client.get(f"/api/v1/impact?connection_id={src.id}&table=orders&column=amount").json()
        assert len(data["affected_metrics"]) == 1
        assert data["affected_metrics"][0]["metric_name"] == "Total Revenue"

    def test_draft_metric_is_excluded(self, client, db, connections):
        src, _ = connections
        table = CatalogTable(connection_id=src.id, table_name="orders")
        db.add(table)
        db.flush()
        col = CatalogColumn(table_id=table.id, column_name="amount", data_type="DECIMAL")
        db.add(col)
        db.flush()
        metric = SemanticMetricDefinition(name="Draft Metric", status="draft", definition={})
        db.add(metric)
        db.flush()
        db.add(SemanticLineage(metric_id=metric.id, catalog_column_id=col.id, role="measure"))
        db.commit()

        data = client.get(f"/api/v1/impact?connection_id={src.id}&table=orders&column=amount").json()
        assert data["affected_metrics"] == []

    def test_pii_column_raises_risk_score(self, client, db, connections, published_mapping):
        src, _ = connections
        table = CatalogTable(connection_id=src.id, table_name="users")
        db.add(table)
        db.flush()
        col = CatalogColumn(table_id=table.id, column_name="email", data_type="TEXT")
        db.add(col)
        db.flush()
        db.add(ColumnClassification(column_id=col.id, label="PII", level="High", confidence=0.9, method="value_pattern"))
        db.commit()

        with_pii = client.get(f"/api/v1/impact?connection_id={src.id}&table=users&column=email").json()
        assert with_pii["is_pii"] is True
        assert with_pii["risk_score"] > 15  # base mapping consumer (15) + PII (25)

    def test_affected_reports_and_ml_models_are_honestly_empty(self, client, connections, published_mapping):
        src, _ = connections
        data = client.get(f"/api/v1/impact?connection_id={src.id}&table=users&column=email").json()
        assert data["affected_reports"] == []
        assert data["affected_ml_models"] == []

    def test_table_level_query_without_column_aggregates_all_columns(self, client, connections, published_mapping):
        src, _ = connections
        data = client.get(f"/api/v1/impact?connection_id={src.id}&table=users").json()
        assert data["column"] is None
        assert len(data["downstream"]) == 1
