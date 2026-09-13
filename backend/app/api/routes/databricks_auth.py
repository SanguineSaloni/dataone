"""
Databricks Apps Native Authentication + OAuth2 Endpoints

Two authentication modes:
1. NATIVE (preferred for Databricks Apps): The Databricks platform reverse-proxy
   injects X-Forwarded-Email and X-Forwarded-Access-Token headers into every
   request. No OAuth client credentials are needed — the platform handles SSO.
   Endpoint: GET /auth/databricks/app-login

2. OAUTH2 (optional, requires DATABRICKS_OAUTH_CLIENT_ID/SECRET env vars):
   Full OAuth2 authorization-code flow for external/self-hosted deployments.
   Endpoints: GET /auth/databricks/login  →  GET /auth/databricks/callback
"""

import logging
import secrets
from typing import Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy.orm import Session

from app.services.databricks_auth_service import databricks_auth_service
from app.core.database import get_db
from app.services.auth_service import AuthService
from app.core.config import settings
from app.models.user import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth/databricks", tags=["databricks-auth"])


# ── Mode 1: Native Databricks Apps authentication ─────────────────────────────
# Databricks Apps reverse-proxy injects X-Forwarded-Email and
# X-Forwarded-Access-Token into every request.  No client credentials needed.

@router.get("/app-login")
async def databricks_app_login(request: Request, db: Session = Depends(get_db)):
    """
    Authenticate using the identity injected by the Databricks Apps platform.

    Databricks Apps automatically inject:
      X-Forwarded-Email              — user's email from the IdP
      X-Forwarded-Preferred-Username — username
      X-Forwarded-Access-Token       — user's OAuth access token (if OBO enabled)
      X-Forwarded-User               — unique user identifier

    This endpoint reads those headers, provisions or updates the DataOne user,
    issues a DataOne JWT, and returns it as JSON so the frontend can store it.
    No OAuth client credentials (DATABRICKS_OAUTH_CLIENT_ID/SECRET) are needed.
    """
    email = request.headers.get("X-Forwarded-Email")
    username = request.headers.get("X-Forwarded-Preferred-Username") or request.headers.get("X-Forwarded-User")
    access_token = request.headers.get("X-Forwarded-Access-Token")

    logger.info(
        f"[databricks-app-login] email={email!r} username={username!r} "
        f"has_token={bool(access_token)}"
    )

    if not email:
        logger.warning(
            "[databricks-app-login] X-Forwarded-Email header missing. "
            "Is this running inside a Databricks App?"
        )
        raise HTTPException(
            status_code=401,
            detail=(
                "Databricks user identity not found. "
                "This endpoint is only available when running inside Databricks Apps."
            ),
        )

    # Provision or update the user in DataOne DB
    user = db.query(User).filter(User.email == email).first()
    if user:
        # Refresh the stored access token if a new one was injected
        if access_token:
            user.databricks_access_token = access_token
        user.is_active = True
        db.commit()
        logger.info(f"[databricks-app-login] Updated existing user: {email}")
    else:
        # Auto-provision: new Databricks users get 'viewer' role by default.
        # An admin can promote them later via the Users admin panel.
        user = User(
            email=email,
            full_name=username or email,
            role="viewer",
            is_active=True,
            hashed_password=None,  # OAuth user — no password
            databricks_access_token=access_token,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        logger.info(f"[databricks-app-login] Provisioned new user: {email} role=viewer")

    # Issue a DataOne JWT
    dataone_token = AuthService.create_access_token(
        data={"sub": user.email, "user_id": user.id, "role": user.role}
    )

    return JSONResponse(
        content={
            "access_token": dataone_token,
            "token_type": "bearer",
            "email": user.email,
            "role": user.role,
        }
    )


# ── Mode 2: Full OAuth2 flow (requires client credentials) ────────────────────

@router.get("/login")
async def databricks_login(
    request: Request,
    redirect_to: str = Query(default="/dashboard", description="URL to redirect after successful login"),
    db: Session = Depends(get_db),
):
    """
    Initiate Databricks authentication.

    Priority order:
    1. Native Databricks Apps mode: reads X-Forwarded-Email / X-Forwarded-Access-Token
       injected by the Databricks Apps reverse-proxy. Works with zero credentials.
    2. OAuth2 flow: used only when DATABRICKS_OAUTH_CLIENT_ID/SECRET are configured.
    3. Error redirect if neither is available.
    """
    # ── Priority 1: Native Databricks Apps headers ────────────────────────────
    email = request.headers.get("X-Forwarded-Email")
    username = (
        request.headers.get("X-Forwarded-Preferred-Username")
        or request.headers.get("X-Forwarded-User")
    )
    access_token = request.headers.get("X-Forwarded-Access-Token")

    if email:
        logger.info(f"[databricks-login] Native Databricks Apps auth for {email!r}")
        try:
            # Provision or update user
            user = db.query(User).filter(User.email == email).first()
            if user:
                if access_token:
                    user.databricks_access_token = access_token
                user.is_active = True
                db.commit()
            else:
                user = User(
                    email=email,
                    full_name=username or email,
                    role="viewer",
                    is_active=True,
                    hashed_password=None,
                    databricks_access_token=access_token,
                )
                db.add(user)
                db.commit()
                db.refresh(user)
                logger.info(f"[databricks-login] Auto-provisioned new user: {email}")

            dataone_token = AuthService.create_access_token(
                data={"sub": user.email, "user_id": user.id, "role": user.role}
            )
            # Redirect to frontend login page with token — same pattern as Entra SSO
            frontend_login = settings.FRONTEND_LOGIN_URL or f"{settings.FRONTEND_URL}/signin"
            return RedirectResponse(
                url=f"{frontend_login}?token={dataone_token}",
                status_code=302,
            )
        except Exception as e:
            logger.error(f"[databricks-login] Native auth failed: {e}", exc_info=True)
            # Fall through to OAuth or error

    # ── Priority 2: OAuth2 flow (requires client credentials) ────────────────
    if databricks_auth_service.oauth_client is not None:
        try:
            state = secrets.token_urlsafe(32)
            state_data = f"{state}:{redirect_to}"
            auth_url = databricks_auth_service.get_authorization_url(state=state_data)
            logger.info(f"[databricks-login] Redirecting to OAuth consent: {auth_url}")
            return RedirectResponse(url=auth_url)
        except Exception as e:
            logger.error(f"[databricks-login] OAuth initiation failed: {e}")

    # ── Priority 3: Nothing worked — redirect with friendly error ─────────────
    logger.warning(
        "[databricks-login] No auth method available. "
        "X-Forwarded-Email header not present and OAuth client not configured."
    )
    frontend_login = settings.FRONTEND_LOGIN_URL or f"{settings.FRONTEND_URL}/signin"
    return RedirectResponse(
        url=f"{frontend_login}?error=oauth_not_configured",
        status_code=302,
    )


@router.get("/callback")
async def databricks_callback(
    code: str = Query(..., description="Authorization code from Databricks"),
    state: Optional[str] = Query(None, description="State parameter for CSRF protection"),
    error: Optional[str] = Query(None, description="Error from OAuth provider"),
    error_description: Optional[str] = Query(None, description="Error description"),
    db: Session = Depends(get_db),
):
    """Handle OAuth2 callback from Databricks (Mode 2 only)."""
    if error:
        logger.error(f"[databricks-callback] OAuth error: {error} — {error_description}")
        raise HTTPException(
            status_code=400,
            detail=f"OAuth authorization failed: {error_description or error}",
        )

    try:
        redirect_to = "/dashboard"
        if state and ":" in state:
            _, redirect_to = state.split(":", 1)

        token_data = await databricks_auth_service.exchange_code_for_token(code)
        user_info = databricks_auth_service.get_user_info(token_data["access_token"])

        logger.info(f"[databricks-callback] Provisioning user: {user_info['email']}")
        user = await databricks_auth_service.provision_or_update_user(
            db=db,
            user_info=user_info,
            access_token=token_data["access_token"],
            refresh_token=token_data["refresh_token"],
            expires_in=token_data["expires_in"],
        )

        dataone_token = AuthService.create_access_token(
            data={"sub": user.email, "user_id": user.id, "role": user.role}
        )

        frontend_url = f"{settings.FRONTEND_URL}{redirect_to}?token={dataone_token}"
        logger.info(f"[databricks-callback] Auth success for {user.email}, redirecting")
        return RedirectResponse(url=frontend_url)

    except Exception as e:
        logger.error(f"[databricks-callback] OAuth callback failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to complete authentication: {str(e)}")


@router.get("/status")
async def databricks_auth_status(request: Request):
    """Check which Databricks auth modes are available."""
    oauth_configured = (
        databricks_auth_service.oauth_client is not None
        and databricks_auth_service.client_id is not None
    )
    native_available = bool(request.headers.get("X-Forwarded-Email"))

    return {
        "native_app_login": native_available,
        "oauth_configured": oauth_configured,
        "workspace_url": databricks_auth_service.workspace_url if oauth_configured else None,
    }
