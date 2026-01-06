import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import supabase from "@/lib/supabase";
import { markMessageAsRead } from "@/api/message";
import { useCurrentProfile } from "@/hooks";
import type { MessageWithProfile } from "@/api/message";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

/**
 * Supabase Realtime으로 메시지 실시간 구독 훅
 * @param taskId Task ID
 * @param enabled 구독 활성화 여부
 * @param isPresent 현재 사용자가 채팅 화면에 있는지 (Presence 상태)
 */
export function useRealtimeMessages(
  taskId: string | undefined,
  enabled: boolean = true,
  isPresent: boolean = false
) {
  const queryClient = useQueryClient();
  const { data: currentProfile } = useCurrentProfile();
  const channelRef = useRef<any>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef(0);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!taskId || !enabled) {
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
        .channel(`messages:${taskId}`, {
          config: {
            broadcast: { self: true },
          },
        })
        .on(
          "postgres_changes",
          {
            event: "*", // INSERT, UPDATE, DELETE 모두 구독
            schema: "public",
            table: "messages",
            filter: `task_id=eq.${taskId}`,
          },
          async (payload: RealtimePostgresChangesPayload<any>) => {
            console.log(`[Realtime] Message change detected for task ${taskId}:`, payload.eventType);

            // ⚠️ 중요: INSERT 이벤트에서만 읽음 처리 실행
            // UPDATE(read_by 변경) 이벤트는 읽음 처리 로직을 절대 실행하지 않음
            if (payload.eventType === "INSERT" && isPresent && currentProfile?.id) {
              const newMessage = payload.new;
              const messageUserId = newMessage?.user_id;
              const messageId = newMessage?.id;

              // 상대방 메시지인 경우에만 읽음 처리
              if (messageUserId && messageUserId !== currentProfile.id && messageId) {
                // Guard: 이미 읽은 메시지인지 확인
                const readBy = newMessage?.read_by;
                const isAlreadyRead = Array.isArray(readBy) && readBy.includes(currentProfile.id);

                if (!isAlreadyRead) {
                  try {
                    console.log(`[Realtime] 📖 Marking message as read (real-time): ${messageId}`);
                    await markMessageAsRead(messageId);
                    // 읽음 처리 후 쿼리 무효화하여 UI 즉시 반영
                    queryClient.invalidateQueries({ queryKey: ["messages", taskId] });
                  } catch (error) {
                    console.error(`[Realtime] ❌ Failed to mark message as read:`, error);
                    // 읽음 처리 실패해도 쿼리 무효화는 진행 (메시지 목록 갱신)
                    queryClient.invalidateQueries({ queryKey: ["messages", taskId] });
                  }
                } else {
                  console.log(`[Realtime] ⏭️ Message ${messageId} already read, skipping`);
                  // 이미 읽은 메시지이면 쿼리만 무효화
                  queryClient.invalidateQueries({ queryKey: ["messages", taskId] });
                }
              } else {
                // 본인 메시지이거나 Presence 상태가 아니면 쿼리만 무효화
                queryClient.invalidateQueries({ queryKey: ["messages", taskId] });
              }
            } else {
              // UPDATE, DELETE 이벤트 또는 INSERT이지만 Presence 상태가 아닌 경우
              // ⚠️ UPDATE 이벤트는 읽음 처리 로직을 절대 실행하지 않음 (무한 루프 방지)
              // 메시지 변경 시 쿼리 무효화하여 최신 데이터 가져오기
              queryClient.invalidateQueries({ queryKey: ["messages", taskId] });
            }
          },
        )
        .subscribe((status) => {
          setSubscriptionStatus(status);
          console.log(`[Realtime] Subscription status for task ${taskId}:`, status);

          if (status === "SUBSCRIBED") {
            console.log(`[Realtime] ✅ Successfully subscribed to messages for task ${taskId}`);
            retryCountRef.current = 0; // 성공 시 재시도 카운터 리셋
          } else if (status === "CHANNEL_ERROR") {
            console.error(`[Realtime] ❌ Channel error for task ${taskId}`);
            handleSubscriptionFailure();
          } else if (status === "TIMED_OUT") {
            console.error(`[Realtime] ⏱️ Subscription timed out for task ${taskId}`);
            handleSubscriptionFailure();
          } else if (status === "CLOSED") {
            console.warn(`[Realtime] ⚠️ Channel closed for task ${taskId}`);
            // CLOSED는 정상적인 종료일 수 있으므로 재시도하지 않음
          } else if (status === "SUBSCRIBE_ERROR") {
            console.error(`[Realtime] ❌ Subscribe error for task ${taskId}`);
            handleSubscriptionFailure();
          }
        });

      channelRef.current = channel;
    };

    const handleSubscriptionFailure = () => {
      if (retryCountRef.current < MAX_RETRIES) {
        retryCountRef.current += 1;
        console.log(
          `[Realtime] Retrying subscription (${retryCountRef.current}/${MAX_RETRIES}) for task ${taskId}...`
        );
        retryTimeoutRef.current = setTimeout(() => {
          setupSubscription();
        }, RETRY_DELAY * retryCountRef.current); // 지수 백오프
      } else {
        console.error(
          `[Realtime] ❌ Failed to subscribe after ${MAX_RETRIES} attempts for task ${taskId}. Please refresh the page.`
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
        console.log(`[Realtime] Cleaning up subscription for task ${taskId}`);
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      retryCountRef.current = 0;
      setSubscriptionStatus(null);
    };
  }, [taskId, enabled, isPresent, currentProfile, queryClient]);

  // 디버깅용: 구독 상태 반환 (선택사항)
  return { subscriptionStatus };
}

