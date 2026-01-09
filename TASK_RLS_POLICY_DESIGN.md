# Task RLS 정책 설계 문서

## 요구사항 정리

### 1. 목록 조회 권한
- **프로젝트 참여자 전원**: 해당 프로젝트의 모든 Task를 볼 수 있어야 함
- Task 존재 여부와 상태만 확인 가능

### 2. 상세 접근 권한
- **관리자(admin)**: 모든 Task 상세 접근 가능
- **일반 멤버(member)**: 본인이 assigner 또는 assignee인 Task만 상세 접근 가능
- 일반 멤버는 자신의 Task가 아닌 경우, Task 존재와 상태만 볼 수 있고 상세 내용은 접근 불가

### 3. Task 생성 권한
- 프로젝트 참여자 모두가 서로에게 Task 생성/할당 가능

## 현재 정책 분석

### 현재 적용된 SELECT 정책

**정책명**: `tasks_select_assigner_assignee_or_admin`

**조건**:
```sql
is_admin((SELECT auth.uid()))
OR (SELECT auth.uid()) = assigner_id
OR (SELECT auth.uid()) = assignee_id
```

**문제점**:
- ❌ 프로젝트 참여자 중 assigner/assignee가 아닌 멤버는 Task를 볼 수 없음
- ❌ 요구사항과 불일치: "프로젝트 참여자 전원이 모든 Task를 볼 수 있어야 함"

## 설계 방안

### 제약사항 분석

**PostgreSQL RLS의 한계**:
- RLS는 **행(row) 단위**로만 제어 가능
- 같은 행에 대해 "목록에서는 보이지만 상세는 못 본다"는 것을 RLS만으로는 구분 불가
- 컬럼별 정책은 PostgreSQL 17.6+에서 지원되지만, Supabase는 아직 완전히 지원하지 않을 수 있음

**해결 방안**:
1. **RLS SELECT 정책**: 프로젝트 참여자 전원이 모든 Task 행을 조회 가능하도록 설정
2. **애플리케이션 레벨 검증**: 상세 접근 권한은 API/프론트엔드에서 검증

### 설계 1: RLS + 애플리케이션 레벨 검증 (권장)

#### A. RLS SELECT 정책 수정

**목적**: 프로젝트 참여자 전원이 모든 Task를 조회 가능하도록 설정

**정책**:
```sql
CREATE POLICY "tasks_select_participant_or_admin"
ON public.tasks FOR SELECT
USING (
  is_admin((SELECT auth.uid()))
  OR is_project_participant((SELECT auth.uid()), project_id)
);
```

**효과**:
- ✅ 관리자: 모든 Task 조회 가능
- ✅ 프로젝트 참여자: 해당 프로젝트의 모든 Task 조회 가능
- ✅ 목록 조회 요구사항 충족

#### B. 애플리케이션 레벨 상세 접근 검증

**위치**: `src/api/task.ts` - `getTaskById()` 함수

**검증 로직**:
```typescript
export async function getTaskById(id: string): Promise<TaskWithProfiles | null> {
  // 1. RLS 정책으로 인해 프로젝트 참여자는 Task 조회 가능
  const { data, error } = await supabase
    .from("tasks")
    .select(`...`)
    .eq("id", id)
    .single();

  if (error || !data) {
    return null;
  }

  // 2. 상세 접근 권한 검증
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) {
    throw new Error("인증이 필요합니다.");
  }

  const userId = session.session.user.id;
  
  // 관리자 권한 확인
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  const isAdmin = profile?.role === "admin";
  const isAssigner = data.assigner_id === userId;
  const isAssignee = data.assignee_id === userId;

  // 관리자는 모든 Task 상세 접근 가능
  if (isAdmin) {
    return data;
  }

  // 멤버는 본인이 assigner 또는 assignee인 Task만 상세 접근 가능
  if (isAssigner || isAssignee) {
    return data;
  }

  // 멤버가 자신의 Task가 아닌 경우: 접근 거부
  throw new Error("이 Task의 지시자 또는 담당자만 상세 내용을 볼 수 있습니다.");
}
```

**효과**:
- ✅ 관리자: 모든 Task 상세 접근 가능
- ✅ 멤버 (assigner/assignee): 본인 Task 상세 접근 가능
- ✅ 멤버 (기타): 상세 접근 불가 (에러 반환)

#### C. 프론트엔드 처리

**위치**: `src/pages/task-detail-page.tsx`

**현재 구현**:
- `useTask(taskId)` 훅으로 Task 조회
- 에러 발생 시 에러 메시지 표시

**수정 필요**:
- 상세 접근 권한 에러 시 적절한 UI 표시
- 목록에서는 Task가 보이지만 클릭 시 상세 접근 불가 안내

### 설계 2: RLS만으로 해결 (비권장)

**문제점**:
- RLS는 행 단위로만 제어 가능
- 목록 조회와 상세 접근을 구분할 수 없음
- 요구사항을 완전히 충족할 수 없음

**결론**: 설계 1 (RLS + 애플리케이션 레벨 검증)이 유일한 실현 가능한 방안

## 시나리오별 동작 분석

### 시나리오 1: 관리자 → member1 Task 생성

**상황**:
- 관리자가 Task 생성
- assigner_id = 관리자 ID
- assignee_id = member1 ID
- 프로젝트 참여자: 관리자, member1, member2

**목록 조회** (`getTasksByProjectId`):
- ✅ 관리자: RLS `is_admin()` = true → 모든 Task 조회 가능
- ✅ member1: RLS `is_project_participant()` = true → 모든 Task 조회 가능
- ✅ member2: RLS `is_project_participant()` = true → 모든 Task 조회 가능

**상세 접근** (`getTaskById`):
- ✅ 관리자: `isAdmin` = true → 상세 접근 가능
- ✅ member1: `isAssignee` = true → 상세 접근 가능
- ❌ member2: `isAssigner` = false, `isAssignee` = false → 상세 접근 불가 (에러)

### 시나리오 2: 관리자가 member1 → member2 Task 생성

**상황**:
- 관리자가 Task 생성
- assigner_id = member1 ID
- assignee_id = member2 ID
- 프로젝트 참여자: 관리자, member1, member2

**목록 조회** (`getTasksByProjectId`):
- ✅ 관리자: RLS `is_admin()` = true → 모든 Task 조회 가능
- ✅ member1: RLS `is_project_participant()` = true → 모든 Task 조회 가능
- ✅ member2: RLS `is_project_participant()` = true → 모든 Task 조회 가능

**상세 접근** (`getTaskById`):
- ✅ 관리자: `isAdmin` = true → 상세 접근 가능
- ✅ member1: `isAssigner` = true → 상세 접근 가능
- ✅ member2: `isAssignee` = true → 상세 접근 가능

## 정책 수정 계획

### 1. RLS SELECT 정책 수정

**파일**: `supabase/migrations/20260110000013_fix_tasks_select_policy_for_participants.sql`

**작업 내용**:
1. 기존 `tasks_select_assigner_assignee_or_admin` 정책 삭제
2. 새로운 `tasks_select_participant_or_admin` 정책 생성
3. 프로젝트 참여자 전원이 모든 Task 조회 가능하도록 설정

### 2. API 상세 접근 검증 추가

**파일**: `src/api/task.ts`

**작업 내용**:
1. `getTaskById()` 함수에 상세 접근 권한 검증 로직 추가
2. 관리자는 모든 Task 상세 접근 가능
3. 멤버는 본인이 assigner/assignee인 Task만 상세 접근 가능

### 3. 프론트엔드 에러 처리 개선

**파일**: `src/pages/task-detail-page.tsx`

**작업 내용**:
1. 상세 접근 권한 에러 시 적절한 UI 표시
2. "이 Task의 지시자 또는 담당자만 상세 내용을 볼 수 있습니다" 메시지 표시

## 검증 방법

### 테스트 시나리오

1. **목록 조회 테스트**:
   - 관리자가 프로젝트 생성 및 참여자 추가
   - 관리자가 Task 생성 (관리자 → member1)
   - member2로 로그인하여 프로젝트 상세 페이지 접근
   - Task 목록에 모든 Task가 표시되는지 확인 ✅

2. **상세 접근 테스트**:
   - member2로 로그인하여 Task 상세 페이지 접근 시도
   - 본인이 assigner/assignee인 Task: 상세 접근 가능 ✅
   - 본인이 아닌 Task: 상세 접근 불가 (에러 메시지 표시) ✅

3. **관리자 테스트**:
   - 관리자로 로그인하여 모든 Task 상세 접근 가능한지 확인 ✅

## 결론

**설계 방안**: RLS SELECT 정책 수정 + 애플리케이션 레벨 상세 접근 검증

**이유**:
- RLS만으로는 목록 조회와 상세 접근을 구분할 수 없음
- 애플리케이션 레벨 검증으로 상세 접근 권한 제어 가능
- 요구사항을 완전히 충족 가능

**다음 단계**: 설계 검증 완료 후 코드 작성 진행

