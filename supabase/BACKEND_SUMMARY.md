# Tasko 백엔드 구성 완료 요약

## 생성된 파일 목록

### 데이터베이스 마이그레이션 파일 (12개)

1. `20250101000000_create_enums.sql` - ENUM 타입 정의
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

### Edge Function 파일

- `functions/send-task-email/index.ts` - 이메일 발송 Edge Function

### 문서 파일

- `BACKEND_SETUP.md` - 상세 설정 가이드
- `README_BACKEND.md` - 아키텍처 문서
- `DEPLOYMENT_COMMANDS.md` - 배포 명령어 가이드
- `BACKEND_SUMMARY.md` - 이 파일 (요약)

## 데이터베이스 스키마 요약

### 테이블 구조

```
profiles (기존)
├── id (UUID, PK)
├── email (TEXT)
├── role (TEXT: 'admin' | 'member')
└── ... (기타 프로필 필드)

projects (신규)
├── id (UUID, PK)
├── title (TEXT)
├── client_name (TEXT)
├── patent_name (TEXT)
├── status (project_status: 'inProgress' | 'done')
├── due_date (TIMESTAMPTZ)
├── is_public (BOOLEAN, 기본값: true)
├── created_by (UUID → auth.users)
├── created_at (TIMESTAMPTZ)
└── updated_at (TIMESTAMPTZ)

tasks (신규)
├── id (UUID, PK)
├── project_id (UUID → projects)
├── title (TEXT)
├── description (TEXT)
├── assigner_id (UUID → profiles)
├── assignee_id (UUID → profiles)
├── task_status (task_status: 5단계 워크플로우)
├── due_date (TIMESTAMPTZ)
├── created_at (TIMESTAMPTZ)
└── updated_at (TIMESTAMPTZ)

messages (신규)
├── id (UUID, PK)
├── task_id (UUID → tasks)
├── user_id (UUID → profiles)
├── content (TEXT)
├── message_type (message_type: 'USER' | 'SYSTEM')
└── created_at (TIMESTAMPTZ)

email_logs (신규)
├── id (UUID, PK)
├── task_id (UUID → tasks)
├── recipient_email (TEXT)
├── recipient_name (TEXT)
├── subject (TEXT)
├── status (TEXT: 'pending' | 'sent' | 'failed')
├── error_message (TEXT)
├── retry_count (INTEGER)
├── created_at (TIMESTAMPTZ)
└── sent_at (TIMESTAMPTZ)
```

### ENUM 타입

- `project_status`: `inProgress`, `done`
- `task_status`: `ASSIGNED`, `IN_PROGRESS`, `WAITING_CONFIRM`, `APPROVED`, `REJECTED`
- `message_type`: `USER`, `SYSTEM`

## RLS 정책 요약

### projects 테이블
- **SELECT**: Public 프로젝트는 모든 사용자, Private 프로젝트는 Admin 또는 Task 참여자만
- **INSERT**: 인증된 사용자 (실제로는 Admin만)
- **UPDATE**: Admin만
- **DELETE**: Admin만

### tasks 테이블
- **SELECT**: 부모 프로젝트 접근 권한이 있는 사용자만
- **INSERT**: 인증된 사용자 (실제로는 Admin만)
- **UPDATE**: **assigner 또는 assignee만** (Admin 불가)
- **DELETE**: Admin만

### messages 테이블
- **SELECT**: 부모 Task 접근 권한이 있는 사용자만
- **INSERT**: 부모 Task 접근 권한이 있는 사용자만
- **UPDATE**: 자신이 작성한 USER 메시지만
- **DELETE**: 자신이 작성한 USER 메시지만

## Database Triggers 요약

### 1. trigger_send_task_status_change_email
- **목적**: Task 상태 변경 시 이메일 자동 발송
- **트리거 조건**: 
  - `ASSIGNED` → `IN_PROGRESS`
  - `IN_PROGRESS` → `WAITING_CONFIRM`
  - `WAITING_CONFIRM` → `APPROVED`/`REJECTED`
- **동작**: Edge Function 호출하여 이메일 발송

### 2. trigger_create_task_status_change_system_message
- **목적**: Task 상태 변경 시 SYSTEM 메시지 자동 생성
- **트리거 조건**: `task_status` 변경 시
- **동작**: `messages` 테이블에 SYSTEM 타입 메시지 삽입

## Edge Function 요약

### send-task-email
- **경로**: `supabase/functions/send-task-email/index.ts`
- **책임**: 
  - Task 상태 변경 알림 이메일 발송
  - Gmail SMTP 연동
  - 재시도 로직 (최대 3회)
  - 이메일 로그 기록
- **환경 변수**: `SMTP_USER`, `SMTP_PASS`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

## 실행 순서

1. **데이터베이스 마이그레이션 실행**
   ```bash
   supabase db push --project-ref your-project-ref
   ```

2. **Supabase Secrets 설정**
   ```bash
   supabase secrets set SMTP_USER=bass.to.tasko@gmail.com --project-ref your-project-ref
   supabase secrets set SMTP_PASS="wavb nhjc hdig jvrd" --project-ref your-project-ref
   ```

3. **데이터베이스 설정 변수 구성** (SQL Editor에서 실행)
   ```sql
   ALTER DATABASE postgres SET app.supabase_project_ref = 'your-project-ref';
   ALTER DATABASE postgres SET app.supabase_service_role_key = 'your-service-role-key';
   ```

4. **Edge Function 배포**
   ```bash
   supabase functions deploy send-task-email --project-ref your-project-ref
   ```

## 주요 특징

1. **완전한 RLS 보안**: 모든 테이블에 RLS 활성화 및 세밀한 권한 제어
2. **자동화된 워크플로우**: Task 상태 변경 시 자동 이메일 발송 및 SYSTEM 메시지 생성
3. **권한 분리**: Admin은 Task 수정 불가, assigner/assignee만 수정 가능
4. **확장 가능한 구조**: 인덱스 및 복합 인덱스로 성능 최적화

## 다음 단계

백엔드 구성이 완료되었으므로 다음 단계로 진행:

1. **프론트엔드 API 훅 구현**
   - `src/api/project.ts` - 프로젝트 CRUD API
   - `src/api/task.ts` - Task CRUD API
   - `src/api/message.ts` - 메시지 API

2. **React Query 훅 구현**
   - `src/hooks/queries/use-projects.ts`
   - `src/hooks/queries/use-tasks.ts`
   - `src/hooks/mutations/use-project.ts`
   - `src/hooks/mutations/use-task.ts`

3. **UI 컴포넌트 구현**
   - 프로젝트 목록 페이지
   - Task 관리 페이지
   - 채팅 컴포넌트

자세한 내용은 각 문서를 참조하세요:
- `BACKEND_SETUP.md` - 상세 설정 가이드
- `README_BACKEND.md` - 아키텍처 문서
- `DEPLOYMENT_COMMANDS.md` - 배포 명령어

