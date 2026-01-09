import { useQuery } from "@tanstack/react-query";
import { getTasksByProjectId, getTaskById, getTasksForMember, getTasksForAdmin } from "@/api/task";
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
  return useQuery<TaskWithProfiles | null>({
    queryKey: ["tasks", "detail", id],
    queryFn: () => (id ? getTaskById(id) : Promise.resolve(null)),
    enabled: !!id,
    staleTime: 30 * 1000,
  });
}

/**
 * 멤버용 Task 목록 조회 훅
 * 현재 사용자가 담당자 또는 지시자인 Task만 조회
 * 모든 프로젝트에서 Task 조회 (프로젝트별이 아님)
 * 
 * @param excludeApproved APPROVED 상태 Task 제외 여부 (기본값: true)
 */
export function useTasksForMember(excludeApproved: boolean = true) {
  return useQuery<TaskWithProfiles[]>({
    queryKey: ["tasks", "member", excludeApproved],
    queryFn: () => getTasksForMember(excludeApproved),
    staleTime: 30 * 1000,
  });
}

/**
 * Admin용 Task 목록 조회 훅
 * 모든 Task 조회 (APPROVED 제외 옵션)
 * 
 * @param excludeApproved APPROVED 상태 Task 제외 여부 (기본값: true)
 */
export function useTasksForAdmin(excludeApproved: boolean = true) {
  return useQuery<TaskWithProfiles[]>({
    queryKey: ["tasks", "admin", excludeApproved],
    queryFn: () => getTasksForAdmin(excludeApproved),
    staleTime: 30 * 1000,
  });
}

