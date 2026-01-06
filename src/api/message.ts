import supabase from "@/lib/supabase";
import type { Tables, TablesInsert } from "@/database.type";

export type Message = Tables<"messages"> & {
  read_by?: string[] | null;
  file_url?: string | null;
  file_name?: string | null;
  file_type?: string | null;
  file_size?: number | null;
};

export type MessageInsert = Omit<TablesInsert<"messages">, "user_id"> & {
  file_url?: string | null;
  file_name?: string | null;
  file_type?: string | null;
  file_size?: number | null;
};

/**
 * Message with sender profile information
 */
export type MessageWithProfile = Message & {
  sender: {
    id: string;
    full_name: string | null;
    email: string;
  };
};

/**
 * Task의 메시지 목록 조회
 * Task 접근 권한이 있으면 해당 Task의 모든 메시지 조회 가능
 * sender 프로필 정보를 JOIN하여 함께 반환
 * 삭제되지 않은 메시지만 조회 (deleted_at IS NULL)
 */
export async function getMessagesByTaskId(taskId: string): Promise<MessageWithProfile[]> {
  const { data, error } = await supabase
    .from("messages")
    .select(`
      *,
      sender:profiles!messages_user_id_fkey(id, full_name, email)
    `)
    .eq("task_id", taskId)
    .is("deleted_at", null) // 삭제되지 않은 메시지만 조회
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`메시지 목록 조회 실패: ${error.message}`);
  }

  return (data || []) as MessageWithProfile[];
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
      read_by: [], // 초기값: 빈 배열
    })
    .select()
    .single();

  if (error) {
    throw new Error(`메시지 생성 실패: ${error.message}`);
  }

  return data as Message;
}

/**
 * 파일 메시지 생성
 * Supabase Storage에 업로드된 파일의 URL을 포함하여 메시지 생성
 */
export async function createFileMessage(
  taskId: string,
  fileUrl: string,
  fileName: string,
  fileType: string,
  fileSize: number,
): Promise<Message> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) {
    throw new Error("인증이 필요합니다.");
  }

  const { data, error } = await supabase
    .from("messages")
    .insert({
      task_id: taskId,
      user_id: session.session.user.id,
      content: fileName, // 파일명을 content로 사용
      message_type: "FILE",
      file_url: fileUrl,
      file_name: fileName,
      file_type: fileType,
      file_size: fileSize,
      read_by: [],
    })
    .select()
    .single();

  if (error) {
    throw new Error(`파일 메시지 생성 실패: ${error.message}`);
  }

  return data as Message;
}

/**
 * 텍스트와 파일을 함께 포함한 메시지 생성
 * 텍스트가 있으면 텍스트 메시지로, 파일이 있으면 파일 메시지로 각각 생성
 */
export async function createMessageWithFiles(
  taskId: string,
  content: string | null,
  files: Array<{ url: string; fileName: string; fileType: string; fileSize: number }>,
): Promise<Message[]> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) {
    throw new Error("인증이 필요합니다.");
  }

  const messages: Message[] = [];

  // 파일 메시지들을 먼저 생성 (UI에서 파일이 먼저 표시되도록)
  for (const file of files) {
    const { data: fileMessage, error: fileError } = await supabase
      .from("messages")
      .insert({
        task_id: taskId,
        user_id: session.session.user.id,
        content: file.fileName,
        message_type: "FILE",
        file_url: file.url,
        file_name: file.fileName,
        file_type: file.fileType,
        file_size: file.fileSize,
        read_by: [],
      })
      .select()
      .single();

    if (fileError) {
      throw new Error(`파일 메시지 생성 실패: ${fileError.message}`);
    }
    messages.push(fileMessage as Message);
  }

  // 텍스트 메시지가 있으면 나중에 생성 (UI에서 텍스트가 파일 아래에 표시되도록)
  if (content && content.trim()) {
    const { data: textMessage, error: textError } = await supabase
      .from("messages")
      .insert({
        task_id: taskId,
        user_id: session.session.user.id,
        content: content.trim(),
        message_type: "USER",
        read_by: [],
      })
      .select()
      .single();

    if (textError) {
      throw new Error(`텍스트 메시지 생성 실패: ${textError.message}`);
    }
    messages.push(textMessage as Message);
  }

  return messages;
}

/**
 * 메시지를 읽음 처리
 * 특정 메시지를 현재 사용자가 읽었다고 표시
 */
export async function markMessageAsRead(messageId: string): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) {
    throw new Error("인증이 필요합니다.");
  }

  const { error } = await supabase.rpc("mark_message_as_read", {
    message_id: messageId,
    reader_id: session.session.user.id,
  });

  if (error) {
    throw new Error(`메시지 읽음 처리 실패: ${error.message}`);
  }
}

/**
 * Task의 모든 메시지를 읽음 처리
 * 채팅 화면 진입 시 호출
 */
export async function markTaskMessagesAsRead(taskId: string): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) {
    throw new Error("인증이 필요합니다.");
  }

  const { error } = await supabase.rpc("mark_task_messages_as_read", {
    task_id_param: taskId,
    reader_id: session.session.user.id,
  });

  if (error) {
    throw new Error(`메시지 읽음 처리 실패: ${error.message}`);
  }
}

/**
 * 메시지가 상대방(assigner 또는 assignee)에 의해 읽혔는지 확인
 * 읽음 처리는 지시자(assigner) ↔ 담당자(assignee) 사이에서만 발생
 * @param message 메시지 정보
 * @param currentUserId 현재 사용자 ID
 * @param task Task 정보 (assigner_id, assignee_id 포함)
 * @returns 읽음 여부
 */
export function isMessageReadByCounterpart(
  message: MessageWithProfile,
  currentUserId: string,
  task: { assigner_id: string; assignee_id: string }
): boolean {
  // 본인이 보낸 메시지만 읽음 표시
  if (message.user_id !== currentUserId) {
    return false;
  }

  // 읽음 처리 주체 확인
  const isCurrentUserAssigner = currentUserId === task.assigner_id;
  const isCurrentUserAssignee = currentUserId === task.assignee_id;

  // 읽음 처리 주체가 아닌 경우 false (Admin 제3자 등)
  if (!isCurrentUserAssigner && !isCurrentUserAssignee) {
    return false;
  }

  // 보낸 사람이 assigner/assignee인지 확인
  const isSenderAssigner = message.user_id === task.assigner_id;
  const isSenderAssignee = message.user_id === task.assignee_id;

  // 상대방 ID 확인
  const counterpartId = isSenderAssigner 
    ? task.assignee_id  // 지시자가 보낸 메시지 → 담당자 확인
    : task.assigner_id; // 담당자가 보낸 메시지 → 지시자 확인

  // read_by 배열에 상대방 ID가 있는지 확인
  const readBy = message.read_by || [];
  if (!Array.isArray(readBy)) {
    return false;
  }

  // 타입 안전성: 모든 값을 문자열로 변환하여 비교
  const counterpartIdStr = String(counterpartId);
  return readBy.some((id) => String(id) === counterpartIdStr);
}

/**
 * 메시지 삭제 (Soft Delete)
 * 본인이 보낸 메시지만 삭제 가능
 * 파일 메시지인 경우 Storage에서도 파일 삭제
 */
export async function deleteMessage(messageId: string): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) {
    throw new Error("인증이 필요합니다.");
  }

  // 메시지 조회 (본인 메시지인지 확인 및 파일 정보 확인)
  const { data: message, error: fetchError } = await supabase
    .from("messages")
    .select("user_id, message_type, file_url, deleted_at")
    .eq("id", messageId)
    .single();

  if (fetchError || !message) {
    throw new Error("메시지를 찾을 수 없습니다.");
  }

  if (message.user_id !== session.session.user.id) {
    throw new Error("본인이 보낸 메시지만 삭제할 수 있습니다.");
  }

  if (message.deleted_at) {
    throw new Error("이미 삭제된 메시지입니다.");
  }

  // Soft delete: deleted_at 설정
  const { error: updateError } = await supabase
    .from("messages")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", messageId);

  if (updateError) {
    throw new Error(`메시지 삭제 실패: ${updateError.message}`);
  }

  // 파일 메시지인 경우 Storage에서도 파일 삭제
  if (message.message_type === "FILE" && message.file_url) {
    try {
      const { deleteTaskFile } = await import("./storage");
      await deleteTaskFile(message.file_url);
    } catch (error) {
      // Storage 삭제 실패해도 DB 삭제는 완료됨 (로깅만)
      console.error("Storage 파일 삭제 실패:", error);
    }
  }
}

