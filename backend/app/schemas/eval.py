from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class EvalItem(BaseModel):
    question: str
    ground_truth: str


class EvalDatasetCreate(BaseModel):
    name: str
    description: str | None = None
    items: list[EvalItem] = Field(default_factory=list)


class EvalDataset(EvalDatasetCreate):
    id: str
    created_at: datetime


RunStatus = Literal["pending", "running", "completed", "failed"]


class EvalRunCreate(BaseModel):
    dataset_id: str
    index: str | None = None  # 평가에 사용할 ES 인덱스 (없으면 default)
    top_k: int = 5
    metrics: list[str] = Field(
        default_factory=lambda: [
            "faithfulness",
            "answer_relevancy",
            "context_precision",
            "context_recall",
        ]
    )


class EvalItemResult(BaseModel):
    question: str
    ground_truth: str
    answer: str
    contexts: list[str]
    scores: dict[str, float] = Field(default_factory=dict)


class EvalRun(BaseModel):
    id: str
    dataset_id: str
    status: RunStatus
    index: str | None = None
    top_k: int = 5
    metrics: list[str] = Field(default_factory=list)
    aggregate_scores: dict[str, float] = Field(default_factory=dict)
    items: list[EvalItemResult] = Field(default_factory=list)
    error: str | None = None
    started_at: datetime
    finished_at: datetime | None = None
