import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Plus, Trash2, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/api/client";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function HealthBadge({ health }: { health: string | null }) {
  if (!health) return <Badge variant="outline">unknown</Badge>;
  const variant =
    health === "green" ? "default" : health === "yellow" ? "warning" : "destructive";
  return <Badge variant={variant}>{health}</Badge>;
}

export default function IndicesPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data, isLoading, error } = useQuery({
    queryKey: ["indices"],
    queryFn: api.listIndices,
  });

  // ---- create ----
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const createMutation = useMutation({
    mutationFn: (name: string) => api.createIndex(name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["indices"] });
      setNewName("");
      setShowCreate(false);
    },
  });

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(name)) {
      window.alert(
        "인덱스 이름은 소문자, 숫자, '-', '_' 만 사용할 수 있고 소문자/숫자로 시작해야 해요."
      );
      return;
    }
    createMutation.mutate(name);
  };

  // ---- delete ----
  const deleteMutation = useMutation({
    mutationFn: (name: string) => api.deleteIndex(name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["indices"] });
      qc.invalidateQueries({ queryKey: ["files"] });
    },
  });

  const handleDelete = (name: string) => {
    const ok = window.confirm(
      `인덱스 "${name}"를 정말 삭제하시겠습니까?\n\n` +
        "이 작업은 되돌릴 수 없으며, 인덱스에 저장된 모든 청크가 함께 사라집니다."
    );
    if (ok) deleteMutation.mutate(name);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">인덱스</h2>
        <p className="text-muted-foreground">
          Elasticsearch 인덱스 목록과 통계 · 행을 클릭하면 인덱스 안의 파일/청크를 볼 수 있어요
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">인덱스 ({data?.length ?? 0})</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCreate((v) => !v)}
            >
              {showCreate ? (
                <>
                  <X className="mr-1.5 h-4 w-4" />
                  취소
                </>
              ) : (
                <>
                  <Plus className="mr-1.5 h-4 w-4" />새 인덱스
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {showCreate && (
            <div className="mb-4 rounded-md border bg-muted/30 p-3">
              <div className="flex gap-2">
                <Input
                  autoFocus
                  placeholder="인덱스 이름 (예: ragops-legal)"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                />
                <Button
                  onClick={handleCreate}
                  disabled={!newName.trim() || createMutation.isPending}
                >
                  {createMutation.isPending ? "생성 중..." : "생성"}
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                기본 매핑(text + dense_vector + metadata)으로 생성됩니다. 소문자, 숫자, -, _ 만 사용 가능.
              </p>
              {createMutation.error && (
                <p className="mt-2 text-xs text-destructive">
                  {(createMutation.error as Error).message}
                </p>
              )}
            </div>
          )}
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {error && (
            <p className="text-sm text-destructive">{(error as Error).message}</p>
          )}
          {data && data.length === 0 && !showCreate && (
            <p className="text-sm text-muted-foreground">
              인덱스가 없습니다. 위 "+ 새 인덱스" 버튼을 누르거나 문서 페이지에서 파일을 업로드하면
              자동으로 생성됩니다.
            </p>
          )}
          {data && data.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>이름</TableHead>
                  <TableHead className="text-right">문서 수</TableHead>
                  <TableHead className="text-right">크기</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((idx) => {
                  const isDeleting =
                    deleteMutation.isPending &&
                    deleteMutation.variables === idx.name;
                  return (
                    <TableRow
                      key={idx.name}
                      className="cursor-pointer"
                      onClick={() => navigate(`/indices/${encodeURIComponent(idx.name)}`)}
                    >
                      <TableCell className="font-mono text-xs">
                        <div className="flex items-center gap-1.5">
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                          {idx.name}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {idx.docs_count.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatBytes(idx.size_in_bytes)}
                      </TableCell>
                      <TableCell>
                        <HealthBadge health={idx.health} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(idx.name);
                          }}
                          disabled={isDeleting}
                          aria-label={`${idx.name} 삭제`}
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          {deleteMutation.error && (
            <p className="mt-2 text-sm text-destructive">
              삭제 실패: {(deleteMutation.error as Error).message}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
