"""User management routes — CRUD, password, profile.

Permissions:
  - superadmin: manage users across ALL tenants
  - admin: manage users within own tenant
  - any user: change own password, update own profile
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth.permissions import (
    Role,
    can_assign_role,
    get_assignable_roles,
    require_permission,
    role_level,
)
from core.auth.routes import CurrentUser
from core.database import get_db, set_tenant_context
from core.models.user import User
from core.schemas.user import (
    PasswordChange,
    PasswordReset,
    UserCreate,
    UserProfileUpdate,
    UserResponse,
    UserUpdate,
)
from core.services import user_service

router = APIRouter()

UserManager = Annotated[User, Depends(require_permission("users", "list"))]


# --- User CRUD (admin/superadmin) ---


@router.get("/", response_model=list[UserResponse])
async def list_users(
    user: UserManager,
    db: AsyncSession = Depends(get_db),
    include_inactive: bool = Query(False),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """List users in the current tenant. Superadmin sees all tenants."""
    if user.role != Role.SUPERADMIN:
        await set_tenant_context(db, str(user.tenant_id))
    result = await user_service.list_users(db, include_inactive, limit, offset)
    await user_service.count_users(db, include_inactive)
    return result


@router.get("/me", response_model=UserResponse)
async def get_my_profile(user: CurrentUser):
    """Get the current user's full profile."""
    return user


@router.patch("/me", response_model=UserResponse)
async def update_my_profile(
    data: UserProfileUpdate,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Update the current user's profile (name only)."""
    return await user_service.update_profile(db, user, data)


@router.post("/me/change-password")
async def change_my_password(
    data: PasswordChange,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Change the current user's password. Requires current password."""
    success = await user_service.change_password(db, user, data.current_password, data.new_password)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )
    return {"message": "Password changed successfully"}


@router.get("/roles")
async def get_roles(user: CurrentUser):
    """Get available roles and which ones the current user can assign."""
    return {
        "roles": [
            {
                "value": r.value,
                "label": r.value.capitalize(),
                "level": role_level(r.value),
            }
            for r in Role
        ],
        "assignable": get_assignable_roles(user.role),
        "current_role": user.role,
    }


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: uuid.UUID,
    user: UserManager,
    db: AsyncSession = Depends(get_db),
):
    """Get a specific user. Admin sees own tenant, superadmin sees all."""
    if user.role != Role.SUPERADMIN:
        await set_tenant_context(db, str(user.tenant_id))
    target = await user_service.get_user(db, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    # Admin can only see users from own tenant
    if user.role != Role.SUPERADMIN and target.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="User not found")
    return target


@router.post("/", response_model=UserResponse, status_code=201)
async def create_user(
    data: UserCreate,
    user: Annotated[User, Depends(require_permission("users", "create"))],
    db: AsyncSession = Depends(get_db),
):
    """Create a new user in the current tenant."""
    # Validate the caller can assign this role
    if not can_assign_role(user.role, data.role):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Cannot assign role '{data.role}'. Assignable roles: {get_assignable_roles(user.role)}",
        )
    try:
        return await user_service.create_user(db, user.tenant_id, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: uuid.UUID,
    data: UserUpdate,
    user: Annotated[User, Depends(require_permission("users", "update"))],
    db: AsyncSession = Depends(get_db),
):
    """Update a user. Admins can update own-tenant users, superadmin any."""
    target = await user_service.get_user(db, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    # Admin can only manage own tenant
    if user.role != Role.SUPERADMIN and target.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="User not found")

    # Prevent editing users above your own role level
    if role_level(user.role) >= role_level(target.role) and user.id != target.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot modify a user at or above your role level",
        )

    # Validate role assignment if changing
    if data.role and data.role != target.role:
        if not can_assign_role(user.role, data.role):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Cannot assign role '{data.role}'",
            )

    # Prevent self-deactivation
    if data.is_active is False and user.id == target.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot deactivate your own account",
        )

    # Prevent self-role-demotion
    if data.role and user.id == target.id and role_level(data.role) > role_level(target.role):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot demote your own role",
        )

    try:
        return await user_service.update_user(db, target, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{user_id}/reset-password")
async def reset_user_password(
    user_id: uuid.UUID,
    data: PasswordReset,
    user: Annotated[User, Depends(require_permission("users", "reset_password"))],
    db: AsyncSession = Depends(get_db),
):
    """Reset another user's password (admin action, no current password needed)."""
    target = await user_service.get_user(db, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    # Admin can only reset own tenant
    if user.role != Role.SUPERADMIN and target.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="User not found")

    # Cannot reset password of someone at or above your level
    if role_level(user.role) >= role_level(target.role):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot reset password of a user at or above your role level",
        )

    await user_service.reset_password(db, target, data.new_password)
    return {"message": "Password reset successfully"}


@router.post("/{user_id}/deactivate", response_model=UserResponse)
async def deactivate_user(
    user_id: uuid.UUID,
    user: Annotated[User, Depends(require_permission("users", "deactivate"))],
    db: AsyncSession = Depends(get_db),
):
    """Deactivate a user (soft delete). Prevents login."""
    target = await user_service.get_user(db, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if user.role != Role.SUPERADMIN and target.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="User not found")

    if user.id == target.id:
        raise HTTPException(status_code=400, detail="Cannot deactivate your own account")

    if role_level(user.role) >= role_level(target.role):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot deactivate a user at or above your role level",
        )

    return await user_service.deactivate_user(db, target)


@router.post("/{user_id}/activate", response_model=UserResponse)
async def activate_user(
    user_id: uuid.UUID,
    user: Annotated[User, Depends(require_permission("users", "deactivate"))],
    db: AsyncSession = Depends(get_db),
):
    """Reactivate a deactivated user."""
    target = await user_service.get_user(db, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if user.role != Role.SUPERADMIN and target.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="User not found")

    return await user_service.activate_user(db, target)
