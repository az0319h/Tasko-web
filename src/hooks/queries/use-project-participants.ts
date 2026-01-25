import { useQuery } from "@tanstack/react-query";

/**
 * 프로젝트 참여자 목록 조회 훅 (deprecated)
 * 프로젝트 구조 제거로 인해 더 이상 사용되지 않음
 */
export function useProjectParticipants(_projectId: string | undefined) {
  return useQuery<never[]>({
    queryKey: ["project-participants", _projectId],
    queryFn: () => Promise.resolve([]),
    enabled: false,
  });
}

