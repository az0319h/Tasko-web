import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createMessage, type MessageInsert } from "@/api/message";

/**
 * 메시지 생성 뮤테이션 훅
 */
export function useCreateMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (message: MessageInsert) => createMessage(message),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["messages", data.task_id] });
    },
    onError: (error: Error) => {
      console.error("메시지 생성 실패:", error);
    },
  });
}

