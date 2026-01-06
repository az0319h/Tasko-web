# Task 상태 변경 문제 분석 및 수정 계획

## 📋 문제 요약

### 현재 상황
- ✅ **Task 생성**: 정상 동작 (DB 반영 ✅, 이메일 전송 ✅)
- ❌ **Task 상태 변경**: 비정상 동작 (DB 반영 ❌, 이메일 전송 ❌)
- ⚠️ **프론트엔드**: 상태 변경 시 성공 토스트 메시지 표시 (하지만 실제로는 실패)

---

## 🔍 원인 분석

### 1. 핵심 문제: RLS 정책 불일치

**현재 RLS 정책 상태:**
```sql
-- tasks 테이블의 UPDATE 정책
POLICY: tasks_update_admin_only
USING: is_admin(auth.uid())
WITH CHECK: is_admin(auth.uid())
```

**문제점:**
- 현재 `tasks` 테이블의 UPDATE 정책은 **Admin만 UPDATE 가능**하도록 설정되어 있습니다.
- 하지만 `updateTaskStatus` 함수는 **Admin이 아닌 assigner/assignee만 상태 변경을 허용**하도록 설계되어 있습니다.
- 결과적으로 assigner/assignee가 상태 변경을 시도하면 **RLS 정책에 의해 차단**되어 UPDATE가 실패합니다.

### 2. 왜 프론트엔드에서는 성공 메시지가 표시되는가?

**원인:**
1. **Optimistic Update**: `useUpdateTaskStatus` 훅에서 `onMutate` 단계에서 UI를 먼저 업데이트합니다.
2. **에러 처리 부족**: UPDATE가 RLS 정책에 의해 조용히 실패하거나, 에러가 제대로 전파되지 않을 수 있습니다.
3. **RLS로 인한 SELECT 실패**: UPDATE 후 SELECT 시 RLS 정책으로 인해 결과를 조회하지 못할 수 있지만, 코드에서는 이를 성공으로 처리할 수 있습니다.

### 3. Task 생성은 왜 정상 동작하는가?

**이유:**
- Task 생성은 `INSERT` 작업이며, `tasks_insert_authenticated` 정책은 인증된 사용자면 허용합니다.
- Admin만 Task를 생성하도록 애플리케이션 레벨에서 제어하고 있지만, RLS 정책 자체는 인증된 사용자면 허용합니다.
- 따라서 Admin이 Task를 생성하면 RLS 정책을 통과하고, 트리거가 실행되어 이메일이 발송됩니다.

---

## 📊 현재 구조 분석

### Task 생성 흐름 (정상 동작)

```
1. 프론트엔드: Admin이 Task 생성
   ↓
2. API: createTask() 호출
   ↓
3. Supabase: INSERT 작업
   ↓
4. RLS 정책: tasks_insert_authenticated 통과 ✅
   ↓
5. DB: Task 레코드 생성 ✅
   ↓
6. 트리거: trigger_send_task_created_email 실행
   ↓
7. Edge Function: send-task-email 호출
   ↓
8. 이메일 발송 ✅
```

### Task 상태 변경 흐름 (비정상 동작)

```
1. 프론트엔드: assigner/assignee가 상태 변경
   ↓
2. API: updateTaskStatus() 호출
   ↓
3. Supabase: UPDATE 작업 시도
   ↓
4. RLS 정책: tasks_update_admin_only 차단 ❌
   ↓
5. DB: UPDATE 실패 (또는 조용히 무시됨) ❌
   ↓
6. 트리거: 실행되지 않음 ❌
   ↓
7. 이메일 발송: 발생하지 않음 ❌
```

---

## 🛠️ 수정 계획

### 단계 1: RLS 정책 수정

**목표:** assigner/assignee가 `task_status` 필드만 UPDATE할 수 있도록 허용

**방법:** 두 가지 RLS 정책을 분리
1. **일반 필드 UPDATE**: Admin만 가능 (title, description, due_date 등)
2. **task_status UPDATE**: assigner/assignee만 가능

**구현:**
- 기존 `tasks_update_admin_only` 정책을 유지하되, `task_status` 필드 변경은 제외
- 새로운 `tasks_update_status_assigner_assignee` 정책 추가
- PostgreSQL의 `UPDATE OF` 절을 사용하여 특정 컬럼만 대상으로 하는 정책 생성

### 단계 2: 마이그레이션 파일 생성

**파일명:** `supabase/migrations/20250101000021_fix_task_status_update_policy.sql`

**내용:**
1. 기존 `tasks_update_admin_only` 정책 수정 (task_status 제외)
2. 새로운 `tasks_update_status_assigner_assignee` 정책 생성
3. 정책 설명 주석 추가

### 단계 3: 프론트엔드 에러 처리 개선

**목표:** UPDATE 실패 시 명확한 에러 메시지 표시

**수정 사항:**
- `updateTaskStatus` 함수에서 UPDATE 실패 시 명확한 에러 메시지 반환
- `useUpdateTaskStatus` 훅에서 에러 발생 시 Optimistic Update 롤백 확인

### 단계 4: 테스트 및 검증

**테스트 시나리오:**
1. ✅ assignee가 ASSIGNED → IN_PROGRESS 변경
2. ✅ assignee가 IN_PROGRESS → WAITING_CONFIRM 변경
3. ✅ assigner가 WAITING_CONFIRM → APPROVED 변경
4. ✅ assigner가 WAITING_CONFIRM → REJECTED 변경
5. ✅ Admin이 일반 필드(title, description) 수정 가능
6. ✅ Admin이 task_status 직접 변경 불가 (에러 발생)
7. ✅ 이메일 발송 확인

---

## 📝 상세 수정 내용

### 1. RLS 정책 수정 (마이그레이션)

```sql
-- 기존 정책 수정: task_status 필드 변경 제외
-- Admin은 title, description, due_date만 수정 가능
DROP POLICY IF EXISTS "tasks_update_admin_only" ON public.tasks;

CREATE POLICY "tasks_update_admin_only"
ON public.tasks
FOR UPDATE
USING (is_admin(auth.uid()))
WITH CHECK (
  is_admin(auth.uid())
  AND (
    -- task_status는 변경 불가 (별도 정책으로 제어)
    (OLD.task_status IS NOT DISTINCT FROM NEW.task_status)
  )
);

-- 새로운 정책: assigner/assignee가 task_status만 변경 가능
CREATE POLICY "tasks_update_status_assigner_assignee"
ON public.tasks
FOR UPDATE
USING (
  (auth.uid() = assigner_id OR auth.uid() = assignee_id)
  AND NOT is_admin(auth.uid())  -- Admin은 제외
)
WITH CHECK (
  (auth.uid() = assigner_id OR auth.uid() = assignee_id)
  AND NOT is_admin(auth.uid())
  AND (
    -- task_status만 변경 가능, 다른 필드는 변경 불가
    (OLD.id IS NOT DISTINCT FROM NEW.id)
    AND (OLD.project_id IS NOT DISTINCT FROM NEW.project_id)
    AND (OLD.title IS NOT DISTINCT FROM NEW.title)
    AND (OLD.description IS NOT DISTINCT FROM NEW.description)
    AND (OLD.assigner_id IS NOT DISTINCT FROM NEW.assigner_id)
    AND (OLD.assignee_id IS NOT DISTINCT FROM NEW.assignee_id)
    AND (OLD.due_date IS NOT DISTINCT FROM NEW.due_date)
    AND (OLD.created_at IS NOT DISTINCT FROM NEW.created_at)
    AND (OLD.updated_at IS NOT DISTINCT FROM NEW.updated_at)
    -- task_status는 변경 가능
  )
);
```

**주의사항:**
- PostgreSQL의 RLS 정책은 `UPDATE OF column_name` 구문을 지원하지 않습니다.
- 대신 `WITH CHECK` 절에서 다른 필드가 변경되지 않았는지 확인해야 합니다.
- 하지만 이 방법은 복잡하고 성능에 영향을 줄 수 있습니다.

**더 나은 방법:**
- PostgreSQL 15+에서는 `UPDATE OF` 절을 지원하지만, Supabase가 사용하는 버전을 확인해야 합니다.
- 대안: 두 개의 정책을 만들되, 하나는 Admin용(일반 필드), 하나는 assigner/assignee용(task_status만)으로 분리

### 2. 대안: 더 간단한 접근 방식

**방법:** `updateTaskStatus` 함수에서 Service Role을 사용하여 RLS를 우회

**장점:**
- RLS 정책을 복잡하게 만들 필요 없음
- 애플리케이션 레벨에서 권한 제어 가능
- 트리거는 정상적으로 실행됨

**단점:**
- Service Role 사용 시 보안 주의 필요
- 권한 검증이 애플리케이션 레벨에만 의존

**권장 방법:**
- RLS 정책을 수정하는 것이 더 안전하고 권장되는 방법입니다.
- 하지만 Supabase의 제약사항을 고려하여 실용적인 접근이 필요합니다.

---

## 🎯 최종 권장 수정 방안

### 옵션 1: RLS 정책 분리 (권장)

**장점:**
- 데이터베이스 레벨에서 보안 보장
- 애플리케이션 로직과 독립적
- 트리거 정상 실행

**단점:**
- RLS 정책이 복잡해질 수 있음
- PostgreSQL 버전에 따라 제약사항 있을 수 있음

### 옵션 2: Service Role 사용 (대안)

**장점:**
- 구현이 간단함
- RLS 정책 변경 불필요

**단점:**
- 보안이 애플리케이션 레벨에만 의존
- Service Role 키 관리 필요

---

## 📌 다음 단계

1. **RLS 정책 수정 마이그레이션 작성**
   - `tasks_update_admin_only` 정책 수정
   - `tasks_update_status_assigner_assignee` 정책 추가

2. **마이그레이션 적용**
   - Supabase MCP를 사용하여 마이그레이션 실행

3. **프론트엔드 에러 처리 개선**
   - `updateTaskStatus` 함수의 에러 처리 강화
   - 명확한 에러 메시지 반환

4. **테스트**
   - 각 상태 변경 시나리오 테스트
   - 이메일 발송 확인
   - DB 상태 확인

5. **검증**
   - Admin이 일반 필드 수정 가능 확인
   - Admin이 task_status 직접 변경 불가 확인
   - assigner/assignee가 상태 변경 가능 확인

---

## 🔗 관련 파일

- `supabase/migrations/20250101000007_create_rls_policies_tasks.sql` - 기존 RLS 정책
- `supabase/migrations/20250101000018_update_task_update_policy_admin_only.sql` - 최신 RLS 정책
- `src/api/task.ts` - Task API 함수
- `src/hooks/mutations/use-task.ts` - Task 뮤테이션 훅
- `supabase/migrations/20250101000010_create_task_status_change_trigger.sql` - 상태 변경 트리거

---

## 📅 예상 소요 시간

- RLS 정책 수정: 30분
- 마이그레이션 작성 및 테스트: 1시간
- 프론트엔드 에러 처리 개선: 30분
- 전체 테스트 및 검증: 1시간

**총 예상 시간: 약 3시간**


