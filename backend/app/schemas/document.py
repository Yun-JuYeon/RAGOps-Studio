from typing import Any

from pydantic import BaseModel, Field


class DocumentIngestRequest(BaseModel):
    index: str | None = None
    text: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    chunk_size: int = 800
    chunk_overlap: int = 100


class DocumentIngestResponse(BaseModel):
    index: str
    chunks_indexed: int
    ids: list[str]


class FileUploadResult(BaseModel):
    filename: str
    chunks_indexed: int = 0
    error: str | None = None


class UploadResponse(BaseModel):
    index: str
    files: list[FileUploadResult]
    total_chunks: int


class FileSummary(BaseModel):
    """업로드된 파일 한 건의 요약 (filename으로 그룹핑된 청크들)."""

    filename: str
    chunk_count: int


class FileChunk(BaseModel):
    id: str
    chunk_index: int
    text: str


class FileDetail(BaseModel):
    filename: str
    chunk_count: int
    chunks: list[FileChunk]
