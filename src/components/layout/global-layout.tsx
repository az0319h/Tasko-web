import { Link, Outlet } from "react-router";
import { SidebarProvider, SidebarTrigger } from "../ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import logo_en_light from "@/assets/logo_en_light.svg";
import logo_en_dark from "@/assets/logo_en_dark.svg";
import logo_ko_light from "@/assets/logo_ko_light.svg";
import logo_ko_dark from "@/assets/logo_ko_dark.svg";
import { useTranslation } from "react-i18next";
import { useResolvedThemeMode } from "@/hooks";

export default function GlobalLayout() {
  const { i18n } = useTranslation();
  const mode = useResolvedThemeMode();
  return (
    <SidebarProvider>
      <div className="mx-auto flex min-h-screen w-full max-w-400 overflow-x-hidden">
        <AppSidebar />
        <div className="flex flex-1 flex-col">
          <main className="flex-1">
            <div className="flex items-center justify-between border-b p-4 md:hidden">
              <Link to={"/"}>
                {mode === "light" ? (
                  <img
                    src={i18n.language.startsWith("ko") ? logo_ko_dark : logo_en_dark}
                    alt="logo"
                    className="h-6"
                  />
                ) : (
                  <img
                    src={i18n.language.startsWith("ko") ? logo_ko_light : logo_en_light}
                    alt="logo"
                    className="h-6"
                  />
                )}
              </Link>
              <SidebarTrigger className="md:hidden" />
            </div>
            <Outlet />
          </main>
          <footer>footer</footer>
        </div>
      </div>
    </SidebarProvider>
  );
}
