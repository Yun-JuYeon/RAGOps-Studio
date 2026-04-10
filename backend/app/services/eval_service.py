"""평가(eval) 서비스 — RAGAS 기반 자동 평가.

⚠️ 현재 WIP / 보류 상태.
- `app/api/v1/router.py`에서 evaluation 라우터가 비활성화되어 있어 외부에서 호출되지 않는다.
- `ragas`, `datasets` 패키지는 `pyproject.toml`에 주석 처리되어 있다.
- 재개할 때 위 두 군데를 활성화하면 바로 동작.

설계 메모:
- 정답지 데이터셋 CRUD (Elasticsearch에 저장)
- RAG 파이프라인을 데이터셋 전체에 대해 실행
- RAGAS로 metric 계산 (sync API라 `asyncio.to_thread`로 감쌈)
- 결과를 run 도큐먼트에 저장
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone

from elasticsearch import AsyncElasticsearch
from fastapi import Depends

from app.db.elasticsearch import get_es_client
from app.rag.graph import build_rag_graph
from app.schemas.eval import (
    EvalDataset,
    EvalDatasetCreate,
    EvalItemResult,
    EvalRun,
    EvalRunCreate,
)

DATASETS_INDEX = "ragops-eval-datasets"
RUNS_INDEX = "ragops-eval-runs"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class EvalService:
    def __init__(self, client: AsyncElasticsearch):
        self.client = client

    # ---------- bootstrap ----------

    async def ensure_indices(self) -> None:
        for name in (DATASETS_INDEX, RUNS_INDEX):
            exists = await self.client.indices.exists(index=name)
            if not exists:
                await self.client.indices.create(index=name)

    # ---------- datasets ----------

    async def create_dataset(self, body: EvalDatasetCreate) -> EvalDataset:
        await self.ensure_indices()
        ds = EvalDataset(
            id=str(uuid.uuid4()),
            created_at=_utcnow(),
            **body.model_dump(),
        )
        await self.client.index(
            index=DATASETS_INDEX,
            id=ds.id,
            document=ds.model_dump(mode="json"),
            refresh="wait_for",
        )
        return ds

    async def list_datasets(self) -> list[EvalDataset]:
        await self.ensure_indices()
        resp = await self.client.search(
            index=DATASETS_INDEX,
            body={"size": 100, "sort": [{"created_at": "desc"}], "query": {"match_all": {}}},
        )
        return [EvalDataset(**h["_source"]) for h in resp["hits"]["hits"]]

    async def get_dataset(self, dataset_id: str) -> EvalDataset | None:
        try:
            resp = await self.client.get(index=DATASETS_INDEX, id=dataset_id)
        except Exception:  # noqa: BLE001
            return None
        return EvalDataset(**resp["_source"])

    async def delete_dataset(self, dataset_id: str) -> None:
        await self.client.delete(index=DATASETS_INDEX, id=dataset_id, ignore=[404])

    # ---------- runs ----------

    async def create_run(self, body: EvalRunCreate) -> EvalRun:
        await self.ensure_indices()
        run = EvalRun(
            id=str(uuid.uuid4()),
            dataset_id=body.dataset_id,
            status="pending",
            index=body.index,
            top_k=body.top_k,
            metrics=body.metrics,
            started_at=_utcnow(),
        )
        await self._save_run(run)
        return run

    async def list_runs(self) -> list[EvalRun]:
        await self.ensure_indices()
        resp = await self.client.search(
            index=RUNS_INDEX,
            body={"size": 100, "sort": [{"started_at": "desc"}], "query": {"match_all": {}}},
        )
        return [EvalRun(**h["_source"]) for h in resp["hits"]["hits"]]

    async def get_run(self, run_id: str) -> EvalRun | None:
        try:
            resp = await self.client.get(index=RUNS_INDEX, id=run_id)
        except Exception:  # noqa: BLE001
            return None
        return EvalRun(**resp["_source"])

    async def _save_run(self, run: EvalRun) -> None:
        await self.client.index(
            index=RUNS_INDEX,
            id=run.id,
            document=run.model_dump(mode="json"),
            refresh="wait_for",
        )

    # ---------- execution ----------

    async def execute_run(self, run_id: str) -> None:
        """백그라운드에서 호출되는 실제 실행 로직."""
        run = await self.get_run(run_id)
        if run is None:
            return
        dataset = await self.get_dataset(run.dataset_id)
        if dataset is None:
            run.status = "failed"
            run.error = f"dataset not found: {run.dataset_id}"
            run.finished_at = _utcnow()
            await self._save_run(run)
            return

        run.status = "running"
        await self._save_run(run)

        try:
            # 1) RAG 파이프라인을 각 question에 돌려 answer/contexts 수집
            graph = build_rag_graph()
            item_results: list[EvalItemResult] = []
            for item in dataset.items:
                state = await graph.ainvoke(
                    {
                        "question": item.question,
                        "index": run.index,
                        "top_k": run.top_k,
                        "history": [{"role": "user", "content": item.question}],
                    }
                )
                contexts = [d.get("text", "") for d in state.get("documents", [])]
                item_results.append(
                    EvalItemResult(
                        question=item.question,
                        ground_truth=item.ground_truth,
                        answer=state.get("answer", ""),
                        contexts=contexts,
                    )
                )

            # 2) RAGAS로 metric 계산 (sync → thread)
            scores_per_item, aggregate = await asyncio.to_thread(
                _run_ragas, item_results, run.metrics
            )
            for r, s in zip(item_results, scores_per_item, strict=False):
                r.scores = s

            run.items = item_results
            run.aggregate_scores = aggregate
            run.status = "completed"
            run.finished_at = _utcnow()
        except Exception as exc:  # noqa: BLE001
            run.status = "failed"
            run.error = str(exc)
            run.finished_at = _utcnow()

        await self._save_run(run)


def _run_ragas(
    items: list[EvalItemResult],
    metric_names: list[str],
) -> tuple[list[dict[str, float]], dict[str, float]]:
    """RAGAS evaluate 호출. 라이브러리 미설치 시에도 import-time에 죽지 않게 지연 import."""
    from datasets import Dataset  # type: ignore
    from ragas import evaluate  # type: ignore
    from ragas.metrics import (  # type: ignore
        answer_relevancy,
        context_precision,
        context_recall,
        faithfulness,
    )

    metric_map = {
        "faithfulness": faithfulness,
        "answer_relevancy": answer_relevancy,
        "context_precision": context_precision,
        "context_recall": context_recall,
    }
    metrics = [metric_map[m] for m in metric_names if m in metric_map]

    ds = Dataset.from_dict(
        {
            "question": [i.question for i in items],
            "answer": [i.answer for i in items],
            "contexts": [i.contexts or [""] for i in items],
            "ground_truth": [i.ground_truth for i in items],
        }
    )
    result = evaluate(ds, metrics=metrics)
    df = result.to_pandas()

    metric_cols = [m.name for m in metrics]
    per_item: list[dict[str, float]] = []
    for _, row in df.iterrows():
        per_item.append({col: float(row[col]) for col in metric_cols if col in row})

    aggregate: dict[str, float] = {}
    for col in metric_cols:
        if col in df.columns:
            aggregate[col] = float(df[col].mean())
    return per_item, aggregate


def get_eval_service(
    client: AsyncElasticsearch = Depends(get_es_client),
) -> EvalService:
    return EvalService(client)
