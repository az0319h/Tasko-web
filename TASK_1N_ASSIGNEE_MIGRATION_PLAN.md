# Task 1:n 담당자 마이그레이션 계획서

> **목표**: Task 생성 시 담당자를 1:n으로 변경 (최소 1명 이상 선택 가능)

---

## 📊 현재 구조 요약

| 구분 | 현재 (1:1) |
|------|------------|
| tasks.assignee_id | 단일 UUID (nullable) |
| 담당자 수 | 1명 고정 |
| 권한 | 지시자(assigner) vs 담당자(assignee) 양분 |

---

## 🎯 설계 방향 3가지

### 방안 A: 완전 1:n (모든 담당자 동등 권한)

- **구조**: `task_assignees` 조인 테이블 생성, `assignee_id` 제거
- **권한**: 모든 담당자가 "시작", "확인 요청" 등 동일 권한
- **복잡도**: ⭐⭐⭐ 매우 높음

### 방안 B: 주 담당자(primary) + 부 담당자 (권장)

- **구조**: `assignee_id` 유지 (주 담당자), `task_assignees` 추가 (전체 담당자 목록)
- **권한**: 주 담당자만 버튼 조작 (시작, 확인 요청), 나머지는 참여자
- **복잡도**: ⭐⭐ 중간

### 방안 C: 최소 변경 (assignee_id 유지 + 첫 번째=주 담당자)

- **구조**: `assignee_id`만 유지, 선택 순서 첫 번째 = 주 담당자
- **권한**: 현재와 동일 (1명만 담당자로 취급)
- **복잡도**: ⭐ 낮음 (실질적으로 1:1 유지, UI만 멀티 선택처럼 보이게)

---

## 🔍 영향 범위 분석 (assignee_id 사용처)

### 1. 데이터베이스

| 영역 | 파일/위치 | 영향 내용 |
|------|-----------|-----------|
| **tasks 테이블** | 스키마 | assignee_id 컬럼 변경 또는 제거 |
| **RLS 정책** | tasks, messages, task_schedules, task_list_items | `auth.uid() = assignee_id` → 담당자 목록 포함 여부로 변경 |
| **제약조건** | my-tasks 마이그레이션 | `is_self_task` 시 assigner_id = assignee_id 체크 |
| **트리거** | create_task_schedule | 담당자 1명 기준 일정 생성 → n명 시 로직 재설계 필요 |
| **이메일 트리거** | send_task_created_email, send_task_status_change_email | 단일 assignee → 복수 담당자 루프 발송 |
| **알림 트리거** | TASK_DELETED 등 | assignee_id → 담당자들 각각 알림 |

### 2. Edge Functions

| 함수 | 영향 | 변경 포인트 |
|------|------|-------------|
| **send-task-email** | recipients가 assigner/assignee 1:1 가정 | `assigneeEmail` 배열로 변경, 담당자별 개별 발송 |
| **check-due-date-approaching** | assignee_id 1명에게만 알림 | 담당자 n명에게 각각 알림 생성 |

### 3. 프론트엔드 / API

| 영역 | 파일 | 영향 |
|------|------|------|
| Task 생성 폼 | task-form-dialog.tsx, task-schema | 단일 선택 → 다중 선택 (최소 1명) |
| Task 상세 | task-detail-page, task-detail-sheet/dialog | assignee 1명 표시 → 여러 명 표시 |
| 버튼 권한 | task-detail-page, admin/member-dashboard | `task.assignee_id === currentProfile?.id` → 담당자 배열 포함 여부 |
| 칸반/필터 | kanban-board, kanban-board-with-projects | MY_ASSIGNEE 등 `assignee_id` 기반 필터 |
| 메시지 읽음 | message.ts, mark_message_as_read | counterpart 1:1 → 지시자 vs "담당자들" |
| API | task.ts | createTask, updateTask, getTasksByUserId 등 assignee_id 기반 로직 |
| 일정 | schedule.ts, api/schedule.ts | assignee_id 기준 필터 → 주 담당자 또는 담당자 중 1명 기준 |

### 4. 부가 기능

| 기능 | 영향 |
|------|------|
| **일정 자동 생성** | 담당자 1명 기준 빈 slot 탐색 → n명일 때: 1) 주 담당자만 2) 첫 담당자만 3) 각 담당자별 일정 생성(복잡) |
| **task_list_items** | "자신이 assignee인 Task" → "자신이 assignees에 포함된 Task" |
| **can_access_profile** | assigner/assignee → assigner 또는 assignees에 포함 |
| **읽음 처리** | 지시자 ↔ 담당자 1:1 → 지시자 ↔ 담당자들 (담당자끼리 읽음 처리 정책 필요) |

---

## 📋 방안별 마이그레이션 플로우

### 방안 B: 주 담당자 + 부 담당자 (권장)

#### Phase 1: 스키마

1. `task_assignees` 테이블 생성  
   - `task_id`, `user_id`, `is_primary` (또는 `display_order`), `created_at`
   - UNIQUE(task_id, user_id)
   - FK: task_id → tasks, user_id → profiles
2. `tasks.assignee_id` **유지** (주 담당자 = primary assignee)
3. Task 생성 시: `assignee_id` = 첫 번째 선택자, `task_assignees`에 전원 insert (`is_primary` = 첫 번째만 true)

#### Phase 2: 기존 데이터 마이그레이션

- `assignee_id`가 있는 모든 task에 대해 `task_assignees` insert (1 row, is_primary=true)

#### Phase 3: RLS

- "담당자" 판단: `auth.uid() = assignee_id OR EXISTS (SELECT 1 FROM task_assignees WHERE task_id = tasks.id AND user_id = auth.uid())`
- tasks SELECT/UPDATE, messages, task_schedules, task_list_items 등 해당 조건으로 정책 수정

#### Phase 4: 트리거 / Edge Function

- **create_task_schedule**: `assignee_id` 그대로 사용 (주 담당자에게 일정 생성) → 변경 없음
- **이메일**: 트리거에서 task_assignees 조회 → assigner + assignees 각각에게 발송 (assignee 복수 대응)
- **알림**: assignee_id + task_assignees 조회 → 각 담당자에게 알림

#### Phase 5: API

- createTask: `assignee_id` = 첫 선택자, task_assignees bulk insert
- getTaskById 등: task_assignees join해서 `assignees: Profile[]` 반환
- updateTask: 담당자 변경 시 assignee_id + task_assignees 동기화

#### Phase 6: 프론트엔드

- 폼: 단일 Select → Multi Select (최소 1명)
- 상세: assignee 1명 → assignees 목록 (주 담당자 강조)
- 버튼 권한: `isAssignee = assignee_id === userId || assignees.some(a => a.id === userId)`
- 주 담당자만: `assignee_id === userId` (시작/확인요청 버튼)

---

## 🚨 핵심 결정 사항

### 1. "버튼 권한" 정의

- **시작**, **확인 요청**, **고객 이메일 발송** 등:
  - A) 모든 담당자 가능
  - B) 주 담당자(첫 번째)만 가능 ← 권장
  - C) 별도 "주 담당자" 지정

### 2. 일정 정책

- 현재: task당 일정 1개, assignee 기준
- 1:n 시:
  - **옵션 1**: 주 담당자에게만 1개 일정 생성 (현 로직 유지)
  - **옵션 2**: 담당자별로 일정 생성 (task_schedules 구조 변경 필요)
  - **옵션 3**: 일정은 task 단위로 1개, "담당자들"이 공유

→ **옵션 1 권장** (변경 최소화)

### 3. 읽음 처리

- 현재: 지시자 ↔ 담당자 1:1
- 1:n 시:
  - 지시자 → 담당자 A,B,C 각각 읽음
  - 담당자 A → 지시자 읽음 (B,C는?)
  - **권장**: 지시자 ↔ 각 담당자 개별 읽음. 담당자 간 읽음은 불필요로 가정 (또는 팀 채팅으로 확장 시 재검토)

### 4. 이메일 수신

- 담당자 전원에게 발송 vs 주 담당자만
- **권장**: 담당자 전원에게 발송 (업무 공유 목적)

---

## ⏱ 예상 공수 (방안 B 기준)

| Phase | 예상 |
|-------|------|
| 스키마 + 마이그레이션 | 0.5일 |
| RLS 정책 수정 | 1일 |
| 트리거 / Edge Function | 1일 |
| API (task, message, schedule) | 1.5일 |
| 프론트엔드 (폼, 상세, 대시보드, 칸반) | 2일 |
| 테스트 및 버그 수정 | 2일 |
| **총합** | **약 8일** |

---

## 🔄 방안 C (최소 변경) 요약

- UI만 "여러 명 선택"처럼 보이게 하고, 실제로는 **첫 번째 선택자만 assignee_id로 저장**
- 나머지 선택자는 `task_assignees`에만 저장 (알림/이메일 대상, 표시용)
- **버튼 권한**: assignee_id 1명만 (현 구조 유지)
- **장점**: RLS, 트리거, 일정, 읽음 처리 등 대부분 수정 불필요
- **단점**: "담당자"가 사실상 1명, 나머지는 참여자에 가까움

---

## ✅ 권장 결론

1. **구현 난이도 vs 기능**를 고려하면 **방안 B(주 담당자 + 부 담당자)** 권장
2. **빠른 적용**이 중요하면 **방안 C**로 시작 후, 필요 시 방안 B로 확장 가능
3. **방안 A(완전 동등 권한)**는 일정·읽음·권한 정책 전면 재설계가 필요해 리스크 큼

---

## 📝 방안 B 상세 수정 체크리스트

### 1. 새 마이그레이션 (추가 파일)

| 파일 | 작업 |
|------|------|
| `supabase/migrations/YYYYMMDD000001_create_task_assignees.sql` | `task_assignees` 테이블 생성, 기존 데이터 마이그레이션 |
| `supabase/migrations/YYYYMMDD000002_update_rls_for_task_assignees.sql` | RLS 정책 수정 (tasks, messages, task_schedules, task_list_items 등) |
| `supabase/migrations/YYYYMMDD000003_update_triggers_for_task_assignees.sql` | 이메일/알림 트리거 수정 (task_assignees 조회 루프) |

---

### 2. 데이터베이스 - RLS 정책 (수정 대상)

| 테이블 | 정책명 | 변경 내용 |
|--------|--------|-----------|
| **tasks** | `tasks_select_admin_or_assigned`, `tasks_select_*` | `assignee_id` → `assignee_id OR EXISTS(SELECT 1 FROM task_assignees ...)` |
| **tasks** | `tasks_update_assigner_or_assignee` | 동일 |
| **messages** | `messages_select_assigner_assignee_or_admin` | 동일 |
| **task_schedules** | `task_schedules_select_assigner_assignee`, `task_schedules_update_assigner_assignee` | 동일 (주 담당자만 일정 수정 가능 시 변경 최소화 가능) |
| **task_list_items** | INSERT 정책 | `tasks.assignee_id` → `assignee_id OR task_assignees` |
| **task_lists** | `remove_task_from_list_on_privacy_change` 함수 | `NEW.assignee_id` → assignees 전체 체크 (또는 주 담당자만) |
| **profiles** | `can_access_profile()` 함수 | `assignee_id` → `assignee_id OR task_assignees` |

---

### 3. 데이터베이스 - 트리거/함수 (수정 대상)

| 트리거/함수 | 위치 (마이그레이션) | 변경 내용 |
|-------------|---------------------|-----------|
| `send_task_created_email` | my-tasks/20260205000000, 20250101000028 등 | assignee 1명 → task_assignees 루프, 각 담당자에게 HTTP 호출 (또는 Edge Function에서 배열 수신) |
| `send_task_status_change_email` | 동일 | 동일 |
| `create_task_schedule` | schedule_end/20260129000009 | **변경 없음** (assignee_id = 주 담당자 그대로 사용) |
| `trigger_notify_task_created` | notification, my-tasks | assignee_id → task_assignees 루프, 각 담당자에게 알림 |
| `trigger_notify_task_deleted` | notification/20260130000008, 09 | assignee_id → task_assignees 루프 |

---

### 4. Edge Functions (수정 대상)

| 함수 | 파일 | 변경 내용 |
|------|------|-----------|
| **send-task-email** | `supabase/functions/send-task-email/index.ts` | `assigneeEmail` → `assigneeEmails: string[]`, recipients에 assignee 포함 시 각 담당자별 발송 |
| **check-due-date-approaching** | `supabase/functions/check-due-date-approaching/index.ts` | `assignee_id` → task_assignees 조회, 각 담당자에게 알림 생성 |

---

### 5. API (src/api) (수정 대상)

| 파일 | 함수/위치 | 변경 내용 |
|------|-----------|-----------|
| **task.ts** | `TaskWithProfiles` 타입 | `assignee: Profile \| null` → `assignee: Profile \| null`, `assignees: Profile[]` 추가 |
| **task.ts** | `getTaskById` select | `assignee:profiles!tasks_assignee_id_fkey` + task_assignees join |
| **task.ts** | `createTask` | `assignee_id` = 첫 선택자, task_assignees bulk insert |
| **task.ts** | `updateTask` | send_email_to_client: `assignee_id` → `assignee_id` (주 담당자만, 변경 없음) |
| **task.ts** | `getTasksByUserId`, `getTasksAsAssigner` 등 | `.or("assigner_id.eq.X,assignee_id.eq.X")` → assignee_id OR task_assignees subquery |
| **task.ts** | `canUpdateTaskStatus` | `isAssignee = assignee_id` (주 담당자만 버튼) - 또는 전체 담당자 허용 시 변경 |
| **message.ts** | `getMessages`, `subscribeMessages`, `mark_message_as_read` | `assignee_id` → assignee_id OR task_assignees (채팅 권한), counterpart 로직: 지시자 ↔ 담당자들 |
| **schedule.ts** | `getSchedulesByUserId` | **변경 없음** (assignee_id = 주 담당자 기준 유지) |
| **task-list.ts** | select | assignee + task_assignees join |

---

### 6. 타입/스키마 (수정 대상)

| 파일 | 변경 내용 |
|------|-----------|
| `src/database.type.ts` | tasks Row에 assignees 관계 추가, TaskWithProfiles 확장 |
| `src/types/schedule.ts` | 필요 시 assignees 추가 |
| `src/schemas/task/task-schema.ts` | `assignee_id` → `assignee_ids: string[]` (최소 1개), 첫 번째 = 주 담당자 |

---

### 7. 프론트엔드 - 컴포넌트 (수정 대상)

| 파일 | 변경 내용 |
|------|-----------|
| **task-form-dialog.tsx** | 단일 Select → Multi Select (assignee_ids), 최소 1명 검증 |
| **task-detail-sheet.tsx** | assignee 1명 → assignees 목록 표시 (주 담당자 강조) |
| **task-detail-dialog.tsx** | 동일 |
| **task-card.tsx** | assigneeDisplay → assigneesDisplay (여러 명 표시) |
| **task-list-item.tsx** | 동일 |
| **kanban-board.tsx** | `assignee_id` → `assignee_id OR assignees 포함` (필터, MY_ASSIGNEE) |
| **kanban-board-with-projects.tsx** | 동일 |

---

### 8. 프론트엔드 - 페이지 (수정 대상)

| 파일 | 변경 내용 |
|------|-----------|
| **task-detail-page.tsx** | `isAssignee`, `counterpartId`, 버튼 disabled 조건, assignees 표시 |
| **member-dashboard-page.tsx** | 버튼 권한 `assignee_id` → 주 담당자만 (assignee_id), assignees 검색/표시 |
| **admin-dashboard-page.tsx** | 동일 |
| **task-list-detail-page.tsx** | assigneeName → assignees 표시 |

---

### 9. 기타 (수정 또는 검토)

| 파일 | 변경 내용 |
|------|-----------|
| `src/lib/task-status.ts` | userRole "assignee" - 주 담당자만 해당 시 로직 유지 |
| `src/lib/project-permissions.ts` | assigner 체크만 있음 → 유지 |
| `src/hooks/mutations/use-task.ts` | createTask 인자 타입 변경 |
| `src/hooks/mutations/__tests__/use-task.test.ts` | 테스트 데이터 수정 |

---

### 10. 변경 불필요 (assignee_id = 주 담당자 유지)

| 항목 | 비고 |
|------|------|
| create_task_schedule 트리거 | assignee_id 그대로 사용 |
| task_schedules RLS | 주 담당자만 일정 조회/수정 시 현재 정책 유지 |
| schedule API | assignee_id 기준 필터 유지 |
| is_self_task 제약 | assigner_id = assignee_id (주 담당자 = 본인일 때) |

---

### 11. 읽음 처리 (message.ts) 상세

현재: `counterpartId` = assigner 또는 assignee 단일 인물  
방안 B:  
- 지시자 메시지 → 담당자 A,B,C 각각 읽음 (read_by에 각자 추가)  
- 담당자 A 메시지 → 지시자 읽음 (counterpartId = assigner_id)  
- 담당자 B 메시지 → 지시자 읽음  
→ `mark_message_as_read`에서 "상대방" = 지시자면 assigner_id, 담당자면 **지시자 1명** (담당자 간 읽음 없음)

---

*작성일: 2025-02-11*  
*상세 체크리스트 추가: 2025-02-11*
