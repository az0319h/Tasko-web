# tasks.json 분석 보고서

## 📋 전체 작업 요약

### 프로젝트 목표
**프로젝트 → 태스크 계층 구조 제거 및 태스크 단위 관리로 전환**
- 프로젝트 테이블 제거
- 태스크 중심 구조로 전환
- 공지사항 기능 추가

### 주요 작업 흐름 (10개 Task)

#### Phase 1: 데이터 준비 (Task 1)
- 테스트 환경 설정
- 데이터 백업
- projects → tasks 데이터 마이그레이션

#### Phase 2: 스키마 변경 (Task 2)
- tasks 테이블에 `created_by`, `client_name`, `send_email_to_client` 컬럼 추가
- `project_id` 컬럼 제거
- 외래키 변경

#### Phase 3: 보안 정책 변경 (Task 3)
- 프로젝트 기반 RLS 정책 → 태스크 단위 RLS 정책으로 변경

#### Phase 4: 함수/트리거 수정 (Task 4)
- 프로젝트 관련 함수 제거
- 이메일 트리거 수정

#### Phase 5: 인덱스 정리 (Task 5)
- 프로젝트 관련 인덱스 제거
- 새 인덱스 추가

#### Phase 6-8: 공지사항 기능 추가 (Task 6-8)
- 공지사항 테이블 생성
- API 및 훅 구현
- UI 컴포넌트 구현

#### Phase 9: 프로젝트 코드 제거 (Task 9)
- 프로젝트 관련 코드 제거
- UI 수정

#### Phase 10: 최종 정리 (Task 10)
- 타입 재생성
- 테스트
- 프로젝트 테이블 제거
- 통합 마이그레이션 파일 생성

---

## ⚠️ 발견된 문제점 및 애매한 부분

### 🔴 심각한 문제

#### 1. Task 1-3: 데이터 마이그레이션 순서 문제
**위치**: Line 52
```sql
UPDATE public.tasks t 
SET created_by = p.created_by, client_name = p.client_name 
FROM public.projects p 
WHERE t.project_id = p.id;
```

**문제점**:
- `tasks` 테이블에 `created_by`, `client_name` 컬럼이 아직 없음
- Task 2에서 컬럼을 추가하는데, Task 1에서 이미 사용하려고 함

**해결 방법**:
- Task 1-3은 컬럼 추가 후에 실행되어야 함
- 또는 Task 1-3을 Task 2-1 이후로 이동

#### 2. Task 2-1: 스키마 변경 순서 문제
**위치**: Line 76
```sql
ALTER TABLE public.tasks 
  ADD COLUMN IF NOT EXISTS created_by UUID, 
  ADD COLUMN IF NOT EXISTS client_name TEXT, 
  ADD COLUMN IF NOT EXISTS send_email_to_client BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_project_id_fkey;
ALTER TABLE public.tasks DROP COLUMN IF EXISTS project_id;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_created_by_fkey ...;
```

**문제점**:
- 컬럼 추가 → 외래키 제거 → 컬럼 제거 → 새 외래키 추가가 한 파일에 있음
- 하지만 데이터 마이그레이션(Task 1-3)이 먼저 실행되어야 함
- 순서가 명확하지 않음

**해결 방법**:
- Task 2-1을 두 단계로 분리:
  1. 컬럼 추가만 (데이터 마이그레이션 전)
  2. project_id 제거 및 외래키 변경 (데이터 마이그레이션 후)

### 🟡 애매한 부분

#### 3. Task 6: Sub-task ID 불연속
**위치**: Line 138, 148
- `6-1`: 공지사항 테이블 생성
- `6-6`: 스토리지 버킷 생성

**문제점**:
- ID가 6-1에서 6-6으로 건너뜀 (6-2, 6-3, 6-4, 6-5가 없음)
- 다른 작업이 빠진 것처럼 보임

**권장 사항**:
- `6-6`을 `6-2`로 변경하거나
- 누락된 작업이 있는지 확인

#### 4. Task 10-7: 마이그레이션 파일 경로 불일치
**위치**: Line 451
```json
"migration_file": "supabase/migrations/YYYYMMDDHHMMSS_complete_migration.sql"
```

**문제점**:
- 다른 마이그레이션 파일들은 `supabase/migrations/migrations_refactoring/` 경로 사용
- 이 파일만 다른 경로 사용
- `YYYYMMDDHHMMSS` 형식도 다른 파일들과 다름 (다른 파일들은 숫자만)

**권장 사항**:
- `"supabase/migrations/migrations_refactoring/complete_refactoring.sql"`로 통일

#### 5. Task 1-3과 Task 2-1의 실행 순서 불명확
**문제점**:
- Task 1-3: 데이터 마이그레이션 (컬럼이 있어야 실행 가능)
- Task 2-1: 컬럼 추가 및 제거
- 순서가 논리적으로 맞지 않음

**권장 순서**:
1. Task 2-1 (1단계): 컬럼 추가만
2. Task 1-3: 데이터 마이그레이션
3. Task 2-1 (2단계): project_id 제거 및 외래키 변경

#### 6. Task 2-1의 notes 설명 부족
**위치**: Line 77
```json
"notes": "기존 데이터는 1번 작업에서 마이그레이션됨. 테스트 환경에서 실행 후 검증."
```

**문제점**:
- "1번 작업"이 Task 1 전체를 의미하는지 Task 1-3만을 의미하는지 불명확
- 컬럼 추가와 제거가 같은 파일에 있어서 순서가 애매함

#### 7. Task 4-1: 함수 제거 목록 불완전
**위치**: Line 110
```sql
DROP FUNCTION IF EXISTS public.has_project_access(UUID, UUID);
DROP FUNCTION IF EXISTS public.has_task_in_project(UUID, UUID);
DROP FUNCTION IF EXISTS public.is_project_participant(UUID, UUID);
```

**문제점**:
- 실제 DB에는 `has_task_in_project` 함수가 없을 수 있음
- `create_project_with_participants`, `get_project_summaries` 함수도 제거해야 하는데 목록에 없음
- `can_access_profile` 함수는 "수정"이라고 했는데 구체적인 수정 내용이 없음

#### 8. Task 3-1: RLS 정책 변경 순서 문제
**위치**: Line 93
```sql
DROP POLICY IF EXISTS "tasks_select_project_access" ON public.tasks;
```

**문제점**:
- 실제 DB의 정책 이름과 다를 수 있음
- 현재 DB에는 `tasks_select_participant_or_admin` 같은 이름이 있을 수 있음
- 정책을 제거하기 전에 새 정책을 먼저 생성해야 하는데 순서가 명시되지 않음

#### 9. Task 9-10: 담당 업무 탭 구현 설명 부족
**위치**: Line 348-351
```json
"title": "담당 업무 탭 구현 (공통)",
"description": "지시자/담당자인 태스크 중 승인됨이 아닌 것들만 표시",
"notes": "admin-dashboard-page.tsx와 member-dashboard-page.tsx 모두에 구현"
```

**문제점**:
- "승인됨이 아닌 것들"의 의미가 애매함
  - `task_status != 'APPROVED'`를 의미하는지?
  - 아니면 `task_status IN ('ASSIGNED', 'IN_PROGRESS', 'WAITING_CONFIRM', 'REJECTED')`를 의미하는지?
- "지시자/담당자인"의 의미도 애매함
  - `assigner_id = auth.uid() OR assignee_id = auth.uid()`를 의미하는지?
  - 아니면 둘 다인지?

#### 10. Task 9-11: 체크박스 추가 설명 부족
**위치**: Line 356
```json
"description": "프로젝트 관련 로직 제거, 승인 상태일 때 '고객에게 이메일 발송 완료' 체크박스 추가"
```

**문제점**:
- "승인 상태일 때"가 `task_status = 'APPROVED'`를 의미하는지 명확하지 않음
- 체크박스가 어떤 필드를 업데이트하는지 명시되지 않음 (`send_email_to_client`로 추정되지만 명확하지 않음)
- 체크박스를 누르면 즉시 업데이트되는지, 저장 버튼이 필요한지 불명확

#### 11. Task 10-7: 통합 파일 경로 및 이름 불일치
**위치**: Line 451
```json
"migration_file": "supabase/migrations/YYYYMMDDHHMMSS_complete_migration.sql"
```

**문제점**:
- 다른 파일들과 경로가 다름 (`migrations_refactoring` 폴더 없음)
- 파일명 형식도 다름 (`complete_refactoring.sql`이 아니라 `complete_migration.sql`)
- `YYYYMMDDHHMMSS`는 실제 타임스탬프로 대체되어야 하는데, 다른 파일들은 숫자만 사용

---

## 📝 수정 권장 사항

### 1. Task 순서 재정렬
```
현재 순서:
Task 1 (데이터 마이그레이션 준비)
Task 2 (스키마 변경)

권장 순서:
Task 1: 테스트 환경 설정 및 백업
Task 2-1 (1단계): 컬럼 추가만
Task 1-3: 데이터 마이그레이션 (컬럼 추가 후)
Task 2-1 (2단계): project_id 제거 및 외래키 변경
Task 3: RLS 정책 변경
...
```

### 2. Task 6 Sub-task ID 수정
- `6-6` → `6-2`로 변경

### 3. Task 10-7 경로 통일
- `"supabase/migrations/migrations_refactoring/complete_refactoring.sql"`로 변경

### 4. 설명 보완 필요 항목
- Task 1-3: 컬럼 추가 후 실행한다는 명시
- Task 2-1: 두 단계로 분리하거나 순서 명시
- Task 3-1: 실제 정책 이름 확인 후 수정
- Task 4-1: 제거할 함수 목록 완성
- Task 9-10: "승인됨이 아닌 것들"의 정확한 조건 명시
- Task 9-11: 체크박스 동작 방식 명시

---

## ✅ 정상적인 부분

1. ✅ 전체적인 작업 흐름은 논리적임
2. ✅ 마이그레이션 파일 경로가 대부분 통일됨
3. ✅ 각 Task의 목적이 명확함
4. ✅ 테스트 환경 설정 방법이 명확함
5. ✅ 백업 방법이 명시됨

---

## 🎯 최종 요약

### 작업 목적
프로젝트 계층 구조를 제거하고 태스크 단위로 관리하도록 전환하는 대규모 리팩터링

### 주요 문제점
1. **데이터 마이그레이션 순서 문제** (Task 1-3이 Task 2-1보다 먼저 실행 불가)
2. **스키마 변경 순서 문제** (컬럼 추가와 제거가 같은 파일에 있음)
3. **Sub-task ID 불연속** (Task 6)
4. **경로 불일치** (Task 10-7)
5. **설명 부족** (여러 Task에서 구체적인 조건/동작 방식 불명확)

### 권장 조치
1. Task 순서 재정렬 또는 Task 2-1을 두 단계로 분리
2. Task 6-6을 6-2로 변경
3. Task 10-7 경로 통일
4. 애매한 설명 부분 보완
