"""User CRUD service — create, list, update, deactivate, password management."""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth.routes import hash_password, verify_password
from core.models.base import utcnow
from core.models.user import User
from core.schemas.user import UserCreate, UserProfileUpdate, UserUpdate
from core.services import audit_service


async def list_users(
    db: AsyncSession,
    include_inactive: bool = False,
    limit: int = 100,
    offset: int = 0,
) -> list[User]:
    query = select(User).order_by(User.name)
    if not include_inactive:
        query = query.where(User.is_active)
    query = query.limit(limit).offset(offset)
    result = await db.execute(query)
    return list(result.scalars().all())


async def count_users(db: AsyncSession, include_inactive: bool = False) -> int:
    query = select(func.count()).select_from(User)
    if not include_inactive:
        query = query.where(User.is_active)
    result = await db.execute(query)
    return result.scalar_one()


async def get_user(db: AsyncSession, user_id: uuid.UUID) -> User | None:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def create_user(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    data: UserCreate,
) -> User:
    # Check email uniqueness
    existing = await get_user_by_email(db, data.email)
    if existing:
        raise ValueError(f"Email '{data.email}' is already in use")

    user = User(
        tenant_id=tenant_id,
        email=data.email,
        name=data.name,
        role=data.role,
        hashed_password=hash_password(data.password),
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    await audit_service.log_action(
        db,
        tenant_id,
        user_id=None,
        action="create",
        resource_type="user",
        resource_id=str(user.id),
        changes={"email": user.email, "name": user.name, "role": user.role},
    )
    return user


async def update_user(
    db: AsyncSession,
    user: User,
    data: UserUpdate,
) -> User:
    updates = data.model_dump(exclude_unset=True)

    # Check email uniqueness if changing
    if "email" in updates and updates["email"] != user.email:
        existing = await get_user_by_email(db, updates["email"])
        if existing:
            raise ValueError(f"Email '{updates['email']}' is already in use")

    for field, value in updates.items():
        setattr(user, field, value)
    user.updated_at = utcnow()
    await db.flush()
    await db.refresh(user)
    await audit_service.log_action(
        db,
        user.tenant_id,
        user_id=user.id,
        action="update",
        resource_type="user",
        resource_id=str(user.id),
        changes=updates,
    )
    return user


async def update_profile(
    db: AsyncSession,
    user: User,
    data: UserProfileUpdate,
) -> User:
    updates = data.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(user, field, value)
    user.updated_at = utcnow()
    await db.flush()
    await db.refresh(user)
    await audit_service.log_action(
        db,
        user.tenant_id,
        user_id=user.id,
        action="update",
        resource_type="user",
        resource_id=str(user.id),
        changes=updates,
    )
    return user


async def change_password(
    db: AsyncSession,
    user: User,
    current_password: str,
    new_password: str,
) -> bool:
    if not verify_password(current_password, user.hashed_password):
        return False
    user.hashed_password = hash_password(new_password)
    user.updated_at = utcnow()
    await db.flush()
    await audit_service.log_action(
        db,
        user.tenant_id,
        user_id=user.id,
        action="update",
        resource_type="user",
        resource_id=str(user.id),
        changes={"password": "changed"},
    )
    return True


async def reset_password(
    db: AsyncSession,
    user: User,
    new_password: str,
) -> None:
    user.hashed_password = hash_password(new_password)
    user.updated_at = utcnow()
    await db.flush()
    await audit_service.log_action(
        db,
        user.tenant_id,
        user_id=None,
        action="update",
        resource_type="user",
        resource_id=str(user.id),
        changes={"password": "reset"},
    )


async def deactivate_user(db: AsyncSession, user: User) -> User:
    user.is_active = False
    user.updated_at = utcnow()
    await db.flush()
    await db.refresh(user)
    await audit_service.log_action(
        db,
        user.tenant_id,
        user_id=None,
        action="delete",
        resource_type="user",
        resource_id=str(user.id),
        changes={"name": user.name, "deactivated": True},
    )
    return user


async def activate_user(db: AsyncSession, user: User) -> User:
    user.is_active = True
    user.updated_at = utcnow()
    await db.flush()
    await db.refresh(user)
    await audit_service.log_action(
        db,
        user.tenant_id,
        user_id=None,
        action="update",
        resource_type="user",
        resource_id=str(user.id),
        changes={"name": user.name, "activated": True},
    )
    return user
