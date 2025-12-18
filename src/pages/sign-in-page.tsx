import { SEO } from "@/components/common/seo";
import { useTranslation } from "react-i18next";

export default function SignInPage() {
  const { t } = useTranslation();

  return (
    <>
      <SEO
        title={t("meta.login.title")}
        description={t("meta.login.description")}
      />
    </>
  );
}
