import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import supabase from "@/lib/supabase";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

/**
 * Supabase Realtime으로 공지사항 실시간 구독 훅
 * @param enabled 구독 활성화 여부
 */
export function useRealtimeAnnouncements(enabled: boolean = true) {
  const queryClient = useQueryClient();
  const channelRef = useRef<any>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    // 이전 재시도 타이머 정리
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    const MAX_RETRIES = 3;
    const RETRY_DELAY = 2000; // 2초

    const setupSubscription = () => {
      // 기존 채널이 있으면 제거
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }

      // Realtime 채널 생성
      const channel = supabase
        .channel("announcements_realtime", {
          config: {
            broadcast: { self: true },
          },
        })
        .on(
          "postgres_changes",
          {
            event: "*", // INSERT, UPDATE, DELETE 모두 구독
            schema: "public",
            table: "announcements",
          },
          (payload: RealtimePostgresChangesPayload<any>) => {
            console.log(`[Realtime] Announcement change detected:`, payload.eventType, payload);

            // INSERT 이벤트: 새 공지사항이 생성됨
            if (payload.eventType === "INSERT") {
              const newAnnouncement = payload.new;
              const announcementId = newAnnouncement?.id;
              console.log(`[Realtime] 📢 New announcement inserted: ${announcementId}`);
              // 활성 공지사항 쿼리 무효화
              queryClient.invalidateQueries({ queryKey: ["announcements", "active"] });
              // 관리자 공지사항 목록도 무효화
              queryClient.invalidateQueries({ queryKey: ["announcements", "admin"] });
            }
            // UPDATE 이벤트: 공지사항이 업데이트됨 (활성화/비활성화, 내용 수정 등)
            else if (payload.eventType === "UPDATE") {
              const updatedAnnouncement = payload.new;
              const announcementId = updatedAnnouncement?.id;
              console.log(`[Realtime] 🔄 Announcement updated: ${announcementId}`, {
                is_active: updatedAnnouncement?.is_active,
                title: updatedAnnouncement?.title?.substring(0, 50),
              });
              // 활성 공지사항 쿼리 무효화
              queryClient.invalidateQueries({ queryKey: ["announcements", "active"] });
              // 관리자 공지사항 목록도 무효화
              queryClient.invalidateQueries({ queryKey: ["announcements", "admin"] });
            }
            // DELETE 이벤트: 공지사항이 삭제됨
            else if (payload.eventType === "DELETE") {
              const deletedAnnouncement = payload.old;
              const announcementId = deletedAnnouncement?.id;
              console.log(`[Realtime] 🗑️ Announcement deleted: ${announcementId}`);
              // 활성 공지사항 쿼리 무효화
              queryClient.invalidateQueries({ queryKey: ["announcements", "active"] });
              // 관리자 공지사항 목록도 무효화
              queryClient.invalidateQueries({ queryKey: ["announcements", "admin"] });
            }
          }
        )
        .subscribe((status) => {
          setSubscriptionStatus(status);
          console.log(`[Realtime] Announcements subscription status:`, status);

          if (status === "SUBSCRIBED") {
            console.log(`[Realtime] ✅ Successfully subscribed to announcements`);
            retryCountRef.current = 0; // 성공 시 재시도 카운터 리셋
          } else if (status === "CHANNEL_ERROR") {
            console.error(`[Realtime] ❌ Channel error for announcements`);
            handleSubscriptionFailure();
          } else if (status === "TIMED_OUT") {
            console.error(`[Realtime] ⏱️ Subscription timed out for announcements`);
            handleSubscriptionFailure();
          } else if (status === "CLOSED") {
            console.warn(`[Realtime] ⚠️ Channel closed for announcements`);
            // CLOSED는 정상적인 종료일 수 있으므로 재시도하지 않음
          } else if (status === "SUBSCRIBE_ERROR") {
            console.error(`[Realtime] ❌ Subscribe error for announcements`);
            handleSubscriptionFailure();
          }
        });

      channelRef.current = channel;
    };

    const handleSubscriptionFailure = () => {
      if (retryCountRef.current < MAX_RETRIES) {
        retryCountRef.current += 1;
        console.log(
          `[Realtime] Retrying announcements subscription (${retryCountRef.current}/${MAX_RETRIES})...`
        );
        retryTimeoutRef.current = setTimeout(() => {
          setupSubscription();
        }, RETRY_DELAY * retryCountRef.current); // 지수 백오프
      } else {
        console.error(
          `[Realtime] ❌ Failed to subscribe to announcements after ${MAX_RETRIES} attempts. Please refresh the page.`
        );
      }
    };

    // 초기 구독 설정
    setupSubscription();

    // 클린업: 구독 해제
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      if (channelRef.current) {
        console.log(`[Realtime] Cleaning up announcements subscription`);
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      retryCountRef.current = 0;
      setSubscriptionStatus(null);
    };
  }, [enabled, queryClient]);

  // 디버깅용: 구독 상태 반환 (선택사항)
  return { subscriptionStatus };
}
