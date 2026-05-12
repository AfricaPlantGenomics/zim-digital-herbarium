import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel, field_validator

LOG_DIR = Path(os.getenv("DOWNLOAD_LOG_DIR", "logs"))
LOG_PATH = LOG_DIR / "download_events.ndjson"

router = APIRouter(prefix="/log", tags=["analytics"])

_VALID_EMAIL = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
_VALID_USE_CASES = {"Research", "Education", "Personal", "Other"}
_VALID_EXPORT_TYPES = {"csv", "zip"}
_VALID_SCOPES = {"filtered", "selected", "all"}


class DownloadEventIn(BaseModel):
    full_name: str
    email: str
    use_case: str
    export_type: str
    scope: str
    specimen_count: int

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        if not _VALID_EMAIL.match(v.strip()):
            raise ValueError("Invalid email address")
        return v.strip()

    @field_validator("use_case")
    @classmethod
    def validate_use_case(cls, v: str) -> str:
        if v not in _VALID_USE_CASES:
            raise ValueError(f"use_case must be one of {_VALID_USE_CASES}")
        return v

    @field_validator("export_type")
    @classmethod
    def validate_export_type(cls, v: str) -> str:
        if v not in _VALID_EXPORT_TYPES:
            raise ValueError("export_type must be 'csv' or 'zip'")
        return v

    @field_validator("scope")
    @classmethod
    def validate_scope(cls, v: str) -> str:
        if v not in _VALID_SCOPES:
            raise ValueError(f"scope must be one of {_VALID_SCOPES}")
        return v

    @field_validator("specimen_count")
    @classmethod
    def validate_count(cls, v: int) -> int:
        if v < 0:
            raise ValueError("specimen_count must be non-negative")
        return v


@router.post("/download", status_code=201)
async def log_download(event: DownloadEventIn) -> dict:
    """Append one download event to the NDJSON log file."""
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    record = {
        **event.model_dump(),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    with LOG_PATH.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(record) + "\n")
    return {"status": "logged"}


@router.get("/download")
async def get_download_log() -> list[dict]:
    """Return all logged download events as a JSON array (for scraping/analysis)."""
    if not LOG_PATH.exists():
        return []
    records: list[dict] = []
    with LOG_PATH.open("r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                try:
                    records.append(json.loads(line))
                except json.JSONDecodeError:
                    pass
    return records
