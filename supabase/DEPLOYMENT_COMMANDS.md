# Tasko 백엔드 배포 명령어 가이드

이 문서는 백엔드 구성 요소를 배포하기 위한 명령어를 순서대로 정리합니다.

## 사전 요구사항

1. Supabase CLI 설치 및 로그인
2. 프로젝트 연결 확인

```bash
# Supabase CLI 버전 확인
supabase --version

# 프로젝트 연결 확인
supabase projects list
```

## 1단계: 데이터베이스 마이그레이션 실행

### 방법 1: Supabase CLI 사용 (권장)

```bash
# 프로젝트 루트에서 실행
cd /path/to/project

# 모든 마이그레이션 적용
supabase db push

# 또는 특정 프로젝트에 적용
supabase db push --project-ref your-project-ref
```

### 방법 2: Supabase Dashboard SQL Editor 사용

1. Supabase Dashboard → SQL Editor 접속
2. 다음 순서로 각 마이그레이션 파일을 실행:

```sql
-- 1. ENUM 타입 생성
-- 파일: 20250101000000_create_enums.sql

-- 2. projects 테이블 생성
-- 파일: 20250101000001_create_projects_table.sql

-- 3. tasks 테이블 생성
-- 파일: 20250101000002_create_tasks_table.sql

-- 4. messages 테이블 생성
-- 파일: 20250101000003_create_messages_table.sql

-- 5. email_logs 테이블 생성
-- 파일: 20250101000004_create_email_logs_table.sql

-- 6. RLS 활성화
-- 파일: 20250101000005_enable_rls.sql

-- 7. projects RLS 정책
-- 파일: 20250101000006_create_rls_policies_projects.sql

-- 8. tasks RLS 정책
-- 파일: 20250101000007_create_rls_policies_tasks.sql

-- 9. messages RLS 정책
-- 파일: 20250101000008_create_rls_policies_messages.sql

-- 10. email_logs RLS 정책
-- 파일: 20250101000009_create_rls_policies_email_logs.sql

-- 11. 이메일 발송 트리거
-- 파일: 20250101000010_create_task_status_change_trigger.sql

-- 12. SYSTEM 메시지 생성 트리거
-- 파일: 20250101000011_create_system_message_trigger.sql
```

## 2단계: Supabase Secrets 설정

### CLI로 설정

```bash
# SMTP 사용자 이메일
supabase secrets set SMTP_USER=bass.to.tasko@gmail.com --project-ref your-project-ref

# SMTP 앱 비밀번호
supabase secrets set SMTP_PASS="wavb nhjc hdig jvrd" --project-ref your-project-ref

# Supabase URL (자동 설정되지만 명시적으로 설정 가능)
supabase secrets set SUPABASE_URL=https://your-project-ref.supabase.co --project-ref your-project-ref

# Service Role Key (Edge Function에서 사용)
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key --project-ref your-project-ref
```

### Dashboard에서 설정

1. Supabase Dashboard → Project Settings → Edge Functions
2. Secrets 섹션에서 다음 추가:
   - `SMTP_USER`: `bass.to.tasko@gmail.com`
   - `SMTP_PASS`: `wavb nhjc hdig jvrd`
   - `SUPABASE_URL`: `https://your-project-ref.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY`: `your-service-role-key`

## 3단계: 데이터베이스 설정 변수 구성

Trigger 함수가 Edge Function을 호출하기 위해 데이터베이스 설정 변수가 필요합니다.

### SQL로 설정 (Supabase Dashboard SQL Editor)

```sql
-- 프로젝트 참조 ID 설정
-- 예: 프로젝트 URL이 https://xyzabcdefghijklmnop.supabase.co 라면
-- xyzabcdefghijklmnop가 프로젝트 참조 ID입니다
ALTER DATABASE postgres SET app.supabase_project_ref = 'your-project-ref';

-- Service Role Key 설정
-- Dashboard → Project Settings → API → service_role key 복사
ALTER DATABASE postgres SET app.supabase_service_role_key = 'your-service-role-key';

-- Edge Function URL 설정 (선택사항, 자동 생성됨)
ALTER DATABASE postgres SET app.edge_function_url = 'https://your-project-ref.supabase.co/functions/v1/send-task-email';
```

**주의사항**:
- Service Role Key는 매우 민감한 정보입니다. 절대 공개하지 마세요.
- 프로젝트 참조 ID는 Supabase Dashboard URL에서 확인할 수 있습니다.

## 4단계: Edge Function 배포

```bash
# Edge Function 배포
supabase functions deploy send-task-email --project-ref your-project-ref

# 배포 확인
supabase functions list --project-ref your-project-ref
```

## 5단계: 검증

### 테이블 생성 확인

```sql
-- Supabase Dashboard SQL Editor에서 실행
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('projects', 'tasks', 'messages', 'email_logs')
ORDER BY table_name;
```

### ENUM 타입 확인

```sql
SELECT typname 
FROM pg_type 
WHERE typname IN ('project_status', 'task_status', 'message_type');
```

### RLS 정책 확인

```sql
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('projects', 'tasks', 'messages', 'email_logs');
```

### Trigger 확인

```sql
SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers
WHERE event_object_schema = 'public'
AND event_object_table = 'tasks';
```

### Edge Function 테스트

```bash
# Edge Function 로그 확인
supabase functions logs send-task-email --project-ref your-project-ref --tail
```

## 전체 배포 스크립트 (예시)

```bash
#!/bin/bash

# 환경 변수 설정
PROJECT_REF="your-project-ref"
SERVICE_ROLE_KEY="your-service-role-key"

# 1. 마이그레이션 적용
echo "Applying database migrations..."
supabase db push --project-ref $PROJECT_REF

# 2. Secrets 설정
echo "Setting up secrets..."
supabase secrets set SMTP_USER=bass.to.tasko@gmail.com --project-ref $PROJECT_REF
supabase secrets set SMTP_PASS="wavb nhjc hdig jvrd" --project-ref $PROJECT_REF

# 3. 데이터베이스 설정 변수 (SQL 실행 필요)
echo "Please set database configuration variables via SQL Editor:"
echo "ALTER DATABASE postgres SET app.supabase_project_ref = '$PROJECT_REF';"
echo "ALTER DATABASE postgres SET app.supabase_service_role_key = '$SERVICE_ROLE_KEY';"

# 4. Edge Function 배포
echo "Deploying Edge Function..."
supabase functions deploy send-task-email --project-ref $PROJECT_REF

echo "Deployment complete!"
```

## 문제 해결

### 마이그레이션 실패 시

```bash
# 마이그레이션 상태 확인
supabase migration list --project-ref your-project-ref

# 특정 마이그레이션 롤백 (필요시)
supabase db reset --project-ref your-project-ref  # 주의: 모든 데이터 삭제됨
```

### Edge Function 배포 실패 시

```bash
# Edge Function 로그 확인
supabase functions logs send-task-email --project-ref your-project-ref

# Edge Function 재배포
supabase functions deploy send-task-email --project-ref your-project-ref --no-verify-jwt
```

### Trigger가 작동하지 않는 경우

1. **pg_net 확장 확인**:
```sql
SELECT * FROM pg_extension WHERE extname = 'pg_net';
```

2. **설정 변수 확인**:
```sql
SHOW app.supabase_project_ref;
SHOW app.supabase_service_role_key;
```

3. **Trigger 함수 수동 테스트**:
```sql
-- 테스트용 Task 생성 후 상태 변경
UPDATE public.tasks
SET task_status = 'IN_PROGRESS'
WHERE id = 'test-task-id';
```

## 다음 단계

백엔드 배포가 완료되면:

1. 프론트엔드 API 훅 구현
2. React Query 훅 구현
3. UI 컴포넌트 구현

자세한 내용은 `BACKEND_SETUP.md`를 참조하세요.

