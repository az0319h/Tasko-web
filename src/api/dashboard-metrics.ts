import supabase from "@/lib/supabase";

export type DashboardMetricsRole = "admin" | "member";

export interface DashboardMetrics {
  /** 생성/할당 Task 수 (이번 달) */
  createdThisMonth: number;
  /** 생성/할당 Task 수 (지난 달) */
  createdLastMonth: number;
  /** 승인 완료 수 (이번 달) */
  approvedThisMonth: number;
  /** 승인 완료 수 (지난 달) */
  approvedLastMonth: number;
  /** 평균 처리 소요 시간 일수 (이번 달) */
  avgProcessingDaysThisMonth: number;
  /** 평균 처리 소요 시간 일수 (지난 달) */
  avgProcessingDaysLastMonth: number;
  /** 마감일 초과 미처리 (현재) */
  overdueCount: number;
  /** 마감일 초과 미처리 (지난 달 말 기준) */
  overdueCountLastMonthEnd: number;
}

/**
 * 이번 달/지난 달 첫날·마지막날 (로컬 KST 기준)
 */
function getMonthRanges(): {
  thisMonthStart: string;
  thisMonthEnd: string;
  lastMonthStart: string;
  lastMonthEnd: string;
} {
  const now = new Date();

  // 이번 달
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  // 지난 달
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

  return {
    thisMonthStart: thisMonthStart.toISOString(),
    thisMonthEnd: thisMonthEnd.toISOString(),
    lastMonthStart: lastMonthStart.toISOString(),
    lastMonthEnd: lastMonthEnd.toISOString(),
  };
}

/**
 * 대시보드 메트릭 조회
 * - Admin: assigner_id 기준 (내가 지시한 Task)
 * - Member: assignee_id 기준 (내가 담당한 Task)
 */
export async function getDashboardMetrics(role: DashboardMetricsRole): Promise<DashboardMetrics> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) {
    throw new Error("인증이 필요합니다.");
  }

  const userId = session.session.user.id;
  const { thisMonthStart, thisMonthEnd, lastMonthStart, lastMonthEnd } = getMonthRanges();

  // Admin: assigner_id, Member: assignee_id
  const idColumn = role === "admin" ? "assigner_id" : "assignee_id";

  // 1. 생성 Task (이번 달)
  const { count: createdThisMonth } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq(idColumn, userId)
    .eq("is_self_task", false)
    .gte("created_at", thisMonthStart)
    .lte("created_at", thisMonthEnd);

  // 2. 생성 Task (지난 달)
  const { count: createdLastMonth } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq(idColumn, userId)
    .eq("is_self_task", false)
    .gte("created_at", lastMonthStart)
    .lte("created_at", lastMonthEnd);

  // 3. 승인 완료 (이번 달) - updated_at 기준으로 승인 시점 추정
  const { count: approvedThisMonth } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq(idColumn, userId)
    .eq("task_status", "APPROVED")
    .eq("is_self_task", false)
    .gte("updated_at", thisMonthStart)
    .lte("updated_at", thisMonthEnd);

  // 4. 승인 완료 (지난 달)
  const { count: approvedLastMonth } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq(idColumn, userId)
    .eq("task_status", "APPROVED")
    .eq("is_self_task", false)
    .gte("updated_at", lastMonthStart)
    .lte("updated_at", lastMonthEnd);

  // 5. 평균 처리 소요 시간 - APPROVED Task의 created_at ~ updated_at 일수

  const { data: approvedTasksThisMonth } = await supabase
    .from("tasks")
    .select("created_at, updated_at")
    .eq(idColumn, userId)
    .eq("task_status", "APPROVED")
    .eq("is_self_task", false)
    .gte("updated_at", thisMonthStart)
    .lte("updated_at", thisMonthEnd);

  const { data: approvedTasksLastMonth } = await supabase
    .from("tasks")
    .select("created_at, updated_at")
    .eq(idColumn, userId)
    .eq("task_status", "APPROVED")
    .eq("is_self_task", false)
    .gte("updated_at", lastMonthStart)
    .lte("updated_at", lastMonthEnd);

  const calcAvgDays = (tasks: Array<{ created_at: string; updated_at: string }> | null): number => {
    if (!tasks || tasks.length === 0) return 0;
    const totalDays = tasks.reduce((sum, t) => {
      const created = new Date(t.created_at).getTime();
      const updated = new Date(t.updated_at).getTime();
      return sum + (updated - created) / (1000 * 60 * 60 * 24);
    }, 0);
    return Math.round((totalDays / tasks.length) * 10) / 10;
  };

  const avgProcessingDaysThisMonth = calcAvgDays(approvedTasksThisMonth);
  const avgProcessingDaysLastMonth = calcAvgDays(approvedTasksLastMonth);

  // 6. 마감일 초과 미처리 (현재) - due_date < now (UTC) 사용하여 시점 정확히 비교
  const nowIso = new Date().toISOString();
  const overdueBaseQuery = supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("is_self_task", false)
    .neq("task_status", "APPROVED")
    .not("due_date", "is", null)
    .lt("due_date", nowIso);

  const overdueQuery =
    role === "admin"
      ? overdueBaseQuery.eq("assigner_id", userId)
      : overdueBaseQuery.or(`assigner_id.eq.${userId},assignee_id.eq.${userId}`);

  const { count: overdueCount } = await overdueQuery;

  // 7. 마감일 초과 미처리 (지난 달 말 기준) - due_date < 지난달 말 (전체 타임스탬프)
  const overdueLastMonthBaseQuery = supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("is_self_task", false)
    .neq("task_status", "APPROVED")
    .not("due_date", "is", null)
    .lt("due_date", lastMonthEnd);

  const overdueLastMonthQuery =
    role === "admin"
      ? overdueLastMonthBaseQuery.eq("assigner_id", userId)
      : overdueLastMonthBaseQuery.or(`assigner_id.eq.${userId},assignee_id.eq.${userId}`);

  const { count: overdueCountLastMonthEnd } = await overdueLastMonthQuery;

  return {
    createdThisMonth: createdThisMonth ?? 0,
    createdLastMonth: createdLastMonth ?? 0,
    approvedThisMonth: approvedThisMonth ?? 0,
    approvedLastMonth: approvedLastMonth ?? 0,
    avgProcessingDaysThisMonth,
    avgProcessingDaysLastMonth,
    overdueCount: overdueCount ?? 0,
    overdueCountLastMonthEnd: overdueCountLastMonthEnd ?? 0,
  };
}
