import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import supabase from "@/lib/supabase";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

/**
 * 대시보드용 메시지 실시간 구독 훅
 * 여러 Task의 메시지 변경 사항을 구독하여 대시보드의 읽지 않은 메시지 수를 실시간으로 업데이트합니다.
 * Task 상세 페이지의 useRealtimeMessages와 동일한 패턴을 사용하여 안정성을 보장합니다.
 * 
 * @param taskIds 구독할 Task ID 배열
 * @param enabled 구독 활성화 여부
 */
export function useRealtimeDashboardMessages(
  taskIds: string[],
  enabled: boolean = true
) {
  const queryClient = useQueryClient();
  const channelsRef = useRef<Map<string, any>>(new Map());
  const retryTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const retryCountsRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    console.log(`[Realtime Dashboard] 🔄 Effect triggered:`, {
      enabled,
      taskIdsCount: taskIds.length,
      taskIds: taskIds,
      currentChannels: Array.from(channelsRef.current.keys()),
    });

    if (!enabled || taskIds.length === 0) {
      console.log(`[Realtime Dashboard] ⏸️ Disabling subscriptions (enabled: ${enabled}, taskIds: ${taskIds.length})`);
      // 구독 비활성화 또는 Task ID가 없으면 모든 채널 제거
      channelsRef.current.forEach((channel, taskId) => {
        console.log(`[Realtime Dashboard] 🗑️ Removing channel for task ${taskId}`);
        supabase.removeChannel(channel);
        if (retryTimeoutsRef.current.has(taskId)) {
          clearTimeout(retryTimeoutsRef.current.get(taskId)!);
          retryTimeoutsRef.current.delete(taskId);
        }
      });
      channelsRef.current.clear();
      retryCountsRef.current.clear();
      return;
    }

    console.log(`[Realtime Dashboard] 🚀 Setting up subscriptions for ${taskIds.length} tasks:`, taskIds);

    const MAX_RETRIES = 3;
    const RETRY_DELAY = 2000; // 2초

    // 각 Task ID마다 구독 설정
    const setupSubscription = (taskId: string) => {
      console.log(`[Realtime Dashboard] 🔧 Setting up subscription for task ${taskId}`);
      
      // 기존 채널이 있으면 제거
      if (channelsRef.current.has(taskId)) {
        console.log(`[Realtime Dashboard] 🧹 Removing existing channel for task ${taskId}`);
        const existingChannel = channelsRef.current.get(taskId);
        if (existingChannel) {
          supabase.removeChannel(existingChannel);
        }
        channelsRef.current.delete(taskId);
      }

      // 이전 재시도 타이머 정리
      if (retryTimeoutsRef.current.has(taskId)) {
        console.log(`[Realtime Dashboard] ⏰ Clearing retry timeout for task ${taskId}`);
        clearTimeout(retryTimeoutsRef.current.get(taskId)!);
        retryTimeoutsRef.current.delete(taskId);
      }

      const channelName = `dashboard-messages:${taskId}`;
      const filter = `task_id=eq.${taskId}`;
      
      console.log(`[Realtime Dashboard] 📡 Creating channel:`, {
        channelName,
        filter,
        schema: "public",
        table: "messages",
      });

      // Realtime 채널 생성 (Task 상세 페이지와 동일한 패턴)
      const channel = supabase
        .channel(channelName, {
          config: {
            broadcast: { self: true }, // Task 상세 페이지와 동일하게 설정
          },
        })
        .on(
          "postgres_changes",
          {
            event: "*", // INSERT, UPDATE, DELETE 모두 구독
            schema: "public",
            table: "messages",
            filter: filter,
          },
          (payload: RealtimePostgresChangesPayload<any>) => {
            const newRecord = payload.new as { id?: string; user_id?: string; task_id?: string } | null;
            const oldRecord = payload.old as { id?: string; user_id?: string; task_id?: string } | null;
            console.log(`[Realtime Dashboard] 📨 Message change detected for task ${taskId}:`, {
              eventType: payload.eventType,
              messageId: newRecord?.id || oldRecord?.id,
              userId: newRecord?.user_id || oldRecord?.user_id,
              taskId: newRecord?.task_id || oldRecord?.task_id,
              fullPayload: payload,
            });
            
            // 메시지 변경 시 대시보드 쿼리 무효화
            console.log(`[Realtime Dashboard] 🔄 Invalidating queries for task ${taskId}`);
            queryClient.invalidateQueries({ queryKey: ["tasks", "member"] });
            queryClient.invalidateQueries({ queryKey: ["tasks", "admin"] });
            console.log(`[Realtime Dashboard] ✅ Queries invalidated for task ${taskId}`);
          }
        )
        .subscribe((status) => {
          console.log(`[Realtime Dashboard] 📊 Subscription status changed for task ${taskId}:`, {
            status,
            channelName,
            currentRetryCount: retryCountsRef.current.get(taskId) || 0,
            timestamp: new Date().toISOString(),
          });

          if (status === "SUBSCRIBED") {
            console.log(`[Realtime Dashboard] ✅ Successfully subscribed to task ${taskId}`, {
              totalSubscribed: channelsRef.current.size,
              allSubscribedTasks: Array.from(channelsRef.current.keys()),
            });
            retryCountsRef.current.set(taskId, 0); // 성공 시 재시도 카운터 리셋
          } else if (status === "CHANNEL_ERROR") {
            console.error(`[Realtime Dashboard] ❌ Channel error for task ${taskId}`, {
              error: "CHANNEL_ERROR",
              willRetry: (retryCountsRef.current.get(taskId) || 0) < 3,
            });
            handleSubscriptionFailure(taskId);
          } else if (status === "TIMED_OUT") {
            console.error(`[Realtime Dashboard] ⏱️ Subscription timed out for task ${taskId}`, {
              error: "TIMED_OUT",
              willRetry: (retryCountsRef.current.get(taskId) || 0) < 3,
            });
            handleSubscriptionFailure(taskId);
          } else if (status === "CLOSED") {
            console.warn(`[Realtime Dashboard] ⚠️ Channel closed for task ${taskId}`, {
              note: "This may be normal if component is unmounting",
            });
            // CLOSED는 정상적인 종료일 수 있으므로 재시도하지 않음
          } else if (status === "SUBSCRIBE_ERROR") {
            console.error(`[Realtime Dashboard] ❌ Subscribe error for task ${taskId}`, {
              error: "SUBSCRIBE_ERROR",
              willRetry: (retryCountsRef.current.get(taskId) || 0) < 3,
            });
            handleSubscriptionFailure(taskId);
          } else {
            console.warn(`[Realtime Dashboard] ⚠️ Unknown subscription status for task ${taskId}:`, status);
          }
        });

      channelsRef.current.set(taskId, channel);
      console.log(`[Realtime Dashboard] 💾 Channel stored for task ${taskId}`, {
        totalChannels: channelsRef.current.size,
        allChannels: Array.from(channelsRef.current.keys()),
      });
    };

    const handleSubscriptionFailure = (taskId: string) => {
      const retryCount = retryCountsRef.current.get(taskId) || 0;
      
      console.log(`[Realtime Dashboard] 🔄 Handling subscription failure for task ${taskId}:`, {
        currentRetryCount: retryCount,
        maxRetries: MAX_RETRIES,
        willRetry: retryCount < MAX_RETRIES,
      });
      
      if (retryCount < MAX_RETRIES) {
        const newRetryCount = retryCount + 1;
        retryCountsRef.current.set(taskId, newRetryCount);
        const delay = RETRY_DELAY * newRetryCount;
        
        console.log(
          `[Realtime Dashboard] 🔁 Retrying subscription (${newRetryCount}/${MAX_RETRIES}) for task ${taskId} in ${delay}ms...`
        );
        
        const timeout = setTimeout(() => {
          console.log(`[Realtime Dashboard] ⏰ Retry timeout fired for task ${taskId}, setting up subscription...`);
          setupSubscription(taskId);
        }, delay); // 지수 백오프
        
        retryTimeoutsRef.current.set(taskId, timeout);
      } else {
        console.error(
          `[Realtime Dashboard] ❌ Failed to subscribe after ${MAX_RETRIES} attempts for task ${taskId}. Please refresh the page.`,
          {
            taskId,
            finalRetryCount: retryCount,
            maxRetries: MAX_RETRIES,
          }
        );
      }
    };

    // 현재 Task ID 목록에 대해 구독 설정
    const currentTaskIdSet = new Set(taskIds);
    const existingTaskIdSet = new Set(channelsRef.current.keys());
    
    console.log(`[Realtime Dashboard] 📋 Task ID comparison:`, {
      current: Array.from(currentTaskIdSet),
      existing: Array.from(existingTaskIdSet),
      toAdd: Array.from(currentTaskIdSet).filter(id => !existingTaskIdSet.has(id)),
      toRemove: Array.from(existingTaskIdSet).filter(id => !currentTaskIdSet.has(id)),
    });
    
    // 새로운 Task ID에 대해 구독 설정
    currentTaskIdSet.forEach((taskId) => {
      if (!channelsRef.current.has(taskId)) {
        console.log(`[Realtime Dashboard] ➕ New task ID detected, setting up subscription: ${taskId}`);
        setupSubscription(taskId);
      } else {
        console.log(`[Realtime Dashboard] ✓ Task ${taskId} already has active subscription`);
      }
    });

    // 제거된 Task ID에 대한 채널 정리
    channelsRef.current.forEach((channel, existingTaskId) => {
      if (!currentTaskIdSet.has(existingTaskId)) {
        console.log(`[Realtime Dashboard] ➖ Removing subscription for task ${existingTaskId} (no longer in list)`);
        supabase.removeChannel(channel);
        channelsRef.current.delete(existingTaskId);
        if (retryTimeoutsRef.current.has(existingTaskId)) {
          clearTimeout(retryTimeoutsRef.current.get(existingTaskId)!);
          retryTimeoutsRef.current.delete(existingTaskId);
        }
        retryCountsRef.current.delete(existingTaskId);
      }
    });
    
    console.log(`[Realtime Dashboard] 📊 Final state:`, {
      totalChannels: channelsRef.current.size,
      activeChannels: Array.from(channelsRef.current.keys()),
      retryTimeouts: Array.from(retryTimeoutsRef.current.keys()),
      retryCounts: Object.fromEntries(retryCountsRef.current),
    });

    // 정리 함수
    return () => {
      console.log(`[Realtime Dashboard] 🧹 Cleaning up subscriptions:`, {
        taskIdsCount: taskIds.length,
        taskIds: taskIds,
        channelsToClean: Array.from(channelsRef.current.keys()),
      });
      channelsRef.current.forEach((channel, taskId) => {
        console.log(`[Realtime Dashboard] 🗑️ Removing channel for task ${taskId} during cleanup`);
        supabase.removeChannel(channel);
        if (retryTimeoutsRef.current.has(taskId)) {
          clearTimeout(retryTimeoutsRef.current.get(taskId)!);
        }
      });
      channelsRef.current.clear();
      retryTimeoutsRef.current.clear();
      retryCountsRef.current.clear();
      console.log(`[Realtime Dashboard] ✅ Cleanup completed`);
    };
  }, [taskIds.join(","), enabled, queryClient]);
}
