// 프로젝트 참여자 관련 mutation 훅은 제거되었습니다.
// 프로젝트 구조가 태스크 중심 구조로 전환되었습니다.
// 이 파일은 하위 호환성을 위해 유지되지만 사용되지 않습니다.

import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

export function useAddProjectParticipant() {
  return useMutation({
    mutationFn: async () => {
      throw new Error("프로젝트 구조가 제거되었습니다.");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useAddProjectParticipants() {
  return useMutation({
    mutationFn: async () => {
      throw new Error("프로젝트 구조가 제거되었습니다.");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}

export function useRemoveProjectParticipant() {
  return useMutation({
    mutationFn: async () => {
      throw new Error("프로젝트 구조가 제거되었습니다.");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
