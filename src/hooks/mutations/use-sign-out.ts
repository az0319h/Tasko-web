import { signOut } from "@/api/auth";
import type { UseMutationCallback } from "@/types/types";
import { useMutation } from "@tanstack/react-query";

export function useSignOut(callbacks?: UseMutationCallback<void, void>) {
  return useMutation({
    mutationFn: signOut,
    onSuccess: () => {
      callbacks?.onSuccess?.(undefined, undefined, undefined);
    },
    onError: (error) => {
      callbacks?.onError?.(error, undefined, undefined);
    },
  });
}
