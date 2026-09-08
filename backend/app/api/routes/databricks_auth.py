"""
Databricks OAuth2 Authentication Endpoints

Provides OAuth2 flow endpoints for Databricks Lakehouse App authentication:
- /auth/databricks/login - Initiate OAuth flow
- /auth/databricks/callback - Handle OAuth callback
- /auth/databricks/refresh - Refresh access token
"""

import logging
import secrets
from typing import Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.services.databricks_auth_service import databricks_auth_service
from app.core.database import get_db
from app.services.auth_service import AuthService
from app.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth/databricks", tags=["databricks-auth"])


@router.get("/login")
async def databricks_login(
    request: Request,
    redirect_to: str = Query(default="/dashboard", description="URL to redirect after successful login")
):
    """
    Initiate Databricks OAuth2 authorization flow.
    
    This endpoint redirects the user to Databricks OAuth consent page.
    After user grants permission, they will be redirected back to /callback.
    """
    try:
        # Generate CSRF token for state parameter
        state = secrets.token_urlsafe(32)
        
        # Store state and redirect_to in session (in production, use Redis)
        # For now, we'll encode it in the state parameter
        state_data = f"{state}:{redirect_to}"
        
        # Get authorization URL
        auth_url = databricks_auth_service.get_authorization_url(state=state_data)
        
        logger.info(f"Redirecting user to Databricks OAuth: {auth_url}")
        
        return RedirectResponse(url=auth_url)
        
    except Exception as e:
        logger.error(f"Failed to initiate OAuth flow: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to initiate Databricks authentication: {str(e)}"
        )


@router.get("/callback")
async def databricks_callback(
    code: str = Query(..., description="Authorization code from Databricks"),
    state: str = Query(None, description="State parameter for CSRF protection"),
    error: str = Query(None, description="Error from OAuth provider"),
    error_description: str = Query(None, description="Error description"),
    db: Session = Depends(get_db)
):
    """
    Handle OAuth2 callback from Databricks.
    
    This endpoint:
    1. Exchanges authorization code for access token
    2. Fetches user information from Databricks
    3. Creates or updates user in DataOne
    4. Returns DataOne JWT token
    """
    # Check for OAuth errors
    if error:
        logger.error(f"OAuth error: {error} - {error_description}")
        raise HTTPException(
            status_code=400,
            detail=f"OAuth authorization failed: {error_description or error}"
        )
    
    try:
        # Parse state to get redirect URL
        redirect_to = "/dashboard"
        if state and ":" in state:
            _, redirect_to = state.split(":", 1)
        
        # Exchange authorization code for tokens
        logger.info("Exchanging authorization code for tokens...")
        token_data = await databricks_auth_service.exchange_code_for_token(code)
        
        # Fetch user information
        logger.info("Fetching user information from Databricks...")
        user_info = databricks_auth_service.get_user_info(token_data["access_token"])
        
        # Provision or update user
        logger.info(f"Provisioning user: {user_info['email']}")
        user = await databricks_auth_service.provision_or_update_user(
            db=db,
            user_info=user_info,
            access_token=token_data["access_token"],
            refresh_token=token_data["refresh_token"],
            expires_in=token_data["expires_in"]
        )
        
        # Create DataOne JWT token
        access_token = AuthService.create_access_token(
            data={
                "sub": user.email,
                "user_id": user.id,
                "role": user.role
            }
        )
        
        # In production, this would redirect to frontend with token in secure cookie
        # For now, return JSON with token and redirect URL
        frontend_url = f"{settings.FRONTEND_URL}{redirect_to}?token={access_token}"
        
        logger.info(f"Successfully authenticated user {user.email}, redirecting to {redirect_to}")
        
        return RedirectResponse(url=frontend_url)
        
    except Exception as e:
        logger.error(f"OAuth callback failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to complete authentication: {str(e)}"
        )


@router.post("/refresh")
async def refresh_databricks_token(
    user_id: int,
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Refresh Databricks access token for a user.
    
    This endpoint is typically called internally when a token is about to expire.
    """
    try:
        from app.models.user import User
        
        # Get user
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Ensure token is valid (will refresh if needed)
        access_token = await databricks_auth_service.ensure_token_valid(user, db)
        
        return {
            "status": "success",
            "message": "Token refreshed successfully",
            "expires_at": user.databricks_token_expires_at.isoformat() if user.databricks_token_expires_at else None
        }
        
    except Exception as e:
        logger.error(f"Failed to refresh token: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to refresh token: {str(e)}"
        )


@router.get("/status")
async def databricks_auth_status():
    """
    Check if Databricks OAuth is configured and available.
    """
    is_configured = (
        databricks_auth_service.oauth_client is not None and
        databricks_auth_service.client_id is not None
    )
    
    return {
        "enabled": is_configured,
        "workspace_url": databricks_auth_service.workspace_url if is_configured else None,
        "scopes": databricks_auth_service.scopes if is_configured else []
    }
