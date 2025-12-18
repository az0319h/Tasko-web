import { createRoot } from "react-dom/client";
import "./index.css";
import { BrowserRouter } from "react-router";
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import i18n from "./i18n";

import App from "./App.tsx";
import { Toaster } from "sonner";
import { DefaultSeo } from "./components/common/default-seo.tsx";
import { HeadProvider } from "react-head";
import { I18nextProvider } from "react-i18next";
import { useI18nRehydrate } from "./hooks/use-i18n-hydrate.ts";

const queryClient = new QueryClient();

function Root() {
  const language = useI18nRehydrate();

  return (
    <I18nextProvider i18n={i18n} key={language}>
      <HeadProvider>
        <BrowserRouter>
          <QueryClientProvider client={queryClient}>
            <ReactQueryDevtools />
            <DefaultSeo />
            <App />
            <Toaster />
          </QueryClientProvider>
        </BrowserRouter>
      </HeadProvider>
    </I18nextProvider>
  );
}

createRoot(document.getElementById("root")!).render(<Root />);
