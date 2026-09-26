import logging
import json
import math
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from app.services.databricks_llm_provider import get_databricks_llm_provider
from app.core.config import settings

logger = logging.getLogger(__name__)

# ── 1. Pydantic Models for LLM Structured Output ───────────────────────────

class LLMMappingResponse(BaseModel):
    target_column: str = Field(description="The exact name of the target column matched.")
    semantic_score: float = Field(description="Semantic match score between 0.0 and 1.0.")
    reasoning: str = Field(description="Why this column was chosen.")

class ReMatchEngine:
    """
    ReMatch Schema Mapping Engine.
    Uses hybrid scoring (In-memory Vector similarity + Rule-based + LLM semantic reasoning).
    """

    def __init__(self, db: Session, user_llm_model: Optional[str] = None):
        self.db = db
        # Use user's selected model or fallback to default
        self.llm_model = user_llm_model or settings.DATABRICKS_LLM_ENDPOINT or "databricks-meta-llama-3-3-70b-instruct"
        self.embedding_endpoint = "databricks-bge-large-en"

    def _get_embedding(self, text: str) -> List[float]:
        """Call Databricks Model Serving to get vector embedding."""
        if not settings.DATABRICKS_WORKSPACE_URL or not settings.DATABRICKS_ACCESS_TOKEN:
            # Fallback mock for local dev without Databricks
            return [0.1] * 1024
            
        import requests
        url = f"{settings.DATABRICKS_WORKSPACE_URL.rstrip('/')}/serving-endpoints/{self.embedding_endpoint}/invocations"
        headers = {"Authorization": f"Bearer {settings.DATABRICKS_ACCESS_TOKEN}", "Content-Type": "application/json"}
        try:
            resp = requests.post(url, headers=headers, json={"inputs": [text]}, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                return data["predictions"][0]
        except Exception as e:
            logger.error(f"Embedding failed: {e}")
        return [0.1] * 1024

    def _cosine_similarity(self, vec1: List[float], vec2: List[float]) -> float:
        """Calculate cosine similarity between two vectors."""
        if len(vec1) != len(vec2):
            return 0.0
        dot_product = sum(a * b for a, b in zip(vec1, vec2))
        magnitude1 = math.sqrt(sum(a * a for a in vec1))
        magnitude2 = math.sqrt(sum(b * b for b in vec2))
        if magnitude1 == 0.0 or magnitude2 == 0.0:
            return 0.0
        return dot_product / (magnitude1 * magnitude2)

    def _type_compatibility_score(self, src_type: str, tgt_type: str) -> float:
        """Rule-based Data Type Compatibility Matrix (Returns 0.0 to 1.0)."""
        src = str(src_type).lower()
        tgt = str(tgt_type).lower()
        
        # Exact match
        if src == tgt:
            return 1.0
            
        # Numeric grouping
        numerics = {"int", "integer", "bigint", "smallint", "decimal", "numeric", "float", "double"}
        if src in numerics and tgt in numerics:
            return 0.9
            
        # String/Text grouping
        strings = {"varchar", "text", "string", "char"}
        if any(s in src for s in strings) and any(t in tgt for t in strings):
            return 1.0
            
        # String can hold anything (coercion)
        if any(t in tgt for t in strings):
            return 0.5
            
        return 0.0

    def map_schemas(self, source_schema: Dict[str, List[Dict[str, Any]]], target_schema: Dict[str, List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
        """
        Main execution flow using IN-MEMORY vector search.
        1. Embed targets into memory.
        2. Embed each source column.
        3. Filter Top-2 targets using in-memory cosine similarity.
        4. LLM reasoning on the filtered context.
        5. Hybrid confidence calculation.
        """
        try:
            llm_provider = get_databricks_llm_provider(endpoint_name=self.llm_model)
        except ValueError:
            logger.warning("Databricks credentials missing. Using mocked LLM for ReMatchEngine.")
            llm_provider = None
        
        # 1. Pre-compute Target Embeddings in Memory
        target_embeddings = []
        for table_name, columns in target_schema.items():
            col_docs = [f"{c['name']} ({c.get('type', 'UNKNOWN')})" for c in columns]
            doc = f"Table: {table_name}. Columns: {', '.join(col_docs)}."
            emb = self._get_embedding(doc)
            target_embeddings.append({
                "table_name": table_name,
                "document": doc,
                "embedding": emb
            })
            
        mappings = []
        
        # 2. Iterate Source Columns
        for src_table, src_cols in source_schema.items():
            for src_col in src_cols:
                src_name = src_col["name"]
                src_type = src_col.get("type", "UNKNOWN")
                src_doc = f"Source Table: {src_table}, Column: {src_name}, Type: {src_type}"
                
                src_emb = self._get_embedding(src_doc)
                
                # 3. Calculate Cosine Similarity to all target tables
                scored_targets = []
                for tgt in target_embeddings:
                    sim = self._cosine_similarity(src_emb, tgt["embedding"])
                    scored_targets.append({
                        "table_name": tgt["table_name"],
                        "document": tgt["document"],
                        "similarity": sim
                    })
                
                # Sort descending and take Top 2
                scored_targets.sort(key=lambda x: x["similarity"], reverse=True)
                top_targets = scored_targets[:2]
                
                if not top_targets:
                    continue
                
                # 4. Build context for LLM
                context_str = "\n".join([f"- {t['table_name']}: {t['document']}" for t in top_targets])
                
                prompt = f"""
You are a database schema mapping assistant. Find the best matching target column for the following source column.

SOURCE COLUMN:
Table: {src_table}
Column: {src_name}
Type: {src_type}

CANDIDATE TARGET TABLES:
{context_str}

Return a JSON object with 'target_column', 'semantic_score' (0.0-1.0), and 'reasoning'.
"""
                try:
                    if llm_provider:
                        response = llm_provider.generate(prompt=prompt, stream=False)
                        text_resp = response.get("response", "{}")
                        if "```json" in text_resp:
                            text_resp = text_resp.split("```json")[1].split("```")[0]
                        
                        llm_result = json.loads(text_resp)
                    else:
                        # MOCK RESPONSE for local testing without credentials
                        # Just pick the first target column as a naive mock
                        llm_result = {
                            "target_column": top_targets[0]["table_name"].split(".")[-1] + "_col", # Dummy 
                            "semantic_score": 0.85,
                            "reasoning": "Mocked LLM reasoning because Databricks tokens are missing."
                        }
                        # Better mock: just pick the very first column from the best target table
                        t_name = top_targets[0]["table_name"]
                        if target_schema.get(t_name) and len(target_schema[t_name]) > 0:
                            llm_result["target_column"] = target_schema[t_name][0]["name"]
                            
                    tgt_col_name = llm_result.get("target_column")
                    llm_score = float(llm_result.get("semantic_score", 0.0))
                    reasoning = llm_result.get("reasoning", "No reasoning provided.")
                    
                except Exception as e:
                    logger.error(f"LLM mapping failed for {src_name}: {e}")
                    tgt_col_name = None
                    llm_score = 0.0
                    reasoning = f"LLM error: {e}"

                if not tgt_col_name:
                    continue

                # Find which target table this column belongs to (from the top 2)
                tgt_table_name = None
                tgt_type = "UNKNOWN"
                for t in top_targets:
                    t_name = t["table_name"]
                    for c in target_schema.get(t_name, []):
                        if c["name"].lower() == tgt_col_name.lower():
                            tgt_table_name = t_name
                            tgt_type = c.get("type", "UNKNOWN")
                            break
                    if tgt_table_name:
                        break
                        
                if not tgt_table_name:
                    continue 

                # 5. Compute hybrid score
                best_sim = top_targets[0]["similarity"]
                type_score = self._type_compatibility_score(src_type, tgt_type)
                
                # Hybrid Formula: Vector(30%) + Rules(20%) + LLM(50%)
                final_confidence = (0.3 * best_sim) + (0.2 * type_score) + (0.5 * llm_score)
                
                mappings.append({
                    "source_table": src_table,
                    "source_column": src_name,
                    "target_table": tgt_table_name,
                    "target_column": tgt_col_name,
                    "confidence_score": round(final_confidence, 2),
                    "data_type_compatible": type_score >= 0.5,
                    "reasoning": reasoning
                })
                
        return mappings
