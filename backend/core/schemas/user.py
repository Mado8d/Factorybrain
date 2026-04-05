"""User schemas — create, update, response, password management."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, field_validator

from core.auth.permissions import VALID_ROLES


class UserCreate(BaseModel):
    """Create a new user within a tenant."""

    email: EmailStr
    name: str
    role: str = "viewer"
    password: str

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        if v not in VALID_ROLES:
            raise ValueError(f"Invalid role '{v}'. Must be one of: {', '.join(sorted(VALID_ROLES))}")
        return v

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 2:
            raise ValueError("Name must be at least 2 characters")
        return v


class UserUpdate(BaseModel):
    """Update user details (admin action)."""

    name: str | None = None
    email: EmailStr | None = None
    role: str | None = None
    is_active: bool | None = None

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str | None) -> str | None:
        if v is not None and v not in VALID_ROLES:
            raise ValueError(f"Invalid role '{v}'. Must be one of: {', '.join(sorted(VALID_ROLES))}")
        return v


class UserResponse(BaseModel):
    """User response — safe for listing (no password hash)."""

    id: UUID
    tenant_id: UUID
    email: str
    name: str
    role: str
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class UserProfileUpdate(BaseModel):
    """Users can update their own profile (limited fields)."""

    name: str | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str | None) -> str | None:
        if v is not None:
            v = v.strip()
            if len(v) < 2:
                raise ValueError("Name must be at least 2 characters")
        return v


class PasswordChange(BaseModel):
    """Change own password — requires current password."""

    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class PasswordReset(BaseModel):
    """Admin resets a user's password (no current password needed)."""

    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v
