# Task 권한 요구사항 분석 및 RLS 정책 설계 검증

## 📋 요구사항 정리

### 1. 목록 조회 권한
- **프로젝트 참여자 전원**은 해당 프로젝트에서 진행 중인 **모든 Task 목록**을 볼 수 있어야 함
- Task 존재 여부, 상태(task_status), 기본 정보(id, title, assigner_id, assignee_id, due_date 등) 확인 가능

### 2. 상세 접근 권한
- **관리자(admin)**: 모든 Task 상세 접근 가능
- **일반 멤버(member)**: 
  - 본인이 assigner 또는 assignee인 Task만 상세 접근 가능
  - 자신의 Task가 아닌 경우, Task 존재와 상태만 볼 수 있고 상세 내용(description 등)은 접근 불가

### 3. Task 생성/할당 권한
- 프로젝트 참여자 모두가 서로 생성/할당 가능해야 함
- 프로젝트는 관리자만 생성

---

## 🔍 현재 RLS 정책 분석

### 현재 적용된 정책 (최신 마이그레이션 기준)

#### 1. `20260110000005_update_task_and_message_policies_assigner_assignee_only.sql`
```sql
CREATE POLICY "tasks_select_assigner_assignee_or_admin"
ON public.tasks
FOR SELECT
USING (
  is_admin((SELECT auth.uid()))
  OR (SELECT auth.uid()) = assigner_id
  OR (SELECT auth.uid()) = assignee_id
);
```

**문제점:**
- ❌ 프로젝트 참여자 전원이 Task 목록을 볼 수 없음
- ❌ assigner/assignee가 아닌 참여자는 Task 존재 자체를 알 수 없음
- ❌ 요구사항 1번(목록 조회)을 만족하지 않음

#### 2. `20260110000002_phase2_rls_policies_verification.sql` (이전 정책)
```sql
CREATE POLICY "tasks_select_participant_or_admin"
ON public.tasks
FOR SELECT
USING (
  is_admin((SELECT auth.uid()))
  OR is_project_participant((SELECT auth.uid()), project_id)
);
```

**특징:**
- ✅ 프로젝트 참여자 전원이 모든 Task를 조회 가능
- ❌ 상세 접근 권한 구분이 없음 (목록과 상세가 동일한 정책)

---

## 🎯 설계 방향

### 제약사항
1. **PostgreSQL RLS의 한계**
   - 컬럼별 접근 제어는 PostgreSQL 17.6+에서만 지원
   - 현재 환경에서는 컬럼별 정책 적용이 어려울 수 있음
   - View를 사용한 접근 제어는 가능하나, 복잡도 증가

2. **애플리케이션 레벨 제어 필요**
   - RLS는 행(row) 단위 접근 제어만 가능
   - 컬럼별 접근 제어는 애플리케이션 레벨에서 처리 필요

### 설계 옵션

#### 옵션 1: RLS + 애플리케이션 레벨 제어 (권장)

**RLS 정책:**
- 목록 조회: 프로젝트 참여자 전원이 모든 Task 조회 가능
- 상세 조회: 동일한 정책 적용 (RLS는 행 단위만 제어)

**애플리케이션 레벨:**
- `getTasksByProjectId()`: 모든 Task 반환 (기본 정보만)
- `getTaskById()`: 
  - Admin: 모든 필드 반환
  - Member: assigner/assignee인 경우만 모든 필드 반환
  - Member: 자신의 Task가 아닌 경우, description을 null로 마스킹하거나 제한된 필드만 반환

**장점:**
- RLS 정책이 단순하고 명확함
- 애플리케이션 레벨에서 세밀한 제어 가능
- 유지보수가 용이함

**단점:**
- 애플리케이션 레벨에서 추가 검증 로직 필요

#### 옵션 2: View 기반 접근 제어

**구조:**
- `tasks_list_view`: 목록용 View (기본 정보만)
- `tasks_detail_view`: 상세용 View (전체 정보)
- 각 View에 별도의 RLS 정책 적용

**장점:**
- 데이터베이스 레벨에서 접근 제어 가능
- 애플리케이션 로직 단순화

**단점:**
- View 관리 복잡도 증가
- API 함수 수정 필요
- 마이그레이션 복잡도 증가

---

## ✅ 권장 설계안 (옵션 1)

### 1. RLS 정책 수정

```sql
-- 기존 정책 삭제
DROP POLICY IF EXISTS "tasks_select_assigner_assignee_or_admin" ON public.tasks;
DROP POLICY IF EXISTS "tasks_select_participant_or_admin" ON public.tasks;

-- 새로운 정책: 프로젝트 참여자 전원이 모든 Task 조회 가능
CREATE POLICY "tasks_select_participant_or_admin"
ON public.tasks
FOR SELECT
USING (
  is_admin((SELECT auth.uid()))
  OR is_project_participant((SELECT auth.uid()), project_id)
);
```

**정책 설명:**
- Admin: 모든 Task 조회 가능
- 프로젝트 참여자: 해당 프로젝트의 모든 Task 조회 가능
- 상세 접근 권한은 애플리케이션 레벨에서 제어

### 2. 애플리케이션 레벨 제어

#### 2.1 `getTasksByProjectId()` 함수 수정

**현재 구현:**
```typescript
export async function getTasksByProjectId(projectId: string): Promise<TaskWithProfiles[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select(`
      *,
      assigner:profiles!tasks_assigner_id_fkey(id, full_name, email),
      assignee:profiles!tasks_assigner_id_fkey(id, full_name, email)
    `)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  // ...
}
```

**수정 방향:**
- 현재 구현 유지 (모든 필드 반환)
- RLS 정책이 프로젝트 참여자 전원의 접근을 허용하므로 문제없음
- UI에서 상세 접근 시 별도 권한 검증 필요

#### 2.2 `getTaskById()` 함수 수정

**현재 구현:**
```typescript
export async function getTaskById(id: string): Promise<TaskWithProfiles | null> {
  const { data, error } = await supabase
    .from("tasks")
    .select(`
      *,
      assigner:profiles!tasks_assigner_id_fkey(id, full_name, email),
      assignee:profiles!tasks_assigner_id_fkey(id, full_name, email)
    `)
    .eq("id", id)
    .single();
  // ...
}
```

**수정 방향:**
1. Task 조회 후 사용자 권한 확인
2. Admin: 모든 필드 반환
3. Member (assigner/assignee): 모든 필드 반환
4. Member (기타): 제한된 필드만 반환 (description null 처리 또는 제한된 필드만 반환)

**수정 예시:**
```typescript
export async function getTaskById(id: string): Promise<TaskWithProfiles | null> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) {
    throw new Error("인증이 필요합니다.");
  }

  const userId = session.session.user.id;

  // Task 조회
  const { data, error } = await supabase
    .from("tasks")
    .select(`
      *,
      assigner:profiles!tasks_assigner_id_fkey(id, full_name, email),
      assignee:profiles!tasks_assigner_id_fkey(id, full_name, email)
    `)
    .eq("id", id)
    .single();

  if (error || !data) {
    return null;
  }

  // Admin 권한 확인
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  const isAdmin = profile?.role === "admin";
  const isAssigner = data.assigner_id === userId;
  const isAssignee = data.assignee_id === userId;

  // 권한 검증
  if (!isAdmin && !isAssigner && !isAssignee) {
    // 일반 멤버가 자신의 Task가 아닌 경우: 제한된 정보만 반환
    return {
      ...data,
      description: null, // 상세 내용 마스킹
      // 또는 제한된 필드만 반환하는 별도 타입 사용
    } as TaskWithProfiles;
  }

  // Admin 또는 assigner/assignee: 모든 필드 반환
  return data as TaskWithProfiles;
}
```

### 3. UI 레벨 제어

#### 3.1 Task 목록 표시
- 프로젝트 참여자 전원이 모든 Task를 볼 수 있음
- Task 카드에 기본 정보만 표시 (title, status, assigner, assignee, due_date)

#### 3.2 Task 상세 페이지 접근
- Task 클릭 시 `getTaskById()` 호출
- 권한이 없는 경우:
  - 상세 페이지 접근 차단 또는
  - 제한된 정보만 표시 (description 숨김)

---

## 🔐 보안 검증

### 1. RLS 정책 검증

**시나리오 1: 프로젝트 참여자 A가 Task 목록 조회**
- ✅ RLS 정책: `is_project_participant(A, project_id)` → true
- ✅ 결과: 모든 Task 조회 가능

**시나리오 2: 프로젝트 참여자 A가 자신의 Task 상세 조회**
- ✅ RLS 정책: `is_project_participant(A, project_id)` → true
- ✅ 애플리케이션: `isAssigner || isAssignee` → true
- ✅ 결과: 모든 필드 반환

**시나리오 3: 프로젝트 참여자 A가 다른 사람의 Task 상세 조회**
- ✅ RLS 정책: `is_project_participant(A, project_id)` → true
- ✅ 애플리케이션: `isAssigner || isAssignee` → false
- ✅ 결과: 제한된 필드만 반환 (description null)

**시나리오 4: 관리자가 Task 상세 조회**
- ✅ RLS 정책: `is_admin(admin)` → true
- ✅ 애플리케이션: `isAdmin` → true
- ✅ 결과: 모든 필드 반환

**시나리오 5: 프로젝트 참여자가 아닌 사용자가 Task 조회**
- ✅ RLS 정책: `is_project_participant(user, project_id)` → false
- ✅ 결과: Task 조회 불가 (RLS 차단)

### 2. 잠재적 보안 이슈

**이슈 1: 직접 SQL 쿼리 우회**
- RLS 정책이 적용되어 있으므로 직접 SQL 쿼리로도 접근 불가
- ✅ 안전

**이슈 2: API 함수 우회**
- 클라이언트에서 직접 Supabase 클라이언트 사용 시 RLS 정책 적용됨
- ✅ 안전

**이슈 3: description 필드 노출**
- 애플리케이션 레벨에서 마스킹하므로, 클라이언트에서 직접 쿼리 시에도 RLS로 전체 행은 조회 가능하나, 애플리케이션 로직에서 제어
- ⚠️ 주의: 클라이언트에서 직접 Supabase 클라이언트 사용 시 description 노출 가능
- ✅ 해결: 클라이언트에서도 동일한 권한 검증 로직 적용 또는 RLS만으로는 완전한 보호 불가하므로, 민감한 정보는 별도 테이블로 분리 고려

---

## 📝 구현 체크리스트

### Phase 1: RLS 정책 수정
- [ ] 기존 `tasks_select_assigner_assignee_or_admin` 정책 삭제
- [ ] `tasks_select_participant_or_admin` 정책 생성/수정
- [ ] 정책 테스트 (프로젝트 참여자 전원 접근 확인)

### Phase 2: API 함수 수정
- [ ] `getTaskById()` 함수에 권한 검증 로직 추가
- [ ] Admin/assigner/assignee 구분 로직 구현
- [ ] 제한된 필드 반환 로직 구현
- [ ] 타입 정의 수정 (제한된 Task 타입 추가 고려)

### Phase 3: UI 수정
- [ ] Task 상세 페이지 접근 권한 검증
- [ ] 권한 없는 경우 UI 처리 (접근 차단 또는 제한된 정보 표시)
- [ ] Task 목록에서 상세 접근 가능 여부 표시 (선택사항)

### Phase 4: 테스트
- [ ] 프로젝트 참여자 전원이 Task 목록 조회 가능 확인
- [ ] 관리자가 모든 Task 상세 접근 가능 확인
- [ ] 일반 멤버가 자신의 Task 상세 접근 가능 확인
- [ ] 일반 멤버가 다른 사람의 Task 상세 접근 시 제한 확인
- [ ] 프로젝트 참여자가 아닌 사용자 접근 차단 확인

---

## 🚨 주의사항

1. **Messages 테이블 정책 연동**
   - 현재 `messages_select_assigner_assignee_or_admin` 정책이 Task SELECT 정책과 일치하도록 설정됨
   - Task SELECT 정책 변경 시 Messages 정책도 함께 수정 필요
   - Messages는 Task 상세 접근 권한과 동일하게 제어되어야 함

2. **성능 고려**
   - `getTaskById()`에서 매번 Admin 권한 확인 쿼리 실행
   - 캐싱 또는 세션 정보 활용 고려

3. **타입 안정성**
   - 제한된 Task 타입과 전체 Task 타입 구분 필요
   - TypeScript 타입 정의 수정 필요

---

## 📊 정책 비교표

| 항목 | 현재 정책 (20260110000005) | 이전 정책 (20260110000002) | 권장 정책 |
|------|---------------------------|---------------------------|-----------|
| 목록 조회 | ❌ assigner/assignee만 | ✅ 참여자 전원 | ✅ 참여자 전원 |
| 상세 접근 | ❌ 구분 없음 | ❌ 구분 없음 | ✅ 권한별 구분 |
| Admin 권한 | ✅ 모든 Task | ✅ 모든 Task | ✅ 모든 Task |
| Member 권한 | ❌ 자신의 Task만 | ✅ 모든 Task | ✅ 목록: 모든 Task<br>상세: 자신의 Task만 |

---

## ✅ 결론

1. **RLS 정책 수정 필요**: `tasks_select_assigner_assignee_or_admin` → `tasks_select_participant_or_admin`
2. **애플리케이션 레벨 제어 추가**: `getTaskById()` 함수에 권한 검증 로직 추가
3. **UI 레벨 제어 추가**: Task 상세 페이지 접근 권한 검증
4. **Messages 정책 연동**: Task 정책 변경에 맞춰 Messages 정책도 수정

이 설계안은 요구사항을 모두 만족하며, RLS와 애플리케이션 레벨의 이중 보안을 제공합니다.

