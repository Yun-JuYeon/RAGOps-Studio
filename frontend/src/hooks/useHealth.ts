import { useQuery } from "@tanstack/react-query";

import { api, type HealthStatus } from "@/api/client";

/** 백엔드의 /health 를 폴링해서 임베더/LLM 가용 여부를 알려준다.
 *  staleTime 을 길게 잡아 자주 호출하지 않음. */
export function useHealth() {
  return useQuery<HealthStatus>({
    queryKey: ["health"],
    queryFn: api.health,
    staleTime: 30_000, // 30s
    refetchOnWindowFocus: false,
  });
}
