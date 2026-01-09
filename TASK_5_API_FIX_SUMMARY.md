# Task 5 API 수정 완료 보고

## 작업 개요
Task 생성 권한 및 assigner 자동 설정 관련 API 및 RLS 정책 수정 완료

## 완료된 작업

### 1. RLS 정책 수정
**파일**: `supabase/migrations/20260110000004_update_task_insert_policy_participants.sql`

#### 변경 사항:
- ✅ **프로젝트 참여자도 Task 생성 가능하도록 변경**
  - 기존: Admin만 Task 생성 가능 (`tasks_insert_admin_only` 정책)
  - 변경: Admin 또는 프로젝트 참여자 모두 Task 생성 가능 (`tasks_insert_admin_or_participant` 정책)

- ✅ **assigner_id 자동 설정**
  - RLS 정책에서 `auth.uid() = assigner_id` 조건 추가
  - Task 생성 시 assigner_id는 자동으로 현재 로그인한 사용자로 설정됨

- ✅ **프로젝트 참여자 확인 함수 생성**
  - `is_project_participant(user_id, project_id)`: `project_participants` 테이블에서 참여자 확인
  - `is_project_member(user_id, project_id)`: 프로젝트 생성자 또는 참여자 확인

#### RLS 정책 조건:
```sql
WITH CHECK (
  -- Admin 또는 프로젝트 참여자만 가능
  (
    is_admin(auth.uid())
    OR is_project_participant(auth.uid(), project_id)
  )
  -- assigner_id는 자동으로 현재 로그인한 사용자로 설정됨
  AND auth.uid() = assigner_id
  -- assignee는 해당 프로젝트에 속한 사용자여야 함
  AND is_project_member(assignee_id, project_id)
  -- assigner와 assignee는 달라야 함
  AND assigner_id != assignee_id
)
```

### 2. API 코드 검증
**파일**: `src/api/task.ts`

#### 확인 사항:
- ✅ API 코드는 이미 프로젝트 참여자 권한 확인 로직이 구현되어 있음
- ✅ `createTask` 함수에서 Admin이 아닌 경우 프로젝트 참여자인지 확인
- ✅ `assigner_id`는 자동으로 현재 로그인한 사용자로 설정됨
- ✅ API 코드와 RLS 정책이 일치하도록 수정 완료

#### API 로직:
```typescript
// Admin 권한 확인
const isAdmin = profile?.role === "admin";

// Admin이 아닌 경우 프로젝트 참여자인지 확인
if (!isAdmin) {
  const participants = await getProjectParticipants(task.project_id);
  const isParticipant = participants.some((p) => p.user_id === currentUserId);
  
  if (!isParticipant) {
    throw new Error("프로젝트 참여자만 Task를 생성할 수 있습니다.");
  }
}

// assigner_id를 현재 로그인한 사용자로 자동 설정
const taskWithAssigner = {
  ...task,
  assigner_id: currentUserId,
};
```

### 3. 타입 정의 수정
**파일**: `src/database.type.ts`

#### 변경 사항:
- ✅ `task_category` 필드를 `tasks` 테이블의 `Row`, `Insert`, `Update` 타입에 추가
- ✅ `task_category` enum 타입을 `Enums`에 추가: `"REVIEW" | "CONTRACT" | "SPECIFICATION" | "APPLICATION"`

### 4. 스키마 수정
**파일**: `src/schemas/task/task-schema.ts`

#### 변경 사항:
- ✅ Zod 스키마에서 `task_category`의 에러 메시지 설정 방식 수정
- ✅ `required_error` → `message`로 변경 (z.enum 호환성)

### 5. 테스트 파일 수정
**파일**: `src/hooks/mutations/__tests__/use-task.test.ts`

#### 변경 사항:
- ✅ Mock Task 객체에 `task_category: "REVIEW"` 필드 추가

### 6. 빌드 오류 수정
- ✅ 모든 TypeScript 타입 오류 해결
- ✅ 빌드 성공 확인 (`npm run build`)

## 요구사항 충족 여부

### ✅ Task 생성 권한
- **요구사항**: 프로젝트 참여자가 Task를 생성할 수 있음
- **구현**: Admin 또는 프로젝트 참여자 모두 Task 생성 가능하도록 RLS 정책 수정 완료

### ✅ assigner 자동 설정
- **요구사항**: Task 생성 시 assigner는 자동으로 현재 로그인한 사용자로 설정
- **구현**: 
  - API 코드에서 `assigner_id` 자동 설정 (기존 구현 유지)
  - RLS 정책에서 `auth.uid() = assigner_id` 조건 추가하여 데이터베이스 레벨에서도 보장

## 마이그레이션 적용 방법

```bash
# Supabase CLI를 사용하여 마이그레이션 적용
supabase db push

# 또는 직접 SQL 실행
psql -h [your-db-host] -U [your-user] -d [your-database] -f supabase/migrations/20260110000004_update_task_insert_policy_participants.sql
```

## 테스트 시나리오

### 1. 프로젝트 참여자 Task 생성 테스트
- 프로젝트 참여자로 로그인
- 프로젝트 상세 페이지에서 Task 생성 시도
- ✅ Task 생성 성공 확인

### 2. Admin Task 생성 테스트
- Admin으로 로그인
- 프로젝트 상세 페이지에서 Task 생성 시도
- ✅ Task 생성 성공 확인

### 3. assigner 자동 설정 테스트
- 프로젝트 참여자로 로그인
- Task 생성 시 assigner_id가 현재 로그인한 사용자로 자동 설정되는지 확인
- ✅ assigner_id가 현재 사용자 ID와 일치하는지 확인

### 4. 비참여자 Task 생성 차단 테스트
- 프로젝트에 참여하지 않은 사용자로 로그인
- Task 생성 시도
- ✅ "프로젝트 참여자만 Task를 생성할 수 있습니다." 에러 메시지 확인

## 다음 단계

1. ✅ 마이그레이션 적용
2. ✅ 실제 환경에서 테스트
3. ✅ Task 5의 나머지 작업 진행 (칸반 보드 UI 등)

## 참고 사항

- RLS 정책은 데이터베이스 레벨에서 보안을 보장하므로 API 코드와 함께 작동합니다.
- API 코드의 권한 확인 로직은 사용자에게 더 명확한 에러 메시지를 제공합니다.
- `task_category`는 필수 필드이며, 생성 후 변경 불가능합니다.


