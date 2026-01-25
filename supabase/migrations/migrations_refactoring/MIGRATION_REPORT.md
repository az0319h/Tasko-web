# 마이그레이션 적용 리포트

**적용 일시**: 2026-01-25  
**대상 프로젝트**: supabase-clone (qskjqqhyrvebrccvunkx)  
**마이그레이션 파일**: `complete_refactoring_without_storage_policies.sql`

---

## ✅ 마이그레이션 파일 준비 완료

Storage 정책 부분을 제외한 마이그레이션 파일이 생성되었습니다:
- **파일명**: `complete_refactoring_without_storage_policies.sql`
- **위치**: `supabase/migrations/migrations_refactoring/`

---

## 📋 마이그레이션 내용 요약

### 1. tasks 테이블 변경
- ✅ `created_by`, `client_name`, `send_email_to_client` 컬럼 추가
- ✅ `project_id` 컬럼 및 외래키 제거
- ✅ RLS 정책 업데이트 (프로젝트 기반 → 태스크 기반)

### 2. 데이터 마이그레이션
- ✅ `projects` 테이블에서 `tasks` 테이블로 데이터 마이그레이션

### 3. RLS 정책 변경
- ✅ `tasks`, `messages`, `task_chat_logs`, `task_chat_log_items` 테이블 RLS 정책 업데이트
- ✅ `profiles` 테이블 RLS 정책 추가 (`profiles_select_active_for_authenticated`)

### 4. 함수 및 트리거 수정
- ✅ `send_task_created_email`, `send_task_status_change_email` 함수 수정 (client_name 사용)
- ✅ `can_access_profile` 함수 수정 (프로젝트 기반 → 태스크 기반)
- ✅ 프로젝트 관련 함수 제거

### 5. 인덱스 추가
- ✅ `idx_tasks_created_by` 인덱스 추가
- ✅ `idx_tasks_client_name` 인덱스 추가

### 6. 공지사항 테이블 생성
- ✅ `announcements` 테이블 생성
- ✅ `announcement_dismissals` 테이블 생성
- ✅ `announcement_attachments` 테이블 생성
- ✅ 관련 인덱스 및 RLS 정책 생성

### 7. Storage 버킷 생성
- ✅ `announcements` 스토리지 버킷 생성
- ⚠️ Storage RLS 정책은 제외됨 (Dashboard에서 수동 설정 필요)

### 8. 프로젝트 테이블 제거
- ✅ `project_participants` 테이블 제거
- ✅ `projects` 테이블 제거
- ✅ 관련 RLS 정책 및 함수 제거

---

## ⚠️ 주의사항

### Storage 정책 수동 설정 필요
`announcements` 버킷의 RLS 정책은 Supabase Dashboard에서 수동으로 설정해야 합니다:

1. Supabase Dashboard > Storage > Policies
2. `announcements` 버킷 선택
3. 다음 정책 추가:
   - **SELECT**: 모든 인증 사용자 (`bucket_id = 'announcements'`)
   - **INSERT/UPDATE/DELETE**: 관리자만 (`bucket_id = 'announcements' AND is_admin(auth.uid())`)

---

## 🚀 실행 방법

### 방법 1: Supabase Dashboard SQL Editor
1. Supabase Dashboard > SQL Editor 접속
2. `complete_refactoring_without_storage_policies.sql` 파일 내용 복사
3. SQL Editor에 붙여넣기 후 실행

### 방법 2: Supabase CLI
```bash
supabase db push --db-url "postgresql://postgres.qskjqqhyrvebrccvunkx:[PASSWORD]@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres" --file "supabase/migrations/migrations_refactoring/complete_refactoring_without_storage_policies.sql"
```

---

## ✅ 마이그레이션 실행 완료

**실행 일시**: 2026-01-25  
**실행 방법**: MCP 서버 (user-supabase-clone)  
**결과**: ✅ 성공

---

## 📊 생성/변경된 객체 요약

### 1. 테이블 변경
- ✅ `public.tasks`: 컬럼 추가 (`created_by`, `client_name`, `send_email_to_client`)
- ✅ `public.tasks`: 컬럼 제거 (`project_id`)
- ✅ `public.announcements`: 새 테이블 생성
- ✅ `public.announcement_dismissals`: 새 테이블 생성
- ✅ `public.announcement_attachments`: 새 테이블 생성
- ✅ `public.projects`: 테이블 제거 (CASCADE)
- ✅ `public.project_participants`: 테이블 제거 (CASCADE)

### 2. 인덱스
- ✅ `idx_tasks_created_by`: 생성
- ✅ `idx_tasks_client_name`: 생성
- ✅ `idx_announcements_is_active`: 생성
- ✅ `idx_announcements_created_at`: 생성
- ✅ `idx_announcements_expires_at`: 생성
- ✅ `idx_announcement_dismissals_announcement_user`: 생성
- ✅ `idx_announcement_attachments_announcement_id`: 생성
- ✅ `idx_tasks_project_id`: 제거
- ✅ `idx_tasks_project_status`: 제거

### 3. RLS 정책
- ✅ `tasks_select_admin_or_assigned`: 생성
- ✅ `tasks_insert_authenticated`: 생성
- ✅ `tasks_update_assigner_or_assignee`: 생성
- ✅ `tasks_delete_admin_only`: 생성
- ✅ `messages_select_participant_or_admin`: 업데이트
- ✅ `task_chat_logs_select_task_participants`: 업데이트
- ✅ `task_chat_logs_insert_status_changer`: 업데이트
- ✅ `task_chat_log_items_select_task_participants`: 업데이트
- ✅ `task_chat_log_items_insert_status_changer`: 업데이트
- ✅ `announcements_select_active`: 생성
- ✅ `announcements_insert_admin`: 생성
- ✅ `announcements_update_admin`: 생성
- ✅ `announcements_delete_admin`: 생성
- ✅ `announcement_dismissals_select_own`: 생성
- ✅ `announcement_dismissals_insert_own`: 생성
- ✅ `announcement_attachments_select_all`: 생성
- ✅ `announcement_attachments_insert_admin`: 생성
- ✅ `announcement_attachments_update_admin`: 생성
- ✅ `announcement_attachments_delete_admin`: 생성
- ✅ `profiles_select_active_for_authenticated`: 생성
- ✅ `profiles_select_same_project`: 제거
- ✅ 프로젝트 관련 정책들: 제거

### 4. 함수
- ✅ `send_task_created_email()`: 업데이트 (client_name 사용)
- ✅ `send_task_status_change_email()`: 업데이트 (client_name 사용)
- ✅ `can_access_profile(UUID)`: 업데이트 (프로젝트 기반 → 태스크 기반)
- ✅ `has_task_in_project(UUID, UUID)`: 제거
- ✅ `create_project_with_participants(...)`: 제거
- ✅ `get_project_summaries()`: 제거
- ✅ `has_project_access(uuid, uuid)`: 제거
- ✅ `is_project_participant(uuid, uuid)`: 제거

### 5. 트리거
- ✅ `update_announcements_updated_at`: 생성

### 6. 외래키 제약조건
- ✅ `tasks_created_by_fkey`: 생성
- ✅ `tasks_project_id_fkey`: 제거

### 7. Storage 버킷
- ✅ `announcements`: 생성
- ⚠️ Storage RLS 정책: 수동 설정 필요 (Dashboard)

---

## ✅ 다음 단계

1. ✅ Storage 정책 제외 마이그레이션 파일 생성 완료
2. ✅ 마이그레이션 실행 완료
3. ⏳ Storage RLS 정책 수동 설정 (Dashboard)
4. ⏳ 마이그레이션 검증 및 테스트
