import supabase from "@/lib/supabase";

// 프로젝트 인터페이스
export interface Project {
  id: string;
  title: string;
  client_name: string;
  patent_name?: string | null;
  status: 'inProgress' | 'done';
  due_date?: string | null;
  created_by?: string | null;
  created_at: string | null;
  updated_at: string | null;
}

// 프로젝트 목록 조회 옵션
export interface ProjectsQueryOptions {
  search?: string;
  status?: 'all' | 'inProgress' | 'done';
  sortBy?: 'created_at' | 'due_date' | 'title';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

/**
 * 사용자 권한에 따른 프로젝트 목록 조회
 */
export async function getProjects(options: ProjectsQueryOptions = {}): Promise<Project[]> {
  const {
    search,
    status = 'all',
    sortBy = 'created_at',
    sortOrder = 'desc',
    limit,
    offset = 0
  } = options;

  try {
    // 현재 사용자 정보 조회
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("인증되지 않은 사용자입니다.");

    // 사용자 프로필 조회 (권한 확인용)
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile) throw new Error("사용자 프로필을 찾을 수 없습니다.");

    // 기본 쿼리 시작
    let query = supabase
      .from('projects')
      .select('*');

    // 권한별 필터링
    if (profile.role === 'member') {
      // Member는 자신이 생성했거나 관련된 프로젝트만 조회
      const relatedProjectIds = await getRelatedProjectIds(user.id);
      if (relatedProjectIds.length > 0) {
        query = query.or(`created_by.eq.${user.id},id.in.(${relatedProjectIds.join(',')})`);
      } else {
        // 관련된 프로젝트가 없으면 본인이 생성한 프로젝트만 조회
        query = query.eq('created_by', user.id);
      }
    }
    // Admin은 모든 프로젝트 조회 가능 (추가 필터링 없음)

    // 상태 필터링
    if (status !== 'all') {
      query = query.eq('status', status);
    }

    // 검색어 필터링
    if (search) {
      query = query.or(`title.ilike.%${search}%,client_name.ilike.%${search}%,patent_name.ilike.%${search}%`);
    }

    // 정렬
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });

    // 페이지네이션
    if (limit) {
      query = query.range(offset, offset + limit - 1);
    }

    const { data, error } = await query;

    if (error) throw error;

    return (data || []).map(project => ({
      ...project,
      status: project.status as 'inProgress' | 'done'
    }));

  } catch (error) {
    console.error('프로젝트 목록 조회 실패:', error);
    throw error;
  }
}

/**
 * Member 사용자와 관련된 프로젝트 ID 목록 조회
 */
async function getRelatedProjectIds(userId: string): Promise<string[]> {
  try {
    // 사용자가 assigner 또는 assignee인 Task들의 project_id 조회
    const { data: tasks } = await supabase
      .from('tasks')
      .select('project_id')
      .or(`assigner_id.eq.${userId},assignee_id.eq.${userId}`);

    if (!tasks || tasks.length === 0) {
      return []; // 빈 배열 반환
    }

    // 중복 제거 후 배열로 반환
    const projectIds = [...new Set(tasks.map(task => task.project_id).filter((id): id is string => Boolean(id)))];
    return projectIds;

  } catch (error) {
    console.error('관련 프로젝트 ID 조회 실패:', error);
    return [];
  }
}

/**
 * 특정 프로젝트 조회
 */
export async function getProject(id: string): Promise<Project | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("인증되지 않은 사용자입니다.");

    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    return {
      ...data,
      status: data.status as 'inProgress' | 'done'
    };

  } catch (error) {
    console.error('프로젝트 조회 실패:', error);
    return null;
  }
}

/**
 * 프로젝트 생성 (Admin 전용)
 */
export async function createProject(projectData: Omit<Project, 'id' | 'created_at' | 'updated_at' | 'created_by'>): Promise<Project> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("인증되지 않은 사용자입니다.");

    // Admin 권한 확인
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      throw new Error("프로젝트 생성 권한이 없습니다.");
    }

    // 데이터 검증
    if (!projectData.title?.trim()) {
      throw new Error("프로젝트 제목은 필수입니다.");
    }
    if (!projectData.client_name?.trim()) {
      throw new Error("클라이언트명은 필수입니다.");
    }

    const { data, error } = await supabase
      .from('projects')
      .insert({
        title: projectData.title.trim(),
        client_name: projectData.client_name.trim(),
        patent_name: projectData.patent_name ?? null,
        due_date: projectData.due_date ?? null,
        status: projectData.status || 'inProgress',
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error('Supabase 오류:', error);
      throw new Error(`프로젝트 생성 중 오류가 발생했습니다: ${error.message}`);
    }

    return {
      ...data,
      status: data.status as 'inProgress' | 'done'
    };

  } catch (error) {
    console.error('프로젝트 생성 실패:', error);
    throw error;
  }
}

/**
 * 프로젝트 수정 (Admin 전용)
 */
export async function updateProject(id: string, updates: Partial<Omit<Project, 'id' | 'created_at' | 'updated_at' | 'created_by'>>): Promise<Project> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("인증되지 않은 사용자입니다.");

    // Admin 권한 확인
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      throw new Error("프로젝트 수정 권한이 없습니다.");
    }

    // 프로젝트 존재 확인
    const { data: existingProject } = await supabase
      .from('projects')
      .select('id')
      .eq('id', id)
      .single();

    if (!existingProject) {
      throw new Error("존재하지 않는 프로젝트입니다.");
    }

    // 데이터 검증
    if (updates.title !== undefined && !updates.title?.trim()) {
      throw new Error("프로젝트 제목은 필수입니다.");
    }
    if (updates.client_name !== undefined && !updates.client_name?.trim()) {
      throw new Error("클라이언트명은 필수입니다.");
    }

    const { data, error } = await supabase
      .from('projects')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Supabase 오류:', error);
      throw new Error(`프로젝트 수정 중 오류가 발생했습니다: ${error.message}`);
    }

    return {
      ...data,
      status: data.status as 'inProgress' | 'done'
    };

  } catch (error) {
    console.error('프로젝트 수정 실패:', error);
    throw error;
  }
}

/**
 * 프로젝트 삭제 (Admin 전용)
 */
export async function deleteProject(id: string): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("인증되지 않은 사용자입니다.");

    // Admin 권한 확인
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      throw new Error("프로젝트 삭제 권한이 없습니다.");
    }

    // 프로젝트 존재 확인 및 관련 Task 개수 조회
    const { data: projectInfo } = await supabase
      .from('projects')
      .select(`
        id,
        title,
        tasks:tasks(count)
      `)
      .eq('id', id)
      .single();

    if (!projectInfo) {
      throw new Error("존재하지 않는 프로젝트입니다.");
    }

    // 관련 Task가 있는 경우 경고
    const taskCount = projectInfo.tasks?.[0]?.count || 0;
    if (taskCount > 0) {
      console.warn(`프로젝트 "${projectInfo.title}"에 ${taskCount}개의 관련 Task가 있습니다.`);
    }

    // 프로젝트 삭제 (CASCADE로 관련 데이터도 함께 삭제될 수 있음)
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Supabase 오류:', error);
      throw new Error(`프로젝트 삭제 중 오류가 발생했습니다: ${error.message}`);
    }

  } catch (error) {
    console.error('프로젝트 삭제 실패:', error);
    throw error;
  }
}

/**
 * 프로젝트 상태 변경 (Admin 전용)
 */
export async function toggleProjectStatus(id: string): Promise<Project> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("인증되지 않은 사용자입니다.");

    // Admin 권한 확인
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      throw new Error("프로젝트 상태 변경 권한이 없습니다.");
    }

    // 현재 프로젝트 정보 조회
    const { data: currentProject } = await supabase
      .from('projects')
      .select('id, status')
      .eq('id', id)
      .single();

    if (!currentProject) {
      throw new Error("존재하지 않는 프로젝트입니다.");
    }

    // 상태 토글
    const newStatus = currentProject.status === 'inProgress' ? 'done' : 'inProgress';

    const { data, error } = await supabase
      .from('projects')
      .update({
        status: newStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Supabase 오류:', error);
      throw new Error(`프로젝트 상태 변경 중 오류가 발생했습니다: ${error.message}`);
    }

    return {
      ...data,
      status: data.status as 'inProgress' | 'done'
    };

  } catch (error) {
    console.error('프로젝트 상태 변경 실패:', error);
    throw error;
  }
}

/**
 * 프로젝트 통계 조회
 */
export async function getProjectStats(): Promise<{
  total: number;
  inProgress: number;
  done: number;
  overdue: number;
}> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("인증되지 않은 사용자입니다.");

    // 사용자 권한에 따른 프로젝트 목록 조회
    const projects = await getProjects();
    
    const now = new Date();
    const stats = {
      total: projects.length,
      inProgress: projects.filter(p => p.status === 'inProgress').length,
      done: projects.filter(p => p.status === 'done').length,
      overdue: projects.filter(p => 
        p.status === 'inProgress' && 
        p.due_date && 
        new Date(p.due_date) < now
      ).length
    };

    return stats;

  } catch (error) {
    console.error('프로젝트 통계 조회 실패:', error);
    return { total: 0, inProgress: 0, done: 0, overdue: 0 };
  }
}
