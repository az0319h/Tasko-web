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
 */
export async function createProject(
  project: Omit<ProjectInsert, "created_by">
): Promise<Project> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) {
    throw new Error("인증이 필요합니다.");
  }

  const { data, error } = await supabase
    .from("projects")
    .insert({
      ...project,
      created_by: session.session.user.id,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`프로젝트 생성 실패: ${error.message}`);
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
 */
export async function deleteProject(id: string): Promise<void> {
  const { error } = await supabase.from("projects").delete().eq("id", id);

  if (error) {
    throw new Error(`프로젝트 삭제 실패: ${error.message}`);
  }
}

