"""Declarative base for all SQLAlchemy models."""

from datetime import UTC, datetime

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


def utcnow() -> datetime:
    """Return current UTC time as a naive datetime (no tzinfo).

    asyncpg is strict: if the SQLAlchemy column is mapped as `datetime`
    (naive), passing a tz-aware datetime raises DataError. Our DB columns
    are TIMESTAMPTZ but SQLAlchemy maps them as naive Python datetime.
    """
    return datetime.now(UTC).replace(tzinfo=None)
