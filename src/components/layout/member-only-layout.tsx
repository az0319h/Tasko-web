import { useSession } from "@/store/session";
import { Navigate, Outlet } from "react-router";
import { useCurrentProfile, useCreateProfileAuto } from "@/hooks";
import DefaultSpinner from "../common/default-spinner";
import { useRef, useEffect } from "react";

export default function MemberOnlyLayout() {
  const session = useSession();
  const { data: profile, isLoading, isError } = useCurrentProfile();
  const hasCreatedProfile = useRef(false);
  const { mutate: createProfileAuto } = useCreateProfileAuto({
    onError: (error) => {
      console.error("프로필 자동 생성 실패:", error);
    },
  });

  useEffect(() => {
    // 프로필이 없고 에러가 없는 경우 (프로필이 정말 없는 경우) 자동 생성
    if (!isLoading && !profile && !isError && session && !hasCreatedProfile.current) {
      hasCreatedProfile.current = true;
      createProfileAuto();
    }
  }, [profile, isLoading, isError, session, createProfileAuto]);

  if (!session) return <Navigate to={"/sign-in"} replace={true} />;

  if (isLoading) {
    return <DefaultSpinner />;
  }

  return <Outlet />;
}
