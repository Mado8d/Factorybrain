"""Authentication tests."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_login_invalid_credentials(client: AsyncClient):
    response = await client.post(
        "/api/auth/login",
        data={"username": "nonexistent@test.com", "password": "wrong"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_me_without_token(client: AsyncClient):
    response = await client.get("/api/auth/me")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_me_with_invalid_token(client: AsyncClient):
    response = await client.get(
        "/api/auth/me",
        headers={"Authorization": "Bearer invalid-token"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_machines_without_auth(client: AsyncClient):
    response = await client.get("/api/machines/")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_dashboard_kpis_without_auth(client: AsyncClient):
    response = await client.get("/api/dashboard/kpis")
    assert response.status_code == 401
