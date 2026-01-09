import { useQuery } from "@tanstack/react-query";
import { getProjectParticipants, type ProjectParticipant } from "@/api/project";

/**
 * 프로젝트 참여자 목록 조회 훅
 */
export function useProjectParticipants(projectId: string | undefined) {
  return useQuery<ProjectParticipant[]>({
    queryKey: ["project-participants", projectId],
    queryFn: () => (projectId ? getProjectParticipants(projectId) : Promise.resolve([])),
    enabled: !!projectId,
    staleTime: 0, // 즉시 stale로 만들어 항상 최신 데이터 조회
  });
}

