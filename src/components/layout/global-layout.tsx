import { Link, Outlet } from "react-router";
import { SidebarProvider, SidebarTrigger } from "../ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import { useTranslation } from "react-i18next";
import { useResolvedThemeMode } from "@/hooks";
import logo_dark from "@/assets/logo_dark.png";
import logo_light from "@/assets/logo_light.png";
import { AnnouncementModal } from "../announcement/announcement-modal";
import { useAnnouncements } from "@/hooks/queries/use-announcements";
import { useRealtimeAnnouncements } from "@/hooks/queries/use-realtime-announcements";
import { useEffect, useState } from "react";

export default function GlobalLayout() {
  const { i18n } = useTranslation();
  const mode = useResolvedThemeMode();
  const { data: announcements } = useAnnouncements();
  const [currentAnnouncementIndex, setCurrentAnnouncementIndex] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // 공지사항 리얼타임 구독
  useRealtimeAnnouncements(true);

  // 활성 공지사항이 있으면 모달 표시
  useEffect(() => {
    if (announcements && announcements.length > 0) {
      setCurrentAnnouncementIndex(0);
      setIsModalOpen(true);
    }
  }, [announcements]);

  const handleModalClose = () => {
    setIsModalOpen(false);
    // 다음 공지사항이 있으면 표시
    if (announcements && currentAnnouncementIndex < announcements.length - 1) {
      setCurrentAnnouncementIndex((prev) => prev + 1);
      setIsModalOpen(true);
    }
  };

  const currentAnnouncement = announcements?.[currentAnnouncementIndex];

  return (
    <SidebarProvider>
      <div className="mx-auto flex h-screen w-full max-w-450 overflow-hidden">
        <AppSidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <main className="flex flex-1 flex-col overflow-hidden">
            <div className="flex shrink-0 items-center justify-between border-b p-4 md:px-5 lg:hidden">
              <Link to={"/"}>
                <img
                  alt="logo_character"
                  className="size-8.5 md:size-10"
                  src={mode === "dark" ? logo_light : logo_dark}
                />
              </Link>
              <SidebarTrigger className="lg:hidden" />
            </div>
            <div className="flex-1 overflow-y-auto p-4 md:p-5">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
      {currentAnnouncement && (
        <AnnouncementModal
          announcement={currentAnnouncement}
          open={isModalOpen}
          onOpenChange={handleModalClose}
        />
      )}
    </SidebarProvider>
  );
}
