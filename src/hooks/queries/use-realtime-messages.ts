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
            console.log(`[Realtime] Message change detected for task ${taskId}:`, payload.eventType, payload);

            // INSERT 이벤트: 새 메시지가 생성됨
            if (payload.eventType === "INSERT") {
              const newMessage = payload.new;
              const messageUserId = newMessage?.user_id;
              const messageId = newMessage?.id;

              console.log(`[Realtime] 📨 New message inserted: ${messageId} from user ${messageUserId}`);

              // 먼저 쿼리 무효화하여 새 메시지 즉시 표시
              queryClient.invalidateQueries({ queryKey: ["messages", taskId] });
              // 대시보드의 읽지 않은 메시지 수도 업데이트 (상대방의 대시보드 업데이트)
              queryClient.invalidateQueries({ queryKey: ["tasks", "member"] });
              queryClient.invalidateQueries({ queryKey: ["tasks", "admin"] });

              // 상대방 메시지이고 현재 사용자가 채팅 화면에 있는 경우 읽음 처리
              if (
                isPresent &&
                currentProfile?.id &&
                messageUserId &&
                messageUserId !== currentProfile.id &&
                messageId
              ) {
                // Guard: 이미 읽은 메시지인지 확인
                const readBy = newMessage?.read_by || [];
                const isAlreadyRead = Array.isArray(readBy) && readBy.some((id: string) => String(id) === String(currentProfile.id));

                if (!isAlreadyRead) {
                  try {
                    console.log(`[Realtime] 📖 Marking message as read (real-time): ${messageId}`);
                    await markMessageAsRead(messageId);
                    // 읽음 처리 후 쿼리 다시 무효화하여 읽음 상태 반영
                    queryClient.invalidateQueries({ queryKey: ["messages", taskId] });
                    // 대시보드의 읽지 않은 메시지 수도 업데이트
                    queryClient.invalidateQueries({ queryKey: ["tasks", "member"] });
                    queryClient.invalidateQueries({ queryKey: ["tasks", "admin"] });
                  } catch (error) {
                    console.error(`[Realtime] ❌ Failed to mark message as read:`, error);
                    // 읽음 처리 실패해도 쿼리 무효화는 이미 진행됨
                  }
                } else {
                  console.log(`[Realtime] ⏭️ Message ${messageId} already read, skipping`);
                }
              }
            }
            // UPDATE 이벤트: 메시지가 업데이트됨 (읽음 상태 변경 등)
            else if (payload.eventType === "UPDATE") {
              const updatedMessage = payload.new;
              const messageId = updatedMessage?.id;

              console.log(`[Realtime] 🔄 Message updated: ${messageId}`, {
                read_by: updatedMessage?.read_by,
                content: updatedMessage?.content?.substring(0, 50),
              });

              // 읽음 상태가 변경된 경우 UI 즉시 업데이트
              // ⚠️ 중요: 읽음 처리 로직은 실행하지 않음 (무한 루프 방지)
              // 단순히 쿼리만 무효화하여 최신 읽음 상태를 가져옴
              queryClient.invalidateQueries({ queryKey: ["messages", taskId] });
              // 대시보드의 읽지 않은 메시지 수도 업데이트
              queryClient.invalidateQueries({ queryKey: ["tasks", "member"] });
              queryClient.invalidateQueries({ queryKey: ["tasks", "admin"] });
            }
            // DELETE 이벤트: 메시지가 삭제됨
            else if (payload.eventType === "DELETE") {
              const deletedMessage = payload.old;
              const messageId = deletedMessage?.id;

              console.log(`[Realtime] 🗑️ Message deleted: ${messageId}`);

              // 삭제된 메시지 제거를 위해 쿼리 무효화
              queryClient.invalidateQueries({ queryKey: ["messages", taskId] });
              // 대시보드의 읽지 않은 메시지 수도 업데이트
              queryClient.invalidateQueries({ queryKey: ["tasks", "member"] });
              queryClient.invalidateQueries({ queryKey: ["tasks", "admin"] });
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

