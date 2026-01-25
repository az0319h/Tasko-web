# Shadow DB 복제 누락 항목 체크리스트

## 📋 개요
원본 DB (Tasko-backend-read_only)와 복제본 DB (Tasko-backend-shadow-read_only)를 비교하여 복제가 안 된 항목들을 확인합니다.

---

## ✅ 1. Storage 버킷 (수동 생성 필요)

Storage 버킷은 SQL 마이그레이션으로 자동 생성되지 않습니다. **Supabase Dashboard 또는 Storage API를 통해 수동으로 생성**해야 합니다.

### 필요한 버킷 목록:

#### 1.1 `avatars` 버킷
- **버킷 ID**: `avatars`
- **Public**: `true`
- **파일 크기 제한**: `5MB` (5,242,880 bytes)
- **허용 MIME 타입**:
  - `image/jpeg`
  - `image/png`
  - `image/webp`

**생성 방법**:
```bash
# Supabase Dashboard에서:
# Storage → New bucket → 이름: avatars, Public: true
```

또는 Storage API 사용:
```sql
-- 참고: 이 쿼리는 직접 실행 불가, Dashboard에서 생성 필요
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
);
```

#### 1.2 `task-files` 버킷
- **버킷 ID**: `task-files`
- **Public**: `true`
- **파일 크기 제한**: `10MB` (10,485,760 bytes)
- **허용 MIME 타입**:
  - `image/*`
  - `application/pdf`
  - `application/msword` (.doc)
  - `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (.docx)
  - `application/x-hwp`, `application/haansofthwp` (.hwp)
  - `application/x-hwpx`, `application/haansofthwpx` (.hwpx)
  - `application/vnd.ms-powerpoint` (.ppt)
  - `application/vnd.openxmlformats-officedocument.presentationml.presentation` (.pptx)
  - `application/vnd.ms-excel` (.xls)
  - `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (.xlsx)
  - `text/csv`, `application/csv` (.csv)
  - `text/plain` (.txt)
  - `application/zip` (.zip)
  - `application/x-rar-compressed`, `application/vnd.rar` (.rar)
  - `application/x-7z-compressed` (.7z)
  - `application/octet-stream` (기타 파일)

**생성 방법**:
```bash
# Supabase Dashboard에서:
# Storage → New bucket → 이름: task-files, Public: true
```

---

## ✅ 2. Storage RLS 정책 (마이그레이션으로 설정 가능)

버킷을 생성한 후, 다음 마이그레이션 파일을 실행하여 RLS 정책을 설정하세요:

### 2.1 avatars 버킷 RLS 정책
**마이그레이션 파일**: `supabase/migrations/20260110000003_phase3_storage_buckets_and_final_verification.sql` (26-60줄)

필요한 정책:
- `avatars_upload_own`: 본인만 업로드 가능
- `avatars_read_public`: 모든 인증된 사용자 다운로드 가능
- `avatars_delete_own`: 본인만 삭제 가능

### 2.2 task-files 버킷 RLS 정책
**마이그레이션 파일**: 
- `supabase/migrations/20250101000020_create_task_files_storage_bucket.sql` (전체)
- `supabase/migrations/20260110000003_phase3_storage_buckets_and_final_verification.sql` (68-122줄)

필요한 정책:
- `task_files_upload`: Task 접근 권한이 있는 사용자만 업로드 가능
- `task_files_read`: Task 접근 권한이 있는 사용자만 다운로드 가능
- `task_files_delete`: 본인이 업로드한 파일만 삭제 가능

**주의**: 원본 DB에는 `"authenticated can upload task files 1wv2skv_0"`라는 정책도 있는데, 이는 Supabase Dashboard에서 자동 생성된 것으로 보입니다. 필요에 따라 제거하거나 유지하세요.

---

## ✅ 3. 실제 데이터 (선택사항)

일반적으로 shadow DB에는 실제 데이터를 복제하지 않지만, 테스트가 필요하다면 다음 테이블의 데이터를 수동으로 복제할 수 있습니다:

- `profiles` (5개 행)
- `projects` (53개 행)
- `project_participants` (119개 행)
- `tasks` (130개 행)
- `messages` (909개 행)
- `email_logs` (457개 행)
- `task_chat_logs` (160개 행)
- `task_chat_log_items` (664개 행)

**주의**: `auth.users` 테이블의 데이터도 함께 복제해야 외래키 제약 조건이 작동합니다.

---

## ✅ 4. Edge Functions (별도 배포 필요)

Edge Functions는 데이터베이스와 별도로 배포됩니다. 다음 함수가 배포되어 있는지 확인하세요:

- `send-task-email`: 이메일 발송 함수

**확인 방법**:
```bash
supabase functions list --project-ref your-project-ref
```

**배포 방법**:
```bash
supabase functions deploy send-task-email --project-ref your-project-ref
```

---

## ✅ 5. Secrets (별도 설정 필요)

Edge Function에서 사용하는 환경 변수(Secrets)를 설정해야 합니다:

- `SMTP_USER`: SMTP 사용자 이메일
- `SMTP_PASS`: SMTP 비밀번호
- 기타 필요한 환경 변수들

**설정 방법**:
```bash
supabase secrets set SMTP_USER=your-email@example.com --project-ref your-project-ref
supabase secrets set SMTP_PASS=your-password --project-ref your-project-ref
```

---

## ✅ 6. Realtime 설정 (마이그레이션으로 확인)

다음 마이그레이션 파일이 실행되었는지 확인:

- `supabase/migrations/20260110000005_enable_realtime_for_messages.sql`

Realtime이 활성화되어 있는지 확인:
```sql
SELECT * FROM pg_publication WHERE pubname = 'supabase_realtime';
```

---

## 📝 체크리스트

복제본 DB에 다음 항목들이 있는지 확인하세요:

### 필수 항목:
- [ ] `avatars` Storage 버킷 생성됨
- [ ] `task-files` Storage 버킷 생성됨
- [ ] `avatars` 버킷 RLS 정책 설정됨
- [ ] `task-files` 버킷 RLS 정책 설정됨
- [ ] 모든 마이그레이션 파일 실행됨 (확인: `supabase/migrations/` 폴더의 모든 파일)

### 선택 항목 (테스트용):
- [ ] `auth.users` 데이터 복제됨
- [ ] `profiles` 데이터 복제됨
- [ ] `projects` 데이터 복제됨
- [ ] `tasks` 데이터 복제됨
- [ ] `messages` 데이터 복제됨

### 외부 설정:
- [ ] Edge Functions 배포됨
- [ ] Secrets 설정됨
- [ ] Realtime 활성화됨

---

## 🔍 확인 쿼리

복제본 DB에서 다음 쿼리들을 실행하여 누락된 항목을 확인하세요:

### Storage 버킷 확인:
```sql
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id IN ('avatars', 'task-files');
```

### Storage RLS 정책 확인
```sql
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
ORDER BY policyname;
```

### 함수 확인:
```sql
SELECT proname, pg_get_function_identity_arguments(oid) as arguments
FROM pg_proc
WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
ORDER BY proname;
```

### 트리거 확인:
```sql
SELECT tgname, tgrelid::regclass, tgenabled
FROM pg_trigger
WHERE tgname LIKE 'trigger_%'
ORDER BY tgname;
```

### 테이블 확인:
```sql
SELECT table_name, row_count
FROM (
  SELECT 'profiles' as table_name, COUNT(*) as row_count FROM profiles
  UNION ALL
  SELECT 'projects', COUNT(*) FROM projects
  UNION ALL
  SELECT 'project_participants', COUNT(*) FROM project_participants
  UNION ALL
  SELECT 'tasks', COUNT(*) FROM tasks
  UNION ALL
  SELECT 'messages', COUNT(*) FROM messages
  UNION ALL
  SELECT 'email_logs', COUNT(*) FROM email_logs
  UNION ALL
  SELECT 'task_chat_logs', COUNT(*) FROM task_chat_logs
  UNION ALL
  SELECT 'task_chat_log_items', COUNT(*) FROM task_chat_log_items
) t
ORDER BY table_name;
```

---

## 🚀 빠른 설정 가이드

1. **Storage 버킷 생성** (Supabase Dashboard):
   - Storage → New bucket → `avatars` 생성 (Public: true)
   - Storage → New bucket → `task-files` 생성 (Public: true)

2. **마이그레이션 실행**:
   ```bash
   # 모든 마이그레이션 파일이 순서대로 실행되었는지 확인
   supabase migration list --project-ref your-project-ref
   ```

3. **Storage RLS 정책 설정**:
   - `supabase/migrations/20250101000020_create_task_files_storage_bucket.sql` 실행
   - `supabase/migrations/20260110000003_phase3_storage_buckets_and_final_verification.sql` 실행

4. **확인**:
   - 위의 확인 쿼리들을 실행하여 모든 항목이 설정되었는지 확인

---

## ⚠️ 주의사항

1. **Storage 버킷은 SQL로 직접 생성할 수 없습니다**. 반드시 Supabase Dashboard나 Storage API를 사용해야 합니다.

2. **마이그레이션 파일은 순서대로 실행**되어야 합니다. 타임스탬프 순서를 확인하세요.

3. **RLS 정책은 버킷이 생성된 후**에만 설정할 수 있습니다.

4. **Edge Functions와 Secrets는 별도로 설정**해야 합니다.

5. **실제 데이터 복제는 선택사항**이며, 테스트 목적이 아니라면 필요하지 않을 수 있습니다.
