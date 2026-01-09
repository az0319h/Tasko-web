# DB 스키마 변경 요약

## 📋 변경 사항 요약

### 1. 컬럼 변경

#### projects 테이블
| 작업 | 컬럼명 | 변경 전 | 변경 후 | 상태 |
|------|--------|---------|---------|------|
| RENAME | `title` | `opportunity` | `title` | ✅ 변경됨 |
| DROP | `patent_name` | 존재 시 | 제거 | ✅ 제거됨 |
| DROP | `is_public` | 존재 시 | 제거 | ✅ 제거됨 |
| DROP | `status` | 존재 시 | 제거 | ✅ 제거됨 |

#### tasks 테이블
| 작업 | 컬럼명 | 변경 전 | 변경 후 | 상태 |
|------|--------|---------|---------|------|
| RENAME | `title` | `instruction` | `title` | ✅ 변경됨 |
| ADD | `description` | 없음 | `TEXT` | ✅ 추가됨 |

### 2. RLS 정책 변경

#### 성능 최적화
- 모든 RLS 정책에서 `auth.uid()` → `(SELECT auth.uid())` 변경
- 적용 테이블: profiles, projects, project_participants, tasks, messages, email_logs

#### 정책 통합
- **profiles SELECT**: 3개 정책 → 1개 통합 정책
- **profiles UPDATE**: 2개 정책 → 1개 통합 정책
- **tasks UPDATE**: 2개 정책 → 1개 통합 정책

### 3. 함수 보안 수정

#### search_path 설정
다음 함수들에 `SET search_path = ''` 적용:
- `update_updated_at_column`
- `can_access_profile`
- `handle_new_user`
- `mark_message_as_read`
- `mark_task_messages_as_read`
- `send_task_created_email`
- `create_task_created_system_message`
- `send_task_status_change_email`
- `create_task_status_change_system_message`
- `get_active_profiles`
- `sync_profile_email_on_auth_email_change`
- `has_project_access`
- `is_admin`
- `is_project_participant`

### 4. 인덱스 정리

#### 중복 인덱스 제거
- `profiles.profiles_role_idx` 제거 (idx_profiles_role 유지)

#### 사용되지 않는 인덱스 (보존)
- 현재 사용되지 않지만 향후 쿼리 최적화에 필요할 수 있어 보존
- 필요 시 수동으로 제거 가능

---

## 📁 마이그레이션 파일 목록

1. **20260109000001_fix_projects_tasks_schema.sql**
   - 컬럼명 변경 및 추가
   - 불필요한 컬럼 제거

2. **20260109000002_optimize_rls_policies.sql**
   - RLS 정책 성능 최적화
   - 정책 통합
   - 함수 보안 수정

3. **20260109000003_cleanup_indexes.sql**
   - 중복 인덱스 제거
   - 사용되지 않는 인덱스 정리 (선택적)

---

## ✅ 타입 재생성 전 체크리스트

- [ ] 마이그레이션 실행 완료
- [ ] 모든 테이블 스키마 확인
- [ ] RLS 정책 동작 확인
- [ ] 외래키 제약조건 확인
- [ ] 타입 재생성 실행: `npm run type-gen`
- [ ] `src/database.type.ts` 파일 확인
- [ ] TypeScript 컴파일 에러 확인

---

## 🔄 롤백 계획

롤백이 필요한 경우 다음 마이그레이션 실행:

```sql
-- 20260109000004_rollback_schema_changes.sql (필요 시 생성)
ALTER TABLE projects RENAME COLUMN title TO opportunity;
ALTER TABLE tasks RENAME COLUMN title TO instruction;
ALTER TABLE tasks DROP COLUMN description;
```

---

## 📊 최종 스키마 정의

### projects 테이블
```sql
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,                    -- 기회
  client_name TEXT NOT NULL,
  due_date TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### tasks 테이블
```sql
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,                    -- Task 제목
  description TEXT,                       -- Task 설명
  assigner_id UUID REFERENCES profiles(id),
  assignee_id UUID REFERENCES profiles(id),
  task_status task_status NOT NULL DEFAULT 'ASSIGNED',
  task_category task_category NOT NULL DEFAULT 'REVIEW',
  due_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```


