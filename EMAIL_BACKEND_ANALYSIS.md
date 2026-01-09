# 이메일 발송 백엔드 전체 분석 보고서

## 📋 현재 설정 상태

### ✅ Supabase Secrets 설정 (확인됨)
이미지에서 확인된 Secrets:
- ✅ `SUPABASE_URL`: 설정됨
- ✅ `SUPABASE_SERVICE_ROLE_KEY`: 설정됨  
- ✅ `SMTP_USER`: 설정됨
- ✅ `SMTP_PASS`: 설정됨
- ✅ `FRONTEND_URL`: 설정됨

### 🔍 백엔드 구조 분석

## 1. 트리거 함수 구조

### 1.1 Task 생성 시 이메일 발송
**트리거**: `trigger_send_task_created_email`
- **이벤트**: `AFTER INSERT ON public.tasks`
- **함수**: `send_task_created_email()`
- **마이그레이션 파일**:
  - `20250101000015_create_task_insert_email_trigger.sql` (초기 생성)
  - `20250101000025_fix_task_created_email_trigger_http_post.sql` (http_post 형식 수정)
  - `20250101000026_ensure_hardcoded_email_triggers.sql` (하드코딩 방식)

### 1.2 Task 상태 변경 시 이메일 발송
**트리거**: `trigger_send_task_status_change_email`
- **이벤트**: `AFTER UPDATE OF task_status ON public.tasks`
- **함수**: `send_task_status_change_email()`
- **마이그레이션 파일**:
  - `20250101000010_create_task_status_change_trigger.sql` (초기 생성)
  - `20250101000022_add_rejected_to_in_progress_email_trigger.sql` (REJECTED→IN_PROGRESS 추가)
  - `20250101000024_fix_status_change_email_trigger_hardcoded.sql` (하드코딩 방식)
  - `20250101000026_ensure_hardcoded_email_triggers.sql` (하드코딩 방식)

## 2. 문제점 분석

### ⚠️ 문제 1: net.http_post 함수 시그니처 불일치

**발견된 두 가지 형식:**

#### 형식 A (구버전 - 일부 마이그레이션):
```sql
PERFORM net.http_post(
  url := function_url,
  headers := jsonb_build_object(...),
  body := request_body::text
);
```

#### 형식 B (신버전 - 최신 마이그레이션):
```sql
PERFORM net.http_post(
  url := function_url,
  body := request_body,
  params := '{}'::jsonb,
  headers := jsonb_build_object(...)
);
```

**문제**: Supabase의 `pg_net` 확장에서 실제로 지원하는 형식이 무엇인지 확인 필요

### ⚠️ 문제 2: 트리거 실행 여부 확인 불가

트리거가 실제로 실행되는지 확인할 방법이 없음:
- 트리거 함수 내부에 로깅이 없음
- `RAISE WARNING`만 사용하지만 실제로 로그에 남는지 불확실

### ⚠️ 문제 3: Edge Function 호출 실패 시 조용히 실패

트리거 함수에서:
```sql
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to send email notification: %', SQLERRM;
    RETURN NEW;
END;
```

- 에러가 발생해도 트랜잭션은 성공
- 실제 에러 내용을 확인하기 어려움

## 3. 확인 필요 사항

### 3.1 데이터베이스 상태 확인

다음 SQL을 실행하여 현재 상태 확인:

```sql
-- 1. 트리거 존재 및 활성화 확인
SELECT tgname, tgenabled, tgrelid::regclass
FROM pg_trigger
WHERE tgname IN ('trigger_send_task_created_email', 'trigger_send_task_status_change_email');

-- 2. 트리거 함수 존재 확인
SELECT proname, prosrc
FROM pg_proc
WHERE proname IN ('send_task_created_email', 'send_task_status_change_email');

-- 3. pg_net 확장 확인
SELECT * FROM pg_extension WHERE extname = 'pg_net';

-- 4. net.http_post 함수 시그니처 확인
SELECT pg_get_function_arguments(oid), pg_get_function_result(oid)
FROM pg_proc
WHERE proname = 'http_post' AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'net');
```

### 3.2 Edge Function 배포 확인

```bash
# Edge Function 목록 확인
supabase functions list --project-ref dcovjxmrqomuuwcgiwie

# Edge Function 로그 확인
supabase functions logs send-task-email --project-ref dcovjxmrqomuuwcgiwie
```

### 3.3 이메일 로그 확인

```sql
-- 최근 이메일 발송 시도 확인
SELECT * FROM public.email_logs ORDER BY created_at DESC LIMIT 20;

-- 실패한 이메일 확인
SELECT * FROM public.email_logs WHERE status = 'failed' ORDER BY created_at DESC;
```

## 4. 해결 방안

### 방안 1: 트리거 함수에 로깅 추가

트리거 함수 실행 여부를 확인하기 위해 로깅 추가:

```sql
-- 트리거 함수 시작 시 로그
RAISE NOTICE 'Trigger executed: % -> %', OLD.task_status, NEW.task_status;

-- Edge Function 호출 전 로그
RAISE NOTICE 'Calling Edge Function: %', function_url;

-- Edge Function 호출 후 로그 (성공/실패)
```

### 방안 2: net.http_post 시그니처 통일

Supabase 문서에 따르면 `net.http_post`는 다음 형식을 지원:
- `net.http_post(url text, headers jsonb, body text)`

하지만 named parameter를 사용하면 순서가 중요하지 않을 수 있음.

### 방안 3: Edge Function 직접 테스트

트리거를 거치지 않고 Edge Function을 직접 호출하여 테스트:

```bash
curl -X POST \
  'https://dcovjxmrqomuuwcgiwie.supabase.co/functions/v1/send-task-email' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "eventType": "STATUS_CHANGED",
    "taskId": "test-id",
    "oldStatus": "ASSIGNED",
    "newStatus": "IN_PROGRESS",
    "assignerEmail": "assigner@example.com",
    "assigneeEmail": "assignee@example.com",
    "assignerName": "지시자",
    "assigneeName": "담당자",
    "taskTitle": "테스트 Task",
    "projectTitle": "테스트 프로젝트",
    "recipients": ["assigner", "assignee"]
  }'
```

## 5. 권장 조치 사항

1. **즉시 실행**: `EMAIL_DIAGNOSIS.sql` 파일을 Supabase Dashboard에서 실행하여 현재 상태 확인
2. **트리거 함수 수정**: 로깅 추가 및 에러 처리 개선
3. **Edge Function 로그 확인**: 실제로 호출되는지 확인
4. **이메일 로그 확인**: `email_logs` 테이블에서 발송 시도 기록 확인


