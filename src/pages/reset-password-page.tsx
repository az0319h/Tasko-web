import { SEO } from "@/components/common/seo";
import { ResetPasswordForm } from "@/components/form/reset-password-form";
import { useTranslation } from "react-i18next";

export default function ResetPasswordPage() {
  const { t } = useTranslation();

  return (
    <>
      <SEO title="비밀번호 재설정" description="비밀번호를 재설정할 수 있습니다." />
      <div className="z-30 flex min-h-screen w-full items-center justify-center py-8">
        <div className="w-full max-w-md px-4">
          <ResetPasswordForm />
        </div>
      </div>
    </>
  );
}


