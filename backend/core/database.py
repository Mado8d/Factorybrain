"""Async database engine and session management."""

from collections.abc import AsyncGenerator

from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import sessionmaker

from core.config import settings

# --- Async engine (FastAPI) ---
_pool_size = 5 if settings.environment == "production" else 20
_max_overflow = 3 if settings.environment == "production" else 10

engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
    pool_size=_pool_size,
    max_overflow=_max_overflow,
    pool_pre_ping=True,
)

# --- Sync engine (Celery tasks) ---
sync_engine = create_engine(
    settings.sync_database_url,
    echo=False,
    pool_size=3,
    max_overflow=2,
    pool_pre_ping=True,
)
SyncSession = sessionmaker(sync_engine)

async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency: yields an async database session."""
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def set_tenant_context(session: AsyncSession, tenant_id: str) -> None:
    """Set the current tenant for Row-Level Security policies."""
    from sqlalchemy import text
    await session.execute(text(f"SET LOCAL app.current_tenant = '{tenant_id}'"))
