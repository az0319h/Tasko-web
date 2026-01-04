# Task 목록 프로필 표시 문제 해결

## 문제 원인 분석

### 발견된 문제
- **Admin 계정**: Task 목록에서 assigner/assignee가 사용자 이름으로 정상 표시
- **Member 계정**: Task 목록에서 assigner/assignee가 UUID로 표시됨

### 근본 원인

#### 1. Profiles 테이블 RLS 정책 제한
현재 profiles 테이블의 RLS 정책:
- ✅ **Admin**: 모든 프로필 조회 가능 (`is_admin(auth.uid())`)
- ❌ **Member**: 자신의 프로필만 조회 가능 (`auth.uid() = id`)

#### 2. 데이터 조회 방식의 문제
- 기존 방식: `useProfiles()`로 모든 프로필을 별도 조회 → Member는 자신의 프로필만 받음
- Task의 assigner/assignee가 다른 사용자일 경우 → 프로필 정보를 찾을 수 없음 → UUID 표시

#### 3. 왜 Admin에서는 되고 Member에서는 안 되었는가?
- **Admin**: `is_admin(auth.uid())` 정책으로 모든 프로필 조회 가능 → `useProfiles()`가 모든 프로필 반환 → Task의 assigner/assignee 프로필 정보 매칭 성공
- **Member**: `auth.uid() = id` 정책으로 자신의 프로필만 조회 가능 → `useProfiles()`가 자신의 프로필만 반환 → Task의 assigner/assignee 프로필 정보 매칭 실패 → UUID 표시

## 해결 방법

### 1. RLS 정책 추가
**파일**: `supabase/migrations/20250101000014_create_rls_policies_profiles.sql`

동일 프로젝트에 속한 사용자의 프로필 조회를 허용하는 정책 추가:
```sql
-- Helper function: Check if current user can access a profile
CREATE OR REPLACE FUNCTION public.can_access_profile(target_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.tasks
    WHERE (tasks.assigner_id = target_user_id OR tasks.assignee_id = target_user_id)
    AND has_project_access(auth.uid(), tasks.project_id)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Policy: Users can view profiles of users who share a project with them
CREATE POLICY "profiles_select_same_project"
ON public.profiles
FOR SELECT
USING (can_access_profile(id));
```

**효과**: 
- Task에 접근할 수 있는 사용자는 해당 Task의 assigner/assignee 프로필도 조회 가능
- Member도 동일 프로젝트에 속한 사용자의 프로필 조회 가능

### 2. Task 조회 시 JOIN 사용
**파일**: `src/api/task.ts`

Supabase의 관계 쿼리를 사용하여 Task 조회 시 프로필 정보를 함께 가져오기:
```typescript
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
  // ...
}
```

**효과**:
- Task 조회 시 assigner/assignee 프로필 정보가 함께 반환됨
- 별도의 `useProfiles()` 호출 불필요
- RLS 정책에 따라 접근 가능한 프로필만 반환됨

### 3. 타입 정의 확장
**파일**: `src/api/task.ts`

```typescript
export type TaskWithProfiles = Tables<"tasks"> & {
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
```

### 4. 프론트엔드 수정
**파일**: `src/pages/project-detail-page.tsx`

- `useProfiles()` 제거
- Task에서 JOIN된 프로필 정보 직접 사용:
```typescript
const assignerName = task.assigner?.full_name || task.assigner?.email || task.assigner_id;
const assigneeName = task.assignee?.full_name || task.assignee?.email || task.assignee_id;
```

## 최종 데이터 구조 예시

### Task 조회 응답 (Supabase select 문)
```json
{
  "id": "task-uuid",
  "project_id": "project-uuid",
  "title": "Task 제목",
  "assigner_id": "assigner-uuid",
  "assignee_id": "assignee-uuid",
  "assigner": {
    "id": "assigner-uuid",
    "full_name": "홍성훈",
    "email": "admin@naver.com"
  },
  "assignee": {
    "id": "assignee-uuid",
    "full_name": "김유진",
    "email": "user@example.com"
  },
  // ... 기타 필드
}
```

## 적용 순서

1. **마이그레이션 실행**: `supabase/migrations/20250101000014_create_rls_policies_profiles.sql`
2. **코드 변경 적용**: 이미 완료됨
3. **테스트**: Admin/Member 계정으로 각각 로그인하여 Task 목록 확인

## 보안 고려사항

- RLS 정책은 프로젝트 접근 권한(`has_project_access`)을 기반으로 작동
- Task에 접근할 수 있는 사용자만 해당 Task의 assigner/assignee 프로필 조회 가능
- 민감한 정보(phone, position 등)는 프로필 조회 시 제외됨 (id, full_name, email만 반환)

