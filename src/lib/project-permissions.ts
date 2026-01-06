import type { Project } from "@/api/project";
import type { Task } from "@/api/task";
import { useCurrentProfile } from "@/hooks";
import { useIsAdmin } from "@/hooks";

/**
 * 프로젝트 접근 권한 확인
 * - Public 프로젝트: 모든 사용자 접근 가능
 * - Private 프로젝트: Admin 또는 Task 참여자만 접근 가능
 */
export function canAccessProject(
  project: Project,
  isAdmin: boolean,
  userId: string | undefined
): boolean {
  // Public 프로젝트는 모든 사용자 접근 가능
  if (project.is_public) {
    return true;
  }

  // Admin은 모든 프로젝트 접근 가능
  if (isAdmin) {
    return true;
  }

  // Private 프로젝트는 Task 참여자만 접근 가능
  // (실제로는 RLS 정책에서 처리되지만, 프론트엔드에서도 체크)
  // Task 참여 여부는 백엔드에서 확인해야 하므로 여기서는 기본적으로 false 반환
  // 실제 접근 권한은 RLS 정책에 의해 제어됨
  return false;
}

/**
 * Task 수정 권한 확인
 * - Admin만 Task 수정 가능
 * - assigner / assignee는 수정 불가
 */
export function canEditTask(
  task: Task,
  userId: string | undefined,
  isAdmin: boolean
): boolean {
  if (!userId) {
    return false;
  }

  // Admin만 수정 가능
  return isAdmin;
}

/**
 * 프로젝트 수정/삭제 권한 확인
 * - Admin만 가능
 */
export function canManageProject(isAdmin: boolean): boolean {
  return isAdmin;
}

