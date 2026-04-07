const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

/** FastAPI 의 {detail: "..."} 응답을 사람이 읽기 좋은 메세지로 추출. */
function extractErrorMessage(text: string, fallback: string): string {
  if (!text) return fallback;
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") {
      const d = (parsed as { detail?: unknown }).detail;
      if (typeof d === "string") return d;
      if (d) return JSON.stringify(d);
    }
  } catch {
    // not JSON
  }
  return text;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}/api/v1${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(extractErrorMessage(text, `${res.status} ${res.statusText}`));
  }
  // 204 No Content 또는 빈 body에서 res.json() 폭발 방지
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

async function uploadForm<T>(path: string, form: FormData): Promise<T> {
  // multipart/form-data는 Content-Type을 직접 세팅하지 말 것 (boundary 필요)
  const res = await fetch(`${BASE_URL}/api/v1${path}`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(extractErrorMessage(text, `${res.status} ${res.statusText}`));
  }
  return res.json() as Promise<T>;
}

export type FileUploadResult = {
  filename: string;
  chunks_indexed: number;
  error?: string | null;
};

export type UploadResponse = {
  index: string;
  files: FileUploadResult[];
  total_chunks: number;
};

export type Citation = {
  id: string;
  index?: string | null;
  filename?: string | null;
  chunk_index?: number | null;
  score: number;
  text: string;
};

export type ChatResponse = {
  answer: string;
  search_query?: string | null;
  citations: Citation[];
};

export type FileSummary = {
  filename: string;
  chunk_count: number;
};

export type FileChunk = {
  id: string;
  chunk_index: number;
  text: string;
};

export type FileDetail = {
  filename: string;
  chunk_count: number;
  chunks: FileChunk[];
};

export type HealthStatus = {
  status: string;
  elasticsearch: boolean;
  embedder_available: boolean;
  llm_available: boolean;
};

export type IndexInfo = {
  name: string;
  docs_count: number;
  size_in_bytes: number;
  health: string | null;
};

export type SearchHit = {
  id: string;
  index?: string | null;
  score: number;
  source: Record<string, unknown>;
  highlight?: Record<string, string[]>;
};

export type SearchResponse = {
  total: number;
  took_ms: number;
  hits: SearchHit[];
};

export const api = {
  health: () => request<HealthStatus>("/health"),
  listIndices: () => request<IndexInfo[]>("/indices"),
  createIndex: (name: string) =>
    request<{ name: string; created: boolean }>("/indices", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  deleteIndex: (name: string) =>
    request<void>(`/indices/${encodeURIComponent(name)}`, { method: "DELETE" }),
  clearIndex: (name: string) =>
    request<{ name: string; deleted: number }>(
      `/indices/${encodeURIComponent(name)}/clear`,
      { method: "POST" }
    ),

  ingestText: (body: { index?: string; text: string; metadata?: Record<string, unknown> }) =>
    request("/documents/ingest", { method: "POST", body: JSON.stringify(body) }),

  uploadFiles: (
    files: File[],
    options?: {
      index?: string;
      chunkSize?: number;
      chunkOverlap?: number;
      allowNoEmbedding?: boolean;
    }
  ) => {
    const form = new FormData();
    for (const f of files) form.append("files", f);
    if (options?.index) form.append("index", options.index);
    if (options?.chunkSize !== undefined)
      form.append("chunk_size", String(options.chunkSize));
    if (options?.chunkOverlap !== undefined)
      form.append("chunk_overlap", String(options.chunkOverlap));
    if (options?.allowNoEmbedding !== undefined)
      form.append("allow_no_embedding", String(options.allowNoEmbedding));
    return uploadForm<UploadResponse>("/documents/upload", form);
  },
  listFiles: (index?: string) => {
    const qs = index ? `?index=${encodeURIComponent(index)}` : "";
    return request<FileSummary[]>(`/documents/files${qs}`);
  },
  getFileChunks: (filename: string, index?: string) => {
    const qs = index ? `?index=${encodeURIComponent(index)}` : "";
    return request<FileDetail>(
      `/documents/files/${encodeURIComponent(filename)}/chunks${qs}`
    );
  },
  deleteFile: (filename: string, index?: string) => {
    const qs = index ? `?index=${encodeURIComponent(index)}` : "";
    return request<{ filename: string; deleted: number }>(
      `/documents/files/${encodeURIComponent(filename)}${qs}`,
      { method: "DELETE" }
    );
  },

  search: (body: { query: string; index?: string; mode?: string; top_k?: number }) =>
    request<SearchResponse>("/search", { method: "POST", body: JSON.stringify(body) }),

  chat: (body: {
    index?: string;
    messages: { role: "user" | "assistant" | "system"; content: string }[];
    top_k?: number;
  }) =>
    request<ChatResponse>("/chat", { method: "POST", body: JSON.stringify(body) }),

  // ---------- eval (WIP — 백엔드 라우터 비활성화 상태) ----------
  // 백엔드의 evaluation 라우터가 다시 활성화되면 그대로 사용 가능.
  listDatasets: () => request<EvalDataset[]>("/eval/datasets"),
  createDataset: (body: { name: string; description?: string; items: EvalItem[] }) =>
    request<EvalDataset>("/eval/datasets", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  deleteDataset: (id: string) =>
    request<void>(`/eval/datasets/${encodeURIComponent(id)}`, { method: "DELETE" }),
  startRun: (body: { dataset_id: string; index?: string; top_k?: number; metrics?: string[] }) =>
    request<EvalRun>("/eval/runs", { method: "POST", body: JSON.stringify(body) }),
  listRuns: () => request<EvalRun[]>("/eval/runs"),
  getRun: (id: string) => request<EvalRun>(`/eval/runs/${encodeURIComponent(id)}`),
};

export type EvalItem = { question: string; ground_truth: string };

export type EvalDataset = {
  id: string;
  name: string;
  description?: string | null;
  items: EvalItem[];
  created_at: string;
};

export type EvalItemResult = {
  question: string;
  ground_truth: string;
  answer: string;
  contexts: string[];
  scores: Record<string, number>;
};

export type EvalRun = {
  id: string;
  dataset_id: string;
  status: "pending" | "running" | "completed" | "failed";
  index?: string | null;
  top_k: number;
  metrics: string[];
  aggregate_scores: Record<string, number>;
  items: EvalItemResult[];
  error?: string | null;
  started_at: string;
  finished_at?: string | null;
};
