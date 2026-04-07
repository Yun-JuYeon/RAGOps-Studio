"""Evaluation endpoints — RAGAS 자동 평가.

⚠️ 현재 WIP / 비활성화 상태.
`app/api/v1/router.py`에서 이 라우터의 include가 주석 처리되어 있다.
재개할 때 그 라인을 풀고, `pyproject.toml`의 ragas/datasets 의존성도 활성화할 것.
"""

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

from app.schemas.eval import EvalDataset, EvalDatasetCreate, EvalRun, EvalRunCreate
from app.services.eval_service import EvalService, get_eval_service

router = APIRouter()


# ---------- datasets ----------


@router.post("/datasets", response_model=EvalDataset, status_code=201)
async def create_dataset(
    body: EvalDatasetCreate,
    svc: EvalService = Depends(get_eval_service),
):
    return await svc.create_dataset(body)


@router.get("/datasets", response_model=list[EvalDataset])
async def list_datasets(svc: EvalService = Depends(get_eval_service)):
    return await svc.list_datasets()


@router.get("/datasets/{dataset_id}", response_model=EvalDataset)
async def get_dataset(dataset_id: str, svc: EvalService = Depends(get_eval_service)):
    ds = await svc.get_dataset(dataset_id)
    if ds is None:
        raise HTTPException(status_code=404, detail="dataset not found")
    return ds


@router.delete("/datasets/{dataset_id}", status_code=204)
async def delete_dataset(dataset_id: str, svc: EvalService = Depends(get_eval_service)):
    await svc.delete_dataset(dataset_id)


# ---------- runs ----------


@router.post("/runs", response_model=EvalRun, status_code=202)
async def start_run(
    body: EvalRunCreate,
    background: BackgroundTasks,
    svc: EvalService = Depends(get_eval_service),
):
    ds = await svc.get_dataset(body.dataset_id)
    if ds is None:
        raise HTTPException(status_code=404, detail="dataset not found")
    run = await svc.create_run(body)
    background.add_task(svc.execute_run, run.id)
    return run


@router.get("/runs", response_model=list[EvalRun])
async def list_runs(svc: EvalService = Depends(get_eval_service)):
    return await svc.list_runs()


@router.get("/runs/{run_id}", response_model=EvalRun)
async def get_run(run_id: str, svc: EvalService = Depends(get_eval_service)):
    run = await svc.get_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="run not found")
    return run
