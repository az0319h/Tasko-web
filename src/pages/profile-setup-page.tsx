import { SEO } from "@/components/common/seo";
import { ProfileSetupForm } from "@/components/form/profile-setup-form";
import { useTranslation } from "react-i18next";

export default function ProfileSetupPage() {
  const { t } = useTranslation();

  return (
    <>
      <SEO title="프로필 설정" description="비밀번호와 프로필을 설정해주세요." />
      <div className="flex min-h-screen items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <ProfileSetupForm />
        </div>
      </div>
    </>
  );
}

