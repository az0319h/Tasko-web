import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createTask,
  updateTask,
  deleteTask,
  type TaskInsert,
  type TaskUpdate,
} from "@/api/task";
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

