import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addProjectParticipant, addProjectParticipants, removeProjectParticipant } from "@/api/project";
import { toast } from "sonner";

/**
 * 프로젝트 참여자 추가 뮤테이션 훅 (단일)
 */
export function useAddProjectParticipant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId, userId }: { projectId: string; userId: string }) =>
      addProjectParticipant(projectId, userId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["project-participants", variables.projectId] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("참여자가 추가되었습니다.");
    },
    onError: (error: Error) => {
      toast.error(error.message || "참여자 추가에 실패했습니다.");
    },
  });
}

/**
 * 프로젝트 참여자 여러명 추가 뮤테이션 훅
 */
export function useAddProjectParticipants() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId, userIds }: { projectId: string; userIds: string[] }) =>
      addProjectParticipants(projectId, userIds),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["project-participants", variables.projectId] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      const count = variables.userIds.length;
      toast.success(`${count}명의 참여자가 추가되었습니다.`);
    },
    onError: (error: Error) => {
      toast.error(error.message || "참여자 추가에 실패했습니다.");
    },
  });
}

/**
 * 프로젝트 참여자 삭제 뮤테이션 훅
 */
export function useRemoveProjectParticipant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ projectId, userId }: { projectId: string; userId: string }) =>
      removeProjectParticipant(projectId, userId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["project-participants", variables.projectId] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("참여자가 삭제되었습니다.");
    },
    onError: (error: Error) => {
      toast.error(error.message || "참여자 삭제에 실패했습니다.");
    },
  });
}

