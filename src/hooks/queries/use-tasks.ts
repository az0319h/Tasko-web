import { useQuery } from "@tanstack/react-query";
import { getTasksByProjectId, getTaskById } from "@/api/task";
import type { Task, TaskWithProfiles } from "@/api/task";

/**
 * 프로젝트의 Task 목록 조회 훅
 */
export function useTasks(projectId: string | undefined) {
  return useQuery<TaskWithProfiles[]>({
    queryKey: ["tasks", projectId],
    queryFn: () => (projectId ? getTasksByProjectId(projectId) : Promise.resolve([])),
    enabled: !!projectId,
    staleTime: 30 * 1000,
  });
}

/**
 * Task 상세 조회 훅
 */
export function useTask(id: string | undefined) {
  return useQuery<Task | null>({
    queryKey: ["tasks", "detail", id],
    queryFn: () => (id ? getTaskById(id) : Promise.resolve(null)),
    enabled: !!id,
    staleTime: 30 * 1000,
  });
}

