/**
 * 인덱스 상세 페이지 (/indices/:name).
 *
 * 한 ES 인덱스의 내용을 둘러본다:
 *  - 인덱스 정보 (docs/size/health) + 비우기/삭제
 *  - 업로드된 파일 목록 (filename으로 그룹핑된 청크들)
 *    - 행 클릭 → 그 행 바로 아래에 청크 미리보기 인라인 펼침
 *    - 행 우측 휴지통 → 그 파일의 모든 청크 삭제
 *
 * 업로드는 여기서 안 하고 "문서" 페이지에서.
 */

import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronRight,
  Eraser,
  FileText,
  Trash2,
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
import { api } from "@/api/client";
import { cn } from "@/lib/utils";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export default function IndexDetailPage() {
  const params = useParams<{ name: string }>();
  const indexName = params.name ?? "";
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/indices"
          className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          인덱스 목록으로
        </Link>
        <h2 className="text-3xl font-bold tracking-tight">
          인덱스: <span className="font-mono">{indexName}</span>
        </h2>
        <p className="text-muted-foreground">
          이 인덱스에 저장된 파일과 청크를 확인할 수 있어요
        </p>
      </div>

      <IndexInfoCard indexName={indexName} />

      <FilesListCard
        indexName={indexName}
        selectedFile={selectedFile}
        onSelect={setSelectedFile}
      />
    </div>
  );
}

// =====================================================================
// 인덱스 정보 카드
// =====================================================================

function IndexInfoCard({ indexName }: { indexName: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: indices } = useQuery({
    queryKey: ["indices"],
    queryFn: api.listIndices,
  });
  const info = indices?.find((i) => i.name === indexName);

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteIndex(indexName),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["indices"] });
      navigate("/indices");
    },
  });

  const clearMutation = useMutation({
    mutationFn: () => api.clearIndex(indexName),
    onSuccess: (resp) => {
      qc.invalidateQueries({ queryKey: ["indices"] });
      qc.invalidateQueries({ queryKey: ["files", indexName] });
      qc.invalidateQueries({ queryKey: ["file-chunks", indexName] });
      window.alert(`${resp.deleted}개 청크를 삭제했습니다. 인덱스 매핑은 그대로 유지됩니다.`);
    },
  });

  const handleDelete = () => {
    const ok = window.confirm(
      `인덱스 "${indexName}"를 정말 삭제하시겠습니까?\n\n` +
        "이 작업은 되돌릴 수 없으며, 인덱스에 저장된 모든 청크가 함께 사라집니다."
    );
    if (ok) deleteMutation.mutate();
  };

  const handleClear = () => {
    const ok = window.confirm(
      `인덱스 "${indexName}"의 모든 청크를 삭제할까요?\n\n` +
        "인덱스(매핑)는 그대로 유지되고, 안에 있는 도큐먼트만 모두 비웁니다."
    );
    if (ok) clearMutation.mutate();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base">인덱스 정보</CardTitle>
            <CardDescription>Elasticsearch 인덱스의 통계와 상태</CardDescription>
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              disabled={clearMutation.isPending}
              className="text-muted-foreground hover:text-foreground"
            >
              <Eraser className="mr-1.5 h-4 w-4" />
              비우기
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              삭제
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!info && (
          <p className="text-sm text-muted-foreground">
            인덱스 정보를 불러오는 중...
          </p>
        )}
        {info && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="문서 수" value={info.docs_count.toLocaleString()} />
            <Stat label="크기" value={formatBytes(info.size_in_bytes)} />
            <Stat
              label="상태"
              value={
                <Badge
                  variant={
                    info.health === "green"
                      ? "default"
                      : info.health === "yellow"
                        ? "warning"
                        : info.health === "red"
                          ? "destructive"
                          : "outline"
                  }
                >
                  {info.health ?? "unknown"}
                </Badge>
              }
            />
            <Stat label="이름" value={<span className="font-mono text-xs">{info.name}</span>} />
          </div>
        )}
        {deleteMutation.error && (
          <p className="mt-2 text-sm text-destructive">
            삭제 실패: {(deleteMutation.error as Error).message}
          </p>
        )}
        {clearMutation.error && (
          <p className="mt-2 text-sm text-destructive">
            비우기 실패: {(clearMutation.error as Error).message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-muted/30 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

// =====================================================================
// 파일 목록 카드 (인라인 청크 미리보기 포함)
// =====================================================================

function FilesListCard({
  indexName,
  selectedFile,
  onSelect,
}: {
  indexName: string;
  selectedFile: string | null;
  onSelect: (filename: string | null) => void;
}) {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["files", indexName],
    queryFn: () => api.listFiles(indexName),
  });

  const deleteFileMutation = useMutation({
    mutationFn: (filename: string) => api.deleteFile(filename, indexName),
    onSuccess: (_, filename) => {
      qc.invalidateQueries({ queryKey: ["files", indexName] });
      qc.invalidateQueries({ queryKey: ["indices"] });
      qc.invalidateQueries({ queryKey: ["file-chunks", indexName, filename] });
      // 삭제된 파일이 선택돼 있었다면 선택 해제
      if (selectedFile === filename) onSelect(null);
    },
  });

  const handleDeleteFile = (filename: string) => {
    const ok = window.confirm(
      `"${filename}"의 모든 청크를 삭제할까요?\n\n` +
        "이 파일과 관련된 모든 청크가 인덱스에서 제거됩니다."
    );
    if (ok) deleteFileMutation.mutate(filename);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">파일 목록</CardTitle>
        <CardDescription>
          파일을 클릭하면 그 자리에서 청킹된 내용이 펼쳐져요 · 휴지통으로 파일별 삭제 가능
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && <p className="text-sm text-muted-foreground">불러오는 중...</p>}
        {error && (
          <p className="text-sm text-destructive">{(error as Error).message}</p>
        )}
        {data && data.length === 0 && (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            <p>이 인덱스에는 아직 파일이 없습니다.</p>
            <Link
              to="/documents"
              className="mt-2 inline-block font-medium text-primary hover:underline"
            >
              문서 페이지에서 업로드하기 →
            </Link>
          </div>
        )}
        {data && data.length > 0 && (
          <ul className="space-y-2">
            {data.map((f) => {
              const isSelected = selectedFile === f.filename;
              const isDeleting =
                deleteFileMutation.isPending &&
                deleteFileMutation.variables === f.filename;
              return (
                <li
                  key={f.filename}
                  className={cn(
                    "overflow-hidden rounded-md border transition-colors",
                    isSelected ? "border-primary" : "border-border"
                  )}
                >
                  {/* row */}
                  <div
                    className={cn(
                      "flex cursor-pointer items-center justify-between px-3 py-2.5 transition-colors",
                      isSelected
                        ? "bg-primary/5"
                        : "hover:bg-accent hover:text-accent-foreground"
                    )}
                    onClick={() => onSelect(isSelected ? null : f.filename)}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <ChevronRight
                        className={cn(
                          "h-4 w-4 shrink-0 transition-transform",
                          isSelected && "rotate-90"
                        )}
                      />
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate font-mono text-xs">{f.filename}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Badge variant="secondary">{f.chunk_count} chunks</Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteFile(f.filename);
                        }}
                        disabled={isDeleting}
                        aria-label={`${f.filename} 삭제`}
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* inline chunks preview */}
                  {isSelected && (
                    <div className="border-t bg-muted/20 p-3">
                      <InlineChunks indexName={indexName} filename={f.filename} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {deleteFileMutation.error && (
          <p className="mt-2 text-sm text-destructive">
            파일 삭제 실패: {(deleteFileMutation.error as Error).message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// =====================================================================
// 인라인 청크 뷰 (파일 행 바로 아래에 펼침)
// =====================================================================

function InlineChunks({
  indexName,
  filename,
}: {
  indexName: string;
  filename: string;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["file-chunks", indexName, filename],
    queryFn: () => api.getFileChunks(filename, indexName),
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">청크 불러오는 중...</p>;
  }
  if (error) {
    return <p className="text-sm text-destructive">{(error as Error).message}</p>;
  }
  if (!data) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        전체 {data.chunk_count}개 청크 (chunk_index 순)
      </p>
      <div className="max-h-[480px] space-y-2 overflow-auto pr-1">
        {data.chunks.map((c) => (
          <div key={c.id} className="rounded-md border bg-background p-3">
            <div className="mb-2 flex items-center gap-2">
              <Badge variant="outline">#{c.chunk_index}</Badge>
              <span className="font-mono text-[10px] text-muted-foreground">
                {c.id}
              </span>
            </div>
            <pre className="whitespace-pre-wrap text-xs leading-relaxed">
              {c.text}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}
