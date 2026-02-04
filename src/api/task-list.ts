import supabase from "@/lib/supabase";
import type { Tables, TablesInsert, TablesUpdate } from "@/database.type";
import type { TaskWithProfiles } from "./task";

export type TaskList = Tables<"task_lists">;
export type TaskListInsert = TablesInsert<"task_lists">;
export type TaskListUpdate = TablesUpdate<"task_lists">;

export type TaskListItem = Tables<"task_list_items">;
export type TaskListItemInsert = TablesInsert<"task_list_items">;

/**
 * Task 목록에 포함된 Task 정보를 포함한 타입
 */
export type TaskListWithItems = TaskList & {
  items: Array<{
    id: string;
    task_id: string;
    created_at: string;
    task: TaskWithProfiles;
  }>;
  item_count: number;
};

/**
 * Task가 포함된 목록 정보
 */
export type TaskListForTask = TaskList & {
  has_task: boolean; // 현재 Task가 포함되어 있는지 여부
};

/**
 * 사용자의 Task 목록 목록 조회 (각 목록의 Task 개수 포함)
 */
export async function getTaskLists(): Promise<Array<TaskList & { item_count: number }>> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) {
    throw new Error("인증이 필요합니다.");
  }

  // 목록 조회
  const { data: lists, error: listsError } = await supabase
    .from("task_lists")
    .select("*")
    .order("created_at", { ascending: false });

  if (listsError) {
    throw new Error(`Task 목록 조회 실패: ${listsError.message}`);
  }

  if (!lists || lists.length === 0) {
    return [];
  }

  // 각 목록의 Task 개수 조회
  const listIds = lists.map((list) => list.id);
  const { data: counts, error: countsError } = await supabase
    .from("task_list_items")
    .select("task_list_id")
    .in("task_list_id", listIds);

  if (countsError) {
    throw new Error(`Task 개수 조회 실패: ${countsError.message}`);
  }

  // 목록별 개수 계산
  const countMap = new Map<string, number>();
  (counts || []).forEach((item) => {
    const currentCount = countMap.get(item.task_list_id) || 0;
    countMap.set(item.task_list_id, currentCount + 1);
  });

  // 목록에 개수 추가
  return lists.map((list) => ({
    ...list,
    item_count: countMap.get(list.id) || 0,
  }));
}

/**
 * 특정 Task 목록 조회 (Task 목록 포함)
 */
export async function getTaskList(listId: string): Promise<TaskListWithItems | null> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) {
    throw new Error("인증이 필요합니다.");
  }

  // 목록 조회
  const { data: list, error: listError } = await supabase
    .from("task_lists")
    .select("*")
    .eq("id", listId)
    .single();

  if (listError) {
    if (listError.code === "PGRST116") {
      return null;
    }
    throw new Error(`Task 목록 조회 실패: ${listError.message}`);
  }

  if (!list) {
    return null;
  }

  // 목록에 포함된 Task 항목 조회
  const { data: items, error: itemsError } = await supabase
    .from("task_list_items")
    .select(`
      id,
      task_id,
      created_at,
      task:tasks!task_list_items_task_id_fkey(
        *,
        assigner:profiles!tasks_assigner_id_fkey(id, full_name, email, avatar_url),
        assignee:profiles!tasks_assignee_id_fkey(id, full_name, email, avatar_url)
      )
    `)
    .eq("task_list_id", listId)
    .order("created_at", { ascending: false });

  if (itemsError) {
    throw new Error(`Task 목록 항목 조회 실패: ${itemsError.message}`);
  }

  return {
    ...list,
    items: items || [],
    item_count: items?.length || 0,
  } as TaskListWithItems;
}

/**
 * 목록에 포함된 Task 목록 조회
 */
export async function getTaskListItems(listId: string): Promise<TaskListItem[]> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) {
    throw new Error("인증이 필요합니다.");
  }

  const { data, error } = await supabase
    .from("task_list_items")
    .select("*")
    .eq("task_list_id", listId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Task 목록 항목 조회 실패: ${error.message}`);
  }

  return data || [];
}

/**
 * Task 목록 생성
 */
export async function createTaskList(title: string): Promise<TaskList> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) {
    throw new Error("인증이 필요합니다.");
  }

  const userId = session.session.user.id;

  const { data, error } = await supabase
    .from("task_lists")
    .insert({
      title: title.trim(),
      user_id: userId,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Task 목록 생성 실패: ${error.message}`);
  }

  return data;
}

/**
 * Task 목록 제목 수정
 */
export async function updateTaskList(listId: string, title: string): Promise<TaskList> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) {
    throw new Error("인증이 필요합니다.");
  }

  const { data, error } = await supabase
    .from("task_lists")
    .update({
      title: title.trim(),
    })
    .eq("id", listId)
    .select()
    .single();

  if (error) {
    throw new Error(`Task 목록 수정 실패: ${error.message}`);
  }

  return data;
}

/**
 * Task 목록 삭제
 */
export async function deleteTaskList(listId: string): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) {
    throw new Error("인증이 필요합니다.");
  }

  const { error } = await supabase
    .from("task_lists")
    .delete()
    .eq("id", listId);

  if (error) {
    throw new Error(`Task 목록 삭제 실패: ${error.message}`);
  }
}

/**
 * 목록에 Task 추가
 */
export async function addTaskToList(listId: string, taskId: string): Promise<TaskListItem> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) {
    throw new Error("인증이 필요합니다.");
  }

  const { data, error } = await supabase
    .from("task_list_items")
    .insert({
      task_list_id: listId,
      task_id: taskId,
    })
    .select()
    .single();

  if (error) {
    // 중복 추가 시도 시 에러 처리
    if (error.code === "23505") {
      throw new Error("이미 목록에 추가된 Task입니다.");
    }
    throw new Error(`Task 추가 실패: ${error.message}`);
  }

  return data;
}

/**
 * 목록에서 Task 제거
 */
export async function removeTaskFromList(listId: string, taskId: string): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) {
    throw new Error("인증이 필요합니다.");
  }

  const { error } = await supabase
    .from("task_list_items")
    .delete()
    .eq("task_list_id", listId)
    .eq("task_id", taskId);

  if (error) {
    throw new Error(`Task 제거 실패: ${error.message}`);
  }
}

/**
 * 특정 Task가 포함된 목록 목록 조회 (체크 표시용)
 * 현재 Task가 어떤 목록에 포함되어 있는지 확인
 */
export async function getTaskListsForTask(taskId: string): Promise<TaskListForTask[]> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) {
    throw new Error("인증이 필요합니다.");
  }

  // 사용자의 모든 목록 조회
  const { data: lists, error: listsError } = await supabase
    .from("task_lists")
    .select("*")
    .order("created_at", { ascending: false });

  if (listsError) {
    throw new Error(`Task 목록 조회 실패: ${listsError.message}`);
  }

  if (!lists || lists.length === 0) {
    return [];
  }

  // 현재 Task가 포함된 목록 ID 조회
  const { data: items, error: itemsError } = await supabase
    .from("task_list_items")
    .select("task_list_id")
    .eq("task_id", taskId);

  if (itemsError) {
    throw new Error(`Task 목록 항목 조회 실패: ${itemsError.message}`);
  }

  const taskListIds = new Set(items?.map((item) => item.task_list_id) || []);

  // 목록에 has_task 플래그 추가
  return lists.map((list) => ({
    ...list,
    has_task: taskListIds.has(list.id),
  })) as TaskListForTask[];
}
