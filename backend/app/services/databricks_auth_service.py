"""
Databricks OAuth2 Authentication Service

Handles OAuth2 authentication flow for Databricks Lakehouse Apps:
- OAuth2 authorization code flow
- Token management (access + refresh)
- Unity Catalog permission mapping to DataOne roles
- User provisioning from Databricks workspace users
"""

import logging
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta

from databricks.sdk import WorkspaceClient
from databricks.sdk.oauth import OAuthClient
from databricks.sdk.service.iam import User as DatabricksUser

from app.core.config import settings
from app.models.user import User
from app.core.database import get_db
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


class DatabricksAuthService:
    """
    Service for handling Databricks OAuth2 authentication and user management.
    """

    def __init__(self):
        self.oauth_client: Optional[OAuthClient] = None
        self.workspace_url = settings.DATABRICKS_WORKSPACE_URL
        self.client_id = settings.DATABRICKS_OAUTH_CLIENT_ID
        self.client_secret = settings.DATABRICKS_OAUTH_CLIENT_SECRET
        self.redirect_uri = f"{settings.BACKEND_URL}/api/v1/auth/databricks/callback"
        
        # OAuth scopes required for DataOne
        self.scopes = [
            "sql",              # Execute SQL queries
            "unity-catalog",    # Read Unity Catalog metadata
            "offline_access"    # Refresh token
        ]
        
        # Initialize OAuth client if credentials are available
        if self.client_id and self.client_secret:
            try:
                self.oauth_client = OAuthClient(
                    host=self.workspace_url,
                    client_id=self.client_id,
                    client_secret=self.client_secret,
                    redirect_url=self.redirect_uri,
                    scopes=self.scopes
                )
                logger.info(f"Databricks OAuth client initialized for {self.workspace_url}")
            except Exception as e:
                logger.error(f"Failed to initialize Databricks OAuth client: {e}")
                self.oauth_client = None

    def get_authorization_url(self, state: Optional[str] = None) -> str:
        """
        Generate OAuth2 authorization URL for user to grant permissions.
        
        Args:
            state: Optional state parameter for CSRF protection
            
        Returns:
            Authorization URL to redirect user to
        """
        if not self.oauth_client:
            raise ValueError("OAuth client not initialized")
        
        auth_url = self.oauth_client.initiate_consent()
        
        if state:
            # Add state parameter for CSRF protection
            auth_url = f"{auth_url}&state={state}"
        
        logger.info(f"Generated authorization URL with state={state}")
        return auth_url

    async def exchange_code_for_token(
        self, 
        authorization_code: str
    ) -> Dict[str, Any]:
        """
        Exchange authorization code for access and refresh tokens.
        
        Args:
            authorization_code: Code received from OAuth callback
            
        Returns:
            Dictionary containing access_token, refresh_token, expires_in, etc.
        """
        if not self.oauth_client:
            raise ValueError("OAuth client not initialized")
        
        try:
            # Exchange code for tokens
            token_response = await self.oauth_client.exchange_code(authorization_code)
            
            logger.info("Successfully exchanged authorization code for tokens")
            
            return {
                "access_token": token_response.access_token,
                "refresh_token": token_response.refresh_token,
                "expires_in": token_response.expires_in,
                "token_type": token_response.token_type,
                "scope": token_response.scope
            }
        except Exception as e:
            logger.error(f"Failed to exchange authorization code: {e}")
            raise

    async def refresh_access_token(self, refresh_token: str) -> Dict[str, Any]:
        """
        Refresh an expired access token using refresh token.
        
        Args:
            refresh_token: Refresh token from initial authorization
            
        Returns:
            New token information
        """
        if not self.oauth_client:
            raise ValueError("OAuth client not initialized")
        
        try:
            token_response = await self.oauth_client.refresh(refresh_token)
            
            logger.info("Successfully refreshed access token")
            
            return {
                "access_token": token_response.access_token,
                "refresh_token": token_response.refresh_token or refresh_token,  # Some providers don't return new refresh token
                "expires_in": token_response.expires_in,
                "token_type": token_response.token_type
            }
        except Exception as e:
            logger.error(f"Failed to refresh access token: {e}")
            raise

    def get_user_info(self, access_token: str) -> Dict[str, Any]:
        """
        Fetch user information from Databricks using access token.
        
        Args:
            access_token: Valid OAuth access token
            
        Returns:
            User information (email, name, id, etc.)
        """
        try:
            # Create workspace client with OAuth token
            ws = WorkspaceClient(
                host=self.workspace_url,
                token=access_token
            )
            
            # Get current user
            current_user = ws.current_user.me()
            
            user_info = {
                "id": current_user.id,
                "email": current_user.emails[0].value if current_user.emails else None,
                "username": current_user.user_name,
                "display_name": current_user.display_name,
                "active": current_user.active
            }
            
            logger.info(f"Fetched user info for: {user_info['email']}")
            return user_info
            
        except Exception as e:
            logger.error(f"Failed to fetch user info: {e}")
            raise

    def get_user_permissions(self, access_token: str) -> List[str]:
        """
        Get Unity Catalog permissions for the authenticated user.
        
        Args:
            access_token: Valid OAuth access token
            
        Returns:
            List of permission strings
        """
        try:
            ws = WorkspaceClient(
                host=self.workspace_url,
                token=access_token
            )
            
            # Get user's Unity Catalog grants
            # This is a simplified version - actual implementation would check:
            # - Catalog-level grants
            # - Schema-level grants
            # - Table-level grants
            # - Function grants
            
            permissions = []
            
            # Check if user has SQL warehouse access
            try:
                warehouses = ws.warehouses.list()
                if warehouses:
                    permissions.append("sql:execute")
            except Exception:
                pass
            
            # Check Unity Catalog access
            try:
                catalogs = ws.catalogs.list()
                if catalogs:
                    permissions.append("unity_catalog:read")
            except Exception:
                pass
            
            logger.info(f"User permissions: {permissions}")
            return permissions
            
        except Exception as e:
            logger.error(f"Failed to get user permissions: {e}")
            return []

    def map_permissions_to_role(self, permissions: List[str]) -> str:
        """
        Map Databricks Unity Catalog permissions to DataOne role.
        
        Args:
            permissions: List of permission strings from Unity Catalog
            
        Returns:
            DataOne role (admin, editor, viewer)
        """
        # Role mapping logic based on Unity Catalog grants
        # In production, this would be more sophisticated
        
        if "unity_catalog:admin" in permissions:
            return "admin"
        elif "sql:execute" in permissions and "unity_catalog:read" in permissions:
            return "editor"
        elif "unity_catalog:read" in permissions:
            return "viewer"
        else:
            # Default to viewer if no specific permissions found
            return "viewer"

    async def provision_or_update_user(
        self, 
        db: Session,
        user_info: Dict[str, Any],
        access_token: str,
        refresh_token: str,
        expires_in: int
    ) -> User:
        """
        Create or update DataOne user from Databricks OAuth.
        
        Args:
            db: Database session
            user_info: User information from Databricks
            access_token: OAuth access token
            refresh_token: OAuth refresh token
            expires_in: Token expiration time in seconds
            
        Returns:
            DataOne User object
        """
        email = user_info.get("email")
        if not email:
            raise ValueError("User email not found in Databricks user info")
        
        # Check if user already exists
        user = db.query(User).filter(User.email == email).first()
        
        # Get user permissions and map to role
        permissions = self.get_user_permissions(access_token)
        role = self.map_permissions_to_role(permissions)
        
        if user:
            # Update existing user
            user.full_name = user_info.get("display_name", user.full_name)
            user.role = role
            user.is_active = user_info.get("active", True)
            
            # Update OAuth tokens (stored securely, encrypted in production)
            user.databricks_access_token = access_token
            user.databricks_refresh_token = refresh_token
            user.databricks_token_expires_at = datetime.utcnow() + timedelta(seconds=expires_in)
            
            logger.info(f"Updated existing user: {email} with role {role}")
        else:
            # Create new user
            user = User(
                email=email,
                full_name=user_info.get("display_name", email),
                role=role,
                is_active=user_info.get("active", True),
                databricks_user_id=user_info.get("id"),
                databricks_access_token=access_token,
                databricks_refresh_token=refresh_token,
                databricks_token_expires_at=datetime.utcnow() + timedelta(seconds=expires_in),
                # No password for OAuth users
                hashed_password=None
            )
            db.add(user)
            logger.info(f"Created new user: {email} with role {role}")
        
        db.commit()
        db.refresh(user)
        
        return user

    async def ensure_token_valid(self, user: User, db: Session) -> str:
        """
        Ensure user's access token is valid, refresh if necessary.
        
        Args:
            user: DataOne user object
            db: Database session
            
        Returns:
            Valid access token
        """
        if not user.databricks_access_token:
            raise ValueError("User has no Databricks access token")
        
        # Check if token is expired or about to expire (5 min buffer)
        buffer = timedelta(minutes=5)
        now = datetime.utcnow()
        
        if user.databricks_token_expires_at and user.databricks_token_expires_at - buffer <= now:
            logger.info(f"Token expired for user {user.email}, refreshing...")
            
            # Refresh the token
            token_data = await self.refresh_access_token(user.databricks_refresh_token)
            
            # Update user tokens
            user.databricks_access_token = token_data["access_token"]
            user.databricks_refresh_token = token_data["refresh_token"]
            user.databricks_token_expires_at = now + timedelta(seconds=token_data["expires_in"])
            
            db.commit()
            db.refresh(user)
            
            logger.info(f"Successfully refreshed token for user {user.email}")
        
        return user.databricks_access_token


# Global instance
databricks_auth_service = DatabricksAuthService()
