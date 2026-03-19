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
 * 이번 달/지난 달 첫날·마지막날 (KST 기준 - 브라우저/OS 타임존 무관)
 */
function getMonthRanges(): {
  thisMonthStart: string;
  thisMonthEnd: string;
  lastMonthStart: string;
  lastMonthEnd: string;
} {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  const year = parseInt(parts.find((p) => p.type === "year")!.value, 10);
  const month = parseInt(parts.find((p) => p.type === "month")!.value, 10) - 1; // 0-indexed

  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

  // KST 00:00:00.000 = UTC - 9h
  const thisMonthStart = new Date(Date.UTC(year, month, 1) - KST_OFFSET_MS);
  const thisMonthEnd = new Date(Date.UTC(year, month + 1, 1) - KST_OFFSET_MS - 1);
  const lastMonthStart = new Date(Date.UTC(year, month - 1, 1) - KST_OFFSET_MS);
  const lastMonthEnd = new Date(Date.UTC(year, month, 1) - KST_OFFSET_MS - 1);

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

  // 3. 승인 완료 (이번 달) - approved_at 기준 (마이그레이션 후)
  const { count: approvedThisMonth } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq(idColumn, userId)
    .eq("task_status", "APPROVED")
    .eq("is_self_task", false)
    .gte("approved_at", thisMonthStart)
    .lte("approved_at", thisMonthEnd);

  // 4. 승인 완료 (지난 달)
  const { count: approvedLastMonth } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq(idColumn, userId)
    .eq("task_status", "APPROVED")
    .eq("is_self_task", false)
    .gte("approved_at", lastMonthStart)
    .lte("approved_at", lastMonthEnd);

  // 5. 평균 처리 소요 시간 - APPROVED Task의 created_at ~ approved_at 일수

  const { data: approvedTasksThisMonth } = await supabase
    .from("tasks")
    .select("created_at, approved_at, updated_at")
    .eq(idColumn, userId)
    .eq("task_status", "APPROVED")
    .eq("is_self_task", false)
    .gte("approved_at", thisMonthStart)
    .lte("approved_at", thisMonthEnd);

  const { data: approvedTasksLastMonth } = await supabase
    .from("tasks")
    .select("created_at, approved_at, updated_at")
    .eq(idColumn, userId)
    .eq("task_status", "APPROVED")
    .eq("is_self_task", false)
    .gte("approved_at", lastMonthStart)
    .lte("approved_at", lastMonthEnd);

  const calcAvgDays = (
    tasks: Array<{ created_at: string; approved_at: string | null; updated_at: string }> | null
  ): number => {
    if (!tasks || tasks.length === 0) return 0;
    const totalDays = tasks.reduce((sum, t) => {
      const created = new Date(t.created_at).getTime();
      const approved = (t.approved_at ?? t.updated_at) as string;
      const completedAt = new Date(approved).getTime();
      return sum + (completedAt - created) / (1000 * 60 * 60 * 24);
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

  const overdueQuery = overdueBaseQuery.eq(idColumn, userId);

  const { count: overdueCount } = await overdueQuery;

  // 7. 마감일 초과 미처리 (지난 달 말 기준) - due_date < 지난달 말, created_at <= 지난달 말 (과거 시점 스냅샷)
  const overdueLastMonthBaseQuery = supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("is_self_task", false)
    .neq("task_status", "APPROVED")
    .not("due_date", "is", null)
    .lt("due_date", lastMonthEnd)
    .lte("created_at", lastMonthEnd);

  const overdueLastMonthQuery = overdueLastMonthBaseQuery.eq(idColumn, userId);

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
