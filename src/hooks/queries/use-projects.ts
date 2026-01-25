// 프로젝트 관련 훅은 제거되었습니다.
// 프로젝트 구조가 태스크 중심 구조로 전환되었습니다.
// 이 파일은 하위 호환성을 위해 유지되지만 사용되지 않습니다.

import { useQuery } from "@tanstack/react-query";

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: () => Promise.resolve([]),
    enabled: false,
  });
}

export function useProject(_id: string | undefined) {
  return useQuery({
    queryKey: ["projects", _id],
    queryFn: () => Promise.resolve(null),
    enabled: false,
  });
}
