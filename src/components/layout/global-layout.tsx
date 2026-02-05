import { Link, Outlet, useLocation, useNavigationType } from "react-router";
import { SidebarProvider, SidebarTrigger } from "../ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import { useTranslation } from "react-i18next";
import { useResolvedThemeMode } from "@/hooks";
import logo_dark from "@/assets/logo_dark.png";
import logo_light from "@/assets/logo_light.png";
import { AnnouncementModal } from "../announcement/announcement-modal";
import { useAnnouncements } from "@/hooks/queries/use-announcements";
import { useRealtimeAnnouncements } from "@/hooks/queries/use-realtime-announcements";
import { useEffect, useState, useLayoutEffect, useRef } from "react";

export default function GlobalLayout() {
  const { i18n } = useTranslation();
  const mode = useResolvedThemeMode();
  const { data: announcements } = useAnnouncements();
  const [currentAnnouncementIndex, setCurrentAnnouncementIndex] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { pathname } = useLocation();
  const navType = useNavigationType();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevPathRef = useRef(pathname);
  const scrollYRef = useRef(0);

  // 공지사항 리얼타임 구독
  useRealtimeAnnouncements(true);

  // 스크롤 위치 추적
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const saveScroll = () => {
      scrollYRef.current = container.scrollTop;
    };

    container.addEventListener("scroll", saveScroll, { passive: true });
    return () => container.removeEventListener("scroll", saveScroll);
  }, []);

  // 스크롤 복원 처리
  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // 페이지 이동(PUSH)할 때: 떠나는 페이지 위치 저장
    if (navType === "PUSH") {
      const prevPath = prevPathRef.current;
      if (prevPath !== pathname) {
        sessionStorage.setItem(`scroll_${prevPath}`, scrollYRef.current.toString());
      }
      // 새 페이지는 스크롤을 최상단으로
      container.scrollTop = 0;
    }
    // 뒤로가기(POP) 할 때: 저장된 위치로 복원
    else if (navType === "POP") {
      const saved = Number(sessionStorage.getItem(`scroll_${pathname}`)) || 0;
      let tries = 0;
      
      const restore = () => {
        container.scrollTop = saved;
        // DOM 렌더링이 완료되지 않았을 수 있으므로 재시도
        if (Math.abs(container.scrollTop - saved) > 1 && tries++ < 15) {
          setTimeout(restore, 50);
        }
      };
      
      // 약간의 지연 후 복원 시도 (DOM 렌더링 완료 대기)
      setTimeout(restore, 0);
    }
    
    prevPathRef.current = pathname;
  }, [pathname, navType]);

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
            <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 md:p-5">
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
