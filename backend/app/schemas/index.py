from typing import Any

from pydantic import BaseModel, Field


class CreateIndexRequest(BaseModel):
    name: str
    mappings: dict[str, Any] | None = None
    settings: dict[str, Any] | None = None


class IndexInfo(BaseModel):
    name: str
    docs_count: int = Field(default=0)
    size_in_bytes: int = Field(default=0)
    health: str | None = None
