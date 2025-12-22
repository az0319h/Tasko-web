import { getCurrentProfile } from "@/api/profile";
import { useQuery } from "@tanstack/react-query";

export function useCurrentProfile() {
  return useQuery({
    queryKey: ["profile", "current"],
    queryFn: getCurrentProfile,
    retry: false,
  });
}


