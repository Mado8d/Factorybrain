"""Backward-compatible re-export — models now live in core.models."""

from core.models.base import Base
from core.models.user import User

__all__ = ["Base", "User"]
