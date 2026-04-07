/**
 * Evaluation 페이지 — RAGAS 자동 평가
 *
 * ⚠️ 작업 중 / 추후 개발 예정
 * 백엔드 evaluation 라우터가 비활성화 상태라 현재는 호출되지 않음.
 * 아래 EvalPageImpl 구현은 골격으로 유지 — 백엔드 활성화 시 WipBanner 제거 후 활성화.
 *
 * 재개 시 체크리스트:
 *  1) backend/pyproject.toml 의 ragas/datasets 의존성 활성화
 *  2) backend/app/api/v1/router.py 의 evaluation include_router 주석 해제
 *  3) 이 파일의 WipBanner 제거 + 아래 EvalPageImpl 활성화
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { api, type EvalItem, type EvalRun } from "@/api/client";

export default function EvalPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">평가</h2>
        <p className="text-muted-foreground">RAGAS 기반 RAG 파이프라인 자동 평가</p>
      </div>

      <WipBanner />
      {/* 백엔드 활성화 시 아래 한 줄만 살리면 됩니다. */}
      {/* <EvalPageImpl /> */}
      <EvalDesignPreview />
    </div>
  );
}

function WipBanner() {
  return (
    <Card className="border-yellow-300 bg-yellow-50">
      <CardHeader>
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-yellow-700" />
          <CardTitle className="text-base text-yellow-900">
            추후 개발 예정 (작업 중)
          </CardTitle>
          <Badge variant="warning">WIP</Badge>
        </div>
        <CardDescription className="text-yellow-800">
          관리자가 정답지(question + ground_truth)를 등록하고, RAG 파이프라인을 자동
          실행하여 <strong>faithfulness / answer_relevancy / context_precision /
          context_recall</strong> 지표를 측정하는 기능입니다. 백엔드 골격은 준비되어
          있으며 현재는 비활성화 상태입니다.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function EvalDesignPreview() {
  const metrics = [
    "faithfulness",
    "answer_relevancy",
    "context_precision",
    "context_recall",
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">설계 미리보기</CardTitle>
        <CardDescription>구현될 평가 파이프라인의 흐름</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>관리자가 정답지 데이터셋(JSON/CSV)을 업로드</li>
          <li>각 question에 대해 LangGraph(retrieve → generate)를 실행하여 answer/contexts 수집</li>
          <li>RAGAS evaluate() 호출 → 항목별 + 집계 점수 산출</li>
          <li>
            결과를 ES 인덱스(<code className="rounded bg-muted px-1">ragops-eval-runs</code>)에
            저장 + UI에 시계열 비교
          </li>
        </ol>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {metrics.map((m) => (
            <div key={m} className="rounded-md border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">{m}</div>
              <div className="mt-1 font-mono text-2xl text-muted-foreground/40">—</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================
// 아래는 백엔드 활성화 시 그대로 사용할 실제 구현 (현재는 미사용).
// =============================================================

// @ts-expect-error - 현재 미사용. 백엔드 라우터 활성화 시 EvalPage에서 호출.
function EvalPageImpl() {
  const qc = useQueryClient();

  const datasetsQ = useQuery({ queryKey: ["eval-datasets"], queryFn: api.listDatasets });
  const runsQ = useQuery({
    queryKey: ["eval-runs"],
    queryFn: api.listRuns,
    refetchInterval: 3000,
  });

  const [name, setName] = useState("");
  const [rawItems, setRawItems] = useState(
    '[\n  {"question": "RAGOps Studio가 뭐야?", "ground_truth": "Elasticsearch 기반 RAG 운영 콘솔"}\n]'
  );

  const createDs = useMutation({
    mutationFn: async () => {
      let items: EvalItem[] = [];
      try {
        items = JSON.parse(rawItems);
      } catch (e) {
        throw new Error("items JSON 파싱 실패: " + (e as Error).message);
      }
      return api.createDataset({ name, items });
    },
    onSuccess: () => {
      setName("");
      qc.invalidateQueries({ queryKey: ["eval-datasets"] });
    },
  });

  const startRun = useMutation({
    mutationFn: (datasetId: string) => api.startRun({ dataset_id: datasetId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["eval-runs"] }),
  });

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">정답지 데이터셋</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ds-name">이름</Label>
            <Input
              id="ds-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="데이터셋 이름"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ds-items">Items (JSON)</Label>
            <Textarea
              id="ds-items"
              className="h-40 font-mono text-xs"
              value={rawItems}
              onChange={(e) => setRawItems(e.target.value)}
            />
          </div>
          <Button disabled={!name || createDs.isPending} onClick={() => createDs.mutate()}>
            데이터셋 생성
          </Button>
          {createDs.error && (
            <p className="text-sm text-destructive">
              {(createDs.error as Error).message}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">데이터셋 목록</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Created</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {datasetsQ.data?.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-mono text-xs">{d.name}</TableCell>
                  <TableCell>{d.items.length}</TableCell>
                  <TableCell>{new Date(d.created_at).toLocaleString()}</TableCell>
                  <TableCell>
                    <Button size="sm" onClick={() => startRun.mutate(d.id)}>
                      평가 실행
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">실행 이력</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {runsQ.data?.map((r) => (
            <RunCard key={r.id} run={r} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function RunCard({ run }: { run: EvalRun }) {
  const variant =
    run.status === "completed"
      ? "default"
      : run.status === "running"
        ? "warning"
        : run.status === "failed"
          ? "destructive"
          : "secondary";

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">
              {run.id.slice(0, 8)}
            </span>
            <Badge variant={variant}>{run.status}</Badge>
          </div>
          <span className="text-xs text-muted-foreground">
            {new Date(run.started_at).toLocaleString()}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {run.error && <p className="text-sm text-destructive">{run.error}</p>}
        {Object.keys(run.aggregate_scores).length > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Object.entries(run.aggregate_scores).map(([k, v]) => (
              <div key={k} className="rounded-md bg-muted/30 p-2">
                <div className="text-xs text-muted-foreground">{k}</div>
                <div className="font-mono text-lg">{v.toFixed(3)}</div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
