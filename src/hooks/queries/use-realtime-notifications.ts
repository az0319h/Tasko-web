import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import supabase from "@/lib/supabase";
import { useCurrentProfile } from "@/hooks";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import type { Database } from "@/database.type";

type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"];

/**
 * Supabase Realtime으로 알림 실시간 구독 훅
 * 대시보드 메시지 Realtime 패턴을 따라 구현하여 안정성을 보장합니다.
 * 
 * @param enabled 구독 활성화 여부
 */
export function useRealtimeNotifications(enabled: boolean = true) {
  const queryClient = useQueryClient();
  const { data: currentProfile } = useCurrentProfile();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);

  useEffect(() => {
    console.log(`[Realtime Notifications] 🔄 Effect triggered:`, {
      enabled,
      userId: currentProfile?.id,
      hasChannel: !!channelRef.current,
    });

    if (!enabled || !currentProfile?.id) {
      console.log(`[Realtime Notifications] ⏸️ Disabling subscription (enabled: ${enabled}, userId: ${currentProfile?.id})`);
      // 구독 비활성화 시 채널 제거
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
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
      console.log(`[Realtime Notifications] 🔧 Setting up subscription for user ${currentProfile.id}`);
      
      // 기존 채널이 있으면 제거
      if (channelRef.current) {
        console.log(`[Realtime Notifications] 🧹 Removing existing channel`);
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }

      // 사용자별 고유 채널 이름 생성 (대시보드 패턴과 유사)
      const channelName = `notifications:${currentProfile.id}`;
      const filter = `user_id=eq.${currentProfile.id}`;
      
      console.log(`[Realtime Notifications] 📡 Creating channel:`, {
        channelName,
        filter,
        schema: "public",
        table: "notifications",
      });

      // Realtime 채널 생성 (대시보드 메시지와 동일한 패턴)
      const channel = supabase
        .channel(channelName, {
          config: {
            broadcast: { self: true },
          },
        })
        .on(
          "postgres_changes",
          {
            event: "*", // INSERT, UPDATE, DELETE 모두 구독
            schema: "public",
            table: "notifications",
            filter: filter, // 현재 사용자의 알림만 구독
          },
          (payload: RealtimePostgresChangesPayload<NotificationRow>) => {
            const newRecord = payload.new as Partial<NotificationRow> | null;
            const oldRecord = payload.old as Partial<NotificationRow> | null;

            console.log(`[Realtime Notifications] 📨 Notification change detected:`, {
              eventType: payload.eventType,
              notificationId: newRecord?.id ?? oldRecord?.id,
              userId: newRecord?.user_id ?? oldRecord?.user_id,
              title: (newRecord?.title ?? oldRecord?.title)?.substring(0, 50),
              is_read: newRecord?.is_read,
              fullPayload: payload,
            });

            // 이벤트 타입별 처리
            if (payload.eventType === "INSERT") {
              // 새 알림 생성 시
              console.log(`[Realtime Notifications] ➕ New notification created:`, newRecord?.id);
            } else if (payload.eventType === "UPDATE") {
              // 알림 업데이트 시 (읽음 처리 등)
              console.log(`[Realtime Notifications] 🔄 Notification updated:`, newRecord?.id);
            } else if (payload.eventType === "DELETE") {
              // 알림 삭제 시
              console.log(`[Realtime Notifications] 🗑️ Notification deleted:`, oldRecord?.id);
            }

            // 대시보드 패턴과 동일하게 invalidateQueries 사용
            console.log(`[Realtime Notifications] 🔄 Invalidating notification queries`);
            queryClient.invalidateQueries({ queryKey: ["notifications", "list"] });
            queryClient.invalidateQueries({ queryKey: ["notifications", "unread-count"] });
            
            // 중요: 읽지 않은 알림 수는 즉시 refetch하여 사이드바 배지가 바로 업데이트되도록 함
            // invalidateQueries만으로는 쿼리가 활성화되어 있을 때만 자동 refetch되므로,
            // refetchQueries를 추가하여 활성 쿼리를 즉시 refetch
            queryClient.refetchQueries({ 
              queryKey: ["notifications", "unread-count"],
              type: 'active' // 활성 쿼리만 refetch (사이드바에서 사용 중인 쿼리)
            });
            console.log(`[Realtime Notifications] ✅ Queries invalidated and unread-count refetched`);
          }
        )
        .subscribe((status) => {
          setSubscriptionStatus(status);
          console.log(`[Realtime Notifications] 📊 Subscription status changed:`, {
            status,
            channelName,
            userId: currentProfile.id,
            currentRetryCount: retryCountRef.current,
            timestamp: new Date().toISOString(),
          });

          if (status === "SUBSCRIBED") {
            console.log(`[Realtime Notifications] ✅ Successfully subscribed to notifications`, {
              userId: currentProfile.id,
              channelName,
            });
            retryCountRef.current = 0; // 성공 시 재시도 카운터 리셋
          } else if (status === "CHANNEL_ERROR") {
            console.error(`[Realtime Notifications] ❌ Channel error for notifications`, {
              error: "CHANNEL_ERROR",
              userId: currentProfile.id,
              willRetry: retryCountRef.current < MAX_RETRIES,
            });
            handleSubscriptionFailure();
          } else if (status === "TIMED_OUT") {
            console.error(`[Realtime Notifications] ⏱️ Subscription timed out for notifications`, {
              error: "TIMED_OUT",
              userId: currentProfile.id,
              willRetry: retryCountRef.current < MAX_RETRIES,
            });
            handleSubscriptionFailure();
          } else if (status === "CLOSED") {
            console.warn(`[Realtime Notifications] ⚠️ Channel closed for notifications`, {
              note: "This may be normal if component is unmounting",
              userId: currentProfile.id,
            });
            // CLOSED는 정상적인 종료일 수 있으므로 재시도하지 않음
          } else if (status === "SUBSCRIBE_ERROR") {
            console.error(`[Realtime Notifications] ❌ Subscribe error for notifications`, {
              error: "SUBSCRIBE_ERROR",
              userId: currentProfile.id,
              willRetry: retryCountRef.current < MAX_RETRIES,
            });
            handleSubscriptionFailure();
          } else {
            console.warn(`[Realtime Notifications] ⚠️ Unknown subscription status:`, status);
          }
        });

      channelRef.current = channel;
      console.log(`[Realtime Notifications] 💾 Channel stored`, {
        channelName,
        userId: currentProfile.id,
      });
    };

    const handleSubscriptionFailure = () => {
      const retryCount = retryCountRef.current;
      
      console.log(`[Realtime Notifications] 🔄 Handling subscription failure:`, {
        currentRetryCount: retryCount,
        maxRetries: MAX_RETRIES,
        willRetry: retryCount < MAX_RETRIES,
        userId: currentProfile.id,
      });
      
      if (retryCount < MAX_RETRIES) {
        const newRetryCount = retryCount + 1;
        retryCountRef.current = newRetryCount;
        const delay = RETRY_DELAY * newRetryCount;
        
        console.log(
          `[Realtime Notifications] 🔁 Retrying subscription (${newRetryCount}/${MAX_RETRIES}) in ${delay}ms...`,
          { userId: currentProfile.id }
        );
        
        retryTimeoutRef.current = setTimeout(() => {
          console.log(`[Realtime Notifications] ⏰ Retry timeout fired, setting up subscription...`);
          setupSubscription();
        }, delay); // 지수 백오프
      } else {
        console.error(
          `[Realtime Notifications] ❌ Failed to subscribe after ${MAX_RETRIES} attempts. Please refresh the page.`,
          {
            userId: currentProfile.id,
            finalRetryCount: retryCount,
            maxRetries: MAX_RETRIES,
          }
        );
      }
    };

    // 초기 구독 설정
    setupSubscription();

    // 클린업: 구독 해제
    return () => {
      console.log(`[Realtime Notifications] 🧹 Cleaning up subscription:`, {
        userId: currentProfile?.id,
        hasChannel: !!channelRef.current,
        hasRetryTimeout: !!retryTimeoutRef.current,
      });
      
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      if (channelRef.current) {
        console.log(`[Realtime Notifications] 🗑️ Removing channel during cleanup`);
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      retryCountRef.current = 0;
      setSubscriptionStatus(null);
      console.log(`[Realtime Notifications] ✅ Cleanup completed`);
    };
  }, [enabled, currentProfile?.id, queryClient]);

  // 디버깅용: 구독 상태 반환 (선택사항)
  return { subscriptionStatus };
}
