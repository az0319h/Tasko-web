# 알림/데이터 미표시 문제 진단 및 수정 계획

## 1. 진단 결과 요약

### 1.1 데이터 상태 ✅
- **tasks**: 62개 존재 (삭제되지 않음)
- **notifications**: 139개 존재 (삭제되지 않음)
- **bass.to.tasko@gmail.com (CEO)**: 읽지 않은 알림 15개
- **마이그레이션**: 기존 데이터 유지됨, 데이터 손실 없음

### 1.2 증상
| 위치 | 표시 | 실제 DB |
|------|------|---------|
| 사이드바 뱃지 | "읽지 않은 알림 15개" | ✅ 15개 (RPC로 조회, 정상) |
| 알림 목록 | "알림이 없습니다" (0개) | ❌ 15개 있어야 함 |
| 탭 | 전체(0), 읽지않음(0), 읽음(0) | ❌ |

### 1.3 원인 분석

#### 원인 A: tasks RLS 정책에서 `is_public` 누락
참조자 마이그레이션(`20260212000003`)이 `tasks` SELECT 정책을 교체할 때 **`is_public` 조건이 제거**됨.

**기존 정책 (is-public 마이그레이션):**
```sql
is_public = true                                    -- 공개 Task: 모든 사용자
OR (is_self_task = true AND auth.uid() = assigner_id)
OR (is_self_task = false AND is_public = false AND (is_admin OR assigner OR assignee))
```

**현재 정책 (참조자 마이그레이션 후):**
```sql
is_admin(auth.uid())
OR assigner_id = auth.uid()
OR assignee_id = auth.uid()
OR EXISTS (task_references...)
-- is_public 조건 완전 누락!
```

**영향**: 공개 Task(`is_public=true`)가 모든 사용자에게 보이지 않음. 알림 목록뿐 아니라 캘린더, 작업 목록 등 전반에 영향.

#### 원인 B: 알림 목록 조회 시 tasks JOIN + RLS
`getNotifications()`가 `tasks` 테이블과 JOIN하여 task 정보(id, title, task_status, client_name)를 가져옴:
```ts
.select(`*, task:tasks!notifications_task_id_fkey(id, title, task_status, client_name)`)
```

PostgREST/Supabase는 JOIN 시 **tasks RLS**를 적용함. tasks RLS에 문제가 있으면:
- tasks 행이 RLS에 의해 차단될 수 있음
- JOIN 결과가 비정상적으로 필터링되어 알림 행 자체가 누락될 수 있음

#### 원인 C: 알림 수 vs 목록 불일치
- **읽지 않은 알림 수**: `get_unread_notification_count` RPC 사용 → SECURITY DEFINER로 **RLS 우회** → 15 반환 ✅
- **알림 목록**: `notifications` + `tasks` JOIN → **RLS 적용** → 0 반환 ❌

---

## 2. 수정 계획

### 2.1 Phase 1: tasks RLS에 is_public 복구 (필수)

**마이그레이션 파일**: `supabase/migrations/multi-chat/20260212000006_restore_is_public_in_tasks_rls.sql`

```sql
-- tasks SELECT 정책에 is_public 조건 복구
DROP POLICY IF EXISTS "tasks_select_assigner_assignee_reference_or_admin" ON public.tasks;

CREATE POLICY "tasks_select_assigner_assignee_reference_or_admin"
ON public.tasks
FOR SELECT
USING (
  -- 공개 Task: 모든 인증된 사용자 접근 가능 (자기 할당 제외)
  (is_public = true AND is_self_task = false)
  OR
  -- 자기 할당 Task: 본인만
  (is_self_task = true AND auth.uid() = assigner_id)
  OR
  -- 비공개 Task: admin, assigner, assignee, reference
  (is_self_task = false AND is_public = false AND (
    is_admin((SELECT auth.uid()))
    OR (SELECT auth.uid()) = assigner_id
    OR (SELECT auth.uid()) = assignee_id
    OR EXISTS (
      SELECT 1 FROM public.task_references
      WHERE task_references.task_id = tasks.id
      AND task_references.user_id = (SELECT auth.uid())
    )
  ))
);
```

**효과**: 공개 Task, 캘린더, 작업 목록, 알림 관련 조회가 정상화됨.

### 2.2 Phase 2: 알림용 task 접근 정책 추가 (권장)

**목적**: 알림 수신자가 해당 알림의 task 기본 정보(id, title, status, client_name)를 볼 수 있도록 보장.

**마이그레이션에 추가:**
```sql
-- 알림 수신자는 해당 알림의 task 기본 정보 조회 가능
CREATE POLICY "tasks_select_own_notification_tasks"
ON public.tasks
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.notifications
    WHERE notifications.task_id = tasks.id
    AND notifications.user_id = auth.uid()
  )
);
```

**효과**: JOIN 시 task RLS를 통과해 알림 목록이 안정적으로 표시됨.

### 2.3 Phase 3: API 폴백 (선택)

tasks JOIN이 계속 실패할 경우를 위한 대비:
- `getNotifications()`에서 task JOIN 없이 조회 후, task_id로 별도 최소 조회
- 또는 task가 null이어도 알림 title/message로 UI 표시

---

## 3. 롤백 필요 여부

**❌ DB 롤백 불필요**
- 데이터는 모두 존재함
- 문제는 RLS 정책 변경으로 인한 **접근 제한**일 뿐
- 마이그레이션 1건(Phase 1) 적용으로 해결 가능

---

## 4. 적용 순서

1. Phase 1 마이그레이션 생성 및 적용 (Supabase MCP 또는 `supabase db push`)
2. 브라우저에서 알림 페이지 새로고침 후 확인
3. (권장) Phase 2 정책 추가
4. 캘린더, 작업 목록 등 다른 화면도 정상 동작 확인

---

## 5. 검증 쿼리 (적용 후)

```sql
-- tasks RLS 정책 확인
SELECT policyname, qual
FROM pg_policies
WHERE tablename = 'tasks' AND cmd = 'SELECT';

-- 공개 task 수
SELECT COUNT(*) FROM public.tasks WHERE is_public = true;
```
