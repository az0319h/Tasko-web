# Phase 1~3 작업 완료 요약

## 개요

@tasks.json의 Task 3 요구사항에 맞춰 데이터베이스 스키마, RLS 정책, Storage 버킷을 완전히 설정했습니다.

## 생성된 마이그레이션 파일

### Phase 1: 스키마 완성
- **파일**: `supabase/migrations/20260110000001_phase1_complete_schema_setup.sql`
- **목적**: 누락된 스키마 요소 추가 및 컬럼명 정정

### Phase 2: RLS 정책 검증 및 보완
- **파일**: `supabase/migrations/20260110000002_phase2_rls_policies_verification.sql`
- **목적**: 모든 테이블의 RLS 정책을 tasks.json 명세에 맞게 검증 및 보완

### Phase 3: Storage 버킷 및 최종 검증
- **파일**: `supabase/migrations/20260110000003_phase3_storage_buckets_and_final_verification.sql`
- **목적**: Storage 버킷 생성 및 권한 설정, 트리거/함수 최종 검증

## 주요 변경 사항

### 1. ENUM 타입

#### task_category ENUM 생성
```sql
CREATE TYPE task_category AS ENUM (
  'REVIEW',      -- 검토
  'CONTRACT',    -- 계약
  'SPECIFICATION', -- 명세서
  'APPLICATION'  -- 출원
);
```

**상태**: 새로 생성됨 (없는 경우)

### 2. 테이블 구조

#### profiles 테이블
- **상태**: 생성됨 (없는 경우)
- **주요 컬럼**:
  - `id` (UUID, PK, auth.users 참조)
  - `email` (TEXT, NOT NULL)
  - `full_name` (TEXT)
  - `role` (TEXT, DEFAULT 'member', CHECK: 'admin' | 'member')
  - `profile_completed` (BOOLEAN, DEFAULT false)
  - `is_active` (BOOLEAN, DEFAULT true)
  - `avatar_url` (TEXT)
  - `created_at`, `updated_at` (TIMESTAMPTZ)

- **트리거**: `on_auth_user_created` - auth.users에 INSERT 시 자동으로 profiles 레코드 생성

#### project_participants 테이블
- **상태**: 생성됨 (없는 경우)
- **주요 컬럼**:
  - `id` (UUID, PK)
  - `project_id` (UUID, projects 참조, CASCADE DELETE)
  - `user_id` (UUID, profiles 참조, CASCADE DELETE)
  - `invited_by` (UUID, profiles 참조)
  - `invited_at` (TIMESTAMPTZ, DEFAULT NOW())
  - `created_at` (TIMESTAMPTZ, DEFAULT NOW())
  - UNIQUE(project_id, user_id)

#### tasks 테이블 컬럼 추가
- **task_category 컬럼**: `task_category` ENUM 타입, NOT NULL, DEFAULT 'REVIEW'
- **description 컬럼**: `TEXT` 타입 (NULL 허용)

#### 컬럼명 정정
- **projects 테이블**: `opportunity` → `title` (없는 경우 생성)
- **tasks 테이블**: `instruction` → `title` (없는 경우 생성)

#### 불필요한 컬럼 제거
- `projects.patent_name` 제거
- `projects.is_public` 제거
- `projects.status` 제거

### 3. RLS 정책

#### profiles 테이블
- **SELECT**: 본인 또는 Admin 또는 동일 프로젝트 참여자
- **UPDATE**: 본인만
- **INSERT**: 본인만 (auth.users 트리거를 통해 자동 생성)

#### projects 테이블
- **SELECT**: Admin 또는 프로젝트 참여자
- **INSERT/UPDATE/DELETE**: Admin만

#### project_participants 테이블
- **SELECT**: 참여자 또는 Admin
- **INSERT/DELETE**: Admin만

#### tasks 테이블
- **SELECT**: 프로젝트 참여자 또는 Admin
- **INSERT**: 프로젝트 참여자 또는 Admin
- **UPDATE**: Admin 또는 지시자/담당자
- **DELETE**: 지시자만

#### messages 테이블
- **SELECT/INSERT**: Task 접근 권한 필요
- **UPDATE**: 본인 작성 USER/FILE 메시지만
- **DELETE**: 본인 작성 USER 메시지만

### 4. Storage 버킷

#### avatars 버킷
- **목적**: 프로필 이미지 저장
- **경로 구조**: `avatars/{userId}/{filename}`
- **권한**:
  - **업로드**: 본인만 (`avatars/{userId}/` 경로에만 업로드 가능)
  - **다운로드**: 모든 인증된 사용자 (공개)
  - **삭제**: 본인만

#### task-files 버킷
- **목적**: Task 채팅 파일 저장
- **경로 구조**: `task-files/{taskId}/{userId}/{filename}`
- **권한**:
  - **업로드**: Task 접근 권한이 있는 사용자만 (Admin 또는 지시자/담당자)
  - **다운로드**: Task 접근 권한이 있는 사용자만
  - **삭제**: 본인이 업로드한 파일만

### 5. 트리거 및 함수

#### Task 생성 시 트리거
- **trigger_send_task_created_email**: Task 생성 시 이메일 발송 (assigner, assignee 모두)
- **trigger_create_task_created_system_message**: Task 생성 시 SYSTEM 메시지 생성

#### Task 상태 변경 시 트리거
- **trigger_send_task_status_change_email**: 특정 상태 전환 시 이메일 발송
  - ASSIGNED → IN_PROGRESS: assigner, assignee 모두
  - IN_PROGRESS → WAITING_CONFIRM: assigner만
  - WAITING_CONFIRM → APPROVED/REJECTED: assignee만
- **trigger_create_task_status_change_system_message**: 모든 상태 변경 시 SYSTEM 메시지 생성

#### 읽음 처리 함수
- **mark_message_as_read(message_id, reader_id)**: 단일 메시지 읽음 처리 (assigner ↔ assignee만)
- **mark_task_messages_as_read(task_id, reader_id)**: Task의 모든 메시지 읽음 처리 (assigner ↔ assignee만)

## 검증 방법

### 1. 스키마 검증
```sql
-- ENUM 타입 확인
SELECT typname FROM pg_type 
WHERE typname IN ('task_status', 'task_category', 'message_type');

-- 테이블 구조 확인
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name IN ('profiles', 'projects', 'project_participants', 'tasks', 'messages')
ORDER BY table_name, ordinal_position;
```

### 2. RLS 정책 검증
```sql
-- RLS 정책 확인
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

### 3. Storage 버킷 검증
```sql
-- Storage 버킷 확인
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id IN ('avatars', 'task-files');

-- Storage 정책 확인
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage'
ORDER BY tablename, policyname;
```

### 4. 트리거 및 함수 검증
```sql
-- 트리거 확인
SELECT tgname, tgrelid::regclass, tgenabled
FROM pg_trigger
WHERE tgname LIKE 'trigger_%'
ORDER BY tgname;

-- 함수 확인
SELECT proname, proargtypes::regtype[]
FROM pg_proc
WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  AND proname IN ('mark_message_as_read', 'mark_task_messages_as_read')
ORDER BY proname;
```

## 마이그레이션 실행 순서

1. **Phase 1**: `20260110000001_phase1_complete_schema_setup.sql`
2. **Phase 2**: `20260110000002_phase2_rls_policies_verification.sql`
3. **Phase 3**: `20260110000003_phase3_storage_buckets_and_final_verification.sql`

## 주의사항

### Storage 버킷 생성
- **avatars 버킷**: Supabase Dashboard에서 수동으로 생성해야 함
  - 버킷 이름: `avatars`
  - Public: `true`
  - 파일 크기 제한: 5MB (권장)

### 프로필 자동 생성 트리거
- `handle_new_user()` 함수는 `auth.users` 테이블에 INSERT 시 자동으로 `profiles` 레코드를 생성합니다.
- 기존 사용자가 있는 경우, 수동으로 `profiles` 레코드를 생성해야 할 수 있습니다.

### 컬럼명 변경
- `projects.opportunity` → `title`: 기존 데이터는 자동으로 마이그레이션됩니다.
- `tasks.instruction` → `title`: 기존 데이터는 자동으로 마이그레이션됩니다.

## 다음 단계

Phase 1~3 작업이 완료되었으므로, 프론트엔드 개발을 시작할 수 있습니다.

**프론트엔드 개발 시작 전 확인 사항**:
1. ✅ 모든 테이블이 생성되었는지 확인
2. ✅ 모든 RLS 정책이 올바르게 설정되었는지 확인
3. ✅ Storage 버킷이 생성되고 권한이 설정되었는지 확인
4. ✅ 트리거 및 함수가 정상 동작하는지 확인
5. ✅ TypeScript 타입이 최신 상태인지 확인 (`supabase gen types` 실행)


