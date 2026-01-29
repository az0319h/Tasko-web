import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get the authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "인증 토큰이 필요합니다." }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Create Supabase client with user's JWT (인증 확인용)
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: authHeader },
        },
      },
    );

    // Verify user is authenticated
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "인증되지 않은 사용자입니다." }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Parse request body
    const { taskId, dueDate } = await req.json();

    console.log(`[check-due-date-exceeded] 요청 받음: taskId=${taskId}, dueDate=${dueDate}, userId=${user.id}`);

    if (!taskId || !dueDate) {
      console.error(`[check-due-date-exceeded] 필수 파라미터 누락: taskId=${taskId}, dueDate=${dueDate}`);
      return new Response(
        JSON.stringify({ error: "taskId와 dueDate가 필요합니다." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Task 조회하여 지시자(assigner) 확인
    const { data: task, error: taskError } = await supabaseClient
      .from("tasks")
      .select("id, assigner_id, assignee_id")
      .eq("id", taskId)
      .single();

    if (taskError || !task) {
      console.error(`[check-due-date-exceeded] Task 조회 실패:`, taskError);
      return new Response(
        JSON.stringify({ error: `Task를 찾을 수 없습니다: ${taskError?.message}` }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 지시자(assigner)만 이 기능을 사용할 수 있도록 확인
    if (task.assigner_id !== user.id) {
      console.error(`[check-due-date-exceeded] 권한 없음: userId=${user.id}, assignerId=${task.assigner_id}`);
      return new Response(
        JSON.stringify({ error: "이 Task의 지시자만 마감일을 확인할 수 있습니다." }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Service Role Key를 사용하여 RLS 우회 (일정 조회)
    // 지시자는 RLS 정책에 의해 일정을 조회할 수 없으므로 Service Role Key 사용
    const supabaseServiceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // 일정 조회 (재시도 로직 포함)
    // DB 트리거가 비동기로 실행되므로 일정이 생성될 때까지 대기
    let schedule = null;
    const maxRetries = 10;
    const retryDelay = 200; // 200ms

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const { data, error } = await supabaseServiceClient
        .from("task_schedules")
        .select("*")
        .eq("task_id", taskId)
        .maybeSingle();

      if (error) {
        // 마지막 시도가 아니면 재시도
        if (attempt < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
          continue;
        }
        // 마지막 시도에서도 에러면 에러 반환
        return new Response(
          JSON.stringify({ error: `일정 조회 실패: ${error.message}` }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // 일정을 찾으면 반복 종료
      if (data) {
        schedule = data;
        console.log(`[check-due-date-exceeded] 일정 발견 (시도 ${attempt + 1}/${maxRetries}):`, {
          task_id: data.task_id,
          start_time: data.start_time,
        });
        break;
      }

      // 일정이 없으면 재시도 (마지막 시도가 아니면)
      if (attempt < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }

    // 일정이 생성되지 않은 경우 (담당자 일정이 30일 내 모두 가득 찬 경우)
    if (!schedule) {
      console.log(`[check-due-date-exceeded] 일정 없음: taskId=${taskId}`);
      return new Response(
        JSON.stringify({
          exceeded: false,
          reason: "no_schedule",
          message: "일정이 생성되지 않았습니다.",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 마감일과 일정 시작일 비교 (날짜만 비교)
    // dueDate는 "YYYY-MM-DD" 형식 문자열
    const dueDateObj = new Date(dueDate);
    dueDateObj.setHours(0, 0, 0, 0);

    // schedule.start_time은 TIMESTAMPTZ이므로 Date 객체로 변환
    const scheduleStartDate = new Date(schedule.start_time);
    scheduleStartDate.setHours(0, 0, 0, 0);

    // 일정 시작일이 마감일보다 늦은 경우
    const exceeded = scheduleStartDate.getTime() > dueDateObj.getTime();

    console.log(`[check-due-date-exceeded] 날짜 비교 결과:`, {
      taskId,
      dueDate: dueDateObj.toISOString(),
      scheduleStartDate: scheduleStartDate.toISOString(),
      exceeded,
      comparison: exceeded ? "일정이 마감일보다 늦음" : "일정이 마감일 이내",
    });

    return new Response(
      JSON.stringify({
        exceeded,
        scheduleDate: schedule.start_time,
        dueDate: dueDate,
        scheduleStartDate: scheduleStartDate.toISOString(),
        dueDateObj: dueDateObj.toISOString(),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Edge Function 에러:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "알 수 없는 오류가 발생했습니다.",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
