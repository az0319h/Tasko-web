import { Link, Outlet } from "react-router";
import { SidebarProvider, SidebarTrigger } from "../ui/sidebar";
import { AppSidebar } from "./app-sidebar";
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
              <Link to={"/"}>로고</Link>
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
