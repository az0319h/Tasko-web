# 이메일 발송 문제 해결 가이드

## 🔍 단계별 진단 절차

### 1단계: 데이터베이스 상태 확인

Supabase Dashboard → SQL Editor에서 `EMAIL_DIAGNOSIS.sql` 파일 실행

**확인 사항:**
- ✅ 트리거가 존재하고 활성화되어 있는지
- ✅ 트리거 함수가 하드코딩 방식인지
- ✅ pg_net 확장이 설치되어 있는지
- ✅ net.http_post 함수 시그니처 확인

### 2단계: 트리거 함수 로그 확인

트리거 함수에 로깅이 추가되었으므로, Task 상태 변경 시 PostgreSQL 로그를 확인:

```sql
-- 최근 로그 확인 (Supabase Dashboard → Logs → Postgres Logs)
-- 또는 다음 쿼리로 트리거 함수 실행 여부 확인
SELECT * FROM pg_stat_user_functions 
WHERE funcname IN ('send_task_created_email', 'send_task_status_change_email');
```

### 3단계: Edge Function 로그 확인

Supabase Dashboard → Edge Functions → send-task-email → Logs

**확인 사항:**
- Edge Function이 호출되는지
- 요청 본문이 올바른지
- SMTP 설정 오류가 있는지
- 이메일 발송 성공/실패 여부

### 4단계: 이메일 로그 확인

```sql
-- 최근 이메일 발송 시도 확인
SELECT 
  id,
  task_id,
  recipient_email,
  status,
  error_message,
  created_at,
  sent_at
FROM public.email_logs
ORDER BY created_at DESC
LIMIT 20;
```

### 5단계: 수동 테스트

#### 5.1 Edge Function 직접 호출 테스트

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
    "assignerEmail": "your-email@example.com",
    "assigneeEmail": "your-email@example.com",
    "assignerName": "지시자",
    "assigneeName": "담당자",
    "taskTitle": "테스트 Task",
    "projectTitle": "테스트 프로젝트",
    "recipients": ["assigner", "assignee"]
  }'
```

#### 5.2 Task 상태 변경 테스트

```sql
-- 실제 Task ID로 상태 변경 테스트
UPDATE public.tasks
SET task_status = 'IN_PROGRESS'
WHERE id = 'your-task-id' AND task_status = 'ASSIGNED';

-- 로그 확인
SELECT * FROM public.email_logs WHERE task_id = 'your-task-id' ORDER BY created_at DESC;
```

## 🐛 일반적인 문제 및 해결 방법

### 문제 1: 트리거가 실행되지 않음

**증상**: Task 상태 변경 시 이메일 로그가 생성되지 않음

**해결 방법**:
1. 트리거 활성화 확인: `SELECT tgname, tgenabled FROM pg_trigger WHERE tgname LIKE '%email%';`
2. 트리거 재생성: `EMAIL_TROUBLESHOOTING_GUIDE.md` 참조

### 문제 2: Edge Function이 호출되지 않음

**증상**: 트리거는 실행되지만 Edge Function 로그에 요청이 없음

**원인 가능성**:
- `net.http_post` 함수 시그니처 오류
- Edge Function URL 오류
- 네트워크 문제

**해결 방법**:
1. `net.http_post` 시그니처 확인
2. Edge Function URL 확인
3. 트리거 함수 로그 확인 (RAISE NOTICE)

### 문제 3: SMTP 인증 실패

**증상**: Edge Function 로그에 SMTP 인증 오류

**해결 방법**:
1. Supabase Secrets에서 `SMTP_USER`, `SMTP_PASS` 확인
2. Gmail 앱 비밀번호가 올바른지 확인
3. Gmail 2단계 인증 활성화 확인

### 문제 4: 이메일이 스팸 폴더로 이동

**증상**: 이메일이 발송되었지만 받지 못함

**해결 방법**:
1. 스팸 폴더 확인
2. 발신자 이메일 주소 확인
3. 이메일 템플릿 개선

## 📝 체크리스트

- [ ] 트리거가 존재하고 활성화되어 있음
- [ ] 트리거 함수가 하드코딩 방식으로 설정됨
- [ ] pg_net 확장이 설치되어 있음
- [ ] Edge Function이 배포되어 있음
- [ ] Supabase Secrets가 올바르게 설정됨
- [ ] 트리거 함수 로그에서 실행 확인됨
- [ ] Edge Function 로그에서 호출 확인됨
- [ ] 이메일 로그에 발송 시도 기록됨
- [ ] 실제 이메일 수신 확인됨

## 🚀 다음 단계

1. **마이그레이션 적용**: `20250101000027_fix_email_triggers_with_logging.sql` 실행
2. **테스트**: Task 상태 변경 후 로그 확인
3. **문제 지속 시**: 각 단계별 로그를 확인하여 정확한 원인 파악


