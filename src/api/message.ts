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
 */
export async function getMessagesByTaskId(taskId: string): Promise<MessageWithProfile[]> {
  const { data, error } = await supabase
    .from("messages")
    .select(`
      *,
      sender:profiles!messages_user_id_fkey(id, full_name, email)
    `)
    .eq("task_id", taskId)
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

  // 텍스트 메시지가 있으면 먼저 생성
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

  // 파일 메시지들 생성
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

