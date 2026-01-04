import supabase from "@/lib/supabase";
import type { Tables, TablesInsert } from "@/database.type";

export type Message = Tables<"messages">;
export type MessageInsert = TablesInsert<"messages">;

/**
 * Task의 메시지 목록 조회
 * Task 접근 권한이 있으면 해당 Task의 모든 메시지 조회 가능
 */
export async function getMessagesByTaskId(taskId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`메시지 목록 조회 실패: ${error.message}`);
  }

  return data || [];
}

/**
 * 메시지 생성
 * Task 접근 권한이 있으면 메시지 작성 가능
 */
export async function createMessage(message: MessageInsert): Promise<Message> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) {
    throw new Error("인증이 필요합니다.");
  }

  const { data, error } = await supabase
    .from("messages")
    .insert({
      ...message,
      user_id: session.session.user.id,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`메시지 생성 실패: ${error.message}`);
  }

  return data;
}

