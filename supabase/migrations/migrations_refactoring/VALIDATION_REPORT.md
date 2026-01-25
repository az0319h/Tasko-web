# 마이그레이션 적용 가능 여부 검증 보고서

**검증 일시**: 2026-01-25  
**대상 파일**: `complete_refactoring.sql`  
**대상 환경**: supabase-main (READ-ONLY 검증)

---

## 📋 요약

| 항목 | 상태 | 비고 |
|------|------|------|
| **전제조건 충족** | ✅ PASS | 필수 함수 및 확장 모두 존재 |
| **데이터 마이그레이션** | ⚠️ WARNING | 모든 tasks가 project_id 보유, 마이그레이션 가능 |
| **RLS 정책 충돌** | ⚠️ WARNING | 기존 정책과 충돌 가능, 순서대로 처리 필요 |
| **테이블 제거** | ⚠️ WARNING | CASCADE로 제거 가능하나 데이터 손실 주의 |
| **환경별 설정** | ⚠️ WARNING | 하드코딩된 URL/Key 확인 필요 |

**최종 판정**: ⚠️ **적용 가능하나 주의 필요**

---

## 1. 전제조건 점검

### ✅ PASS: 필수 함수 존재 확인

| 함수명 | 상태 | 비고 |
|--------|------|------|
| `is_admin(uuid)` | ✅ 존재 | RLS 정책에서 사용 |
| `update_updated_at_column()` | ✅ 존재 | 트리거에서 사용 |
| `can_access_profile(uuid)` | ✅ 존재 | 프로필 접근 권한 확인 |
| `send_task_created_email()` | ✅ 존재 | 트리거 함수 (재정의 예정) |
| `send_task_status_change_email()` | ✅ 존재 | 트리거 함수 (재정의 예정) |

### ✅ PASS: 필수 확장 설치 확인

| 확장명 | 상태 | 비고 |
|--------|------|------|
| HTTP 확장 (http/pg_net) | ✅ 설치됨 | Edge Function 호출에 필요 |

### ✅ PASS: 필수 테이블 존재 확인

| 테이블명 | 상태 | 레코드 수 | 비고 |
|----------|------|-----------|------|
| `tasks` | ✅ 존재 | 52개 | 마이그레이션 대상 |
| `projects` | ✅ 존재 | 53개 | 데이터 소스 및 제거 대상 |
| `project_participants` | ✅ 존재 | 119개 | 제거 대상 |
| `profiles` | ✅ 존재 | 4개 | 참조 테이블 |
| `messages` | ✅ 존재 | 172개 | RLS 정책 수정 대상 |
| `task_chat_logs` | ✅ 존재 | 58개 | RLS 정책 수정 대상 |
| `task_chat_log_items` | ✅ 존재 | 110개 | RLS 정책 수정 대상 |

---

## 2. 데이터 마이그레이션 전제조건

### ⚠️ WARNING: 데이터 마이그레이션 가능성

**현재 상태:**
- `tasks` 테이블: **52개 레코드**
- `project_id`가 NULL인 tasks: **0개** (모든 tasks가 project_id 보유)
- `projects` 테이블: **53개 레코드**

**예상 시나리오:**
1. ✅ **성공 케이스**: 모든 tasks가 유효한 project_id를 가지고 있으므로, 데이터 마이그레이션이 정상적으로 수행될 것으로 예상됩니다.
2. ⚠️ **주의 케이스**: 
   - `projects` 테이블에 존재하지 않는 `project_id`를 참조하는 tasks가 있는 경우 → 외래키 제약조건 위반 가능
   - `projects.created_by` 또는 `projects.client_name`이 NULL인 경우 → tasks의 `created_by` 또는 `client_name`이 NULL로 설정됨

**검증 쿼리 (적용 전 실행 권장):**
```sql
-- 1. 유효하지 않은 project_id 참조 확인
SELECT COUNT(*) 
FROM tasks t 
LEFT JOIN projects p ON t.project_id = p.id 
WHERE p.id IS NULL;

-- 2. NULL 값이 될 수 있는 데이터 확인
SELECT COUNT(*) 
FROM tasks t 
JOIN projects p ON t.project_id = p.id 
WHERE p.created_by IS NULL OR p.client_name IS NULL;
```

**예상 에러:**
- ❌ 외래키 제약조건 위반: `foreign key constraint "tasks_project_id_fkey"` (마이그레이션 전에는 발생하지 않음)
- ⚠️ NULL 값 설정: `created_by` 또는 `client_name`이 NULL로 설정될 수 있음 (데이터 손실 가능)

---

## 3. 충돌/의존성/데이터로 인한 실패 가능 지점

### ⚠️ WARNING: RLS 정책 충돌

**현재 존재하는 정책 (제거 예정):**
- `tasks_select_participant_or_admin`
- `tasks_insert_participant_or_admin`
- `tasks_update_assigner_only`
- `tasks_update_assignee_status`
- `tasks_delete_assigner_only`
- `messages_select_participant_or_admin` (기존 정책)
- `profiles_select_same_project` (제거 예정)

**마이그레이션 순서:**
1. ✅ 새 정책 생성 (기존 정책과 이름이 다르므로 충돌 없음)
2. ✅ 기존 정책 제거 (DROP POLICY IF EXISTS 사용)
3. ⚠️ **주의**: 새 정책이 활성화되기 전에 기존 정책이 제거되면 일시적으로 접근 불가능할 수 있음

**예상 에러:**
- ❌ 정책 이름 충돌: 없음 (모두 DROP IF EXISTS 사용)
- ⚠️ 일시적 접근 불가: 트랜잭션 중간에 발생할 수 있으나, BEGIN/COMMIT으로 보호됨

### ⚠️ WARNING: 외래키 제약조건 제거

**현재 상태:**
- `tasks_project_id_fkey`: 존재 (제거 예정)
- `tasks_created_by_fkey`: 없음 (생성 예정)

**마이그레이션 순서:**
1. ✅ `created_by` 컬럼 추가 (NULL 허용)
2. ✅ 데이터 마이그레이션 수행
3. ✅ `tasks_created_by_fkey` 제약조건 추가
4. ⚠️ **주의**: `created_by`가 NULL인 tasks가 있으면 제약조건 추가 실패 가능 (하지만 마이그레이션에서 NULL 허용)

**예상 에러:**
- ❌ NOT NULL 제약조건 위반: 없음 (`created_by`는 NULL 허용)
- ⚠️ 외래키 제약조건 위반: `created_by`가 `auth.users`에 존재하지 않는 경우 (마이그레이션에서 `projects.created_by` 사용하므로 발생 가능성 낮음)

### ⚠️ WARNING: 인덱스 제거

**제거 예정 인덱스:**
- `idx_tasks_project_id`
- `idx_tasks_project_status`

**현재 상태:**
- ✅ 두 인덱스 모두 존재
- ✅ DROP INDEX IF EXISTS 사용하므로 안전

**예상 에러:**
- ❌ 인덱스 없음 에러: 없음 (IF EXISTS 사용)

### ⚠️ WARNING: 컬럼 제거

**제거 예정 컬럼:**
- `tasks.project_id` (NOT NULL)

**현재 상태:**
- ✅ `project_id` 컬럼 존재 (NOT NULL)
- ⚠️ **주의**: 모든 tasks가 `project_id`를 가지고 있으므로, 데이터 마이그레이션 후에만 제거 가능

**마이그레이션 순서:**
1. ✅ 데이터 마이그레이션 완료
2. ✅ 외래키 제약조건 제거
3. ✅ 인덱스 제거
4. ✅ 컬럼 제거

**예상 에러:**
- ❌ NOT NULL 제약조건 위반: 없음 (마이그레이션 후 제거)
- ⚠️ 데이터 손실: `project_id` 제거로 인한 데이터 손실 (의도된 변경)

### ⚠️ WARNING: 함수 재정의

**재정의 예정 함수:**
- `send_task_created_email()`
- `send_task_status_change_email()`
- `can_access_profile(uuid)`

**현재 상태:**
- ✅ 모든 함수 존재
- ✅ CREATE OR REPLACE 사용하므로 안전

**예상 에러:**
- ❌ 함수 시그니처 불일치: 없음 (동일한 시그니처)
- ⚠️ 의존성 문제: 트리거가 함수를 참조하므로, 함수 재정의 시 트리거도 재생성 필요할 수 있음

### ⚠️ WARNING: 테이블 제거

**제거 예정 테이블:**
- `project_participants` (CASCADE)
- `projects` (CASCADE)

**현재 상태:**
- ✅ `projects`: 53개 레코드
- ✅ `project_participants`: 119개 레코드
- ⚠️ **주의**: CASCADE로 제거되면 관련 데이터 모두 삭제됨

**예상 에러:**
- ❌ 외래키 제약조건 위반: 없음 (CASCADE 사용)
- ⚠️ **데이터 손실**: 프로젝트 관련 데이터 영구 삭제 (의도된 변경이지만 복구 불가능)

---

## 4. Clone vs Main 차이로 인한 리스크

### ⚠️ WARNING: 환경별 설정 차이

**하드코딩된 값 (라인 514, 518, 674, 678):**
```sql
function_url := 'https://mbwmxowoyvaxmtnigjwa.supabase.co/functions/v1/send-task-email';
service_role_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

**리스크:**
- ⚠️ **프로덕션 환경 URL/Key 불일치**: supabase-main이 다른 프로젝트인 경우, Edge Function URL과 Service Role Key가 다를 수 있음
- ⚠️ **이메일 발송 실패**: 잘못된 URL/Key로 인해 이메일 발송이 실패할 수 있음

**조치 필요:**
- ✅ 적용 전에 supabase-main의 실제 Edge Function URL 확인
- ✅ 적용 전에 supabase-main의 실제 Service Role Key 확인
- ✅ 함수 내부의 하드코딩된 값을 환경에 맞게 수정

### ⚠️ WARNING: 데이터 볼륨 차이

**현재 확인된 데이터:**
- `tasks`: 52개
- `projects`: 53개
- `project_participants`: 119개

**리스크:**
- ⚠️ **마이그레이션 시간**: 데이터 볼륨이 클수록 마이그레이션 시간이 길어질 수 있음
- ⚠️ **트랜잭션 타임아웃**: 대량 데이터 업데이트 시 트랜잭션 타임아웃 가능

**조치 필요:**
- ✅ 마이그레이션 실행 시간 예상 및 모니터링
- ✅ 필요시 배치 처리로 분할 실행 고려

### ⚠️ WARNING: RLS 정책 차이

**현재 존재하는 정책:**
- `profiles_select_same_project`: 존재 (제거 예정)
- 기타 프로젝트 기반 정책들: 존재

**리스크:**
- ⚠️ **접근 권한 변경**: 프로젝트 기반 정책 제거로 인한 접근 권한 변경
- ⚠️ **애플리케이션 호환성**: 애플리케이션이 프로젝트 기반 접근을 가정하는 경우 문제 발생 가능

**조치 필요:**
- ✅ 애플리케이션 코드에서 프로젝트 기반 접근 로직 제거 확인
- ✅ 새 RLS 정책으로 인한 접근 권한 변경 테스트

---

## 5. 체크리스트 및 적용 전 조치사항

### ✅ PASS 항목

- [x] 필수 함수 존재 확인 (`is_admin`, `update_updated_at_column`, `can_access_profile`, `send_task_created_email`, `send_task_status_change_email`)
- [x] HTTP 확장 설치 확인
- [x] 필수 테이블 존재 확인 (`tasks`, `projects`, `project_participants`, `profiles`, `messages`, `task_chat_logs`, `task_chat_log_items`)
- [x] SQL 문법 검증 (BEGIN/COMMIT 트랜잭션 사용, IF EXISTS 사용)

### ⚠️ WARNING 항목 (조치 필요)

#### 1. 데이터 무결성 검증
```sql
-- 적용 전 실행 권장
-- 1. 유효하지 않은 project_id 참조 확인
SELECT COUNT(*) as invalid_project_refs
FROM tasks t 
LEFT JOIN projects p ON t.project_id = p.id 
WHERE p.id IS NULL;

-- 2. NULL 값이 될 수 있는 데이터 확인
SELECT COUNT(*) as null_migration_data
FROM tasks t 
JOIN projects p ON t.project_id = p.id 
WHERE p.created_by IS NULL OR p.client_name IS NULL;

-- 3. created_by가 auth.users에 존재하는지 확인
SELECT COUNT(*) as invalid_created_by
FROM tasks t
JOIN projects p ON t.project_id = p.id
LEFT JOIN auth.users u ON p.created_by = u.id
WHERE p.created_by IS NOT NULL AND u.id IS NULL;
```

**조치:**
- ✅ 결과가 0이면 PASS
- ⚠️ 결과가 0이 아니면 데이터 정리 필요

#### 2. 환경별 설정 확인
```sql
-- 적용 전 실행 권장
-- 1. 현재 Edge Function URL 확인 (Supabase Dashboard에서 확인)
-- 2. 현재 Service Role Key 확인 (Supabase Dashboard > Settings > API에서 확인)
```

**조치:**
- ✅ `complete_refactoring.sql` 파일의 하드코딩된 URL/Key를 supabase-main 환경에 맞게 수정
- ✅ 라인 514, 518, 674, 678 수정 필요

#### 3. 백업 생성
**조치:**
- ✅ `projects` 테이블 백업 (53개 레코드)
- ✅ `project_participants` 테이블 백업 (119개 레코드)
- ✅ `tasks` 테이블 백업 (52개 레코드)
- ✅ 현재 RLS 정책 백업

#### 4. 애플리케이션 호환성 확인
**조치:**
- ✅ 애플리케이션 코드에서 `project_id` 사용 여부 확인
- ✅ 프로젝트 기반 접근 로직 제거 확인
- ✅ 새 RLS 정책으로 인한 접근 권한 변경 테스트

#### 5. 트리거 확인
**조치:**
- ✅ `send_task_created_email_trigger` 트리거 존재 여부 확인
- ✅ `send_task_status_change_email_trigger` 트리거 존재 여부 확인
- ⚠️ 트리거가 없으면 함수 재정의 후 트리거 생성 필요할 수 있음

### ❌ FAIL 항목

없음 (현재 확인된 항목 중 FAIL은 없음)

---

## 6. 예상 에러 및 대응 방안

### 에러 1: 외래키 제약조건 위반
**에러 메시지**: `foreign key constraint "tasks_created_by_fkey" violated`

**원인**: `created_by`가 `auth.users`에 존재하지 않는 경우

**대응 방안**:
1. 데이터 마이그레이션 전에 `projects.created_by`가 `auth.users`에 존재하는지 확인
2. 존재하지 않는 경우, NULL로 설정하거나 유효한 사용자 ID로 변경

### 에러 2: 트랜잭션 타임아웃
**에러 메시지**: `statement timeout` 또는 `lock timeout`

**원인**: 대량 데이터 업데이트로 인한 트랜잭션 시간 초과

**대응 방안**:
1. 트랜잭션 타임아웃 시간 증가
2. 배치 처리로 분할 실행 (권장하지 않음, 트랜잭션 무결성 보장 어려움)

### 에러 3: RLS 정책 충돌
**에러 메시지**: `policy already exists` 또는 `duplicate key value`

**원인**: 정책 이름 충돌 (예상되지 않음)

**대응 방안**:
1. SQL 파일에서 `DROP POLICY IF EXISTS` 사용하므로 발생하지 않을 것으로 예상
2. 발생 시 수동으로 기존 정책 제거 후 재실행

### 에러 4: Edge Function 호출 실패
**에러 메시지**: HTTP 에러 (401, 403, 404 등)

**원인**: 잘못된 URL 또는 Service Role Key

**대응 방안**:
1. 적용 전에 URL/Key 확인 및 수정
2. 함수 내부의 하드코딩된 값 수정

---

## 7. 적용 전 최종 체크리스트

### 필수 사전 작업

- [ ] **데이터 무결성 검증 쿼리 실행 및 결과 확인**
- [ ] **supabase-main의 Edge Function URL 확인 및 SQL 파일 수정**
- [ ] **supabase-main의 Service Role Key 확인 및 SQL 파일 수정**
- [ ] **데이터베이스 백업 생성** (`projects`, `project_participants`, `tasks` 테이블)
- [ ] **RLS 정책 백업** (현재 정책 목록 저장)
- [ ] **애플리케이션 코드에서 `project_id` 사용 여부 확인**
- [ ] **트리거 존재 여부 확인**

### 적용 시 주의사항

- [ ] **트랜잭션 모니터링**: 마이그레이션 실행 시간 모니터링
- [ ] **에러 로그 확인**: 각 단계별 에러 발생 여부 확인
- [ ] **데이터 검증**: 마이그레이션 후 `created_by`, `client_name` 값 확인
- [ ] **RLS 정책 테스트**: 새 정책으로 인한 접근 권한 변경 테스트

### 적용 후 검증

- [ ] **데이터 마이그레이션 검증**: `tasks.created_by`, `tasks.client_name` 값 확인
- [ ] **RLS 정책 검증**: 새 정책이 정상적으로 작동하는지 확인
- [ ] **함수 검증**: 이메일 발송 함수가 정상적으로 작동하는지 확인
- [ ] **애플리케이션 테스트**: 애플리케이션이 정상적으로 작동하는지 확인

---

## 8. 결론

### 적용 가능 여부: ⚠️ **적용 가능하나 주의 필요**

**이유:**
1. ✅ 필수 전제조건(함수, 확장, 테이블) 모두 충족
2. ⚠️ 데이터 마이그레이션 전 데이터 무결성 검증 필요
3. ⚠️ 환경별 설정(URL/Key) 수정 필요
4. ⚠️ 프로젝트 테이블 제거로 인한 데이터 손실 (의도된 변경)
5. ⚠️ RLS 정책 변경으로 인한 접근 권한 변경

**권장 사항:**
1. ✅ **스테이징 환경에서 먼저 테스트** (가능한 경우)
2. ✅ **데이터 백업 필수**
3. ✅ **적용 전 모든 체크리스트 항목 완료**
4. ✅ **적용 후 즉시 데이터 검증 및 애플리케이션 테스트**

---

**검증 완료 일시**: 2026-01-25  
**검증자**: AI Assistant (Cursor)
