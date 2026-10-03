from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session
from app.api.routers.auth import get_current_user
from app.models.user import User
from app.core.database import get_db
from app.services.databricks_llm_provider import get_databricks_llm_provider

router = APIRouter()

class TransformationRequest(BaseModel):
    prompt: str
    mapping_id: Optional[int] = None
    current_code: Optional[str] = None

class TransformationResponse(BaseModel):
    explanation: str
    code: str

@router.post("/generate", response_model=TransformationResponse)
def generate_transformation(
    req: TransformationRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    try:
        llm_model = getattr(user, "llm_model", None)
        databricks_workspace_url = getattr(user, "databricks_workspace_url", None)
        databricks_access_token = getattr(user, "databricks_access_token", None)

        provider = get_databricks_llm_provider(
            endpoint_name=llm_model,
            workspace_url=databricks_workspace_url,
            access_token=databricks_access_token
        )

        current_code_context = ""
        if req.current_code:
            current_code_context = f"\n\nHere is the current transformation code:\n```python\n{req.current_code}\n```\nModify or append to it as requested."

        llm_prompt = f"""You are an expert PySpark data engineer. The user has provided natural language instructions to transform a DataFrame `df`.
Assume `pyspark.sql.functions` is imported as `F`.
Write ONLY valid Python code using PySpark that implements the user's request. Do not provide explanations in the output code, just return the raw python code.

User Request: {req.prompt}{current_code_context}

Respond in the following JSON format ONLY:
{{
  "explanation": "A short, 1 sentence explanation of what you did",
  "code": "The raw python code"
}}
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
        except json.JSONDecodeError:
            explanation = "Here is your requested transformation code:"
            code = content
            
        return TransformationResponse(
            explanation=explanation,
            code=code
        )
    except Exception as e:
        # Fallback to simple matching if LLM fails
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
            code=code
        )
