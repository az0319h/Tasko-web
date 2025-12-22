import { deactivateUser, inviteUser } from "@/api/admin";
import type { UseMutationCallback } from "@/types/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useInviteUser(
  callbacks?: UseMutationCallback<void, string>,
) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: inviteUser,
    onSuccess: async (data, variables, context) => {
      // 쿼리 무효화 및 즉시 다시 가져오기
      await queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      await queryClient.refetchQueries({ queryKey: ["admin", "users"] });
      callbacks?.onSuccess?.(data, variables, context);
    },
    onError: (error, variables, context) => {
      callbacks?.onError?.(error, variables, context);
    },
  });
}

export function useDeactivateUser(
  callbacks?: UseMutationCallback<void, string>,
) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: deactivateUser,
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      callbacks?.onSuccess?.(data, variables, context);
    },
    onError: (error, variables, context) => {
      callbacks?.onError?.(error, variables, context);
    },
  });
}

