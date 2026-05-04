"""업로드된 파일을 텍스트로 변환하는 유틸.

지원 포맷: pdf, docx, txt, md, markdown
지원 안 되는 확장자는 utf-8 디코드를 시도하고, 실패하면 UnsupportedFileType 발생.
"""

from __future__ import annotations

import logging
from io import BytesIO
from pathlib import Path

logger = logging.getLogger(__name__)


class UnsupportedFileType(Exception):
    """파일 포맷을 파싱할 수 없을 때."""


SUPPORTED_EXTENSIONS = {"pdf", "docx", "txt", "md", "markdown"}


def _ext(filename: str | None) -> str:
    if not filename:
        return ""
    return Path(filename).suffix.lstrip(".").lower()


def parse_bytes(filename: str | None, content: bytes) -> str:
    """파일 바이트를 텍스트로 변환한다."""
    ext = _ext(filename)

    if ext == "pdf":
        return _parse_pdf(content)
    if ext == "docx":
        return _parse_docx(content)
    if ext in {"txt", "md", "markdown", ""}:
        return _parse_text(content)

    raise UnsupportedFileType(f"지원하지 않는 파일 형식: .{ext}")


def _parse_pdf(content: bytes) -> str:
    from pypdf import PdfReader

    reader = PdfReader(BytesIO(content))
    pages: list[str] = []
    for idx, page in enumerate(reader.pages):
        try:
            pages.append(page.extract_text() or "")
        except Exception:  # noqa: BLE001
            # 페이지 단위 추출 실패는 건너뛴다 (스캔 이미지 등). 빈도 파악 위해 로그 남김.
            logger.warning("PDF 페이지 %d 텍스트 추출 실패 → 빈 페이지로 처리", idx, exc_info=True)
            pages.append("")
    return "\n\n".join(p for p in pages if p.strip())


def _parse_docx(content: bytes) -> str:
    from docx import Document

    doc = Document(BytesIO(content))
    return "\n".join(p.text for p in doc.paragraphs if p.text)


def _parse_text(content: bytes) -> str:
    return content.decode("utf-8", errors="ignore")
