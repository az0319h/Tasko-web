import { useQuery } from "@tanstack/react-query";
import { getMessagesByTaskId } from "@/api/message";
import type { Message } from "@/api/message";

/**
 * Task의 메시지 목록 조회 훅
 */
export function useMessages(taskId: string | undefined) {
  return useQuery<Message[]>({
    queryKey: ["messages", taskId],
    queryFn: () => (taskId ? getMessagesByTaskId(taskId) : Promise.resolve([])),
    enabled: !!taskId,
    staleTime: 10 * 1000, // 메시지는 더 자주 갱신
  });
}

