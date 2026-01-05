import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import supabase from "@/lib/supabase";
import type { MessageWithProfile } from "@/api/message";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

/**
 * Supabase Realtime으로 메시지 실시간 구독 훅
 * @param taskId Task ID
 * @param enabled 구독 활성화 여부
 */
export function useRealtimeMessages(taskId: string | undefined, enabled: boolean = true) {
  const queryClient = useQueryClient();
  const channelRef = useRef<any>(null);

  useEffect(() => {
    if (!taskId || !enabled) {
      return;
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
        (payload: RealtimePostgresChangesPayload<any>) => {
          // 메시지 변경 시 쿼리 무효화하여 최신 데이터 가져오기
          queryClient.invalidateQueries({ queryKey: ["messages", taskId] });
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log(`[Realtime] Subscribed to messages for task ${taskId}`);
        } else if (status === "CHANNEL_ERROR") {
          console.error(`[Realtime] Channel error for task ${taskId}`);
        }
      });

    channelRef.current = channel;

    // 클린업: 구독 해제
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [taskId, enabled, queryClient]);
}

