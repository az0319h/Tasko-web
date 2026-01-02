// src/components/common/default-seo.tsx
import { useEffect } from "react";
import { Title, Meta } from "react-head";
import { useTranslation } from "react-i18next";

export function DefaultSeo() {
  const { i18n, t, ready } = useTranslation();

  if (!ready) return null;

  const isKorean = i18n.language.startsWith("ko");

  const defaultTitle = t("meta.default.title");
  const defaultDescription = t("meta.default.description");
  const keywords = t("meta.default.keywords");
  const ogLocale = isKorean ? "ko_KR" : "en_US";
  useEffect(() => {
    document.documentElement.lang = isKorean ? "ko" : "en";
  }, [isKorean]);

  return (
    <>
      <Title>{defaultTitle}</Title>
      <Meta name="description" content={defaultDescription} />
      <Meta name="keywords" content={keywords} />
      <Meta property="og:title" content={defaultTitle} />
      <Meta property="og:description" content={defaultDescription} />
      <Meta property="og:type" content="website" />
      <Meta property="og:locale" content={ogLocale} />
      <Meta name="robots" content="index,follow" />
    </>
  );
}
