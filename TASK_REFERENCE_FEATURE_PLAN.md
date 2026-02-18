# Task 참조자(Reference) 기능 마이그레이션 및 프론트엔드 계획서

> **목표**: Task 생성 시 담당자 1명 + 참조자 n명 선택 지원. 참조자는 채팅·읽음·참조자 전용 이메일만, 일정·알림·상태 변경은 담당자만.

---

## 📋 기능 요약

| 구분 | 담당자 (1명) | 참조자 (n명) |
|------|--------------|--------------|
| **선택** | Task 생성 시 1명 (기존) | Task 생성 시 다중 선택 (신규) |
| **채팅** | ✅ | ✅ |
| **읽음 처리** | ✅ | ✅ (지시자·담당자·참조자 전원) |
| **상태 변경** | ✅ | ❌ |
| **이메일** | 기존 send-task-email | 참조자 전용 Edge Function |
| **알림** | 기존 (마감일 등) | ❌ |
| **일정** | ✅ | ❌ |
| **표시** | 담당 업무 탭 | 참조된 업무 탭 (신규) |

---

## 📊 읽음 처리 정책 (신규)

### 원칙
- **참여자**: 지시자 + 담당자 + 참조자
- **읽음 표시**: `미읽음 인원 수` → `0`이면 "읽음"
- 예: "2" (2명 미읽음) → "1" → "읽음" (0)

### 계산 식
```
총 참여자 = assigner_id + assignee_id + task_references.user_ids
읽음 대상 수 = 총 참여자 - 1(작성자)
미읽음 수 = 읽음 대상 수 - read_by.length
```

---

## Phase 1: 데이터베이스 마이그레이션

### 1.1 task_references 테이블 생성

**파일**: `supabase/migrations/YYYYMMDD000001_create_task_references.sql`

```sql
-- task_references: Task 참조자 (협력자) 테이블
CREATE TABLE public.task_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(task_id, user_id)
);

-- 인덱스
CREATE INDEX idx_task_references_task_id ON public.task_references(task_id);
CREATE INDEX idx_task_references_user_id ON public.task_references(user_id);

-- RLS
ALTER TABLE public.task_references ENABLE ROW LEVEL SECURITY;

-- SELECT: task 접근 권한이 있는 사용자 (assigner, assignee, 참조자, admin)
-- INSERT/DELETE: assigner만 (Task 생성 시, 수정 시)
-- (구체 정책은 기존 tasks 정책과 연동)
```

### 1.2 RLS 정책

**task_references 정책**:
- **SELECT**: `auth.uid() = assigner_id OR auth.uid() = assignee_id OR EXISTS(SELECT 1 FROM task_references WHERE task_id = tasks.id AND user_id = auth.uid()) OR is_admin(auth.uid())`
- **INSERT**: assigner 또는 admin (Task 소유자만 참조자 추가)
- **DELETE**: assigner 또는 admin

**messages 정책** (수정):
- 현재: `messages_select_admin_or_assigned_or_public` - assigner, assignee, admin, 공개 Task
- 변경: 비공개 Task 조건에 `OR EXISTS(SELECT 1 FROM task_references WHERE task_id = tasks.id AND user_id = auth.uid())` 추가

**messages INSERT 정책** (수정):
- 현재: `messages_insert_assigner_or_assignee_only` - assigner, assignee만
- 변경: 참조자 추가 - `OR EXISTS(SELECT 1 FROM task_references ...)`

**tasks 정책**:
- SELECT: 기존 `tasks_select_admin_or_assigned` 등에 참조자 조건 추가 (참조자도 Task 상세 조회 가능)

### 1.3 읽음 처리 함수 수정

**파일**: `supabase/migrations/YYYYMMDD000002_update_read_functions_for_references.sql`

**mark_message_as_read**:
- reader가 assigner, assignee, **참조자** 중 하나인지 확인
- 참조자 판단: `EXISTS(SELECT 1 FROM task_references WHERE task_id = t.id AND user_id = reader_id)`
- 읽음 조건: 보낸 사람이 참여자(assigner/assignee/참조자) 중 한 명이고, 읽는 사람도 참여자면 read_by에 추가

**mark_task_messages_as_read**:
- 동일하게 참조자 포함

---

## Phase 2: 이메일 - 참조자 전용 Edge Function

### 2.1 새 Edge Function 생성

**파일**: `supabase/functions/send-task-reference-email/index.ts`

**역할**:
- 참조자 전용 이메일 발송 (지시자·담당자 제외)
- 수신자: `referenceEmails[]` (배열)
- 내용: "○○ 업무에 참조자로 추가되었습니다. 채팅 참여 및 진행 상황 확인이 가능합니다."
- Task 상세 링크 포함

**요청 본문 예시**:
```json
{
  "eventType": "TASK_REFERENCE_ADDED",
  "taskId": "uuid",
  "taskTitle": "업무 제목",
  "assignerName": "지시자명",
  "assigneeName": "담당자명",
  "referenceEmails": ["ref1@...", "ref2@..."],
  "referenceNames": ["참조자1", "참조자2"],
  "dueDate": "2025-02-15"
}
```

### 2.2 트리거 생성

**파일**: `supabase/migrations/YYYYMMDD000003_create_reference_email_trigger.sql`

- **AFTER INSERT ON task_references**: Task 생성 시 참조자가 있으면 호출
- 트리거에서 task_references 조회 → 참조자 이메일/이름 수집 → `net.http_post`로 `send-task-reference-email` 호출

**참고**: Task 생성이 1회 INSERT이므로, task_references는 Task INSERT 후 별도 INSERT. 트리거는 `task_references` INSERT 시에만 동작.

---

## Phase 3: API 수정

### 3.1 task.ts

| 함수 | 변경 내용 |
|------|-----------|
| **createTask** | `reference_ids?: string[]` 추가. Task INSERT 후 task_references bulk insert |
| **getTaskById** | task_references join, `references: Profile[]` 반환 |
| **TaskWithProfiles 타입** | `references?: { id, full_name, email, avatar_url }[]` 추가 |
| **getTasksByUserId** | "참조된 Task" 조회 함수 추가 (`getTasksAsReference`) |
| **getTasksAsAssigner** | 기존 유지 |

### 3.2 message.ts

| 함수 | 변경 내용 |
|------|-----------|
| **sendMessage**, **uploadFileMessage** | 권한: assigner OR assignee OR **참조자** |
| **getMessagesByTaskId** | Task 접근 권한에 참조자 포함 (RLS로 처리 가능) |
| **isMessageReadByCounterpart** | "상대방" 개념 제거, **미읽음 인원 수** 반환 |
| **getUnreadCountForMessage** | `총 참여자 - 1 - read_by.length` |

### 3.3 message 권한 체크 로직

```typescript
// 참조자 판단: task.references?.some(r => r.id === userId) 또는 API에서 task_references 조회
const canSendMessage = 
  userId === task.assigner_id || 
  userId === task.assignee_id || 
  task.references?.some(r => r.id === userId);
```

---

## Phase 4: 프론트엔드 수정

### 4.1 Task 생성 폼 (task-form-dialog.tsx)

| 항목 | 변경 내용 |
|------|-----------|
| **담당자** | 기존 단일 Select 유지 |
| **참조자** | 새로 추가: Multi Select (선택 사항, 0명 가능) |
| **스키마** | `reference_ids?: string[]` 추가 |
| **제출 데이터** | `assignee_id` + `reference_ids` 전달 |

### 4.2 Task 상세/카드/시트 (표시)

| 파일 | 변경 내용 |
|------|-----------|
| **task-detail-page.tsx** | 참조자 목록 표시, 채팅 권한에 참조자 포함 |
| **task-detail-sheet.tsx** | 참조자 섹션 추가 |
| **task-detail-dialog.tsx** | 참조자 섹션 추가 |
| **task-card.tsx** | 참조자 수 또는 "참조자: N명" 표시 (선택) |
| **task-list-item.tsx** | 동일 |

### 4.3 읽음 표시 UI (task-detail-page.tsx)

| 현재 | 변경 |
|------|------|
| "읽음" (boolean) | "N명 미읽음" 또는 "읽음" (0명) |
| `isMessageReadByCounterpart` | `getUnreadCountForMessage(message, task)` → 숫자 반환 |

### 4.4 대시보드 탭

#### member-dashboard-page.tsx

| 탭 | 변경 내용 |
|------|-----------|
| **담당 업무** | 기존: assigner OR assignee. 참조자 제외 유지 |
| **참조된 업무** | **신규 탭**: `getTasksAsReference`로 참조자인 Task 조회 |
| **승인된 태스크** | 기존 유지. 참조된 Task가 승인되면 참조자도 목록에 표시 (선택: "참조를 통해 승인" 컬럼) |
| **개인 태스크** | 기존 유지 |

#### admin-dashboard-page.tsx

| 탭 | 변경 내용 |
|------|-----------|
| **담당 업무** | 기존 유지 |
| **참조된 업무** | **신규 탭** (admin도 본인이 참조자인 Task 조회) |
| **전체 태스크 / 승인된 태스크 / 개인 태스크** | 기존 유지 |

### 4.5 칸반 (kanban-board, kanban-board-with-projects)

| 항목 | 변경 내용 |
|------|-----------|
| **MY_ASSIGNEE** | 기존 유지 (담당자만) |
| **MY_TASKS** | `assigner_id OR assignee_id` → `assigner_id OR assignee_id OR 참조자` 포함 여부 결정 |
| **필터 라벨** | "내가 관련된 Task"에 참조 포함 시 설명 추가 |

### 4.6 Task 목록 (task-list-detail-page)

- 참조자 표시 (지시자/담당자/참조자)
- **task_list_items INSERT 정책**: 참조자인 Task도 목록에 추가 가능하도록 `OR EXISTS(SELECT 1 FROM task_references WHERE ...)` 조건 추가

---

## Phase 5: 스키마/타입

### 5.1 task-schema.ts

```typescript
// taskCreateSchema에 추가
reference_ids: z.array(z.string().uuid()).optional().default([])

// TaskCreateFormData
reference_ids?: string[];
```

### 5.2 database.type.ts

- `task_references` 테이블 타입 생성 (Supabase 타입 재생성)
- `TaskWithProfiles`에 `references?: Profile[]` 추가

---

## Phase 6: 변경 불필요 (유지)

| 영역 | 비고 |
|------|------|
| **이메일** (담당자/지시자) | send-task-email 기존 로직 유지 |
| **알림** | check-due-date-approaching 등 기존 로직 유지 (담당자만) |
| **일정** | create_task_schedule, task_schedules 기존 유지 |
| **상태 변경** | 담당자만 버튼 노출 (기존) |
| **can_access_profile** | 참조자 추가 시 연동 검토 (같은 Task 참조자끼리 프로필 조회 가능) |

---

## 📝 파일별 수정 체크리스트

### 데이터베이스 (신규 마이그레이션)
- [ ] `create_task_references.sql` - 테이블 생성, RLS
- [ ] `update_read_functions_for_references.sql` - mark_message_as_read, mark_task_messages_as_read
- [ ] `update_messages_rls_for_references.sql` - messages SELECT/INSERT에 참조자 포함
- [ ] `update_tasks_rls_for_references.sql` - tasks SELECT에 참조자 포함
- [ ] `update_task_list_items_rls_for_references.sql` - task_list_items INSERT에 참조자 포함, remove_task_from_lists_on_unpublish에 참조자 목록 유지 추가
- [ ] `create_reference_email_trigger.sql` - task_references INSERT 시 참조자 이메일 트리거

### Edge Function (신규)
- [ ] `send-task-reference-email/index.ts` - 참조자 전용 이메일

### API
- [ ] `src/api/task.ts` - createTask, getTaskById, getTasksAsReference
- [ ] `src/api/message.ts` - sendMessage 등 권한, isMessageReadByCounterpart → getUnreadCountForMessage

### 프론트엔드
- [ ] `src/schemas/task/task-schema.ts` - reference_ids
- [ ] `src/components/task/task-form-dialog.tsx` - 참조자 Multi Select
- [ ] `src/pages/task-detail-page.tsx` - 참조자 표시, 읽음 수, 채팅 권한
- [ ] `src/pages/member-dashboard-page.tsx` - 참조된 업무 탭
- [ ] `src/pages/admin-dashboard-page.tsx` - 참조된 업무 탭
- [ ] `src/components/task/task-detail-sheet.tsx` - 참조자 섹션
- [ ] `src/components/task/task-detail-dialog.tsx` - 참조자 섹션
- [ ] `src/components/task/task-card.tsx` - 참조자 표시
- [ ] `src/components/task-list/task-list-item.tsx` - 참조자 표시
- [ ] `src/components/task/kanban-board.tsx` - MY_TASKS에 참조자 포함 여부
- [ ] `src/components/task/kanban-board-with-projects.tsx` - 동일

### 타입
- [ ] `src/database.type.ts` - task_references, TaskWithProfiles 확장

---

## ⏱ 예상 공수

| Phase | 예상 |
|-------|------|
| Phase 1 (DB) | 1일 |
| Phase 2 (Edge Function) | 0.5일 |
| Phase 3 (API) | 1일 |
| Phase 4 (프론트엔드) | 2일 |
| Phase 5 (스키마/타입) | 0.5일 |
| 테스트 및 버그 수정 | 1일 |
| **총합** | **약 6일** |

---

## 🚨 주의사항

1. **task_references INSERT 시점**: Task 생성 API에서 Task INSERT → task_references INSERT 순서. 트리거는 task_references INSERT 시 동작.
2. **참조자 중복**: 담당자를 참조자로 선택하지 않도록 UI에서 차단 (선택 사항).
3. **승인된 Task의 참조자**: "참조를 통해 승인" 표시는 metadata 또는 별도 컬럼으로 구현 가능. Phase 1에서 필수는 아님.

---

*작성일: 2025-02-11*
