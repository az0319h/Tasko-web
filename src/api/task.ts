import supabase from "@/lib/supabase";
import type { Tables, TablesInsert, TablesUpdate } from "@/database.type";

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
 */
export async function getTaskById(id: string): Promise<Task | null> {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return null;
    }
    throw new Error(`Task 조회 실패: ${error.message}`);
  }

  return data;
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
 * Task 수정 (assigner 또는 assignee만 가능, Admin 불가)
 */
export async function updateTask(id: string, updates: TaskUpdate): Promise<Task> {
  const { data, error } = await supabase
    .from("tasks")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(`Task 수정 실패: ${error.message}`);
  }

  return data;
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

