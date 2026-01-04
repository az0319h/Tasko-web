import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createTask,
  updateTask,
  deleteTask,
  updateTaskStatus,
  type TaskInsert,
  type TaskUpdate,
  type TaskWithProfiles,
} from "@/api/task";
import type { TaskStatus } from "@/lib/task-status";
import { toast } from "sonner";

/**
 * Task 생성 뮤테이션 훅 (Admin만 가능)
 * assigner_id와 assignee_id는 모두 선택값
 */
export function useCreateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (task: TaskInsert) => createTask(task),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["tasks", data.project_id] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Task가 생성되었습니다.");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Task 생성에 실패했습니다.");
    },
  });
}

/**
 * Task 수정 뮤테이션 훅
 */
export function useUpdateTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: TaskUpdate }) =>
      updateTask(id, updates),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["tasks", data.project_id] });
      queryClient.invalidateQueries({ queryKey: ["tasks", "detail", data.id] });
      toast.success("Task가 수정되었습니다.");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Task 수정에 실패했습니다.");
    },
  });
}

/**
 * Task 삭제 뮤테이션 훅
 */
export function useDeleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteTask(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Task가 삭제되었습니다.");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Task 삭제에 실패했습니다.");
    },
  });
}

/**
 * Task 상태 변경 뮤테이션 훅
 * - optimistic update 적용
 * - 실패 시 롤백 처리
 */
export function useUpdateTaskStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, newStatus }: { taskId: string; newStatus: TaskStatus }) =>
      updateTaskStatus(taskId, newStatus),
    onMutate: async ({ taskId, newStatus }) => {
      // 진행 중인 쿼리 취소
      await queryClient.cancelQueries({ queryKey: ["tasks"] });

      // 이전 값 백업 (롤백용)
      const previousTasks = queryClient.getQueriesData({ queryKey: ["tasks"] });

      // Optimistic update: 모든 관련 Task 목록 쿼리를 업데이트
      queryClient.setQueriesData<TaskWithProfiles[]>(
        { queryKey: ["tasks"] },
        (old) => {
          if (!old) return old;
          return old.map((task) =>
            task.id === taskId ? { ...task, task_status: newStatus } : task,
          );
        },
      );

      return { previousTasks };
    },
    onError: (error, variables, context) => {
      // 에러 발생 시 롤백
      if (context?.previousTasks) {
        context.previousTasks.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      toast.error(error.message || "상태 변경에 실패했습니다.");
    },
    onSuccess: (data) => {
      // 성공 시 관련 쿼리 무효화하여 최신 데이터 가져오기
      queryClient.invalidateQueries({ queryKey: ["tasks", data.project_id] });
      queryClient.invalidateQueries({ queryKey: ["tasks", "detail", data.id] });
      toast.success("상태가 변경되었습니다.");
    },
  });
}

