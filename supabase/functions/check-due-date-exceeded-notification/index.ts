import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Supabase Edge Function: Check Due Date Exceeded Notification
// This function checks tasks with exceeded due dates that are not approved
// Called daily by pg_cron scheduler

interface TaskWithDueDate {
  id: string;
  title: string;
  assignee_id: string | null;
  due_date: string;
  task_status: string;
}

Deno.serve(async (req: Request) => {
  try {
    // Service Role Key를 사용하여 RLS 우회
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      console.error("[check-due-date-exceeded-notification] 환경 변수 누락");
      return new Response(
        JSON.stringify({ error: "환경 변수가 설정되지 않았습니다." }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    console.log("[check-due-date-exceeded-notification] 마감일 초과 알림 체크 시작");

    // 오늘 날짜 (날짜만 비교)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split("T")[0]; // YYYY-MM-DD

    // 마감일이 지났고 APPROVED가 아닌 Task 조회 (담당자가 있는 Task만)
    const { data: tasks, error: tasksError } = await supabase
      .from("tasks")
      .select("id, title, assignee_id, due_date, task_status")
      .not("assignee_id", "is", null)
      .not("due_date", "is", null)
      .neq("task_status", "APPROVED")
      .lt("due_date", todayStr)
      .order("due_date", { ascending: true });

    if (tasksError) {
      console.error("[check-due-date-exceeded-notification] Task 조회 실패:", tasksError);
      return new Response(
        JSON.stringify({ error: `Task 조회 실패: ${tasksError.message}` }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    if (!tasks || tasks.length === 0) {
      console.log("[check-due-date-exceeded-notification] 마감일이 초과된 Task 없음");
      return new Response(
        JSON.stringify({ message: "마감일이 초과된 Task가 없습니다.", processed: 0 }),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    console.log(`[check-due-date-exceeded-notification] ${tasks.length}개의 Task 조회됨`);

    let processedCount = 0;
    let notificationCount = 0;
    const errors: string[] = [];

    // 각 Task에 대해 처리
    for (const task of tasks as TaskWithDueDate[]) {
      try {
        // 마감일 날짜 계산 (날짜만 비교)
        const dueDate = new Date(task.due_date);
        dueDate.setHours(0, 0, 0, 0);
        const dueDateStr = dueDate.toISOString().split("T")[0]; // YYYY-MM-DD

        // 초과 일수 계산 (오늘 - 마감일)
        const exceededDays = Math.ceil(
          (today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        // 중복 체크: 같은 Task에 대한 마감일 초과 알림이 이미 있는지 확인
        const { data: existingNotification, error: checkError } = await supabase
          .from("notifications")
          .select("id")
          .eq("task_id", task.id)
          .eq("notification_type", "TASK_DUE_DATE_EXCEEDED")
          .maybeSingle();

        if (checkError) {
          console.error(
            `[check-due-date-exceeded-notification] 중복 체크 실패 (Task ${task.id}):`,
            checkError
          );
          errors.push(`Task ${task.id}: 중복 체크 실패 - ${checkError.message}`);
          continue;
        }

        // 이미 알림이 있으면 스킵
        if (existingNotification) {
          console.log(
            `[check-due-date-exceeded-notification] Task ${task.id}: 마감일 초과 알림이 이미 존재함`
          );
          continue;
        }

        // 알림 생성
        const title = "Task 마감일이 초과되었습니다";
        const message = `${task.title} Task의 마감일이 지났습니다. 아직 승인되지 않았습니다.`;

        const { data: notificationId, error: notificationError } = await supabase.rpc(
          "create_notification",
          {
            p_user_id: task.assignee_id,
            p_notification_type: "TASK_DUE_DATE_EXCEEDED",
            p_title: title,
            p_message: message,
            p_task_id: task.id,
            p_metadata: {
              exceeded_days: exceededDays,
              due_date: dueDateStr,
            },
          }
        );

        if (notificationError) {
          console.error(
            `[check-due-date-exceeded-notification] 알림 생성 실패 (Task ${task.id}):`,
            notificationError
          );
          errors.push(
            `Task ${task.id}: 알림 생성 실패 - ${notificationError.message}`
          );
          continue;
        }

        console.log(
          `[check-due-date-exceeded-notification] 알림 생성 성공: Task ${task.id}, exceeded_days=${exceededDays}, notification_id=${notificationId}`
        );
        notificationCount++;
      } catch (error) {
        console.error(
          `[check-due-date-exceeded-notification] Task ${task.id} 처리 중 오류:`,
          error
        );
        errors.push(`Task ${task.id}: ${error.message || "알 수 없는 오류"}`);
      }

      processedCount++;
    }

    const result = {
      message: "마감일 초과 알림 체크 완료",
      processed: processedCount,
      notifications_created: notificationCount,
      errors: errors.length > 0 ? errors : undefined,
    };

    console.log(
      `[check-due-date-exceeded-notification] 완료: 처리된 Task ${processedCount}개, 생성된 알림 ${notificationCount}개`
    );

    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[check-due-date-exceeded-notification] Edge Function 에러:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "알 수 없는 오류가 발생했습니다.",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
