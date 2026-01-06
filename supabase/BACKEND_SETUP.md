# Tasko 백엔드 설정 가이드

이 문서는 Tasko 프로젝트의 백엔드 구성 요소를 설정하고 배포하는 방법을 설명합니다.

## 목차

1. [데이터베이스 마이그레이션 실행](#데이터베이스-마이그레이션-실행)
2. [Edge Function 배포](#edge-function-배포)
3. [Supabase Secrets 설정](#supabase-secrets-설정)
4. [데이터베이스 설정 변수 구성](#데이터베이스-설정-변수-구성)
5. [검증 및 테스트](#검증-및-테스트)

## 데이터베이스 마이그레이션 실행

### 실행 순서

마이그레이션 파일은 타임스탬프 순서대로 실행되어야 합니다:

```bash
# Supabase CLI를 사용하여 마이그레이션 실행
supabase db reset  # 개발 환경 초기화 (선택사항)
# 또는
supabase migration up  # 새로운 마이그레이션만 적용
```

### 마이그레이션 파일 목록

1. `20250101000000_create_enums.sql` - ENUM 타입 생성
2. `20250101000001_create_projects_table.sql` - projects 테이블 생성
3. `20250101000002_create_tasks_table.sql` - tasks 테이블 생성
4. `20250101000003_create_messages_table.sql` - messages 테이블 생성
5. `20250101000004_create_email_logs_table.sql` - email_logs 테이블 생성
6. `20250101000005_enable_rls.sql` - RLS 활성화
7. `20250101000006_create_rls_policies_projects.sql` - projects RLS 정책
8. `20250101000007_create_rls_policies_tasks.sql` - tasks RLS 정책
9. `20250101000008_create_rls_policies_messages.sql` - messages RLS 정책
10. `20250101000009_create_rls_policies_email_logs.sql` - email_logs RLS 정책
11. `20250101000010_create_task_status_change_trigger.sql` - 이메일 발송 트리거
12. `20250101000011_create_system_message_trigger.sql` - SYSTEM 메시지 생성 트리거

### 수동 실행 (Supabase Dashboard)

Supabase Dashboard에서 SQL Editor를 사용하여 각 파일을 순서대로 실행할 수도 있습니다.

## Edge Function 배포

### 1. Edge Function 배포

```bash
# Edge Function 배포
supabase functions deploy send-task-email

# 또는 특정 프로젝트에 배포
supabase functions deploy send-task-email --project-ref your-project-ref
```

### 2. Edge Function 구조

```
supabase/functions/send-task-email/
└── index.ts  # Edge Function 메인 파일
```

### 3. Edge Function 책임

- **입력**: Task 상태 변경 정보 (taskId, oldStatus, newStatus, assignerEmail, assigneeEmail 등)
- **처리**: 
  - 이메일 템플릿 생성
  - Gmail SMTP를 통한 이메일 발송
  - 재시도 로직 (최대 3회)
  - 이메일 로그 기록
- **출력**: 발송 결과 (성공/실패)

### 4. Edge Function 호출 방법

**자동 호출**: Database Trigger를 통해 자동 호출됨

**수동 호출** (테스트용):
```bash
curl -X POST \
  'https://your-project-ref.supabase.co/functions/v1/send-task-email' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "taskId": "task-uuid",
    "oldStatus": "ASSIGNED",
    "newStatus": "IN_PROGRESS",
    "assignerEmail": "assigner@example.com",
    "assigneeEmail": "assignee@example.com",
    "changerId": "user-uuid",
    "taskTitle": "Task Title",
    "projectTitle": "Project Title"
  }'
```

## Supabase Secrets 설정

Edge Function에서 사용할 SMTP 자격 증명을 Supabase Secrets로 설정해야 합니다.

### Secrets 설정 명령어

```bash
# SMTP 사용자 이메일 설정
supabase secrets set SMTP_USER=bass.to.tasko@gmail.com

# SMTP 앱 비밀번호 설정
supabase secrets set SMTP_PASS="wavb nhjc hdig jvrd"

# Edge Function URL 설정 (선택사항, 자동 감지됨)
supabase secrets set EDGE_FUNCTION_URL=https://your-project-ref.supabase.co/functions/v1/send-task-email
```

### Supabase Dashboard에서 설정

1. Supabase Dashboard → Project Settings → Edge Functions
2. Secrets 섹션에서 다음을 추가:
   - `SMTP_USER`: `bass.to.tasko@gmail.com`
   - `SMTP_PASS`: `wavb nhjc hdig jvrd`

## 데이터베이스 설정 변수 구성

Trigger 함수가 Edge Function을 호출하기 위해 다음 설정 변수가 필요합니다.

### SQL로 설정 변수 추가

```sql
-- Supabase Dashboard SQL Editor에서 실행

-- 프로젝트 참조 ID 설정 (예: xyzabcdefghijklmnop)
ALTER DATABASE postgres SET app.supabase_project_ref = 'your-project-ref';

-- Service Role Key 설정 (Edge Function 호출용)
ALTER DATABASE postgres SET app.supabase_service_role_key = 'your-service-role-key';

-- Edge Function URL 설정 (선택사항)
ALTER DATABASE postgres SET app.edge_function_url = 'https://your-project-ref.supabase.co/functions/v1/send-task-email';
```

**주의**: Service Role Key는 매우 민감한 정보이므로 안전하게 관리해야 합니다.

### 대안: Trigger 함수 수정

더 안전한 방법은 Trigger 함수에서 직접 환경 변수를 읽도록 수정하는 것입니다:

```sql
-- Trigger 함수에서 직접 읽도록 수정 (권장)
-- 이 경우 Supabase의 내장 변수를 사용
```

## 검증 및 테스트

### 1. 테이블 생성 확인

```sql
-- 테이블 목록 확인
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- 예상 결과:
-- email_logs
-- messages
-- profiles (기존)
-- projects
-- tasks
```

### 2. ENUM 타입 확인

```sql
-- ENUM 타입 확인
SELECT typname, typtype 
FROM pg_type 
WHERE typname IN ('project_status', 'task_status', 'message_type');
```

### 3. RLS 정책 확인

```sql
-- RLS 활성화 확인
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('projects', 'tasks', 'messages', 'email_logs');

-- 모든 테이블에서 rowsecurity = true 여야 함
```

### 4. Trigger 확인

```sql
-- Trigger 목록 확인
SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers
WHERE event_object_schema = 'public'
AND event_object_table = 'tasks';

-- 예상 결과:
-- trigger_send_task_status_change_email
-- trigger_create_task_status_change_system_message
```

### 5. Edge Function 테스트

```bash
# Edge Function 로그 확인
supabase functions logs send-task-email

# 또는 Supabase Dashboard에서 확인
# Edge Functions → send-task-email → Logs
```

### 6. 통합 테스트

1. **Task 상태 변경 테스트**:
   ```sql
   -- 테스트 Task 생성 (Admin 권한 필요)
   INSERT INTO public.tasks (
     project_id,
     title,
     description,
     assigner_id,
     assignee_id,
     task_status
   ) VALUES (
     'project-uuid',
     '테스트 업무',
     '테스트 설명',
     'assigner-uuid',
     'assignee-uuid',
     'ASSIGNED'
   );

   -- 상태 변경 (이메일 발송 트리거)
   UPDATE public.tasks
   SET task_status = 'IN_PROGRESS'
   WHERE id = 'task-uuid';
   ```

2. **이메일 로그 확인**:
   ```sql
   SELECT * FROM public.email_logs
   ORDER BY created_at DESC
   LIMIT 10;
   ```

3. **SYSTEM 메시지 확인**:
   ```sql
   SELECT * FROM public.messages
   WHERE message_type = 'SYSTEM'
   ORDER BY created_at DESC
   LIMIT 10;
   ```

## 문제 해결

### Edge Function이 호출되지 않는 경우

1. **pg_net 확장 확인**:
   ```sql
   SELECT * FROM pg_extension WHERE extname = 'pg_net';
   ```

2. **설정 변수 확인**:
   ```sql
   SHOW app.supabase_project_ref;
   SHOW app.supabase_service_role_key;
   ```

3. **Trigger 함수 로그 확인**:
   ```sql
   -- Trigger 함수에 로깅 추가하여 디버깅
   ```

### 이메일이 발송되지 않는 경우

1. **SMTP 자격 증명 확인**:
   - Gmail 앱 비밀번호가 올바른지 확인
   - 2단계 인증이 활성화되어 있는지 확인

2. **Edge Function 로그 확인**:
   ```bash
   supabase functions logs send-task-email --tail
   ```

3. **이메일 로그 테이블 확인**:
   ```sql
   SELECT * FROM public.email_logs
   WHERE status = 'failed'
   ORDER BY created_at DESC;
   ```

## 보안 고려사항

1. **Service Role Key**: 절대 클라이언트에 노출하지 마세요
2. **SMTP 자격 증명**: Supabase Secrets로 안전하게 관리
3. **RLS 정책**: 모든 테이블에 RLS가 활성화되어 있는지 확인
4. **Trigger 함수**: SECURITY DEFINER로 실행되므로 주의 필요

## 다음 단계

백엔드 구성이 완료되면:

1. 프론트엔드 API 훅 구현 (`src/api/project.ts`, `src/api/task.ts` 등)
2. React Query 훅 구현 (`src/hooks/queries/`, `src/hooks/mutations/`)
3. UI 컴포넌트 구현 (프로젝트 목록, Task 관리 등)

