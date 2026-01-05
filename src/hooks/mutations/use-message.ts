import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createMessage,
  createFileMessage,
  createMessageWithFiles,
  markMessageAsRead,
  markTaskMessagesAsRead,
  type MessageInsert,
} from "@/api/message";
import { toast } from "sonner";

/**
 * 메시지 생성 뮤테이션 훅 (optimistic update 적용)
 */
export function useCreateMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (message: MessageInsert) => createMessage(message),
    onMutate: async (newMessage) => {
      // 진행 중인 쿼리 취소
      await queryClient.cancelQueries({ queryKey: ["messages", newMessage.task_id] });

      // 이전 값 백업 (롤백용)
      const previousMessages = queryClient.getQueryData(["messages", newMessage.task_id]);

      // Optimistic update
      queryClient.setQueryData(["messages", newMessage.task_id], (old: any) => {
        if (!old) return old;
        const optimisticMessage = {
          id: `temp-${Date.now()}`,
          ...newMessage,
          user_id: "", // 실제 user_id는 서버에서 설정됨
          created_at: new Date().toISOString(),
          read_by: [],
          sender: {
            id: "",
            full_name: null,
            email: "",
          },
        };
        return [...old, optimisticMessage];
      });

      return { previousMessages };
    },
    onError: (error, variables, context) => {
      // 에러 발생 시 롤백
      if (context?.previousMessages) {
        queryClient.setQueryData(["messages", variables.task_id], context.previousMessages);
      }
      toast.error(error.message || "메시지 전송에 실패했습니다.");
    },
    onSuccess: (data) => {
      // 성공 시 관련 쿼리 무효화하여 최신 데이터 가져오기
      queryClient.invalidateQueries({ queryKey: ["messages", data.task_id] });
    },
  });
}

/**
 * 파일 메시지 생성 뮤테이션 훅
 */
export function useCreateFileMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      taskId,
      fileUrl,
      fileName,
      fileType,
      fileSize,
    }: {
      taskId: string;
      fileUrl: string;
      fileName: string;
      fileType: string;
      fileSize: number;
    }) => createFileMessage(taskId, fileUrl, fileName, fileType, fileSize),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["messages", data.task_id] });
      toast.success("파일이 전송되었습니다.");
    },
    onError: (error: Error) => {
      toast.error(error.message || "파일 전송에 실패했습니다.");
    },
  });
}

/**
 * 텍스트와 파일을 함께 전송하는 뮤테이션 훅
 */
export function useCreateMessageWithFiles() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      taskId,
      content,
      files,
    }: {
      taskId: string;
      content: string | null;
      files: Array<{ url: string; fileName: string; fileType: string; fileSize: number }>;
    }) => createMessageWithFiles(taskId, content, files),
    onMutate: async ({ taskId }) => {
      // 진행 중인 쿼리 취소
      await queryClient.cancelQueries({ queryKey: ["messages", taskId] });
      // 이전 값 백업
      const previousMessages = queryClient.getQueryData(["messages", taskId]);
      return { previousMessages };
    },
    onError: (error, variables, context) => {
      // 에러 발생 시 롤백
      if (context?.previousMessages) {
        queryClient.setQueryData(["messages", variables.taskId], context.previousMessages);
      }
      toast.error(error.message || "메시지 전송에 실패했습니다.");
    },
    onSuccess: (data, variables) => {
      // 성공 시 관련 쿼리 무효화하여 최신 데이터 가져오기
      queryClient.invalidateQueries({ queryKey: ["messages", variables.taskId] });
      const hasText = variables.content && variables.content.trim();
      const hasFiles = variables.files.length > 0;
      if (hasText && hasFiles) {
        toast.success("메시지와 파일이 전송되었습니다.");
      } else if (hasFiles) {
        toast.success(`${variables.files.length}개의 파일이 전송되었습니다.`);
      }
    },
  });
}

/**
 * 메시지 읽음 처리 뮤테이션 훅
 */
export function useMarkMessageAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (messageId: string) => markMessageAsRead(messageId),
    onSuccess: () => {
      // 읽음 처리 후 메시지 목록 무효화
      queryClient.invalidateQueries({ queryKey: ["messages"] });
    },
  });
}

/**
 * Task의 모든 메시지 읽음 처리 뮤테이션 훅
 */
export function useMarkTaskMessagesAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (taskId: string) => markTaskMessagesAsRead(taskId),
    onSuccess: (_, taskId) => {
      // 읽음 처리 후 메시지 목록 무효화
      queryClient.invalidateQueries({ queryKey: ["messages", taskId] });
    },
  });
}

