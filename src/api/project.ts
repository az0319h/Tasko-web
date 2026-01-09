import supabase from "@/lib/supabase";
import type { Tables, TablesInsert, TablesUpdate } from "@/database.type";

export type Project = Tables<"projects">;
export type ProjectInsert = TablesInsert<"projects">;
export type ProjectUpdate = TablesUpdate<"projects">;

/**
 * 프로젝트 목록 조회
 * RLS 정책에 따라 Admin은 모든 프로젝트, Member는 Public 프로젝트 또는 Task 참여한 Private 프로젝트만 조회
 * 전체 데이터를 한 번에 반환 (클라이언트 사이드에서 필터링/페이지네이션 처리)
 */
export async function getProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`프로젝트 목록 조회 실패: ${error.message}`);
  }

  return data || [];
}

/**
 * 프로젝트 상세 조회
 */
export async function getProjectById(id: string): Promise<Project | null> {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      // Not found
      return null;
    }
    throw new Error(`프로젝트 조회 실패: ${error.message}`);
  }

  return data;
}

/**
 * 프로젝트 생성 (Admin만 가능)
 * created_by는 자동으로 현재 사용자로 설정됨
 * 프로젝트 생성 시 관리자가 자동으로 참여자로 추가됨
 * @param project 프로젝트 정보
 * @param participantIds 초대할 사용자 ID 배열 (관리자 제외, 최소 1명 이상)
 */
export async function createProject(
  project: Omit<ProjectInsert, "created_by">,
  participantIds?: string[]
): Promise<Project> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) {
    throw new Error("인증이 필요합니다.");
  }

  const currentUserId = session.session.user.id;

  // 프로젝트 생성
  const { data, error } = await supabase
    .from("projects")
    .insert({
      ...project,
      created_by: currentUserId,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`프로젝트 생성 실패: ${error.message}`);
  }

  // 관리자를 자동으로 참여자로 추가
  try {
    await addProjectParticipant(data.id, currentUserId);
  } catch (error) {
    // 참여자 추가 실패 시 프로젝트도 롤백해야 하지만,
    // Supabase는 트랜잭션을 지원하지 않으므로 에러만 로깅
    console.error("관리자 참여자 추가 실패:", error);
  }

  // 초대할 사용자들을 참여자로 추가
  if (participantIds && participantIds.length > 0) {
    for (const userId of participantIds) {
      // 관리자는 이미 추가되었으므로 제외
      if (userId !== currentUserId) {
        try {
          await addProjectParticipant(data.id, userId);
        } catch (error) {
          console.error(`참여자 추가 실패 (userId: ${userId}):`, error);
          // 개별 참여자 추가 실패는 프로젝트 생성을 막지 않음
        }
      }
    }
  }

  return data;
}

/**
 * 프로젝트 수정 (Admin만 가능)
 */
export async function updateProject(
  id: string,
  updates: ProjectUpdate
): Promise<Project> {
  const { data, error } = await supabase
    .from("projects")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(`프로젝트 수정 실패: ${error.message}`);
  }

  return data;
}

/**
 * 프로젝트 삭제 (Admin만 가능)
 * 삭제 조건 검증 후 삭제 실행
 */
export async function deleteProject(id: string): Promise<void> {
  // 삭제 조건 검증
  const { canDelete, reason } = await canDeleteProject(id);
  if (!canDelete) {
    throw new Error(reason || "프로젝트를 삭제할 수 없습니다.");
  }

  const { error } = await supabase.from("projects").delete().eq("id", id);

  if (error) {
    throw new Error(`프로젝트 삭제 실패: ${error.message}`);
  }
}

/**
 * 프로젝트 참여자 목록 조회
 * 프로젝트에 참여한 사용자들의 프로필 정보를 반환
 */
export type ProjectParticipant = {
  id: string;
  user_id: string;
  project_id: string;
  invited_by: string;
  invited_at: string;
  created_at: string;
  profile: {
    id: string;
    email: string;
    full_name: string | null;
    profile_completed: boolean;
    is_active: boolean;
  } | null; // 프로필이 삭제되었거나 존재하지 않을 수 있음
};

export async function getProjectParticipants(projectId: string): Promise<ProjectParticipant[]> {
  const { data, error } = await (supabase as any)
    .from("project_participants")
    .select(`
      *,
      profile:profiles!project_participants_user_id_fkey(id, email, full_name, profile_completed, is_active)
    `)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`프로젝트 참여자 목록 조회 실패: ${error.message}`);
  }

  return (data || []) as ProjectParticipant[];
}

/**
 * 프로젝트 참여자 추가 (Admin만 가능)
 * 프로젝트 생성 시 관리자가 자동으로 참여자로 추가됨
 */
export async function addProjectParticipant(
  projectId: string,
  userId: string
): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) {
    throw new Error("인증이 필요합니다.");
  }

  const { error } = await (supabase as any).from("project_participants").insert({
    project_id: projectId,
    user_id: userId,
    invited_by: session.session.user.id,
  });

  if (error) {
    // 이미 참여자인 경우 무시 (UNIQUE 제약 조건)
    if (error.code === "23505") {
      return;
    }
    throw new Error(`참여자 추가 실패: ${error.message}`);
  }
}

/**
 * 프로젝트 참여자 여러명 추가 (Admin만 가능)
 */
export async function addProjectParticipants(
  projectId: string,
  userIds: string[]
): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) {
    throw new Error("인증이 필요합니다.");
  }

  if (userIds.length === 0) {
    return;
  }

  const participants = userIds.map((userId) => ({
    project_id: projectId,
    user_id: userId,
    invited_by: session.session!.user.id,
  }));

  const { error } = await (supabase as any).from("project_participants").insert(participants);

  if (error) {
    throw new Error(`참여자 추가 실패: ${error.message}`);
  }
}

/**
 * 프로젝트 참여자 삭제 (Admin만 가능)
 * 진행중인 Task가 있는 참여자는 삭제 불가
 * 진행중인 Task: ASSIGNED, IN_PROGRESS, WAITING_CONFIRM, REJECTED 상태
 * (REJECTED는 반려 상태로 재작업 가능하므로 삭제 불가)
 * 프로젝트 생성자는 삭제 불가
 */
export async function removeProjectParticipant(
  projectId: string,
  userId: string
): Promise<void> {
  // 프로젝트 생성자 확인
  const project = await getProjectById(projectId);
  if (!project) {
    throw new Error("프로젝트를 찾을 수 없습니다.");
  }

  if (project.created_by === userId) {
    throw new Error("프로젝트 생성자는 삭제할 수 없습니다.");
  }

  // 진행중인 Task 확인 (ASSIGNED, IN_PROGRESS, WAITING_CONFIRM, REJECTED 상태)
  // REJECTED는 반려 상태로 재작업 가능하므로 삭제 불가
  const { getTasksByProjectId } = await import("@/api/task");
  const tasks = await getTasksByProjectId(projectId);
  const hasActiveTasks = tasks.some(
    (task) =>
      (task.assigner_id === userId || task.assignee_id === userId) &&
      (task.task_status === "ASSIGNED" ||
       task.task_status === "IN_PROGRESS" ||
       task.task_status === "WAITING_CONFIRM" ||
       task.task_status === "REJECTED")
  );

  if (hasActiveTasks) {
    throw new Error("진행중인 Task가 있는 참여자는 삭제할 수 없습니다.");
  }

  const { error } = await (supabase as any)
    .from("project_participants")
    .delete()
    .eq("project_id", projectId)
    .eq("user_id", userId);

  if (error) {
    throw new Error(`참여자 삭제 실패: ${error.message}`);
  }
}

/**
 * 프로젝트 삭제 조건 검증
 * 1. 프로젝트 내에 참여자가 생성자를 제외하고 없어야 함
 * 2. 모든 Task가 APPROVED 상태이거나 Task가 없어야 함
 */
export async function canDeleteProject(projectId: string): Promise<{
  canDelete: boolean;
  reason?: string;
}> {
  // 프로젝트 정보 가져오기 (created_by 확인)
  const project = await getProjectById(projectId);
  if (!project) {
    return {
      canDelete: false,
      reason: "프로젝트를 찾을 수 없습니다.",
    };
  }

  // 프로젝트 참여자 목록 가져오기
  const participants = await getProjectParticipants(projectId);

  // 생성자를 제외한 참여자가 있는지 확인
  const otherParticipants = participants.filter(
    (participant) => participant.user_id !== project.created_by
  );

  if (otherParticipants.length > 0) {
    return {
      canDelete: false,
      reason: `프로젝트에 ${otherParticipants.length}명의 참여자가 있습니다. 모든 참여자를 제거한 후 삭제할 수 있습니다.`,
    };
  }

  // Task 상태 확인
  const { getTasksByProjectId } = await import("@/api/task");
  const tasks = await getTasksByProjectId(projectId);

  // Task가 없으면 삭제 가능
  if (tasks.length === 0) {
    return { canDelete: true };
  }

  // 모든 Task가 APPROVED 상태인지 확인
  const allApproved = tasks.every((task) => task.task_status === "APPROVED");

  if (allApproved) {
    return { canDelete: true };
  }

  // APPROVED가 아닌 Task가 있으면 삭제 불가
  const nonApprovedTasks = tasks.filter((task) => task.task_status !== "APPROVED");
  return {
    canDelete: false,
    reason: `${nonApprovedTasks.length}개의 Task가 아직 완료되지 않았습니다. 모든 Task를 승인한 후 삭제할 수 있습니다.`,
  };
}

