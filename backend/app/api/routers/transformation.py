from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from app.api.routers.auth import get_current_user
from app.models.user import User
from app.models.mapping import Mapping
from app.core.database import get_db
from app.services.databricks_llm_provider import get_databricks_llm_provider
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


class TransformationRequest(BaseModel):
    prompt: str
    mapping_id: Optional[int] = None
    current_code: Optional[str] = None
    # Optional table context to make LLM smarter
    columns: Optional[List[str]] = None


class TransformationResponse(BaseModel):
    explanation: str
    code: str
    # Inline patch preview: list of {pk_col, pk_val, col, new_val} commands
    patches: Optional[List[Dict[str, Any]]] = None


class PreviewResponse(BaseModel):
    cols: List[str]
    clean_rows: List[List[Any]]      # rows with no nulls
    unclean_rows: List[List[Any]]    # rows with at least one null / blank value
    source_table: str


@router.get("/preview/{mapping_id}", response_model=PreviewResponse)
def get_table_preview(
    mapping_id: int,
    limit: int = 200,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Fetch a sample of the source table for the given mapping.
    Returns rows split into clean (no NULLs) and unclean (has NULLs/blanks).
    """
    m = db.query(Mapping).filter(Mapping.id == mapping_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Mapping not found")

    # Derive source table from mapping name  e.g. "Map cat.schema.tbl → ..."
    source_table = None
    if m.name and " \u2192 " in m.name:
        source_table = m.name.split(" \u2192 ")[0].replace("Map ", "").strip()

    if not source_table:
        raise HTTPException(status_code=422, detail="Cannot determine source table from mapping")

    try:
        from databricks.sdk.runtime import dbutils  # available inside Databricks Apps
        import importlib
        pyspark_sql = importlib.import_module("pyspark.sql")
        SparkSession = pyspark_sql.SparkSession
        spark = SparkSession.builder.getOrCreate()

        df = spark.table(source_table).limit(limit)
        cols = df.columns
        rows_raw = df.collect()

        all_rows = [[row[c] for c in cols] for row in rows_raw]

        clean_rows = [r for r in all_rows if all(v is not None and str(v).strip() != "" for v in r)]
        unclean_rows = [r for r in all_rows if any(v is None or str(v).strip() == "" for v in r)]

        return PreviewResponse(
            cols=cols,
            clean_rows=clean_rows,
            unclean_rows=unclean_rows,
            source_table=source_table,
        )
    except Exception as e:
        logger.error("Preview fetch failed for mapping %s: %s", mapping_id, e)
        raise HTTPException(status_code=500, detail=f"Failed to fetch table preview: {str(e)}")


@router.post("/generate", response_model=TransformationResponse)
def generate_transformation(
    req: TransformationRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Use Databricks LLM to generate PySpark transformation code from a natural language prompt.
    Also extracts any inline row-level patches the user requested (e.g. "fill id=5 name with John").
    """
    try:
        llm_model = getattr(user, "llm_model", None)
        databricks_workspace_url = getattr(user, "databricks_workspace_url", None)
        databricks_access_token = getattr(user, "databricks_access_token", None)

        provider = get_databricks_llm_provider(
            endpoint_name=llm_model,
            workspace_url=databricks_workspace_url,
            access_token=databricks_access_token,
        )

        current_code_context = ""
        if req.current_code:
            current_code_context = f"\n\nHere is the current transformation code:\n```python\n{req.current_code}\n```\nModify or append to it as requested."

        columns_context = ""
        if req.columns:
            columns_context = f"\nKnown columns: {req.columns}"

        llm_prompt = f"""You are an expert PySpark data engineer and data cleaning specialist. The user has provided natural language instructions to transform a DataFrame `df`.
Assume `pyspark.sql.functions` is imported as `F`.{columns_context}

User Request: {req.prompt}{current_code_context}

If the user is asking to SET a specific value in a specific row (e.g. "fill record with id = 5 name with John"),
extract that as a "patch" object AND also generate the PySpark code.

Respond in the following JSON format ONLY:
{{
  "explanation": "A short, 1 sentence explanation of what you did",
  "code": "The raw python PySpark code that applies to the full dataframe",
  "patches": [
    {{"pk_col": "id", "pk_val": 5, "col": "name", "new_val": "John"}}
  ]
}}

If there are no specific row patches, return patches as an empty array [].
"""

        response = provider.generate(prompt=llm_prompt, stream=False)
        content = response.get("response", "")

        import json
        import re

        try:
            clean_content = re.sub(r'```json\n|```', '', content).strip()
            parsed = json.loads(clean_content)
            explanation = parsed.get("explanation", "Here is your requested transformation code:")
            code = parsed.get("code", content)
            patches = parsed.get("patches", [])
        except json.JSONDecodeError:
            explanation = "Here is your requested transformation code:"
            code = content
            patches = []

        return TransformationResponse(
            explanation=explanation,
            code=code,
            patches=patches,
        )
    except Exception as e:
        logger.error("LLM transformation generation failed: %s", e)
        # Fallback to simple rule-based matching
        prompt = req.prompt.lower()
        code = req.current_code or ""
        if not code:
            code = "# AI Generated Transformation\n# DataFrame is provided as 'df' and pyspark.sql.functions as 'F'\n"

        explanation = f"I've added the transformation: {req.prompt}"

        if "null" in prompt and "unknown" in prompt:
            col = "status" if "status" in prompt else "column_name"
            code += f"\ndf = df.fillna('unknown', subset=['{col}'])\n"
        elif "full_name" in prompt or ("first" in prompt and "last" in prompt):
            code += "\ndf = df.withColumn('full_name', F.concat_ws(' ', F.col('first_name'), F.col('last_name')))\n"
        elif "drop" in prompt:
            code += "\ndf = df.drop('status')\n"
        elif "filter" in prompt and "null" in prompt:
            code += "\ndf = df.filter(F.col('id').isNotNull())\n"
        else:
            explanation = "I generated a custom PySpark transformation based on your prompt."
            code += f"\n# User requested: {req.prompt}\n# df = df.withColumn('new_col', F.lit('sample'))\n"

        return TransformationResponse(
            explanation=explanation + " (Fallback mode active due to LLM error)",
            code=code,
            patches=[],
        )
