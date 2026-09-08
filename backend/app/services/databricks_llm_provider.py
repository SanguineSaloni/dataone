"""
Databricks Model Serving LLM provider.

This provides an alternative to Ollama for AI features, allowing DataOne to use:
- Databricks Foundation Model APIs (DBRX, Llama, etc.)
- Customer's own fine-tuned models on Model Serving
- Genie for specialized SQL generation

DELEGATE: LLM inference to Databricks (per assessment).
KEEP: Local Ollama as fallback for non-Databricks deployments (multi-source).
"""
import logging
import requests
import json
from typing import Dict, Any, Optional, List
from app.core.config import settings

logger = logging.getLogger(__name__)


class DatabricksLLMProvider:
    """
    LLM provider that uses Databricks Model Serving or Foundation Model APIs.
    
    Compatible with the existing AIService interface - drop-in replacement for Ollama.
    """
    
    def __init__(
        self,
        workspace_url: str,
        access_token: str,
        endpoint_name: Optional[str] = None,
        model_name: Optional[str] = None
    ):
        """
        Initialize Databricks LLM provider.
        
        Args:
            workspace_url: Databricks workspace URL (e.g., https://xxx.cloud.databricks.com)
            access_token: Access token for authentication
            endpoint_name: Model Serving endpoint name (optional, for custom models)
            model_name: Foundation model name (optional, e.g., 'databricks-dbrx-instruct')
        """
        self.workspace_url = workspace_url.rstrip('/')
        self.access_token = access_token
        self.endpoint_name = endpoint_name
        self.model_name = model_name or "databricks-dbrx-instruct"
        
        # Determine API endpoint
        if endpoint_name:
            # Custom model on Model Serving
            self.api_url = f"{self.workspace_url}/serving-endpoints/{endpoint_name}/invocations"
        else:
            # Foundation Model API
            self.api_url = f"{self.workspace_url}/serving-endpoints/databricks-dbrx-instruct/invocations"
    
    def generate(
        self,
        prompt: str,
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 1000,
        stream: bool = False
    ) -> Dict[str, Any]:
        """
        Generate text using Databricks LLM.
        
        Compatible with Ollama generate() interface.
        
        Args:
            prompt: Input prompt
            model: Model name (overrides instance default)
            temperature: Sampling temperature
            max_tokens: Maximum tokens to generate
            stream: Whether to stream response (not currently supported)
            
        Returns:
            Response dict with 'response' key containing generated text
        """
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }
        
        # Build request payload (Foundation Model API format)
        payload = {
            "messages": [
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            "temperature": temperature,
            "max_tokens": max_tokens
        }
        
        try:
            response = requests.post(
                self.api_url,
                headers=headers,
                json=payload,
                timeout=60
            )
            response.raise_for_status()
            
            result = response.json()
            
            # Extract response text from Databricks API format
            # Foundation Model API returns: {"choices": [{"message": {"content": "..."}}]}
            if "choices" in result and len(result["choices"]) > 0:
                content = result["choices"][0].get("message", {}).get("content", "")
            elif "predictions" in result:
                # Model Serving format
                content = result["predictions"][0] if result["predictions"] else ""
            else:
                content = result.get("response", "")
            
            # Return in Ollama-compatible format
            return {
                "response": content,
                "model": model or self.model_name,
                "done": True
            }
            
        except requests.exceptions.RequestException as e:
            logger.error("Databricks LLM API request failed: %s", e)
            raise Exception(f"Databricks LLM request failed: {str(e)}")
        except Exception as e:
            logger.error("Databricks LLM generation failed: %s", e)
            raise
    
    def chat(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 1000
    ) -> Dict[str, Any]:
        """
        Chat completion using Databricks LLM.
        
        Args:
            messages: List of message dicts with 'role' and 'content'
            model: Model name (overrides instance default)
            temperature: Sampling temperature
            max_tokens: Maximum tokens to generate
            
        Returns:
            Response dict with message content
        """
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens
        }
        
        try:
            response = requests.post(
                self.api_url,
                headers=headers,
                json=payload,
                timeout=60
            )
            response.raise_for_status()
            
            result = response.json()
            
            # Extract response
            if "choices" in result and len(result["choices"]) > 0:
                message = result["choices"][0].get("message", {})
            else:
                message = {"role": "assistant", "content": result.get("response", "")}
            
            return {
                "message": message,
                "model": model or self.model_name,
                "done": True
            }
            
        except Exception as e:
            logger.error("Databricks chat completion failed: %s", e)
            raise


class DatabricksGenieProvider:
    """
    Provider for Databricks Genie (AI/BI) - specialized for SQL generation.
    
    Genie has context about the user's data and can generate better SQL
    than a general-purpose LLM.
    
    ADAPT: Keep DataOne's NL2SQL service, but use Genie as the backend
    for Databricks connections (per assessment).
    """
    
    def __init__(
        self,
        workspace_url: str,
        access_token: str,
        space_id: Optional[str] = None
    ):
        """
        Initialize Genie provider.
        
        Args:
            workspace_url: Databricks workspace URL
            access_token: Access token for authentication
            space_id: Genie space ID (if using a specific space)
        """
        self.workspace_url = workspace_url.rstrip('/')
        self.access_token = access_token
        self.space_id = space_id
        
        # Genie API endpoint
        self.api_url = f"{self.workspace_url}/api/2.0/genie/spaces"
        if space_id:
            self.api_url = f"{self.api_url}/{space_id}"
    
    def generate_sql(
        self,
        natural_language_query: str,
        catalog: Optional[str] = None,
        schema: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Generate SQL from natural language using Genie.
        
        Args:
            natural_language_query: User's question in natural language
            catalog: Unity Catalog to query against (optional)
            schema: Schema to query against (optional)
            
        Returns:
            Dict with 'sql' and optional 'explanation'
        """
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "query": natural_language_query
        }
        
        if catalog:
            payload["catalog"] = catalog
        if schema:
            payload["schema"] = schema
        
        try:
            # Note: Genie API is still evolving - this is a simplified version
            # Real implementation would use the conversation API
            response = requests.post(
                f"{self.api_url}/query",
                headers=headers,
                json=payload,
                timeout=30
            )
            response.raise_for_status()
            
            result = response.json()
            
            return {
                "sql": result.get("sql", ""),
                "explanation": result.get("explanation", ""),
                "confidence": result.get("confidence", 0.0)
            }
            
        except Exception as e:
            logger.error("Genie SQL generation failed: %s", e)
            raise


def get_databricks_llm_provider(
    workspace_url: Optional[str] = None,
    access_token: Optional[str] = None,
    endpoint_name: Optional[str] = None
) -> DatabricksLLMProvider:
    """
    Factory function to create Databricks LLM provider.
    
    Falls back to environment variables if not provided.
    """
    workspace_url = workspace_url or settings.DATABRICKS_WORKSPACE_URL
    access_token = access_token or settings.DATABRICKS_ACCESS_TOKEN
    endpoint_name = endpoint_name or settings.DATABRICKS_LLM_ENDPOINT
    
    if not workspace_url or not access_token:
        raise ValueError(
            "Databricks workspace URL and access token required. "
            "Set DATABRICKS_WORKSPACE_URL and DATABRICKS_ACCESS_TOKEN env vars."
        )
    
    return DatabricksLLMProvider(
        workspace_url=workspace_url,
        access_token=access_token,
        endpoint_name=endpoint_name
    )
