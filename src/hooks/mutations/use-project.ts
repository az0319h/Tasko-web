import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createProject,
  updateProject,
  deleteProject,
  type ProjectInsert,
  type ProjectUpdate,
} from "@/api/project";
import { toast } from "sonner";

/**
 * 프로젝트 생성 뮤테이션 훅
 * created_by는 자동으로 현재 사용자로 설정됨
 * 프로젝트 생성 시 관리자가 자동으로 참여자로 추가됨
 */
export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      project,
      participantIds,
    }: {
      project: Omit<ProjectInsert, "created_by">;
      participantIds?: string[];
    }) => createProject(project, participantIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("프로젝트가 생성되었습니다.");
    },
    onError: (error: Error) => {
      toast.error(error.message || "프로젝트 생성에 실패했습니다.");
    },
  });
}

/**
 * 프로젝트 수정 뮤테이션 훅
 */
export function useUpdateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: ProjectUpdate }) =>
      updateProject(id, updates),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["projects", data.id] });
      toast.success("프로젝트가 수정되었습니다.");
    },
    onError: (error: Error) => {
      toast.error(error.message || "프로젝트 수정에 실패했습니다.");
    },
  });
}

/**
 * 프로젝트 삭제 뮤테이션 훅
 */
export function useDeleteProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteProject(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("프로젝트가 삭제되었습니다.");
    },
    onError: (error: Error) => {
      toast.error(error.message || "프로젝트 삭제에 실패했습니다.");
    },
  });
}

