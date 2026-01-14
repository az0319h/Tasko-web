import { Link, Outlet } from "react-router";
import { SidebarProvider, SidebarTrigger } from "../ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import { useTranslation } from "react-i18next";
import { useResolvedThemeMode } from "@/hooks";
import logo_dark from "@/assets/logo_dark.png";
import logo_light from "@/assets/logo_light.png";

export default function GlobalLayout() {
  const { i18n } = useTranslation();
  const mode = useResolvedThemeMode();
  return (
    <SidebarProvider>
      <div className="mx-auto flex h-screen w-full max-w-400 overflow-hidden">
        <AppSidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <main className="flex flex-1 flex-col overflow-hidden">
            <div className="flex shrink-0 items-center justify-between border-b p-4 md:hidden">
              <Link to={"/"}>
                <img
                  alt="logo_character"
                  className="size-8.5"
                  src={mode === "dark" ? logo_light : logo_dark}
                />
              </Link>
              <SidebarTrigger className="md:hidden" />
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4 md:px-5">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
