# send-task-reference-email 이메일 발송 조건

`send-task-reference-email` Edge Function은 **언제** 참조자에게 이메일을 보내는지 정리한 문서입니다.

## 1. 발송 시점 요약

| 이벤트 | 트리거 | 조건 | 이메일 제목 |
|--------|--------|------|-------------|
| **REFERENCE_ADDED** | `task_references` INSERT | 참조자 1명 이상 | `[Tasko] 업무에 참조자로 추가되었습니다(업무명)` |
| **STATUS_CHANGED** | `tasks` UPDATE OF task_status | 아래 조건 충족 시 | `[Tasko] 업무 상태가 변경되었습니다(업무명)` |

---

## 2. REFERENCE_ADDED (참조자 추가)

**트리거:** `trigger_send_reference_email`  
**테이블:** `task_references`  
**이벤트:** INSERT (참조자 추가)

### 발송 조건
- 해당 Task에 참조자가 1명 이상 새로 추가된 경우
- Task 생성 시 참조자 여러 명을 한 번에 추가해도 **1회만** 발송 (FOR EACH STATEMENT)

### 제외 조건
- 없음 (참조자가 있으면 발송)

### 이메일 내용
- “○○님, 업무에 참조자로 추가되었습니다”
- 지시사항, 마감일, 지시자, 담당자 등 기본 업무 정보 포함

---

## 3. STATUS_CHANGED (상태 변경)

**트리거:** `trigger_send_reference_email_on_status_change`  
**테이블:** `tasks`  
**이벤트:** UPDATE OF task_status

### 발송 조건
모두 만족해야 함:
1. `task_status`가 실제로 변경됨
2. `is_self_task = false` (자기 할당 Task 아님)
3. `assignee_id`가 존재함
4. `task_references`에 참조자가 1명 이상 존재

### 제외 조건 (이메일 미발송)
다음 중 하나에 해당하면 발송하지 않음:

| 조건 | 설명 |
|------|------|
| `task_status` 미변경 | 이전과 동일한 상태 |
| `is_self_task = true` | 자기 할당 Task |
| `assignee_id` 없음 | 담당자 미지정 |
| 참조자 0명 | `task_references`에 해당 task_id 없음 |
| **ASSIGNED → IN_PROGRESS** | 담당자가 “업무 시작”만 한 경우 (send-task-email과 동일) |
| **REJECTED → IN_PROGRESS** | 담당자가 “업무 재시작”만 한 경우 (send-task-email과 동일) |

### 발송되는 상태 전환 예시
- ASSIGNED (할당됨) → 기타
- IN_PROGRESS → WAITING_CONFIRM (완료 요청)
- WAITING_CONFIRM → APPROVED (승인)
- WAITING_CONFIRM → REJECTED (거절)
- REJECTED → IN_PROGRESS 제외, 그 외 전환

### 이메일 내용
- “○○님, 참조 중인 업무의 상태가 변경되었습니다”
- 이전 상태 → 새 상태 표시
- 변경자 이름 표시

---

## 4. 관련 파일

| 파일 | 역할 |
|------|------|
| `supabase/functions/send-task-reference-email/index.ts` | 이메일 발송 로직 및 템플릿 |
| `supabase/migrations/multi-chat/20260212000005_create_reference_email_trigger.sql` | REFERENCE_ADDED 트리거 |
| `supabase/migrations/multi-chat/20260212000009_reference_email_on_status_change.sql` | STATUS_CHANGED 트리거 |

---

## 5. 배포 후 확인

- `app.supabase_service_role_key` 설정 필요 (트리거가 Edge Function 호출 시 사용)
- Supabase 프로젝트 URL이 마이그레이션의 `v_function_url`과 일치하는지 확인
