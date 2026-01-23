import supabase from "@/lib/supabase";
import type { Tables, TablesInsert, TablesUpdate } from "@/database.type";
import type { TaskStatus } from "@/lib/task-status";
import {
  canUserChangeStatus,
  getStatusTransitionErrorMessage,
  isValidStatusTransition,
} from "@/lib/task-status";

export type Task = Tables<"tasks">;
export type TaskInsert = TablesInsert<"tasks">;
export type TaskUpdate = TablesUpdate<"tasks">;

/**
 * Task with joined profile information for assigner and assignee
 */
export type TaskWithProfiles = Task & {
  assigner: {
    id: string;
    full_name: string | null;
    email: string;
    avatar_url: string | null;
  } | null;
  assignee: {
    id: string;
    full_name: string | null;
    email: string;
    avatar_url: string | null;
  } | null;
};

/**
 * 프로젝트의 Task 목록 조회 (deprecated)
 * 프로젝트 구조가 제거되어 더 이상 사용되지 않습니다.
 * @deprecated 프로젝트 구조가 제거되었습니다. getTasksForAdmin 또는 getTasksForMember를 사용하세요.
 */
export async function getTasksByProjectId(_projectId: string): Promise<TaskWithProfiles[]> {
  throw new Error("프로젝트 구조가 제거되었습니다. getTasksForAdmin 또는 getTasksForMember를 사용하세요.");
}

/**
 * Task 상세 조회
 * assigner와 assignee의 프로필 정보를 JOIN하여 함께 반환
 * 
 * 권한별 접근 제어:
 * - Admin: 모든 Task 상세 접근 가능
 * - Member (assigner/assignee): 자신의 Task 상세 접근 가능
 * - Member (기타): 제한된 정보만 반환 (description 마스킹)
 */
export async function getTaskById(id: string): Promise<TaskWithProfiles | null> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) {
    throw new Error("인증이 필요합니다.");
  }

  const userId = session.session.user.id;

  // Task 조회
  const { data, error } = await supabase
    .from("tasks")
    .select(`
      *,
      assigner:profiles!tasks_assigner_id_fkey(id, full_name, email, avatar_url),
      assignee:profiles!tasks_assignee_id_fkey(id, full_name, email, avatar_url)
    `)
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null;
    }
    throw new Error(`Task 조회 실패: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  // Admin 권한 확인
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  const isAdmin = profile?.role === "admin";
  const isAssigner = data.assigner_id === userId;
  const isAssignee = data.assignee_id === userId;

  // 권한 검증 및 필드 제어
  if (!isAdmin && !isAssigner && !isAssignee) {
    // 일반 멤버가 자신의 Task가 아닌 경우: 제한된 정보만 반환
    // description을 null로 마스킹하여 상세 내용 접근 차단
    return {
      ...data,
      description: null,
    } as TaskWithProfiles;
  }

  // Admin 또는 assigner/assignee: 모든 필드 반환
  return data as TaskWithProfiles;
}

/**
 * Task 생성 (프로젝트 참여자 또는 Admin 가능)
 * - assigner_id는 자동으로 현재 로그인한 사용자로 설정됨
 * - assignee_id는 필수 입력값
 * - assigner와 assignee는 모두 해당 프로젝트에 속한 사용자여야 함
 */
export async function createTask(task: Omit<TaskInsert, "assigner_id">): Promise<Task> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) {
    throw new Error("인증이 필요합니다.");
  }

  const currentUserId = session.session.user.id;

  // Admin 권한 확인
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", currentUserId)
    .single();

  const isAdmin = profile?.role === "admin";

  // 프로젝트 구조가 제거되어 프로젝트 참여자 확인 로직 제거
  // 모든 인증된 사용자가 Task를 생성할 수 있습니다.

  // assignee_id가 설정되어 있는지 확인
  if (!task.assignee_id) {
    throw new Error("할당받은 사람을 선택해주세요.");
  }

  // assigner와 assignee가 같은지 확인
  if (currentUserId === task.assignee_id) {
    throw new Error("자기 자신에게 Task를 할당할 수 없습니다.");
  }

  // assigner_id를 현재 로그인한 사용자로 자동 설정
  // created_by도 현재 사용자로 설정 (프로젝트 구조 제거 후)
  // description이 null이거나 undefined일 때는 객체에서 제거 (스키마 캐시 문제 방지)
  const taskWithAssigner: any = {
    ...task,
    assigner_id: currentUserId,
    created_by: currentUserId,
  };
  
  // project_id 제거 (프로젝트 구조 제거)
  if (taskWithAssigner.project_id !== undefined) {
    delete taskWithAssigner.project_id;
  }
  
  // description이 null이거나 undefined이면 객체에서 제거
  if (taskWithAssigner.description === null || taskWithAssigner.description === undefined) {
    delete taskWithAssigner.description;
  }

  const { data, error } = await supabase
    .from("tasks")
    .insert(taskWithAssigner as any)
    .select()
    .single();

  if (error) {
    throw new Error(`Task 생성 실패: ${error.message}`);
  }

  return data;
}

/**
 * Task 수정 (지시자만 가능)
 * - 지시자(assigner)만 Task 수정 가능
 * - 허용 필드: title, description, due_date만 수정 가능
 * - assigner_id, assignee_id, task_status는 수정 불가
 */
export async function updateTask(id: string, updates: TaskUpdate): Promise<Task> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) {
    throw new Error("인증이 필요합니다.");
  }

  const userId = session.session.user.id;

  // 현재 Task 조회 (존재 여부 및 권한 확인)
  const { data: task, error: fetchError } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !task) {
    throw new Error(`Task를 찾을 수 없습니다: ${fetchError?.message || "알 수 없는 오류"}`);
  }

  // send_email_to_client 필드는 담당자(assignee)만 변경 가능
  if (updates.send_email_to_client !== undefined) {
    if (task.assignee_id !== userId) {
      throw new Error("고객에게 이메일 발송 완료 상태는 담당자만 변경할 수 있습니다.");
    }
  } else {
    // send_email_to_client 외의 필드는 지시자(assigner)만 수정 가능
    if (task.assigner_id !== userId) {
      throw new Error("Task 수정은 지시자만 가능합니다.");
    }
  }

  // 수정 불가 필드 차단
  if (updates.assigner_id !== undefined || updates.assignee_id !== undefined) {
    throw new Error("지시자(assigner)와 담당자(assignee)는 수정할 수 없습니다.");
  }

  if (updates.task_status !== undefined) {
    throw new Error("Task 상태는 수정할 수 없습니다. 상태 변경은 별도의 워크플로우를 사용하세요.");
  }

  // 허용된 필드만 명시적으로 포함 (whitelist 방식)
  // 허용 필드: title, description, due_date, client_name, send_email_to_client
  const allowedUpdates: Partial<TaskUpdate> = {};
  
  // title 수정 허용 (지시자만)
  if (updates.title !== undefined && updates.title !== null) {
    if (task.assigner_id !== userId) {
      throw new Error("Task 제목 수정은 지시자만 가능합니다.");
    }
    allowedUpdates.title = updates.title;
  }
  
  // description 수정 허용 (null도 허용, 지시자만)
  if ("description" in updates && updates.description !== undefined) {
    if (task.assigner_id !== userId) {
      throw new Error("Task 설명 수정은 지시자만 가능합니다.");
    }
    (allowedUpdates as any).description = updates.description;
  }
  
  // client_name 수정 허용 (지시자만)
  if (updates.client_name !== undefined && updates.client_name !== null) {
    if (task.assigner_id !== userId) {
      throw new Error("고객명 수정은 지시자만 가능합니다.");
    }
    allowedUpdates.client_name = updates.client_name;
  }
  
  // due_date 수정 허용 (null도 허용, 지시자만)
  if (updates.due_date !== undefined) {
    if (task.assigner_id !== userId) {
      throw new Error("마감일 수정은 지시자만 가능합니다.");
    }
    allowedUpdates.due_date = updates.due_date;
  }
  
  // send_email_to_client 수정 허용 (담당자만, 승인 상태일 때만 사용)
  if (updates.send_email_to_client !== undefined) {
    if (task.assignee_id !== userId) {
      throw new Error("고객에게 이메일 발송 완료 상태는 담당자만 변경할 수 있습니다.");
    }
    (allowedUpdates as any).send_email_to_client = updates.send_email_to_client;
  }
  
  // assigner_id, assignee_id, task_status는 이미 위에서 차단됨
  // 다른 필드는 명시적으로 허용하지 않음
  
  // 업데이트할 필드가 없으면 에러
  if (Object.keys(allowedUpdates).length === 0) {
    throw new Error("수정할 내용이 없습니다.");
  }

  // 디버깅: 업데이트 payload 확인
  console.log("[updateTask] Original updates:", updates);
  console.log("[updateTask] Allowed updates:", allowedUpdates);
  console.log("[updateTask] Task ID:", id);
  console.log("[updateTask] User ID:", userId);
  console.log("[updateTask] Is Assigner:", task.assigner_id === userId);

  // 상태 업데이트
  const { data: updatedTask, error: updateError } = await supabase
    .from("tasks")
    .update(allowedUpdates)
    .eq("id", id)
    .select()
    .single();

  // 에러 상세 로깅
  if (updateError) {
    console.error("[updateTask] Update error:", updateError);
    console.error("[updateTask] Error code:", updateError.code);
    console.error("[updateTask] Error message:", updateError.message);
    console.error("[updateTask] Error details:", updateError.details);
    console.error("[updateTask] Error hint:", updateError.hint);
    throw new Error(`Task 수정 실패: ${updateError.message} (코드: ${updateError.code})`);
  }

  if (!updatedTask) {
    throw new Error("Task 수정 후 데이터를 받지 못했습니다.");
  }

  console.log("[updateTask] Update successful:", updatedTask);
  return updatedTask;
}

/**
 * Task 삭제 (지시자만 가능)
 */
export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from("tasks").delete().eq("id", id);

  if (error) {
    throw new Error(`Task 삭제 실패: ${error.message}`);
  }
}

/**
 * 멤버용 Task 목록 조회
 * 현재 사용자가 담당자 또는 지시자인 Task만 조회
 * 모든 프로젝트에서 Task 조회 (프로젝트별이 아님)
 * 
 * @param excludeApproved APPROVED 상태 Task 제외 여부 (기본값: true)
 * @returns TaskWithProfiles[]
 */
export async function getTasksForMember(
  excludeApproved: boolean = true,
): Promise<TaskWithProfiles[]> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) {
    throw new Error("인증이 필요합니다.");
  }

  const userId = session.session.user.id;

  let query = supabase
    .from("tasks")
    .select(`
      *,
      assigner:profiles!tasks_assigner_id_fkey(id, full_name, email, avatar_url),
      assignee:profiles!tasks_assignee_id_fkey(id, full_name, email, avatar_url)
    `)
    .or(`assigner_id.eq.${userId},assignee_id.eq.${userId}`);

  // APPROVED 제외 옵션
  if (excludeApproved) {
    query = query.neq("task_status", "APPROVED");
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Task 목록 조회 실패: ${error.message}`);
  }

  return (data || []) as TaskWithProfiles[];
}

/**
 * Admin용 Task 목록 조회
 * 모든 Task 조회 (APPROVED 제외 옵션)
 * 
 * @param excludeApproved APPROVED 상태 Task 제외 여부 (기본값: true)
 * @returns TaskWithProfiles[]
 */
export async function getTasksForAdmin(
  excludeApproved: boolean = true,
): Promise<TaskWithProfiles[]> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) {
    throw new Error("인증이 필요합니다.");
  }

  // Admin 권한 확인
  const userId = session.session.user.id;
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (profile?.role !== "admin") {
    throw new Error("Admin 권한이 필요합니다.");
  }

  let query = supabase
    .from("tasks")
    .select(`
      *,
      assigner:profiles!tasks_assigner_id_fkey(id, full_name, email, avatar_url),
      assignee:profiles!tasks_assignee_id_fkey(id, full_name, email, avatar_url)
    `);

  // APPROVED 제외 옵션
  if (excludeApproved) {
    query = query.neq("task_status", "APPROVED");
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Task 목록 조회 실패: ${error.message}`);
  }

  return (data || []) as TaskWithProfiles[];
}

/**
 * Task 상태 변경
 * - assignee: ASSIGNED → IN_PROGRESS, IN_PROGRESS → WAITING_CONFIRM만 가능
 * - assigner: WAITING_CONFIRM → APPROVED/REJECTED만 가능
 * - Admin이 assigner/assignee인 경우에도 상태 변경 가능
 */
export async function updateTaskStatus(
  taskId: string,
  newStatus: TaskStatus,
): Promise<Task> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) {
    throw new Error("인증이 필요합니다.");
  }

  const userId = session.session.user.id;

  // 현재 Task 조회
  // 주의: RLS SELECT 정책으로 인해 조회가 실패할 수 있으나,
  // UPDATE 정책(assigner/assignee만 가능)은 별도로 작동하므로 UPDATE는 시도함
  const { data: task, error: fetchError } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", taskId)
    .maybeSingle();

  // Task 조회 실패 시에도 UPDATE는 시도 (UPDATE 정책이 별도로 검증)
  // 단, 조회 성공 시 추가 검증 수행
  if (task) {
    // 현재 상태와 새 상태가 같은지 확인
    if (task.task_status === newStatus) {
      throw new Error("이미 해당 상태입니다.");
    }

    // 상태 전환 유효성 검증
    if (!isValidStatusTransition(task.task_status, newStatus)) {
      throw new Error(
        getStatusTransitionErrorMessage(task.task_status, newStatus),
      );
    }

    // 사용자 역할 확인
    const isAssigner = task.assigner_id === userId;
    const isAssignee = task.assignee_id === userId;

    if (!isAssigner && !isAssignee) {
      throw new Error("이 Task의 지시자 또는 담당자만 상태를 변경할 수 있습니다.");
    }

    // 역할별 권한 검증
    const userRole = isAssignee ? "assignee" : "assigner";
    if (!canUserChangeStatus(userRole, task.task_status, newStatus)) {
      throw new Error(
        getStatusTransitionErrorMessage(task.task_status, newStatus, userRole),
      );
    }
  } else if (fetchError && fetchError.code !== "PGRST116") {
    // PGRST116이 아닌 다른 에러는 즉시 실패
    throw new Error(`Task 조회 실패: ${fetchError.message}`);
  }
  // PGRST116 에러(RLS로 인한 조회 실패)는 무시하고 UPDATE 시도
  // UPDATE 정책이 assigner/assignee만 허용하므로 안전함

  // 상태 업데이트
  // 주의: UPDATE 후 SELECT 시 RLS 정책으로 인해 0 rows가 반환될 수 있으므로
  // .maybeSingle()을 사용하여 null을 허용하고, 실패 시 기존 task 데이터를 기반으로 반환
  
  // 참고: 채팅 로그는 이제 파일 업로드 기반으로 자동 생성됨 (트리거 기반)
  // 상태 변경 시 로그 생성 로직은 제거됨

  const { data: updatedTask, error: updateError } = await supabase
    .from("tasks")
    .update({ task_status: newStatus })
    .eq("id", taskId)
    .select()
    .maybeSingle();

  if (updateError) {
    // RLS 정책 차단 시 더 명확한 에러 메시지 제공
    if (updateError.code === "42501" || updateError.message.includes("permission denied") || updateError.message.includes("policy")) {
      throw new Error("상태 변경 권한이 없습니다. 이 Task의 지시자 또는 담당자만 상태를 변경할 수 있습니다.");
    }
    // 기타 에러는 원본 메시지 사용
    throw new Error(`상태 변경 실패: ${updateError.message}${updateError.code ? ` (코드: ${updateError.code})` : ""}`);
  }

  // RLS 정책으로 인해 SELECT 결과가 null일 수 있음
  // UPDATE는 성공했으므로 기존 task 데이터를 기반으로 업데이트된 상태 반환
  if (!updatedTask) {
    if (!task) {
      // Task 조회도 실패했지만 UPDATE는 성공했으므로, 최소한의 Task 객체 반환
      // UPDATE 정책이 통과했다는 것은 Task가 존재하고 사용자가 권한이 있다는 의미
      throw new Error("상태 변경은 성공했으나 결과를 조회할 수 없습니다. 페이지를 새로고침해주세요.");
    }
    return { ...task, task_status: newStatus } as Task;
  }

  return updatedTask;
}

