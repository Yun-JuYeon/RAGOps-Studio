/**
 * 문서 페이지 — 파일 업로드 전용.
 *
 * 업로드된 파일은 ES 인덱스(`ragops-documents`)에 저장됨.
 * 업로드된 파일/청크 보기는 "인덱스 → 인덱스 상세" 페이지에서 확인.
 */

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  UploadCloud,
  X,
  XCircle,
} from "lucide-react";

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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useHealth } from "@/hooks/useHealth";
import { api, type UploadResponse } from "@/api/client";
import { cn } from "@/lib/utils";

const DEFAULT_INDEX = "ragops-documents";
const ACCEPTED = ".pdf,.docx,.txt,.md,.markdown";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export default function DocumentsPage() {
  const qc = useQueryClient();
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<UploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 인덱스 선택
  const { data: indices } = useQuery({
    queryKey: ["indices"],
    queryFn: api.listIndices,
  });
  const { data: health } = useHealth();
  const [selectedIndex, setSelectedIndex] = useState<string>(DEFAULT_INDEX);
  // 인덱스 목록이 처음 로드되면 적당한 기본값으로 맞춤
  useEffect(() => {
    if (!indices || indices.length === 0) return;
    const hasCurrent = indices.some((i) => i.name === selectedIndex);
    if (!hasCurrent) {
      const fallback =
        indices.find((i) => i.name === DEFAULT_INDEX)?.name ?? indices[0].name;
      setSelectedIndex(fallback);
    }
  }, [indices, selectedIndex]);

  // 청킹 옵션
  const [chunkSize, setChunkSize] = useState(800);
  const [chunkOverlap, setChunkOverlap] = useState(100);
  const overlapInvalid = chunkOverlap >= chunkSize;

  const addFiles = (newFiles: FileList | File[]) => {
    setFiles((prev) => {
      const merged = [...prev];
      for (const f of Array.from(newFiles)) {
        if (!merged.some((m) => m.name === f.name && m.size === f.size)) {
          merged.push(f);
        }
      }
      return merged;
    });
  };

  const removeFile = (name: string) => {
    setFiles((prev) => prev.filter((f) => f.name !== name));
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  const onUpload = async () => {
    if (files.length === 0 || overlapInvalid) return;

    // 사전 체크: 임베더 미설정 → 사용자에게 어떻게 진행할지 물어봄
    let allowNoEmbedding = false;
    if (health && !health.embedder_available) {
      const proceed = window.confirm(
        "OPENAI_API_KEY 가 설정되지 않아 임베딩을 만들 수 없어요.\n\n" +
          "임베딩 없이 BM25 전용으로만 저장할까요?\n" +
          "→ 확인: BM25 전용으로 진행 (Dense/Hybrid 검색은 사용 불가)\n" +
          "→ 취소: 업로드 중단 (backend/.env 에 키 설정 후 백엔드 재시작)"
      );
      if (!proceed) return;
      allowNoEmbedding = true;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await api.uploadFiles(files, {
        index: selectedIndex,
        chunkSize,
        chunkOverlap,
        allowNoEmbedding,
      });
      setResult(r);
      setFiles([]);
      qc.invalidateQueries({ queryKey: ["indices"] });
      qc.invalidateQueries({ queryKey: ["files", selectedIndex] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">문서</h2>
        <p className="text-muted-foreground">
          파일을 업로드하면 청킹·임베딩 후 인덱스에 저장됩니다
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">청킹 옵션</CardTitle>
          <CardDescription>
            긴 문서를 작은 단위(청크)로 자르는 방법을 설정합니다. 청크 크기가
            작을수록 검색 정확도가 올라가지만 청크 수가 많아지고, 클수록 문맥은
            많이 들어가지만 검색이 뭉뚝해집니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="chunk-size">청크 크기 (글자 수)</Label>
              <Input
                id="chunk-size"
                type="number"
                min={50}
                max={4000}
                step={50}
                value={chunkSize}
                onChange={(e) => setChunkSize(Number(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground">
                보통 400~1200 사이. 한국어/영어 일반 문서는 800 정도가 무난해요.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="chunk-overlap">오버랩 (글자 수)</Label>
              <Input
                id="chunk-overlap"
                type="number"
                min={0}
                max={1000}
                step={10}
                value={chunkOverlap}
                onChange={(e) => setChunkOverlap(Number(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground">
                연속된 청크가 겹치는 글자 수. 문장이 잘려도 문맥이 유지되도록.
                보통 청크 크기의 10~20%.
              </p>
            </div>
          </div>
          {overlapInvalid && (
            <p className="mt-2 text-xs text-destructive">
              오버랩은 청크 크기보다 작아야 해요.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">파일 업로드</CardTitle>
          <CardDescription>
            지원 형식:{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">.pdf</code>{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">.docx</code>{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">.txt</code>{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">.md</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 저장 대상 인덱스 선택 */}
          <div className="space-y-1.5">
            <Label htmlFor="dest-index">저장 대상 인덱스</Label>
            {indices && indices.length > 0 ? (
              <Select value={selectedIndex} onValueChange={setSelectedIndex}>
                <SelectTrigger id="dest-index" className="w-full sm:w-80">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {indices.map((i) => (
                    <SelectItem key={i.name} value={i.name}>
                      {i.name}
                      <span className="ml-2 text-xs text-muted-foreground">
                        ({i.docs_count} docs)
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="text-sm text-muted-foreground">
                인덱스가 없어요. 업로드하면{" "}
                <code className="rounded bg-muted px-1 py-0.5 text-xs">
                  {DEFAULT_INDEX}
                </code>
                가 자동 생성됩니다.{" "}
                <Link to="/indices" className="text-primary hover:underline">
                  인덱스 페이지
                </Link>
                에서 직접 만들 수도 있어요.
              </div>
            )}
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-10 text-center transition-colors",
              dragOver
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-muted-foreground/50"
            )}
          >
            <UploadCloud className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm">
              <span className="font-semibold">클릭해서 선택</span>하거나 파일을 여기로 드래그
            </p>
            <p className="text-xs text-muted-foreground">PDF / DOCX / TXT / MD</p>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPTED}
              className="hidden"
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

          {files.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">선택된 파일 ({files.length})</p>
              <ul className="space-y-1.5">
                {files.map((f) => (
                  <li
                    key={f.name + f.size}
                    className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-sm"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate font-mono text-xs">{f.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatBytes(f.size)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(f.name);
                      }}
                      className="rounded p-1 hover:bg-muted"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button
              onClick={onUpload}
              disabled={files.length === 0 || loading || overlapInvalid}
            >
              {loading ? "업로드 중..." : `업로드 (${files.length})`}
            </Button>
            {files.length > 0 && !loading && (
              <Button variant="ghost" onClick={() => setFiles([])}>
                전체 비우기
              </Button>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">업로드 완료</CardTitle>
            <CardDescription>
              인덱스{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">{result.index}</code>에
              총 <strong>{result.total_chunks}</strong>개 청크가 저장되었습니다
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="space-y-1.5">
              {result.files.map((f) => (
                <li
                  key={f.filename}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {f.error ? (
                      <XCircle className="h-4 w-4 shrink-0 text-destructive" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
                    )}
                    <span className="truncate font-mono text-xs">{f.filename}</span>
                  </div>
                  {f.error ? (
                    <Badge variant="destructive">{f.error}</Badge>
                  ) : (
                    <Badge variant="secondary">{f.chunks_indexed} chunks</Badge>
                  )}
                </li>
              ))}
            </ul>
            <Link
              to={`/indices/${encodeURIComponent(result.index)}`}
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              인덱스에서 청크 확인하기
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
