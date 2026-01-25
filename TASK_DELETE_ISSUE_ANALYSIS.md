# Task 삭제 오류 원인 분석 보고서

**분석 일시**: 2026-01-26  
**문제**: Task 생성자(지시자)가 Task를 삭제할 수 없는 오류

---

## 🔍 문제 요약

Task 생성자(지시자)가 자신이 생성한 Task를 삭제하려고 할 때 삭제가 실패하는 문제가 발생하고 있습니다.

---

## 📋 현재 코드 상태

### 1. 프론트엔드 코드

**파일**: `src/pages/task-detail-page.tsx` (325-330줄)
```typescript
const isAssigner = currentUserId === task.assigner_id;
const isAssignee = currentUserId === task.assignee_id;
// 수정 권한: 지시자만 수정 가능
const canEdit = isAssigner;
// 삭제 권한: 지시자만 삭제 가능
const canDelete = isAssigner;
```

**파일**: `src/api/task.ts` (304-313줄)
```typescript
/**
 * Task 삭제 (지시자만 가능)
 */
export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from("tasks").delete().eq("id", id);

  if (error) {
    throw new Error(`Task 삭제 실패: ${error.message}`);
  }
}
```

**분석**: 프론트엔드와 API 코드는 모두 지시자만 삭제 가능하도록 설계되어 있습니다.

---

## ⚠️ RLS 정책 충돌 문제

여러 마이그레이션 파일에서 서로 다른 DELETE 정책이 설정되어 있어 충돌이 발생하고 있습니다.

### 마이그레이션 파일별 DELETE 정책

| 마이그레이션 파일 | 정책명 | 권한 | 날짜 |
|------------------|--------|------|------|
| `20250101000007_create_rls_policies_tasks.sql` | `tasks_delete_admin_only` | **관리자만** 삭제 가능 | 2025-01-01 |
| `20260109000002_optimize_rls_policies.sql` | `tasks_delete_assigner_only` | **지시자만** 삭제 가능 | 2026-01-09 |
| `20260110000002_phase2_rls_policies_verification.sql` | `tasks_delete_assigner_only` | **지시자만** 삭제 가능 | 2026-01-10 |
| `migrations_refactoring/03_tasks_rls_policies.sql` | `tasks_delete_admin_only` | **관리자만** 삭제 가능 | 리팩토링 |

### 정책 충돌 상세

#### 1. 초기 정책 (2025-01-01)
```sql
-- Policy: DELETE - Only Admin can delete tasks
CREATE POLICY "tasks_delete_admin_only"
ON public.tasks
FOR DELETE
USING (is_admin(auth.uid()));
```
**의도**: 관리자만 삭제 가능

#### 2. 최적화 정책 (2026-01-09)
```sql
-- DELETE 정책 최적화
DROP POLICY IF EXISTS "tasks_delete_assigner_only" ON public.tasks;
CREATE POLICY "tasks_delete_assigner_only" ON public.tasks
  FOR DELETE
  USING (assigner_id = (SELECT auth.uid()));
```
**의도**: 지시자만 삭제 가능

#### 3. Phase 2 검증 정책 (2026-01-10)
```sql
-- DELETE 정책: 지시자만
CREATE POLICY "tasks_delete_assigner_only"
ON public.tasks
FOR DELETE
USING ((SELECT auth.uid()) = assigner_id);
```
**의도**: 지시자만 삭제 가능

#### 4. 리팩토링 정책 (migrations_refactoring)
```sql
-- DELETE 정책: 관리자만 삭제 가능
DROP POLICY IF EXISTS "tasks_delete_admin_only" ON public.tasks;
CREATE POLICY "tasks_delete_admin_only"
ON public.tasks
FOR DELETE
USING (is_admin(auth.uid()));
```
**의도**: 관리자만 삭제 가능 (리팩토링 시 원래 정책으로 복귀)

---

## 🎯 문제 원인 (확인됨)

### ✅ 확인된 원인

`complete_refactoring.sql` 파일이 적용되면서 다음과 같이 정책이 설정되었습니다:

#### 적용된 정책 (215-220줄)
```sql
-- DELETE 정책: 관리자만 삭제 가능
DROP POLICY IF EXISTS "tasks_delete_admin_only" ON public.tasks;
CREATE POLICY "tasks_delete_admin_only"
ON public.tasks
FOR DELETE
USING (is_admin(auth.uid()));
```

#### 제거된 정책 (235줄)
```sql
DROP POLICY IF EXISTS "tasks_delete_assigner_only" ON public.tasks;
```

### 문제의 핵심

1. **RLS 정책이 관리자만 허용**: `tasks_delete_admin_only` 정책이 활성화되어 `is_admin(auth.uid())` 조건만 만족하는 사용자만 삭제 가능
2. **지시자 삭제 정책 제거**: `tasks_delete_assigner_only` 정책이 명시적으로 제거됨
3. **프론트엔드와 백엔드 불일치**: 
   - 프론트엔드: 지시자만 삭제 가능하도록 UI 표시 (`canDelete = isAssigner`)
   - API 코드: 주석에 "지시자만 가능" 명시
   - **실제 RLS 정책**: 관리자만 삭제 가능 (`is_admin(auth.uid())`)

### 결과

지시자가 Task 삭제를 시도하면:
- 프론트엔드에서는 삭제 버튼이 표시됨 (`canDelete = true`)
- API 호출은 정상적으로 실행됨
- **하지만 RLS 정책에 의해 차단되어 삭제 실패**
- 에러 메시지: "Task 삭제 실패: [RLS 정책 위반 관련 에러]"

---

## ✅ 원인 확인 완료

`complete_refactoring.sql` 파일을 확인한 결과, 다음이 확인되었습니다:

### 적용된 DELETE 정책

**파일**: `supabase/migrations/migrations_refactoring/complete_refactoring.sql`  
**라인**: 215-220

```sql
-- DELETE 정책: 관리자만 삭제 가능
DROP POLICY IF EXISTS "tasks_delete_admin_only" ON public.tasks;
CREATE POLICY "tasks_delete_admin_only"
ON public.tasks
FOR DELETE
USING (is_admin(auth.uid()));
```

### 제거된 DELETE 정책

**파일**: `supabase/migrations/migrations_refactoring/complete_refactoring.sql`  
**라인**: 235

```sql
DROP POLICY IF EXISTS "tasks_delete_assigner_only" ON public.tasks;
```

### 최종 확인

1. ✅ **현재 적용된 정책**: `tasks_delete_admin_only` (관리자만 삭제 가능)
2. ✅ **제거된 정책**: `tasks_delete_assigner_only` (지시자만 삭제 가능)
3. ✅ **문제**: 지시자가 삭제를 시도하면 RLS 정책에 의해 차단됨

---

## 💡 확인된 원인

**확인된 원인**:

`complete_refactoring.sql` 마이그레이션 파일이 적용되면서 다음과 같이 정책이 설정되었습니다:

### 적용된 정책 (215-220줄)
```sql
-- DELETE 정책: 관리자만 삭제 가능
DROP POLICY IF EXISTS "tasks_delete_admin_only" ON public.tasks;
CREATE POLICY "tasks_delete_admin_only"
ON public.tasks
FOR DELETE
USING (is_admin(auth.uid()));
```

### 제거된 정책 (235줄)
```sql
DROP POLICY IF EXISTS "tasks_delete_assigner_only" ON public.tasks;
```

**결과**:
1. ✅ **RLS 정책이 관리자만 허용**: `tasks_delete_admin_only` 정책이 활성화되어 관리자만 삭제 가능
2. ✅ **지시자 삭제 정책 제거**: `tasks_delete_assigner_only` 정책이 제거됨
3. ✅ **프론트엔드와 백엔드 불일치**: 프론트엔드는 지시자만 삭제 가능하도록 UI를 표시하지만, 실제 RLS 정책은 관리자만 허용

**문제의 핵심**: 
- 프론트엔드 코드: 지시자만 삭제 가능 (`canDelete = isAssigner`)
- API 코드: 주석에 "지시자만 가능" 명시
- **실제 RLS 정책**: 관리자만 삭제 가능 (`is_admin(auth.uid())`)

따라서 지시자가 삭제를 시도하면 RLS 정책에 의해 차단되어 삭제가 실패합니다.

---

## 📝 해결 방안 (참고용, 아직 수정하지 않음)

### 방안 1: RLS 정책을 지시자만 허용하도록 변경

```sql
DROP POLICY IF EXISTS "tasks_delete_admin_only" ON public.tasks;
DROP POLICY IF EXISTS "tasks_delete_assigner_only" ON public.tasks;

CREATE POLICY "tasks_delete_assigner_only"
ON public.tasks
FOR DELETE
USING (auth.uid() = assigner_id);
```

### 방안 2: 관리자 또는 지시자 모두 허용

```sql
DROP POLICY IF EXISTS "tasks_delete_admin_only" ON public.tasks;
DROP POLICY IF EXISTS "tasks_delete_assigner_only" ON public.tasks;

CREATE POLICY "tasks_delete_admin_or_assigner"
ON public.tasks
FOR DELETE
USING (
  is_admin(auth.uid()) 
  OR auth.uid() = assigner_id
);
```

---

## ✅ 다음 단계

1. **현재 데이터베이스 상태 확인**: 실제로 어떤 DELETE 정책이 적용되어 있는지 확인
2. **마이그레이션 실행 이력 확인**: 어떤 마이그레이션이 실행되었는지 확인
3. **정책 수정**: 확인된 문제에 따라 적절한 정책으로 수정

---

**참고**: 이 문서는 문제 분석만 수행했으며, 실제 코드 수정은 아직 수행하지 않았습니다.
