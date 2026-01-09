# DB 스키마 리팩터링 계획서

## 📋 작업 범위
- DB 스키마 정합성 확보
- 마이그레이션 SQL 작성
- RLS 정책 재정의
- 타입 재생성 준비

---

## 1. 최종 테이블 스키마 정의 (@tasks.json 기준)

### 1.1 projects 테이블

**기획 기준 (tasks.json 3.3):**
```sql
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,                    -- 기회 (기존 opportunity)
  client_name TEXT NOT NULL,
  due_date TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**현재 DB 상태:**
- ✅ id, client_name, due_date, created_by, created_at, updated_at
- ❌ `opportunity` → `title`로 변경 필요
- ❌ `patent_name` 필드 없음 (제거됨)
- ❌ `is_public` 필드 없음 (기획에 없음)
- ❌ `status` 필드 없음 (기획에 없음)

**변경 사항:**
- `opportunity` 컬럼을 `title`로 RENAME
- 불필요한 컬럼 제거 (없으면 스킵)

### 1.2 tasks 테이블

**기획 기준 (tasks.json 3.5):**
```sql
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,                    -- 기존 instruction
  description TEXT,                       -- 추가 필요
  assigner_id UUID REFERENCES profiles(id),
  assignee_id UUID REFERENCES profiles(id),
  task_status task_status NOT NULL DEFAULT 'ASSIGNED',
  task_category task_category NOT NULL DEFAULT 'REVIEW',
  due_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**현재 DB 상태:**
- ✅ id, project_id, assigner_id, assignee_id, task_status, task_category, due_date, created_at, updated_at
- ❌ `instruction` → `title`로 변경 필요
- ❌ `description` 필드 추가 필요

**변경 사항:**
- `instruction` 컬럼을 `title`로 RENAME
- `description TEXT` 컬럼 추가

### 1.3 messages 테이블

**기획 기준 (tasks.json 3.6):**
```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id),
  content TEXT,
  message_type message_type NOT NULL DEFAULT 'USER',
  read_by JSONB DEFAULT '[]'::jsonb,
  file_url TEXT,
  file_name TEXT,
  file_type TEXT,
  file_size BIGINT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**현재 DB 상태:**
- ✅ 모든 필드 일치

**변경 사항:**
- 없음

### 1.4 project_participants 테이블

**기획 기준 (tasks.json 3.4):**
```sql
CREATE TABLE project_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES profiles(id),
  invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);
```

**현재 DB 상태:**
- ✅ 모든 필드 일치

**변경 사항:**
- 없음

### 1.5 profiles 테이블

**기획 기준 (tasks.json 3.2):**
```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'member',
  profile_completed BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**현재 DB 상태:**
- ✅ 모든 필드 일치 (position, phone 필드는 기획에 없지만 유지)

**변경 사항:**
- 없음 (position, phone은 기존 데이터 유지를 위해 보존)

### 1.6 email_logs 테이블

**기획 기준 (tasks.json 3.10, 8.6):**
- 기획서에 명시된 구조와 현재 DB 구조 일치 확인 필요

**현재 DB 상태:**
- ✅ id, task_id, recipient_email, recipient_name, subject, status, error_message, retry_count, created_at, sent_at

**변경 사항:**
- 없음

---

## 2. 마이그레이션 SQL 파일 목록

### 2.1 Phase 1: 컬럼 이름 변경 및 추가

**파일명:** `20260109000001_fix_projects_tasks_schema.sql`

**작업 내용:**
1. `projects.opportunity` → `projects.title` RENAME
2. `tasks.instruction` → `tasks.title` RENAME
3. `tasks.description` 컬럼 추가

### 2.2 Phase 2: RLS 정책 최적화

**파일명:** `20260109000002_optimize_rls_policies.sql`

**작업 내용:**
1. 모든 RLS 정책에서 `auth.uid()` → `(SELECT auth.uid())` 변경
2. Multiple Permissive Policies 통합
3. 함수 search_path 보안 수정

### 2.3 Phase 3: 인덱스 정리

**파일명:** `20260109000003_cleanup_indexes.sql`

**작업 내용:**
1. 사용되지 않는 인덱스 제거 (선택적)
2. 중복 인덱스 제거

---

## 3. 수정/삭제/추가된 컬럼 요약

### 3.1 projects 테이블

| 작업 | 컬럼명 | 변경 전 | 변경 후 | 비고 |
|------|--------|---------|---------|------|
| RENAME | title | opportunity | title | 기회 필드 |
| 확인 필요 | patent_name | 존재 여부 확인 | 제거 | 기획에 없음 |
| 확인 필요 | is_public | 존재 여부 확인 | 제거 | 기획에 없음 |
| 확인 필요 | status | 존재 여부 확인 | 제거 | 기획에 없음 |

### 3.2 tasks 테이블

| 작업 | 컬럼명 | 변경 전 | 변경 후 | 비고 |
|------|--------|---------|---------|------|
| RENAME | title | instruction | title | Task 제목 |
| ADD | description | 없음 | TEXT | Task 설명 |

### 3.3 기타 테이블

- **messages**: 변경 없음
- **project_participants**: 변경 없음
- **profiles**: 변경 없음 (position, phone은 유지)
- **email_logs**: 변경 없음

---

## 4. RLS 정책 변경 요약

### 4.1 성능 최적화 (필수)

**변경 전:**
```sql
auth.uid() = user_id
```

**변경 후:**
```sql
(SELECT auth.uid()) = user_id
```

**적용 대상:**
- 모든 RLS 정책 (profiles, projects, tasks, messages, project_participants, email_logs)

### 4.2 Multiple Permissive Policies 통합

#### profiles 테이블 SELECT 정책 통합

**현재 정책 (3개):**
1. `Users can view own profile`: `auth.uid() = id`
2. `Admins can view all profiles`: `is_admin(auth.uid())`
3. `profiles_select_same_project`: `can_access_profile(id)`

**통합 후:**
```sql
CREATE POLICY "profiles_select_unified" ON profiles
  FOR SELECT
  USING (
    (SELECT auth.uid()) = id 
    OR is_admin((SELECT auth.uid()))
    OR can_access_profile(id)
  );
```

#### profiles 테이블 UPDATE 정책 통합

**현재 정책 (2개):**
1. `Users can update own profile`: `auth.uid() = id`
2. `Admins can update all profiles`: `is_admin(auth.uid())`

**통합 후:**
```sql
CREATE POLICY "profiles_update_unified" ON profiles
  FOR UPDATE
  USING (
    (SELECT auth.uid()) = id 
    OR is_admin((SELECT auth.uid()))
  );
```

#### tasks 테이블 UPDATE 정책 통합

**현재 정책 (2개):**
1. `tasks_update_assigner_only`: `assigner_id = auth.uid()`
2. `tasks_update_assignee_status`: `assignee_id = auth.uid()`

**통합 후:**
```sql
CREATE POLICY "tasks_update_unified" ON tasks
  FOR UPDATE
  USING (
    assigner_id = (SELECT auth.uid())
    OR assignee_id = (SELECT auth.uid())
  );
```

### 4.3 함수 search_path 보안 수정

**적용 대상 함수 (13개):**
1. `update_updated_at_column`
2. `can_access_profile`
3. `handle_new_user`
4. `mark_message_as_read`
5. `mark_task_messages_as_read`
6. `send_task_created_email`
7. `create_task_created_system_message`
8. `send_task_status_change_email`
9. `create_task_status_change_system_message`
10. `get_active_profiles`
11. `sync_profile_email_on_auth_email_change`
12. `has_project_access`
13. 기타 모든 함수

**수정 방법:**
```sql
ALTER FUNCTION function_name(...) SET search_path = '';
```

---

## 5. 타입 재생성 전 체크리스트

### 5.1 마이그레이션 실행 전
- [ ] 백업 생성
- [ ] 프로덕션 데이터 확인 (opportunity → title 데이터 이전 필요 여부)
- [ ] 프로덕션 데이터 확인 (instruction → title 데이터 이전 필요 여부)

### 5.2 마이그레이션 실행 후
- [ ] 모든 테이블 스키마 확인
- [ ] RLS 정책 동작 확인
- [ ] 외래키 제약조건 확인
- [ ] 인덱스 확인

### 5.3 타입 재생성
```bash
npm run type-gen
```

### 5.4 타입 재생성 후 확인
- [ ] `src/database.type.ts` 파일 확인
- [ ] projects 테이블: `title` 필드 존재 확인
- [ ] tasks 테이블: `title`, `description` 필드 존재 확인
- [ ] TypeScript 컴파일 에러 확인

---

## 6. 롤백 계획

### 6.1 롤백 마이그레이션

**파일명:** `20260109000004_rollback_schema_changes.sql`

**작업 내용:**
1. `projects.title` → `projects.opportunity` RENAME
2. `tasks.title` → `tasks.instruction` RENAME
3. `tasks.description` 컬럼 제거

---

## 7. 예상 영향도

### 7.1 Breaking Changes
- ⚠️ **프로젝트 API**: `opportunity` → `title` 변경으로 인한 코드 수정 필요
- ⚠️ **Task API**: `instruction` → `title` 변경, `description` 추가로 인한 코드 수정 필요

### 7.2 데이터 마이그레이션
- `opportunity` 데이터는 `title`로 자동 이전됨 (RENAME)
- `instruction` 데이터는 `title`로 자동 이전됨 (RENAME)
- `description` 필드는 NULL로 시작

### 7.3 성능 영향
- RLS 정책 최적화로 인한 성능 향상 예상
- 인덱스 정리로 인한 스토리지 절약

---

## 8. 실행 순서

1. **백업 생성**
2. **Phase 1 마이그레이션 실행** (스키마 변경)
3. **Phase 2 마이그레이션 실행** (RLS 최적화)
4. **Phase 3 마이그레이션 실행** (인덱스 정리) - 선택적
5. **타입 재생성**
6. **검증**


