"""File upload routes for machine documents."""

import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth.routes import CurrentUser
from core.database import get_db, set_tenant_context
from core.services import machine_service

router = APIRouter()

UPLOAD_DIR = Path("/app/uploads")
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".webp", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".txt"}


def _machine_dir(machine_id: uuid.UUID) -> Path:
    d = UPLOAD_DIR / str(machine_id)
    d.mkdir(parents=True, exist_ok=True)
    return d


@router.post("/machines/{machine_id}/documents")
async def upload_document(
    machine_id: uuid.UUID,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    file: UploadFile = File(...),
):
    """Upload a document for a machine."""
    await set_tenant_context(db, str(user.tenant_id))
    machine = await machine_service.get_machine(db, machine_id)
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")

    # Validate extension
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"File type {ext} not allowed. Allowed: {', '.join(ALLOWED_EXTENSIONS)}")

    # Read and check size
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail=f"File too large. Max {MAX_FILE_SIZE // 1024 // 1024}MB")

    # Sanitize filename — strip path components
    clean_name = re.sub(r'[^\w\-.]', '_', Path(file.filename or "file").name)
    safe_name = f"{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}_{clean_name}"
    dest = _machine_dir(machine_id) / safe_name

    # Verify path stays within upload dir
    if not str(dest.resolve()).startswith(str(UPLOAD_DIR.resolve())):
        raise HTTPException(status_code=400, detail="Invalid filename")

    dest.write_bytes(content)

    return {
        "filename": safe_name,
        "original_name": file.filename,
        "size": len(content),
        "content_type": file.content_type,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/machines/{machine_id}/documents")
async def list_documents(
    machine_id: uuid.UUID,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """List all documents for a machine."""
    await set_tenant_context(db, str(user.tenant_id))
    machine = await machine_service.get_machine(db, machine_id)
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")

    machine_dir = UPLOAD_DIR / str(machine_id)
    if not machine_dir.exists():
        return []

    files = []
    for f in sorted(machine_dir.iterdir()):
        if f.is_file():
            stat = f.stat()
            files.append({
                "filename": f.name,
                "size": stat.st_size,
                "uploaded_at": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
            })
    return files


@router.delete("/machines/{machine_id}/documents/{filename}")
async def delete_document(
    machine_id: uuid.UUID,
    filename: str,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Delete a document."""
    await set_tenant_context(db, str(user.tenant_id))
    machine = await machine_service.get_machine(db, machine_id)
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")

    file_path = _machine_dir(machine_id) / filename
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    # Security: ensure path doesn't escape the upload dir
    if not str(file_path.resolve()).startswith(str(UPLOAD_DIR.resolve())):
        raise HTTPException(status_code=400, detail="Invalid path")

    file_path.unlink()
    return {"deleted": filename}


@router.get("/uploads/{machine_id}/{filename}")
async def download_document(
    machine_id: uuid.UUID,
    filename: str,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Download/serve a document file (authenticated, tenant-checked)."""
    await set_tenant_context(db, str(user.tenant_id))
    machine = await machine_service.get_machine(db, machine_id)
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")

    file_path = UPLOAD_DIR / str(machine_id) / filename
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    if not str(file_path.resolve()).startswith(str(UPLOAD_DIR.resolve())):
        raise HTTPException(status_code=400, detail="Invalid path")

    return FileResponse(file_path, filename=filename)
