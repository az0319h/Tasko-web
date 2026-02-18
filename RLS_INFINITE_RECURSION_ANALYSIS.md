# RLS 무한 재귀 원인 분석 및 수정 계획

## 1. 데이터 상태 (확인됨) ✅

**DB에 모든 원본 데이터 존재:**
| 테이블 | 건수 |
|--------|------|
| tasks | 62 |
| notifications | 139 |
| messages | 292 |
| task_list_items | 23 |
| task_lists | 10 |
| task_schedules | 52 |
| profiles | 6 |
| task_references | 0 |

→ **데이터 삭제 없음. 마이그레이션은 데이터를 건드리지 않음.**

---

## 2. 근본 원인: RLS 무한 재귀

### 2.1 재귀 순환 구조

```
tasks SELECT 정책
  → EXISTS (SELECT 1 FROM task_references WHERE task_id = tasks.id AND user_id = auth.uid())
    → task_references 테이블 읽기
      → task_references RLS 적용
        → EXISTS (SELECT 1 FROM tasks WHERE ... AND EXISTS (SELECT 1 FROM task_references tr WHERE ...))
          → tasks RLS 적용
          → task_references 읽기
          → ... 무한 재귀
```

### 2.2 상세 분석

**tasks 정책 (tasks_select_assigner_assignee_reference_or_admin):**
```sql
OR EXISTS (
  SELECT 1 FROM task_references  -- task_references 읽기 시 RLS 적용
  WHERE task_references.task_id = tasks.id
  AND task_references.user_id = auth.uid()
)
```

**task_references 정책 (task_references_select_task_participants_or_admin):**
```sql
OR EXISTS (
  SELECT 1 FROM tasks  -- tasks 읽기 시 RLS 적용
  WHERE tasks.id = task_references.task_id
  AND (
    tasks.assigner_id = auth.uid()
    OR tasks.assignee_id = auth.uid()
    OR EXISTS (SELECT 1 FROM task_references tr ...)  -- 자기 자신 참조! 재귀
  )
)
```

→ **PostgreSQL 에러: "infinite recursion detected in policy for relation task_references"**
→ **RLS 평가 실패 → 모든 쿼리 0건 반환 → Task/알림/캘린더 등 전부 빈 화면**

---

## 3. 수정 방안

### 3.1 SECURITY DEFINER 함수로 재귀 차단

`is_task_reference(task_id, user_id)` 함수를 SECURITY DEFINER로 생성:
- RLS를 우회하여 task_references 조회
- tasks 정책에서는 이 함수만 호출 → task_references RLS 호출 없음 → 재귀 차단

### 3.2 task_references 정책 단순화

재귀를 유발하는 `EXISTS (SELECT 1 FROM task_references tr ...)` 제거:
- admin: 전체 조회
- `user_id = auth.uid()`: 본인 참조 행만 조회
- assigner/assignee: tasks만 조회 (tasks RLS 내부에서 task_references 안 보면, 이 경로는 재귀 없음)

단, assigner/assignee 판단 시 `EXISTS (SELECT 1 FROM tasks ...)`는 tasks RLS를 유발하고, tasks 정책이 다시 `task_references`를 보려 하면 재귀가 발생할 수 있음.

**따라서 tasks 정책에서 task_references 직접 조회를 제거하고, `is_task_reference()` 함수로 대체해야 함.**

### 3.3 최종 수정 SQL

1. `is_task_reference(uuid, uuid)` SECURITY DEFINER 함수 생성
2. tasks SELECT 정책: `EXISTS (SELECT 1 FROM task_references ...)` → `is_task_reference(tasks.id, auth.uid())`로 교체
3. task_references SELECT 정책: 재귀 구문 제거, `user_id = auth.uid()` 및 assigner/assignee 조건만 사용 (tasks 조회 시 `is_task_reference` 미사용으로 재귀 방지)

---

## 4. 적용 순서

1. 마이그레이션 `20260212000007_fix_rls_infinite_recursion.sql` 생성
2. `is_task_reference` 함수 추가
3. tasks SELECT 정책 수정
4. task_references SELECT 정책 수정
5. MCP로 마이그레이션 적용
6. 프론트엔드 재검증
