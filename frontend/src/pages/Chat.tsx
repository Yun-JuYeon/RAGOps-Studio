import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { api, type Citation } from "@/api/client";
import { cn } from "@/lib/utils";

type Msg = {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  searchQuery?: string | null;
};

function CitationList({ citations }: { citations: Citation[] }) {
  return (
    <details className="mt-2 group">
      <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
        참고한 청크 {citations.length}개 보기
      </summary>
      <div className="mt-2 space-y-2">
        {citations.map((c, idx) => (
          <div key={c.id} className="rounded-md border bg-background p-3">
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <Badge variant="outline">#{idx + 1}</Badge>
              {c.filename && (
                <Badge variant="secondary" className="font-mono">
                  {c.filename}
                </Badge>
              )}
              {c.chunk_index !== null && c.chunk_index !== undefined && (
                <Badge variant="outline">chunk #{c.chunk_index}</Badge>
              )}
              {c.index && (
                <Badge variant="outline" className="font-mono">
                  {c.index}
                </Badge>
              )}
              <span className="ml-auto text-[10px] text-muted-foreground">
                score {c.score.toFixed(3)}
              </span>
            </div>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
              {c.text}
            </pre>
          </div>
        ))}
      </div>
    </details>
  );
}

const ALL_INDICES = "__all__";

export default function ChatPage() {
  const { data: indices } = useQuery({
    queryKey: ["indices"],
    queryFn: api.listIndices,
  });
  const { data: health } = useHealth();

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [indexFilter, setIndexFilter] = useState<string>(ALL_INDICES);
  const [topK, setTopK] = useState(8);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // 메시지가 추가되면 자동으로 맨 아래로 스크롤
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const onSend = async () => {
    if (!input.trim()) return;

    // 사전 체크: LLM 미설정이면 보내기 전에 안내
    if (health && !health.llm_available) {
      window.alert(
        "채팅 응답 생성에는 LLM 이 필요합니다.\n\n" +
          "backend/.env 의 OPENAI_API_KEY 를 설정한 뒤 백엔드를 재시작하세요."
      );
      return;
    }

    const next: Msg[] = [...messages, { role: "user", content: input }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const r = await api.chat({
        messages: next,
        index: indexFilter === ALL_INDICES ? undefined : indexFilter,
        top_k: topK,
      });
      setMessages([
        ...next,
        {
          role: "assistant",
          content: r.answer,
          citations: r.citations,
          searchQuery: r.search_query,
        },
      ]);
    } catch (e) {
      setMessages([...next, { role: "assistant", content: (e as Error).message }]);
    } finally {
      setLoading(false);
    }
  };

  const onReset = () => {
    setMessages([]);
  };

  return (
    <div className="flex h-full flex-col space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">채팅</h2>
        <p className="text-muted-foreground">LangGraph 기반 RAG 플레이그라운드</p>
      </div>

      {/* 검색 범위 선택 */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label>검색 범위 (인덱스)</Label>
              <Select value={indexFilter} onValueChange={setIndexFilter}>
                <SelectTrigger className="w-56">
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
              <Label htmlFor="chat-top-k">Top K (참고 청크 수)</Label>
              <Input
                id="chat-top-k"
                type="number"
                className="w-24"
                min={1}
                max={20}
                value={topK}
                onChange={(e) => setTopK(Number(e.target.value) || 1)}
              />
            </div>
            <p className="flex-1 text-xs text-muted-foreground">
              검색 범위와 가져올 청크 수를 조절하세요. 답이 안 나오면 Top K 를 늘려보세요.
            </p>
            {messages.length > 0 && (
              <Button variant="ghost" size="sm" onClick={onReset}>
                대화 초기화
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="flex flex-1 flex-col overflow-hidden">
        <CardContent className="flex-1 space-y-3 overflow-auto p-4">
          {messages.length === 0 && (
            <p className="text-sm text-muted-foreground">
              질문을 입력하면 LangGraph(retrieve → generate)가 응답합니다.
            </p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={cn(m.role === "user" ? "ml-auto max-w-[80%]" : "max-w-[85%]")}>
              <div
                className={cn(
                  "rounded-md p-3 text-sm",
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                )}
              >
                <Badge
                  variant={m.role === "user" ? "secondary" : "outline"}
                  className="mb-1.5"
                >
                  {m.role}
                </Badge>
                <div className="whitespace-pre-wrap">{m.content}</div>
              </div>
              {m.role === "assistant" && m.searchQuery && (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  <span className="font-semibold">검색 키워드:</span>{" "}
                  <span className="font-mono">{m.searchQuery}</span>
                </p>
              )}
              {m.role === "assistant" && m.citations && m.citations.length > 0 && (
                <CitationList citations={m.citations} />
              )}
            </div>
          ))}
          {loading && <p className="text-sm text-muted-foreground">생각 중…</p>}
          <div ref={chatEndRef} />
        </CardContent>
        <div className="border-t p-3">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !loading && onSend()}
              placeholder="질문을 입력하세요..."
              disabled={loading}
            />
            <Button onClick={onSend} disabled={loading || !input.trim()}>
              Send
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
