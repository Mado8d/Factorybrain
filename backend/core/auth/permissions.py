"""Role-based permission system with hierarchy.

Role hierarchy (higher can do everything lower can):
  superadmin > admin > manager > operator > viewer

Permissions are grouped by domain. Each role has a set of allowed actions.
"""

from enum import StrEnum
from typing import Annotated

from fastapi import Depends, HTTPException, status

from core.auth.routes import get_current_user
from core.models.user import User


class Role(StrEnum):
    SUPERADMIN = "superadmin"
    ADMIN = "admin"
    MANAGER = "manager"
    OPERATOR = "operator"
    VIEWER = "viewer"


# Ordered from highest to lowest privilege
ROLE_HIERARCHY = [
    Role.SUPERADMIN,
    Role.ADMIN,
    Role.MANAGER,
    Role.OPERATOR,
    Role.VIEWER,
]

VALID_ROLES = {r.value for r in Role}


def role_level(role: str) -> int:
    """Return numeric level (0=highest). Unknown roles get lowest."""
    try:
        return ROLE_HIERARCHY.index(Role(role))
    except (ValueError, KeyError):
        return len(ROLE_HIERARCHY)


# --- Permission definitions per domain ---

PERMISSIONS: dict[str, dict[str, set[str]]] = {
    # Tenant management
    "tenants": {
        "list_all": {"superadmin"},
        "create": {"superadmin"},
        "update": {"superadmin", "admin"},
        "delete": {"superadmin"},
        "read_settings": {"superadmin", "admin", "manager", "operator", "viewer"},
        "update_settings": {"superadmin", "admin", "manager"},
    },
    # User management
    "users": {
        "list": {"superadmin", "admin"},
        "create": {"superadmin", "admin"},
        "update": {"superadmin", "admin"},
        "deactivate": {"superadmin", "admin"},
        "reset_password": {"superadmin", "admin"},
        "change_own_password": {"superadmin", "admin", "manager", "operator", "viewer"},
        "update_own_profile": {"superadmin", "admin", "manager", "operator", "viewer"},
    },
    # Machine management
    "machines": {
        "list": {"superadmin", "admin", "manager", "operator", "viewer"},
        "read": {"superadmin", "admin", "manager", "operator", "viewer"},
        "create": {"superadmin", "admin", "manager"},
        "update": {"superadmin", "admin", "manager"},
        "delete": {"superadmin", "admin", "manager"},
    },
    # Maintenance
    "maintenance": {
        "list": {"superadmin", "admin", "manager", "operator", "viewer"},
        "read": {"superadmin", "admin", "manager", "operator", "viewer"},
        "create": {"superadmin", "admin", "manager", "operator"},
        "update": {"superadmin", "admin", "manager", "operator"},
        "delete": {"superadmin", "admin", "manager"},
    },
    # Plants
    "plants": {
        "list": {"superadmin", "admin", "manager", "operator", "viewer"},
        "create": {"superadmin", "admin", "manager"},
        "update": {"superadmin", "admin", "manager"},
        "delete": {"superadmin", "admin", "manager"},
    },
    # Sensors / Nodes
    "nodes": {
        "list": {"superadmin", "admin", "manager", "operator", "viewer"},
        "create": {"superadmin", "admin", "manager"},
        "update": {"superadmin", "admin", "manager"},
        "delete": {"superadmin", "admin", "manager"},
    },
}


def has_permission(role: str, domain: str, action: str) -> bool:
    """Check if a role has permission for a domain action."""
    domain_perms = PERMISSIONS.get(domain, {})
    action_perms = domain_perms.get(action, set())
    return role in action_perms


def can_assign_role(assigner_role: str, target_role: str) -> bool:
    """Check if a user can assign a given role. Can only assign roles below own level."""
    assigner_level = role_level(assigner_role)
    target_level = role_level(target_role)
    return assigner_level < target_level


def get_assignable_roles(role: str) -> list[str]:
    """Get list of roles that this user can assign to others."""
    level = role_level(role)
    return [r.value for r in ROLE_HIERARCHY if ROLE_HIERARCHY.index(r) > level]


# --- FastAPI Dependencies ---


def require_permission(domain: str, action: str):
    """Dependency that checks if the current user has a specific permission."""

    async def check(user: Annotated[User, Depends(get_current_user)]) -> User:
        if not has_permission(user.role, domain, action):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return user

    return check


def require_min_role(min_role: str):
    """Dependency: user must be at or above the given role level."""

    async def check(user: Annotated[User, Depends(get_current_user)]) -> User:
        if role_level(user.role) > role_level(min_role):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions",
            )
        return user

    return check
