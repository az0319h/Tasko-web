# 이메일 발송 디버깅 가이드

## 문제 진단 체크리스트

### 1. 트리거 함수 확인

트리거가 제대로 실행되는지 확인:

```sql
-- 트리거 존재 확인
SELECT tgname, tgtype, tgenabled 
FROM pg_trigger 
WHERE tgname IN ('trigger_send_task_created_email', 'trigger_send_task_status_change_email');

-- 트리거 함수 확인
SELECT proname, prosrc 
FROM pg_proc 
WHERE proname IN ('send_task_created_email', 'send_task_status_change_email');
```

### 2. Edge Function 배포 확인

```bash
# Edge Function 목록 확인
supabase functions list --project-ref dcovjxmrqomuuwcgiwie

# Edge Function 로그 확인
supabase functions logs send-task-email --project-ref dcovjxmrqomuuwcgiwie
```

### 3. SMTP 설정 확인

Supabase Dashboard에서 Secrets 확인:
- `SMTP_USER`: `bass.to.tasko@gmail.com`
- `SMTP_PASS`: Gmail 앱 비밀번호
- `SUPABASE_URL`: `https://dcovjxmrqomuuwcgiwie.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY`: Service Role Key

### 4. 이메일 로그 확인

```sql
-- 최근 이메일 발송 로그 확인
SELECT 
  id,
  task_id,
  recipient_email,
  recipient_name,
  subject,
  status,
  error_message,
  created_at,
  sent_at
FROM public.email_logs
ORDER BY created_at DESC
LIMIT 20;

-- 실패한 이메일 확인
SELECT 
  id,
  task_id,
  recipient_email,
  status,
  error_message,
  created_at
FROM public.email_logs
WHERE status = 'failed'
ORDER BY created_at DESC;

-- 특정 Task의 이메일 로그 확인
SELECT *
FROM public.email_logs
WHERE task_id = 'your-task-id'
ORDER BY created_at DESC;
```

### 5. 트리거 실행 테스트

```sql
-- Task 상태 변경 테스트 (실제 Task ID 사용)
-- 이 쿼리는 트리거를 실행합니다
UPDATE public.tasks
SET task_status = 'IN_PROGRESS'
WHERE id = 'your-task-id' AND task_status = 'ASSIGNED';

-- 이메일 로그 확인
SELECT * FROM public.email_logs WHERE task_id = 'your-task-id' ORDER BY created_at DESC;
```

### 6. Edge Function 수동 호출 테스트

```bash
curl -X POST \
  'https://dcovjxmrqomuuwcgiwie.supabase.co/functions/v1/send-task-email' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "eventType": "STATUS_CHANGED",
    "taskId": "test-task-id",
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

## 일반적인 문제 및 해결 방법

### 문제 1: 트리거가 실행되지 않음

**증상**: Task 상태 변경 시 이메일 로그가 생성되지 않음

**해결 방법**:
1. 트리거가 활성화되어 있는지 확인
2. 트리거 함수의 `net.http_post` 호출 형식 확인
3. Edge Function URL이 올바른지 확인

### 문제 2: Edge Function 호출 실패

**증상**: 이메일 로그에 `failed` 상태가 기록됨

**해결 방법**:
1. Edge Function 로그 확인
2. Authorization 헤더의 Service Role Key 확인
3. Edge Function URL이 올바른지 확인

### 문제 3: SMTP 인증 실패

**증상**: Edge Function 로그에 SMTP 인증 오류

**해결 방법**:
1. Gmail 앱 비밀번호가 올바른지 확인
2. Gmail 2단계 인증이 활성화되어 있는지 확인
3. Supabase Secrets에 `SMTP_USER`와 `SMTP_PASS`가 올바르게 설정되어 있는지 확인

### 문제 4: 이메일이 스팸 폴더로 이동

**증상**: 이메일이 발송되었지만 받지 못함

**해결 방법**:
1. 스팸 폴더 확인
2. 발신자 이메일 주소 확인
3. 이메일 템플릿의 SPF/DKIM 설정 확인

## 마이그레이션 적용

트리거 함수 수정을 적용하려면:

```bash
# 마이그레이션 적용
supabase db push --project-ref dcovjxmrqomuuwcgiwie

# 또는 SQL Editor에서 직접 실행
# supabase/migrations/20250101000025_fix_task_created_email_trigger_http_post.sql 파일 내용 실행
```

## 모니터링

정기적으로 다음을 확인하세요:

1. **이메일 발송 성공률**: `email_logs` 테이블의 `status` 분포 확인
2. **실패한 이메일**: `status = 'failed'`인 로그 확인
3. **Edge Function 로그**: Supabase Dashboard에서 Edge Function 로그 확인


