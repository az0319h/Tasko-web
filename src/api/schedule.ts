import supabase from "@/lib/supabase";
import type { Tables, TablesUpdate } from "@/database.type";
import type { TaskSchedule, TaskScheduleWithTask } from "@/types/schedule";

export type TaskScheduleUpdate = TablesUpdate<"task_schedules">;

/**
 * Get task schedules for a date range
 * Only returns schedules where the current user is assigner or assignee
 * 
 * @param startDate Start date of the range
 * @param endDate End date of the range
 * @param excludeApproved Whether to exclude approved tasks (default: true)
 * @returns Array of task schedules with task information
 */
export async function getTaskSchedules(
  startDate: Date,
  endDate: Date,
  excludeApproved: boolean = true
): Promise<TaskScheduleWithTask[]> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) {
    throw new Error("인증이 필요합니다.");
  }

  // First, get schedules (RLS will filter based on assigner/assignee)
  const { data: schedules, error: schedulesError } = await supabase
    .from("task_schedules")
    .select("*")
    .gte("start_time", startDate.toISOString())
    .lte("end_time", endDate.toISOString())
    .order("start_time", { ascending: true });

  if (schedulesError) {
    console.error("일정 조회 에러:", schedulesError);
    console.error("조회 기간:", startDate.toISOString(), "~", endDate.toISOString());
    throw new Error(`일정 조회 실패: ${schedulesError.message}`);
  }

  if (!schedules || schedules.length === 0) {
    console.log("일정 없음");
    return [];
  }

  // Then, get task information for each schedule
  const taskIds = schedules.map((s) => s.task_id);
  const { data: tasks, error: tasksError } = await supabase
    .from("tasks")
    .select("id, title, task_category, task_status, assigner_id, assignee_id")
    .in("id", taskIds);

  if (tasksError) {
    console.error("Task 조회 에러:", tasksError);
    throw new Error(`Task 조회 실패: ${tasksError.message}`);
  }

  // Create a map for quick lookup
  const taskMap = new Map(tasks?.map((t) => [t.id, t]) || []);

  // Combine schedules with tasks
  const data = schedules
    .map((schedule) => ({
      ...schedule,
      task: taskMap.get(schedule.task_id),
    }))
    .filter((item) => item.task !== undefined); // Filter out schedules without tasks

  console.log("일정 조회 성공:", data.length, "개");

  if (!data) {
    return [];
  }

  // Transform the data to match TaskScheduleWithTask type
  // Filter out approved tasks if requested (though trigger should have deleted them)
  return data
    .filter((item): item is typeof item & { task: NonNullable<typeof item.task> } => {
      // Type guard: ensure task exists
      if (!item.task) {
        return false;
      }
      // Filter out approved tasks if requested
      if (excludeApproved && item.task.task_status === "APPROVED") {
        return false;
      }
      return true;
    })
    .map((item) => ({
      id: item.id,
      task_id: item.task_id,
      start_time: new Date(item.start_time),
      end_time: new Date(item.end_time),
      is_all_day: item.is_all_day,
      created_at: new Date(item.created_at),
      updated_at: new Date(item.updated_at),
      task: {
        id: item.task.id,
        title: item.task.title,
        task_category: item.task.task_category,
        task_status: item.task.task_status,
        assigner_id: item.task.assigner_id,
        assignee_id: item.task.assignee_id,
      },
    }));
}

/**
 * Update task schedule
 * Only assigner or assignee can update schedules
 * 
 * @param id Schedule ID
 * @param updates Schedule updates (start_time, end_time, is_all_day)
 * @returns Updated task schedule
 */
export async function updateTaskSchedule(
  id: string,
  updates: {
    start_time?: Date;
    end_time?: Date;
    is_all_day?: boolean;
  }
): Promise<TaskSchedule> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) {
    throw new Error("인증이 필요합니다.");
  }

  // Prepare update object
  const updateData: TaskScheduleUpdate = {
    updated_at: new Date().toISOString(),
  };

  if (updates.start_time !== undefined) {
    updateData.start_time = updates.start_time.toISOString();
  }

  if (updates.end_time !== undefined) {
    updateData.end_time = updates.end_time.toISOString();
  }

  if (updates.is_all_day !== undefined) {
    updateData.is_all_day = updates.is_all_day;
  }

  console.log("일정 업데이트 API 호출:", {
    id,
    updateData,
  });

  const { data, error } = await supabase
    .from("task_schedules")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("일정 업데이트 API 에러:", error);
    console.error("에러 상세:", {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw new Error(`일정 수정 실패: ${error.message}`);
  }

  if (!data) {
    console.error("일정 업데이트 결과 없음");
    throw new Error("일정을 찾을 수 없습니다.");
  }

  console.log("일정 업데이트 성공:", data);

  return {
    ...data,
    start_time: new Date(data.start_time),
    end_time: new Date(data.end_time),
    created_at: new Date(data.created_at),
    updated_at: new Date(data.updated_at),
  };
}
