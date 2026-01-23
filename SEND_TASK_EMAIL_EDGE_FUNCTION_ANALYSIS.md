# send-task-email Edge Function 실행 실패 원인 분석 보고서

## 📋 요약

`send-task-email` Edge Function이 실행되지 않는 주요 원인은 **프로젝트 구조 제거 후 이메일 트리거 함수들이 업데이트되지 않았기 때문**입니다. 특히 `send_task_created_email` 함수가 여전히 존재하지 않거나 `project_id`를 참조하고 있어 트리거가 실행되지 않거나 오류가 발생할 가능성이 높습니다.

---

## 🔍 발견된 문제점

### 1. **`send_task_created_email` 함수 누락 또는 미업데이트**

**문제:**
- `complete_refactoring.sql` 마이그레이션에서 `send_task_created_email` 함수가 제거되었거나 업데이트되지 않았습니다.
- 기존 마이그레이션 파일들(`20250101000015_create_task_insert_email_trigger.sql` 등)에서는 `project_id`를 참조하는 함수가 정의되어 있습니다.
- 프로젝트 구조가 제거된 후 이 함수가 `client_name`을 사용하도록 수정되지 않았습니다.

**영향:**
- Task 생성 시 이메일이 발송되지 않습니다.
- 트리거가 존재하지 않거나 오류로 인해 실행되지 않을 수 있습니다.

**관련 코드 위치:**
- `supabase/migrations/20250101000015_create_task_insert_email_trigger.sql` (레거시)
- `supabase/migrations/migrations_refactoring/complete_refactoring.sql` (최신 마이그레이션에서 누락)

---

### 2. **Edge Function 코드와 데이터베이스 트리거 간 데이터 구조 불일치**

**문제:**
- Edge Function(`supabase/functions/send-task-email/index.ts`)은 여전히 `projectTitle`과 `projectId` 필드를 요구합니다.
- 하지만 최신 마이그레이션(`complete_refactoring.sql`)에서는 `send_task_status_change_email` 함수가 `clientName`을 전송하도록 수정되었습니다.
- `send_task_created_email` 함수가 업데이트되지 않아 Task 생성 시 `projectTitle`/`projectId`를 전송하려고 시도할 수 있습니다.

**Edge Function 요구사항 (index.ts:13-32, 405):**
```typescript
interface EmailRequest {
  eventType: "TASK_CREATED" | "STATUS_CHANGED";
  taskId: string;
  assignerEmail: string;
  assigneeEmail: string;
  assignerName?: string;
  assigneeName?: string;
  taskTitle: string;
  taskDescription?: string;
  projectTitle: string;  // ⚠️ 여전히 필수 필드로 요구됨
  projectId?: string;    // ⚠️ 선택 필드
  dueDate?: string;
  // ...
}

// 필수 필드 검증 (index.ts:399-416)
if (
  !emailData.taskId ||
  !emailData.eventType ||
  !emailData.assignerEmail ||
  !emailData.assigneeEmail ||
  !emailData.taskTitle ||
  !emailData.projectTitle ||  // ⚠️ 필수 필드 검증
  !emailData.recipients ||
  emailData.recipients.length === 0
) {
  return new Response(JSON.stringify({ error: "Missing required fields" }), {
    status: 400,
    // ...
  });
}
```

**이메일 템플릿에서 사용 위치:**
- `index.ts:87` - Task 생성 이메일 (담당자용): `${data.projectTitle}`
- `index.ts:159` - Task 생성 이메일 (지시자용): `${data.projectTitle}`
- `index.ts:284` - 상태 변경 이메일: `${data.projectTitle}`

**데이터베이스 트리거 전송 데이터 (complete_refactoring.sql:556-572):**
```sql
-- send_task_status_change_email 함수에서 전송하는 데이터
request_body := jsonb_build_object(
  'eventType', 'STATUS_CHANGED',
  'taskId', NEW.id::TEXT,
  'oldStatus', OLD.task_status,
  'newStatus', NEW.task_status,
  'assignerEmail', assigner_email,
  'assigneeEmail', assignee_email,
  'assignerName', assigner_name,
  'assigneeName', assignee_name,
  'changerId', COALESCE(changer_id::TEXT, ''),
  'changerName', changer_name,
  'taskTitle', NEW.title,
  'taskDescription', NEW.description,
  'clientName', COALESCE(client_name, ''),  -- ✅ clientName 사용
  'dueDate', COALESCE(NEW.due_date::TEXT, ''),
  'recipients', recipients_array
  -- ⚠️ projectTitle, projectId 없음
);
```

**주의:** `send_task_created_email` 함수는 `complete_refactoring.sql`에 정의되어 있지 않습니다. 기존 마이그레이션 파일에서는 `projectTitle`과 `projectId`를 전송하도록 되어 있습니다.

**영향:**
- Edge Function이 `projectTitle`이 필수 필드라고 검증하므로 요청이 실패할 수 있습니다.
- `projectTitle`이 없으면 400 Bad Request 응답을 반환합니다.

**관련 코드 위치:**
- `supabase/functions/send-task-email/index.ts:399-416` (필수 필드 검증)
- `supabase/functions/send-task-email/index.ts:87, 159, 284` (템플릿에서 `projectTitle` 사용)

---

### 3. **트리거가 존재하지 않거나 비활성화됨**

**문제:**
- `complete_refactoring.sql`에서 `send_task_created_email` 함수가 정의되지 않았으므로, 해당 트리거도 생성되지 않았을 가능성이 높습니다.
- 기존 트리거가 존재하더라도 `project_id` 컬럼이 제거되어 함수 실행 시 오류가 발생할 수 있습니다.

**확인 필요 사항:**
```sql
-- 다음 쿼리로 트리거 존재 여부 확인 필요
SELECT trigger_name, event_manipulation, event_object_table, action_statement
FROM information_schema.triggers
WHERE event_object_table = 'tasks'
  AND trigger_name LIKE '%email%';
```

**영향:**
- Task 생성 시 이메일 트리거가 실행되지 않습니다.
- Task 상태 변경 시 이메일은 `send_task_status_change_email` 함수가 있으므로 작동할 수 있지만, 데이터 구조 불일치로 실패할 수 있습니다.

---

### 4. **Edge Function URL 및 Service Role Key 불일치 가능성**

**문제:**
- `complete_refactoring.sql`에서 하드코딩된 Edge Function URL과 Service Role Key가 있습니다:
  - URL: `https://mbwmxowoyvaxmtnigjwa.supabase.co/functions/v1/send-task-email`
  - Service Role Key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
- 실제 프로덕션 환경의 프로젝트 참조와 키가 다를 수 있습니다.

**영향:**
- 잘못된 URL로 요청이 전송되어 404 Not Found 또는 인증 실패가 발생할 수 있습니다.
- 잘못된 Service Role Key로 인증 실패가 발생할 수 있습니다.

**관련 코드 위치:**
- `supabase/migrations/migrations_refactoring/complete_refactoring.sql:579, 583`
- `supabase/migrations/migrations_refactoring/04_functions_triggers.sql:151, 155`

---

### 5. **Edge Function 배포 상태 불확실**

**확인 필요 사항:**
- Edge Function이 실제로 배포되어 있는지 확인 필요
- Edge Function이 활성화되어 있는지 확인 필요
- Edge Function의 환경 변수(SMTP_USER, SMTP_PASS, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)가 설정되어 있는지 확인 필요

**확인 방법:**
```bash
# Edge Function 목록 확인
supabase functions list --project-ref <project-ref>

# Edge Function 로그 확인
supabase functions logs send-task-email --project-ref <project-ref> --limit 50

# Edge Function 환경 변수 확인 (Supabase Dashboard)
# Dashboard → Edge Functions → send-task-email → Settings → Secrets
```

---

## 🔧 해결 방안 (참고용 - 코드 작성 금지)

### 우선순위 1: Edge Function 코드 업데이트

1. **`projectTitle`/`projectId`를 `clientName`으로 변경**
   - `EmailRequest` 인터페이스 수정 (`index.ts:13-32`)
     - `projectTitle: string` → `clientName?: string` (선택 필드로 변경)
     - `projectId?: string` 제거
   - 필수 필드 검증 로직 수정 (`index.ts:399-416`)
     - `!emailData.projectTitle` 검증 제거
   - 이메일 템플릿에서 `projectTitle` 대신 `clientName` 사용
     - `index.ts:87` - Task 생성 이메일 (담당자용)
     - `index.ts:159` - Task 생성 이메일 (지시자용)
     - `index.ts:284` - 상태 변경 이메일
     - 템플릿에서 "프로젝트:" 라벨을 "고객명:" 또는 "고객:"으로 변경

2. **이메일 템플릿 업데이트**
   - `getEmailTemplate` 함수에서 `projectTitle` 대신 `clientName` 사용
   - 프로젝트 관련 텍스트를 고객명으로 변경

### 우선순위 2: 데이터베이스 트리거 함수 생성/수정

1. **`send_task_created_email` 함수 생성**
   - `complete_refactoring.sql`에 추가 필요
   - `client_name` 사용하도록 작성
   - `project_id`/`project_title` 제거
   - Edge Function에 `clientName` 전송 (필수 필드가 아니므로 빈 문자열도 가능)
   - `send_task_status_change_email` 함수와 동일한 패턴으로 작성

2. **트리거 생성**
   ```sql
   CREATE TRIGGER trigger_send_task_created_email
     AFTER INSERT ON public.tasks
     FOR EACH ROW
     EXECUTE FUNCTION public.send_task_created_email();
   ```

3. **기존 트리거 확인 및 정리**
   - 기존 `trigger_send_task_created_email` 트리거가 존재하는지 확인
   - 존재한다면 DROP 후 재생성
   - `trigger_send_task_status_change_email` 트리거는 이미 존재하므로 확인만 필요

### 우선순위 3: 환경 설정 확인

1. **Edge Function URL 및 Service Role Key 확인**
   - 실제 프로덕션 환경의 프로젝트 참조 확인
   - 올바른 Service Role Key 사용

2. **Edge Function 환경 변수 확인**
   - SMTP_USER, SMTP_PASS 설정 확인
   - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 설정 확인

---

## 📊 문제 발생 가능성 매트릭스

| 문제 | 발생 가능성 | 영향도 | 우선순위 |
|------|------------|--------|----------|
| `send_task_created_email` 함수 누락 | 높음 | 높음 | 🔴 최우선 |
| Edge Function 데이터 구조 불일치 | 높음 | 높음 | 🔴 최우선 |
| 트리거 미생성/비활성화 | 중간 | 높음 | 🟡 높음 |
| Edge Function URL/Key 불일치 | 중간 | 중간 | 🟡 높음 |
| Edge Function 미배포/비활성화 | 낮음 | 높음 | 🟢 중간 |

---

## 🔍 추가 조사 필요 사항

### 1. 데이터베이스 트리거 및 함수 확인

```sql
-- 트리거 존재 여부 확인
SELECT 
  trigger_name, 
  event_manipulation, 
  event_object_table, 
  action_statement,
  action_timing
FROM information_schema.triggers
WHERE event_object_table = 'tasks'
  AND (trigger_name LIKE '%email%' OR trigger_name LIKE '%task%');

-- 함수 존재 여부 확인
SELECT 
  routine_name,
  routine_type,
  routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('send_task_created_email', 'send_task_status_change_email');

-- 함수 정의 확인 (상세)
SELECT pg_get_functiondef(oid) 
FROM pg_proc 
WHERE proname IN ('send_task_created_email', 'send_task_status_change_email');
```

### 2. 데이터베이스 로그 확인

```sql
-- PostgreSQL 로그에서 EMAIL_TRIGGER 관련 메시지 확인
-- Supabase Dashboard → Database → Logs에서 확인
-- 또는 Supabase CLI 사용:
-- supabase db logs --project-ref <project-ref>

-- 로그에서 다음 메시지들을 찾아보세요:
-- [EMAIL_TRIGGER] Task created: <task-id>
-- [EMAIL_TRIGGER] Status changed: <old-status> -> <new-status> (task: <task-id>)
-- [EMAIL_TRIGGER] Calling Edge Function: <url>
-- [EMAIL_TRIGGER] HTTP request submitted with ID: <id>
-- [EMAIL_TRIGGER] Failed to send email notification: <error>
```

### 3. Edge Function 로그 확인

```bash
# Supabase CLI로 로그 확인
supabase functions logs send-task-email --project-ref <project-ref> --limit 50

# 또는 Supabase Dashboard에서 확인
# Dashboard → Edge Functions → send-task-email → Logs
```

**확인할 로그 메시지:**
- `[send-task-email] Request received:` - 요청이 도달했는지 확인
- `[send-task-email] Email data received:` - 데이터 구조 확인
- `[send-task-email] Missing required fields` - 필수 필드 누락 오류
- `[send-task-email] SMTP credentials not configured` - SMTP 설정 오류
- `[send-task-email] Error sending email:` - 이메일 발송 오류

### 4. 트리거 실행 테스트

```sql
-- 테스트 Task 생성하여 트리거 실행 확인
-- 주의: 실제 프로필 ID를 사용해야 합니다
INSERT INTO tasks (
  title, 
  assigner_id, 
  assignee_id, 
  task_category, 
  due_date,
  client_name,
  created_by
)
VALUES (
  'Test Task for Email Trigger', 
  '<assigner-uuid>',  -- 실제 assigner 프로필 ID
  '<assignee-uuid>',  -- 실제 assignee 프로필 ID
  'REVIEW', 
  NOW() + INTERVAL '7 days',
  'Test Client',
  '<assigner-uuid>'   -- created_by는 assigner와 동일
);

-- 로그에서 다음을 확인:
-- 1. 트리거가 실행되었는지 ([EMAIL_TRIGGER] 메시지)
-- 2. Edge Function에 요청이 전송되었는지
-- 3. Edge Function에서 오류가 발생했는지
```

### 5. HTTP 요청 확인

```sql
-- net.http_post 요청 상태 확인
-- http_response_id를 사용하여 요청 상태 조회
SELECT 
  id,
  url,
  method,
  status_code,
  content,
  created_at
FROM net.http_request_queue
WHERE url LIKE '%send-task-email%'
ORDER BY created_at DESC
LIMIT 10;

-- 또는 net.http_response 테이블 확인 (응답이 있는 경우)
SELECT 
  id,
  request_id,
  status_code,
  content,
  created_at
FROM net.http_response
WHERE request_id IN (
  SELECT id FROM net.http_request_queue 
  WHERE url LIKE '%send-task-email%'
  ORDER BY created_at DESC
  LIMIT 10
);
```

### 6. Edge Function 배포 상태 확인

```bash
# Edge Function 목록 확인
supabase functions list --project-ref <project-ref>

# Edge Function 상세 정보 확인
supabase functions describe send-task-email --project-ref <project-ref>

# Edge Function 환경 변수 확인 (Dashboard에서)
# Dashboard → Edge Functions → send-task-email → Settings → Secrets
# 다음 변수들이 설정되어 있어야 합니다:
# - SMTP_USER
# - SMTP_PASS
# - SUPABASE_URL
# - SUPABASE_SERVICE_ROLE_KEY
# - FRONTEND_URL (선택)
```

### 7. 수동 Edge Function 호출 테스트

```bash
# Edge Function을 수동으로 호출하여 테스트
curl -X POST \
  'https://<project-ref>.supabase.co/functions/v1/send-task-email' \
  -H 'Authorization: Bearer <service-role-key>' \
  -H 'Content-Type: application/json' \
  -d '{
    "eventType": "TASK_CREATED",
    "taskId": "test-task-id",
    "assignerEmail": "assigner@example.com",
    "assigneeEmail": "assignee@example.com",
    "assignerName": "Test Assigner",
    "assigneeName": "Test Assignee",
    "taskTitle": "Test Task",
    "taskDescription": "Test Description",
    "projectTitle": "Test Project",
    "dueDate": "2025-01-30",
    "recipients": ["assigner", "assignee"]
  }'

# 또는 clientName을 사용한 테스트 (수정 후)
curl -X POST \
  'https://<project-ref>.supabase.co/functions/v1/send-task-email' \
  -H 'Authorization: Bearer <service-role-key>' \
  -H 'Content-Type: application/json' \
  -d '{
    "eventType": "TASK_CREATED",
    "taskId": "test-task-id",
    "assignerEmail": "assigner@example.com",
    "assigneeEmail": "assignee@example.com",
    "assignerName": "Test Assigner",
    "assigneeName": "Test Assignee",
    "taskTitle": "Test Task",
    "taskDescription": "Test Description",
    "clientName": "Test Client",
    "dueDate": "2025-01-30",
    "recipients": ["assigner", "assignee"]
  }'
```

---

## 📝 결론

`send-task-email` Edge Function이 실행되지 않는 주요 원인은:

1. **`send_task_created_email` 함수가 프로젝트 구조 제거 후 업데이트되지 않음**
   - `complete_refactoring.sql`에 함수 정의가 없음
   - 기존 함수가 `project_id`를 참조하여 오류 발생 가능

2. **Edge Function 코드가 여전히 `projectTitle`/`projectId`를 요구하지만, 트리거는 `clientName`을 전송**
   - Edge Function의 필수 필드 검증에서 `projectTitle` 요구
   - 데이터베이스 트리거는 `clientName`만 전송
   - 요청이 400 Bad Request로 실패

3. **트리거가 생성되지 않았거나 오류로 인해 실행되지 않음**
   - `trigger_send_task_created_email` 트리거가 존재하지 않을 가능성
   - 함수 오류로 인해 트리거 실행 실패 가능

4. **Edge Function URL 및 Service Role Key 불일치 가능성**
   - 하드코딩된 URL/Key가 실제 환경과 다를 수 있음

**해결 방법:**
이러한 문제들을 해결하려면:
1. Edge Function 코드를 업데이트하여 `clientName`을 사용하도록 수정
2. `send_task_created_email` 함수를 생성/수정하여 `client_name` 사용
3. 트리거가 올바르게 생성되어 있는지 확인
4. Edge Function URL 및 Service Role Key가 올바른지 확인
5. Edge Function이 배포되어 있고 환경 변수가 설정되어 있는지 확인

---

## 📌 다음 단계 권장 사항

1. **즉시 확인 필요:**
   - 데이터베이스에서 트리거 및 함수 존재 여부 확인 (위의 SQL 쿼리 사용)
   - Edge Function 로그 확인하여 실제 오류 메시지 확인
   - Edge Function 배포 상태 및 환경 변수 확인

2. **수정 작업 (코드 작성 금지이므로 참고용):**
   - Edge Function 코드 수정 (`projectTitle` → `clientName`)
   - `send_task_created_email` 함수 생성/수정
   - 트리거 생성/재생성
   - 테스트 및 검증

3. **모니터링:**
   - 이메일 발송 성공률 모니터링
   - Edge Function 로그 정기 확인
   - 데이터베이스 트리거 로그 확인
