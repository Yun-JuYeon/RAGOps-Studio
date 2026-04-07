from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.schemas.document import (
    DocumentIngestRequest,
    DocumentIngestResponse,
    FileDetail,
    FileSummary,
    FileUploadResult,
    UploadResponse,
)
from app.services.document_service import DocumentService, get_document_service
from app.services.file_parser import UnsupportedFileType, parse_bytes

router = APIRouter()


@router.post("/ingest", response_model=DocumentIngestResponse)
async def ingest_document(
    body: DocumentIngestRequest,
    svc: DocumentService = Depends(get_document_service),
):
    """프로그램에서 텍스트를 직접 인제스트할 때 쓰는 엔드포인트.
    UI에서는 /upload (멀티파일) 사용."""
    return await svc.ingest_text(body)


@router.post("/upload", response_model=UploadResponse)
async def upload_documents(
    files: list[UploadFile] = File(...),
    index: str | None = Form(None),
    chunk_size: int = Form(800),
    chunk_overlap: int = Form(100),
    allow_no_embedding: bool = Form(False),
    svc: DocumentService = Depends(get_document_service),
):
    """파일 업로드. PDF / DOCX / TXT / MD 지원. 여러 파일 동시 업로드 가능.

    chunk_size / chunk_overlap 으로 청킹 파라미터 조절 가능.
    OPENAI_API_KEY 가 없을 때:
      - allow_no_embedding=False (기본): 400 에러
      - allow_no_embedding=True: 임베딩 없이 BM25 전용으로 저장
    """
    if chunk_size <= 0:
        chunk_size = 800
    if chunk_overlap < 0:
        chunk_overlap = 0
    if chunk_overlap >= chunk_size:
        chunk_overlap = max(0, chunk_size - 1)

    results: list[FileUploadResult] = []
    used_index = index or ""
    total = 0

    for file in files:
        try:
            content = await file.read()
            text = parse_bytes(file.filename, content)
            if not text.strip():
                results.append(
                    FileUploadResult(
                        filename=file.filename or "(unnamed)",
                        error="추출된 텍스트가 비어있습니다",
                    )
                )
                continue
            result = await svc.ingest_text(
                DocumentIngestRequest(
                    index=index,
                    text=text,
                    metadata={"filename": file.filename},
                    chunk_size=chunk_size,
                    chunk_overlap=chunk_overlap,
                ),
                allow_no_embedding=allow_no_embedding,
            )
            used_index = result.index
            total += result.chunks_indexed
            results.append(
                FileUploadResult(
                    filename=file.filename or "(unnamed)",
                    chunks_indexed=result.chunks_indexed,
                )
            )
        except UnsupportedFileType as exc:
            results.append(
                FileUploadResult(filename=file.filename or "(unnamed)", error=str(exc))
            )
        except HTTPException:
            # 임베딩 미설정 같은 정책 에러는 전역으로 띄워서 프론트가 alert 띄우게 함
            raise
        except Exception as exc:  # noqa: BLE001
            results.append(
                FileUploadResult(filename=file.filename or "(unnamed)", error=str(exc))
            )

    return UploadResponse(index=used_index, files=results, total_chunks=total)


@router.get("/files", response_model=list[FileSummary])
async def list_files(
    index: str | None = None,
    svc: DocumentService = Depends(get_document_service),
):
    """업로드된 파일 목록 (filename 기준 그룹핑)."""
    return await svc.list_files(index)


@router.get("/files/{filename}/chunks", response_model=FileDetail)
async def get_file_chunks(
    filename: str,
    index: str | None = None,
    svc: DocumentService = Depends(get_document_service),
):
    """특정 파일의 모든 청크를 chunk_index 순으로 반환."""
    return await svc.get_file_chunks(filename, index)


@router.delete("/files/{filename}")
async def delete_file(
    filename: str,
    index: str | None = None,
    svc: DocumentService = Depends(get_document_service),
):
    """특정 파일에 속한 모든 청크 삭제."""
    deleted = await svc.delete_file(filename, index)
    return {"filename": filename, "deleted": deleted}
