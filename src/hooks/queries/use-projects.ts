import { useQuery } from "@tanstack/react-query";
import { getProjects, getProjectById } from "@/api/project";
import type { Project } from "@/api/project";

/**
 * 프로젝트 목록 조회 훅
 * RLS 정책에 따라 권한별로 다른 프로젝트 목록을 반환
 * 전체 데이터를 한 번에 fetch (클라이언트 사이드에서 필터링/페이지네이션 처리)
 */
export function useProjects() {
  return useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: getProjects,
    staleTime: 30 * 1000, // 30초간 캐시
  });
}

/**
 * 프로젝트 상세 조회 훅
 */
export function useProject(id: string | undefined) {
  return useQuery<Project | null>({
    queryKey: ["projects", id],
    queryFn: () => (id ? getProjectById(id) : Promise.resolve(null)),
    enabled: !!id,
    staleTime: 30 * 1000,
  });
}

