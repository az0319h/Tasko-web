import { useTranslation } from "react-i18next";

export default function CommunityPage() {
  const { t } = useTranslation();

  return (
    <div className="bg-background flex min-h-screen items-center justify-center px-7.5">
      <div className="flex flex-col items-center gap-5">
        <h2 className="text-32-medium font-medium md:text-5xl md:leading-14">
          {t("common.comingSoon")}
        </h2>
        <p className="text-16-regular md:text-20-regular text-center text-muted-foreground">
          {t("common.comingSoonDescription")}
        </p>
      </div>
    </div>
  );
}
