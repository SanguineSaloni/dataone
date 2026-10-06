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
from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File, Form
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.routers.auth import get_current_user
from app.core.database import get_db
from app.core.config import settings
from app.models.user import User
from app.models.ingestion_run import IngestionRun
from app.services.databricks_ingestion_service import DatabricksIngestionService
from app.services.audit_helper import record_audit

logger = logging.getLogger(__name__)
router = APIRouter()


class TriggerIngestionRequest(BaseModel):
    source_connection_id: int
    target_connection_id: Optional[int] = None
    target_catalog: Optional[str] = None
    target_schema: Optional[str] = None


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
            target_catalog=req.target_catalog or "workspace",
            target_schema=req.target_schema or "default",
            db=db,
            actor=user.email,
            user_token=None # Use M2M to avoid scope issues,
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
            user_token=None # Use M2M to avoid scope issues,
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
        user_token=None # Use M2M to avoid scope issues,
    )
@router.get("/catalogs")
def get_databricks_catalogs(
    request: Request,
    user: User = Depends(get_current_user)
):
    """Fetch available Databricks Unity Catalog names."""
    try:
        from app.services.databricks_ingestion_service import _get_workspace_client
        # M2M token fallback avoids OAuth scope issues
        wc = _get_workspace_client(None)
        catalogs = []
        for cat in wc.catalogs.list():
            catalogs.append({"name": cat.name})
        
        logger.info(f"[get_catalogs] Successfully fetched {len(catalogs)} catalogs for {user.email}")
        return {"catalogs": catalogs}
    except Exception as e:
        logger.error(f"[get_catalogs] Failed for user {user.email}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/catalogs/{catalog_name}/schemas")
def get_databricks_schemas(
    catalog_name: str,
    request: Request,
    user: User = Depends(get_current_user)
):
    """Fetch schemas within a Databricks catalog."""
    try:
        from app.services.databricks_ingestion_service import _get_workspace_client
        # M2M token fallback avoids OAuth scope issues
        wc = _get_workspace_client(None)
        schemas = []
        for schema in wc.schemas.list(catalog_name=catalog_name):
            schemas.append({"name": schema.name})
        
        logger.info(f"[get_schemas] Found {len(schemas)} schemas in {catalog_name}")
        return {"schemas": schemas}
    except Exception as e:
        logger.error(f"[get_schemas] Failed for catalog {catalog_name}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/runs/{ingestion_run_id}/tables")
def get_ingestion_tables(
    ingestion_run_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Get the list of tables ingested by a specific ingestion run.
    Returns metadata from the schema catalog that was populated after ingestion.
    """
    try:
        from app.services.schema_catalog_service import SchemaCatalogService
        from app.models.connection import DBConnection
        
        # Get the ingestion run
        run = db.query(IngestionRun).filter(IngestionRun.id == ingestion_run_id).first()
        if not run:
            raise HTTPException(status_code=404, detail=f"Ingestion run {ingestion_run_id} not found")
        
        # Get target catalog/schema from the run params
        params = run.trigger_params or {}
        target_catalog = params.get("dataone.target.catalog", "main")
        target_schema = params.get("dataone.target.schema", "dataone_ingested")
        source_db = params.get("dataone.source.database", "")
        
        # Find the Databricks connection for this catalog
        databricks_conn = (
            db.query(DBConnection)
            .filter(
                DBConnection.type == "databricks",
                DBConnection.is_deleted == False
            )
            .first()
        )
        
        if not databricks_conn:
            return {
                "run_id": ingestion_run_id,
                "status": run.status,
                "target_catalog": target_catalog,
                "target_schema": target_schema,
                "tables": [],
                "message": "No Databricks connection found. Tables may not have been cataloged yet."
            }
        
        # Get all tables for this connection
        tables = SchemaCatalogService.get_catalog(db, databricks_conn.id)
        
        # Filter tables that match the target catalog.schema and source prefix
        prefix = f"{target_catalog}.{target_schema}."
        source_prefix = f"{source_db}_" if source_db else ""
        
        ingested_tables = [
            {
                "id": t.id,
                "table_name": t.table_name,
                "short_name": t.table_name.replace(prefix, ""),
                "column_count": len(t.columns),
                "last_scanned_at": t.last_scanned_at.isoformat() if t.last_scanned_at else None,
                "columns": [
                    {
                        "id": col.id,
                        "column_name": col.column_name,
                        "data_type": col.data_type,
                        "nullable": col.nullable,
                        "is_primary_key": col.is_primary_key,
                    }
                    for col in sorted(t.columns, key=lambda c: c.ordinal_position)
                ]
            }
            for t in tables
            if t.table_name.startswith(prefix) and (not source_prefix or source_prefix in t.table_name)
        ]
        
        return {
            "run_id": ingestion_run_id,
            "status": run.status,
            "target_catalog": target_catalog,
            "target_schema": target_schema,
            "source_type": run.source_type,
            "tables": ingested_tables,
            "total": len(ingested_tables),
        }
        
    except Exception as e:
        logger.error("[databricks_ingest] get_ingestion_tables failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/upload-csv")
async def upload_csv(
    catalog: str = Form(...),
    schema_name: str = Form(default="default", alias="schema"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Upload a CSV directly to a Databricks Unity Catalog table."""
    import csv
    import io
    from app.services.databricks_ingestion_service import _get_workspace_client
    
    try:
        content = await file.read()
        text = content.decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(text))
        rows = list(reader)
        if not rows:
            raise HTTPException(status_code=400, detail="CSV is empty")
            
        # Clean table name
        table_name = file.filename.replace(".csv", "").replace("-", "_").replace(" ", "_")
        if not table_name[0].isalpha():
            table_name = "t_" + table_name
        full_table_name = f"{catalog}.{schema_name}.{table_name}"
        
        wc = _get_workspace_client(None)
        
        # We need the warehouse_id
        # We can get it from settings or just find a running warehouse
        from app.core.config import settings
        warehouse_id = getattr(settings, "DATABRICKS_SQL_WAREHOUSE_ID", None)
        if not warehouse_id:
            # Try to auto-detect a warehouse if not configured
            warehouses = list(wc.warehouses.list())
            if not warehouses:
                raise Exception("No Databricks SQL Warehouses available to execute the query.")
            warehouse_id = warehouses[0].id
            
        columns = list(rows[0].keys())
        col_defs = ", ".join([f"`{c}` STRING" for c in columns])
        
        def exec_sql(stmt: str):
            res = wc.statement_execution.execute_statement(
                warehouse_id=warehouse_id,
                statement=stmt,
                wait_timeout="50s"
            )
            
            # If still pending/running, wait for it
            import time
            while res.status and res.status.state and res.status.state.value in ('PENDING', 'RUNNING'):
                time.sleep(2)
                res = wc.statement_execution.get_statement(res.statement_id)
                
            if res.status and res.status.state and res.status.state.value == 'FAILED':
                err = res.status.error.message if res.status.error else "Unknown error"
                raise Exception(f"SQL execution failed: {err} \nStatement: {stmt[:100]}...")
            return res

        # Ensure catalog and schema exist
        exec_sql(f"CREATE CATALOG IF NOT EXISTS {catalog}")
        exec_sql(f"CREATE SCHEMA IF NOT EXISTS {catalog}.{schema_name}")
        
        # Create Table
        create_sql = f"CREATE TABLE IF NOT EXISTS {full_table_name} ({col_defs})"
        exec_sql(create_sql)
        
        # Insert rows in batches
        batch_size = 5000
        for i in range(0, len(rows), batch_size):
            batch = rows[i:i+batch_size]
            values = []
            for row in batch:
                row_vals = []
                for col in columns:
                    val = str(row.get(col, "")).replace("'", "''")
                    row_vals.append(f"'{val}'")
                values.append("(" + ", ".join(row_vals) + ")")
                
            insert_sql = f"INSERT INTO {full_table_name} ({', '.join([f'`{c}`' for c in columns])}) VALUES {', '.join(values)}"
            exec_sql(insert_sql)
            
        # Transfer ownership to user so they can see it
        try:
            exec_sql(f"ALTER CATALOG {catalog} OWNER TO `{user.email}`")
        except Exception as e:
            logger.warning(f"[databricks_ingest] Could not set catalog owner: {e}")
        try:
            exec_sql(f"ALTER SCHEMA {catalog}.{schema_name} OWNER TO `{user.email}`")
        except Exception as e:
            logger.warning(f"[databricks_ingest] Could not set schema owner: {e}")
        try:
            exec_sql(f"ALTER TABLE {full_table_name} OWNER TO `{user.email}`")
        except Exception as e:
            logger.warning(f"[databricks_ingest] Could not set table owner: {e}")
            
        # Record audit
        record_audit(db, "csv_uploaded", actor=user.email, payload={"table": full_table_name, "rows": len(rows)})
        db.commit()
            
        return {"message": "Success", "table": full_table_name, "rows": len(rows)}
        
    except Exception as e:
        logger.error(f"[databricks_ingest] CSV upload failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
