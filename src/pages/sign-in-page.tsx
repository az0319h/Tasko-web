import { SEO } from "@/components/common/seo";
import { SigninForm } from "@/components/form/sign-in-form";
import { useTranslation } from "react-i18next";

export default function SignInPage() {
  const { t } = useTranslation();

  return (
    <>
      <SEO title={t("meta.login.title")} description={t("meta.login.description")} />
      <div className="z-30 flex min-h-screen w-full items-center justify-center py-8">
        <div className="w-full max-w-100 px-4">
          <SigninForm />
        </div>
      </div>
    </>
  );
}
