import { useState, useEffect, useRef, useCallback } from "react";
import supabase from "@/lib/supabase";
import { useCurrentProfile } from "@/hooks";

/**
 * Typing Indicator 훅
 * Supabase Realtime Broadcast를 사용하여 입력 중 상태를 공유
 * @param taskId Task ID
 * @param enabled 활성화 여부
 */
export function useTypingIndicator(taskId: string | undefined, enabled: boolean = true) {
  const { data: currentProfile } = useCurrentProfile();
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map()); // userId -> userName
  const channelRef = useRef<any>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 입력 중 상태 전송
  const sendTyping = useCallback(() => {
    if (!taskId || !enabled || !currentProfile?.id || !channelRef.current) {
      return;
    }

    // Broadcast로 입력 중 상태 전송
    channelRef.current.send({
      type: "broadcast",
      event: "typing",
      payload: {
        userId: currentProfile.id,
        userName: currentProfile.full_name || currentProfile.email,
        taskId,
      },
    });

    // 일정 시간 후 자동으로 입력 중 상태 해제
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      channelRef.current.send({
        type: "broadcast",
        event: "stop-typing",
        payload: {
          userId: currentProfile.id,
          taskId,
        },
      });
    }, 3000); // 3초 후 자동 해제
  }, [taskId, enabled, currentProfile]);

  // 입력 중 상태 해제
  const stopTyping = useCallback(() => {
    if (!taskId || !enabled || !currentProfile?.id || !channelRef.current) {
      return;
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }

    channelRef.current.send({
      type: "broadcast",
      event: "stop-typing",
      payload: {
        userId: currentProfile.id,
        taskId,
      },
    });
  }, [taskId, enabled, currentProfile]);

  useEffect(() => {
    if (!taskId || !enabled) {
      return;
    }

    // Realtime 채널 생성 (Broadcast용)
    const channel = supabase
      .channel(`typing:${taskId}`, {
        config: {
          broadcast: { self: true },
        },
      })
      .on("broadcast", { event: "typing" }, (payload) => {
        // 다른 사용자가 입력 중일 때
        if (payload.payload.userId !== currentProfile?.id) {
          setTypingUsers((prev) => {
            const next = new Map(prev);
            next.set(payload.payload.userId, payload.payload.userName || "사용자");
            return next;
          });
        }
      })
      .on("broadcast", { event: "stop-typing" }, (payload) => {
        // 입력 중 상태 해제
        setTypingUsers((prev) => {
          const next = new Map(prev);
          next.delete(payload.payload.userId);
          return next;
        });
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log(`[Typing] Subscribed to typing indicator for task ${taskId}`);
        }
      });

    channelRef.current = channel;

    // 클린업
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      setTypingUsers(new Map());
    };
  }, [taskId, enabled, currentProfile]);

  return {
    typingUsers: Array.from(typingUsers.values()), // 사용자 이름 배열 반환
    sendTyping,
    stopTyping,
  };
}

