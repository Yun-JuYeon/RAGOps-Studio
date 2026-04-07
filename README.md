# RAGOps Studio

> Elasticsearch 기반 RAG 시스템의 운영을 한 곳에서 관리하기 위한 웹 콘솔.
> 인덱스/문서 관리, 검색 디버깅, RAG 채팅 플레이그라운드를 제공합니다.

## 스택

| 영역 | 사용 |
|---|---|
| Backend | Python 3.11+, FastAPI, LangChain, LangGraph, Elasticsearch (async), OpenAI |
| Frontend | Vite + React + TypeScript, TanStack Query, Tailwind, shadcn/ui |
| 인프라 | Docker Compose (로컬) · Vercel + Railway + Elastic Cloud (운영) |

## 주요 기능

- **인덱스** — ES 인덱스 목록/통계, 새 인덱스 생성, 비우기(clear), 삭제
- **문서** — PDF/DOCX/TXT/MD 멀티파일 업로드, 청크 크기/오버랩 조절, 저장 인덱스 선택
- **인덱스 상세** — 인덱스에 들어있는 파일 목록, 파일별 청크 인라인 미리보기, 파일/인덱스 단위 삭제
- **검색** — BM25 / Dense (kNN) / **Hybrid (RRF)** · 전체 또는 특정 인덱스 대상 · hit별 source 인덱스 표시
- **채팅** — LangGraph(retrieve → generate) RAG · 인덱스 범위 선택 · 답변 아래 참고 청크(filename/chunk_index/full text) 펼침
- **헬스 체크** — `/health` 가 ES, embedder, LLM 가용 여부를 노출. 프론트가 사전 검증해서 BM25 자동 폴백 같은 silent fallback 없이 alert로 안내
- **평가 (작업 중)** — RAGAS 골격 코드는 작성됨. 라우터/UI 모두 비활성화 상태

## 디렉터리

```
backend/
  app/
    api/v1/endpoints/   # health, indices, documents, search, chat, evaluation(WIP)
    core/config.py      # pydantic-settings
    db/elasticsearch.py # AsyncElasticsearch 싱글톤 + helper
    rag/graph.py        # LangGraph: retrieve → generate
    schemas/            # Pydantic 모델
    services/           # ElasticsearchService / DocumentService / RagService / EmbeddingService / EvalService(WIP)

frontend/
  src/
    api/client.ts       # 백엔드 호출 + 타입
    components/ui/      # shadcn 컴포넌트
    hooks/useHealth.ts
    pages/              # Indices, IndexDetail, Documents, Search, Chat, Eval(WIP)
```

## 빠른 시작 (로컬)

```bash
cp backend/.env.example backend/.env       # 필요시 OPENAI_API_KEY 설정
cp frontend/.env.example frontend/.env

docker compose up -d                        # ES + Kibana + backend + frontend
```

| 서비스 | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend (Swagger) | http://localhost:8000/docs |
| Elasticsearch | http://localhost:9200 |
| Kibana | http://localhost:5601 |

분리 실행:

```bash
# Backend
cd backend && uv sync && python -m app.main

# Frontend
cd frontend && npm install && npm run dev
```

VS Code 디버거로 띄우려면 `.vscode/launch.json` 의 `Backend: FastAPI (debug)` 또는 `Full Stack: Backend + Frontend` 사용.

## 환경 변수

**backend/.env**
- `ELASTICSEARCH_URL` (기본 `http://localhost:9200`)
- `ELASTICSEARCH_USERNAME`, `ELASTICSEARCH_PASSWORD` (로컬 docker는 비워두기)
- `OPENAI_API_KEY` — 없으면 임베딩/채팅 기능 비활성화 (UI가 alert로 안내)
- `EMBEDDING_MODEL` (기본 `text-embedding-3-small`, dims 1536)
- `LLM_MODEL` (기본 `gpt-4o-mini`)
- `CORS_ORIGINS` (기본 `["http://localhost:5173"]`)

**frontend/.env**
- `VITE_API_BASE_URL` (기본 `http://localhost:8000`)

## RAG 파이프라인

```
question
   │
   ▼
[retrieve]  ──▶  ElasticsearchService.search(mode="hybrid")  ──▶  RRF
   │                                                                │
   │                                                                ▼
   │                                                          BM25 + kNN
   ▼                                                                │
[generate]  ◀────────── docs + filename/chunk_index ◀───────────────┘
   │                            (citations)
   ▼
ChatResponse { answer, citations }
```

- 인덱스가 명시되면 그것만, 아니면 사용자 인덱스(`.`로 시작 안 하는 모든 인덱스) 전체
- 임베더 미설정이면 chat retrieve는 BM25 로 자동 (사용자가 모드를 직접 선택한 게 아니므로 폴백 허용)
- 검색 페이지에서 dense/hybrid 모드를 직접 선택했는데 임베더가 없으면 → 폴백 없이 alert

## 배포 (포트폴리오)

3-tier 분리. Backend는 LangGraph 실행과 stateful ES 커넥션이 있어 serverless 에 부적합합니다.

| 컴포넌트 | 호스트 | 비고 |
|---|---|---|
| Frontend | Vercel | `frontend/vercel.json`. Root Directory 를 `frontend/` 로 |
| Backend | Railway | `backend/railway.json` + Dockerfile |
| Elasticsearch | Elastic Cloud (14일 트라이얼) | URL/credential 을 backend env 에 |