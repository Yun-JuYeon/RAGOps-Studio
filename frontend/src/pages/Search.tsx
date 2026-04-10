import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

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
import { api, type SearchResponse } from "@/api/client";

type Mode = "bm25" | "dense" | "hybrid";

const MODE_DESCRIPTION: Record<Mode, string> = {
  bm25: "키워드 기반 (전통적인 lexical search). 정확한 단어 일치에 강함.",
  dense: "임베딩 기반 의미 검색 (kNN). 동의어/의역에 강함.",
  hybrid: "BM25 + dense 결합. 가장 안정적인 기본값.",
};

// 인덱스 셀렉터에서 "전체" 옵션의 sentinel 값
const ALL_INDICES = "__all__";

export default function SearchPage() {
  const { data: indices } = useQuery({
    queryKey: ["indices"],
    queryFn: api.listIndices,
  });
  const { data: health } = useHealth();

  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<Mode>("hybrid");
  const [topK, setTopK] = useState(10);
  const [indexFilter, setIndexFilter] = useState<string>(ALL_INDICES);
  const [resp, setResp] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSearch = async () => {
    if (!query.trim()) return;

    // 사전 체크: dense/hybrid 인데 임베더 없음 → 즉시 안내, 백엔드 호출 안 함
    if ((mode === "dense" || mode === "hybrid") && health && !health.embedder_available) {
      window.alert(
        `${mode.toUpperCase()} 검색은 임베딩이 필요합니다.\n\n` +
          "backend/.env 의 OPENAI_API_KEY 를 설정한 뒤 백엔드를 재시작하거나,\n" +
          "검색 모드를 BM25 로 바꿔주세요."
      );
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const r = await api.search({
        query,
        mode,
        top_k: topK,
        index: indexFilter === ALL_INDICES ? undefined : indexFilter,
      });
      setResp(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">검색</h2>
        <p className="text-muted-foreground">BM25 / Dense / Hybrid 검색 디버거</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">질의</CardTitle>
          <CardDescription>{MODE_DESCRIPTION[mode]}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_auto_auto_auto]">
            <div className="space-y-1.5">
              <Label htmlFor="search-query">Query</Label>
              <Input
                id="search-query"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="질의를 입력..."
                onKeyDown={(e) => e.key === "Enter" && onSearch()}
              />
            </div>
            <div className="space-y-1.5">
              <Label>인덱스</Label>
              <Select value={indexFilter} onValueChange={setIndexFilter}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_INDICES}>
                    전체 인덱스
                    {indices && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({indices.length})
                      </span>
                    )}
                  </SelectItem>
                  {indices?.map((i) => (
                    <SelectItem key={i.name} value={i.name}>
                      {i.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>모드</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bm25">BM25</SelectItem>
                  <SelectItem value="dense">Dense</SelectItem>
                  <SelectItem value="hybrid">Hybrid</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="top-k">Top K</Label>
              <Input
                id="top-k"
                type="number"
                className="w-20"
                min={1}
                max={50}
                value={topK}
                onChange={(e) => setTopK(Number(e.target.value))}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={onSearch} disabled={loading}>
                {loading ? "검색 중..." : "Search"}
              </Button>
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      {resp && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Badge variant="secondary">{resp.total} hits</Badge>
            <span>{resp.took_ms}ms</span>
            {indexFilter === ALL_INDICES ? (
              <Badge variant="outline">전체 인덱스</Badge>
            ) : (
              <Badge variant="outline">{indexFilter}</Badge>
            )}
          </div>
          {resp.hits.length === 0 && (
            <p className="text-sm text-muted-foreground">결과가 없습니다.</p>
          )}
          {resp.hits.map((h, i) => {
            const text = h.source.text as string | undefined;
            const metadata = h.source.metadata as Record<string, unknown> | undefined;
            return (
              <Card key={`${h.index}-${h.id}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">#{i + 1}</Badge>
                      {h.index && (
                        <Badge variant="secondary" className="font-mono">
                          {h.index}
                        </Badge>
                      )}
                      {metadata?.filename && (
                        <Badge variant="outline" className="font-mono">
                          {String(metadata.filename)}
                        </Badge>
                      )}
                      <span className="font-mono text-xs text-muted-foreground">
                        {h.id}
                      </span>
                    </div>
                    <Badge variant="secondary">score {h.score.toFixed(3)}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {text && (
                    <pre className="mb-2 whitespace-pre-wrap text-sm">{text}</pre>
                  )}
                  {metadata && Object.keys(metadata).length > 0 && (
                    <div className="rounded-md bg-muted/30 p-2 text-xs text-muted-foreground">
                      {Object.entries(metadata).map(([k, v]) => (
                        <span key={k} className="mr-3">
                          <span className="font-semibold">{k}:</span> {String(v)}
                        </span>
                      ))}
                    </div>
                  )}
                  {h.highlight?.text && (
                    <div className="mt-3 rounded-md border border-yellow-200 bg-yellow-50 p-2 text-xs">
                      <span className="mb-1 block text-[10px] font-semibold text-yellow-700">
                        하이라이트
                      </span>
                      {h.highlight.text.map((frag, idx) => (
                        <div
                          key={idx}
                          dangerouslySetInnerHTML={{
                            // ES highlight 는 <em> 태그만 사용. 악의적 HTML 제거.
                            __html: frag
                              .replace(/<(?!\/?em\b)[^>]*>/g, "")
                              .replace(/on\w+="[^"]*"/gi, ""),
                          }}
                        />
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
