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
  } | null;
  assignee: {
    id: string;
    full_name: string | null;
    email: string;
  } | null;
};

/**
 * 프로젝트의 Task 목록 조회
 * 프로젝트 접근 권한이 있으면 해당 프로젝트의 모든 Task 조회 가능
 * assigner와 assignee의 프로필 정보를 JOIN하여 함께 반환
 */
export async function getTasksByProjectId(projectId: string): Promise<TaskWithProfiles[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select(`
      *,
      assigner:profiles!tasks_assigner_id_fkey(id, full_name, email),
      assignee:profiles!tasks_assignee_id_fkey(id, full_name, email)
    `)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Task 목록 조회 실패: ${error.message}`);
  }

  return (data || []) as TaskWithProfiles[];
}

/**
 * Task 상세 조회
 * assigner와 assignee의 프로필 정보를 JOIN하여 함께 반환
 */
export async function getTaskById(id: string): Promise<TaskWithProfiles | null> {
  const { data, error } = await supabase
    .from("tasks")
    .select(`
      *,
      assigner:profiles!tasks_assigner_id_fkey(id, full_name, email),
      assignee:profiles!tasks_assignee_id_fkey(id, full_name, email)
    `)
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null;
    }
    throw new Error(`Task 조회 실패: ${error.message}`);
  }

  return (data || null) as TaskWithProfiles | null;
}

/**
 * Task 생성 (Admin만 가능)
 * - assigner_id와 assignee_id는 모두 선택값 (자동 설정되지 않음)
 * - assigner와 assignee는 모두 해당 프로젝트에 속한 사용자여야 함
 */
export async function createTask(task: TaskInsert): Promise<Task> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) {
    throw new Error("인증이 필요합니다.");
  }

  // Admin 권한 확인
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", session.session.user.id)
    .single();

  if (profile?.role !== "admin") {
    throw new Error("Task 생성은 Admin만 가능합니다.");
  }

  // assigner와 assignee가 모두 설정되어 있는지 확인
  if (!task.assigner_id || !task.assignee_id) {
    throw new Error("담당자와 할당받은 사람을 모두 선택해주세요.");
  }

  // assigner와 assignee가 같은지 확인
  if (task.assigner_id === task.assignee_id) {
    throw new Error("담당자와 할당받은 사람은 같을 수 없습니다.");
  }

  const { data, error } = await supabase
    .from("tasks")
    .insert(task)
    .select()
    .single();

  if (error) {
    throw new Error(`Task 생성 실패: ${error.message}`);
  }

  return data;
}

/**
 * Task 수정 (Admin만 가능)
 * - Admin만 Task 수정 가능
 * - assigner / assignee는 수정 불가
 * - 허용 필드: title, description, due_date만 수정 가능
 * - assigner_id, assignee_id, task_status는 수정 불가
 */
export async function updateTask(id: string, updates: TaskUpdate): Promise<Task> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) {
    throw new Error("인증이 필요합니다.");
  }

  const userId = session.session.user.id;

  // Admin 권한 확인
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (profile?.role !== "admin") {
    throw new Error("Task 수정은 Admin만 가능합니다.");
  }

  // 수정 불가 필드 차단
  if (updates.assigner_id !== undefined || updates.assignee_id !== undefined) {
    throw new Error("지시자(assigner)와 담당자(assignee)는 수정할 수 없습니다.");
  }

  if (updates.task_status !== undefined) {
    throw new Error("Task 상태는 수정할 수 없습니다. 상태 변경은 별도의 워크플로우를 사용하세요.");
  }

  // 현재 Task 조회 (존재 여부 확인)
  const { data: task, error: fetchError } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !task) {
    throw new Error(`Task를 찾을 수 없습니다: ${fetchError?.message || "알 수 없는 오류"}`);
  }

  // 허용된 필드만 명시적으로 포함 (whitelist 방식)
  // 허용 필드: title, description, due_date만
  const allowedUpdates: Partial<TaskUpdate> = {};
  
  // title 수정 허용
  if (updates.title !== undefined && updates.title !== null) {
    allowedUpdates.title = updates.title;
  }
  
  // description 수정 허용 (null도 허용)
  if (updates.description !== undefined) {
    allowedUpdates.description = updates.description;
  }
  
  // due_date 수정 허용 (null도 허용)
  if (updates.due_date !== undefined) {
    allowedUpdates.due_date = updates.due_date;
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
  console.log("[updateTask] Is Admin:", true); // Admin만 수정 가능하므로 항상 true

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
 * Task 삭제 (Admin만 가능)
 */
export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from("tasks").delete().eq("id", id);

  if (error) {
    throw new Error(`Task 삭제 실패: ${error.message}`);
  }
}

/**
 * Task 상태 변경
 * - assignee: ASSIGNED → IN_PROGRESS, IN_PROGRESS → WAITING_CONFIRM만 가능
 * - assigner: WAITING_CONFIRM → APPROVED/REJECTED만 가능
 * - Admin: 상태 변경 불가
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
  const { data: task, error: fetchError } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", taskId)
    .single();

  if (fetchError || !task) {
    throw new Error(`Task를 찾을 수 없습니다: ${fetchError?.message || "알 수 없는 오류"}`);
  }

  // Admin 권한 확인 (Admin은 상태 변경 불가)
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (profile?.role === "admin") {
    throw new Error("Admin은 Task 상태를 변경할 수 없습니다.");
  }

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

  // 상태 업데이트
  const { data: updatedTask, error: updateError } = await supabase
    .from("tasks")
    .update({ task_status: newStatus })
    .eq("id", taskId)
    .select()
    .single();

  if (updateError) {
    throw new Error(`상태 변경 실패: ${updateError.message}`);
  }

  return updatedTask;
}

