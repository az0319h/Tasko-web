# 프로젝트 완료예정일(due_date) 제거 리팩토링 계획서

## 📋 개요

프로젝트 생성/수정/조회 흐름에서 완료예정일(`due_date`) 필드를 제거하는 리팩토링 계획입니다.
**중요**: Task의 마감일(`due_date`)은 반드시 유지되며, Task 생성 시 필수 입력이어야 합니다.

---

## 1️⃣ 현황 파악

### 1.1 DB 레벨 현황

#### 프로젝트 테이블 (`projects`)

- **컬럼명**: `due_date`
- **타입**: `TIMESTAMPTZ`
- **제약조건**: `NULL` 허용 (nullable)
- **인덱스**: `idx_projects_due_date` 존재 (`supabase/migrations/20250101000001_create_projects_table.sql:21`)
- **마이그레이션 파일**: `20250101000001_create_projects_table.sql`

#### Task 테이블 (`tasks`)

- **컬럼명**: `due_date` (유지 필요)
- **타입**: `TIMESTAMPTZ`
- **제약조건**: `NULL` 허용 (현재) → **필수로 변경 필요**
- **인덱스**: `idx_tasks_due_date` 존재

#### RLS 정책

- ✅ RLS 정책에서 프로젝트 `due_date` 직접 참조 없음
- ✅ RLS 정책은 주로 `created_by`, `project_id`, `assigner_id`, `assignee_id` 기반

#### 트리거/함수

- ✅ 이메일 트리거에서는 **Task의 `due_date`만 사용** (프로젝트 `due_date` 미사용)
- ✅ 프로젝트 `due_date`를 참조하는 트리거/함수 없음

#### 뷰

- ✅ 프로젝트 `due_date`를 참조하는 뷰 없음

### 1.2 프론트엔드 현황

#### 스키마/타입 정의

1. **프로젝트 생성 스키마** (`src/schemas/project/project-schema.ts:10-20`)
   - `due_date: z.string().optional().nullable()` + refine 검증
   - 오늘 이후 날짜만 허용하는 검증 로직 포함

2. **프로젝트 수정 스키마** (`src/schemas/project/project-schema.ts:31-41`)
   - `due_date: z.string().optional().nullable()` + refine 검증

3. **DB 타입 정의** (`src/database.type.ts:226, 235, 244`)
   - `projects.due_date: string | null` (Row, Insert, Update)

#### UI 컴포넌트

1. **프로젝트 생성/수정 폼** (`src/components/project/project-form-dialog.tsx`)
   - 라인 64, 69: 기본값 `due_date: null`
   - 라인 106: 수정 모드 초기값 설정 시 `due_date` 포함
   - 라인 193-207: 완료예정일 입력 필드 (Label, Input, 에러 메시지, 도움말)

2. **프로젝트 상세 페이지** (`src/pages/project-detail-page.tsx`)
   - 라인 209-210: 프로젝트 수정 시 `due_date` 비교/검증 로직
   - 라인 217-231: Task 마감일이 프로젝트 완료예정일보다 늦으면 수정 불가 검증
   - 라인 239: 프로젝트 수정 API 호출 시 `due_date` 포함
   - 라인 361: 프로젝트 정보 카드에서 완료예정일 표시

3. **프로젝트 카드** (`src/components/project/project-card.tsx`)
   - 라인 100-102: 프로젝트 카드에서 완료예정일 표시

4. **대시보드 페이지들**
   - `src/pages/member-dashboard-page.tsx:165-174`: 완료예정일 기준 정렬 (`dueDateNewest`, `dueDateOldest`)
   - `src/pages/admin-dashboard-page.tsx:191-200`: 완료예정일 기준 정렬
   - `src/pages/member-dashboard-page.tsx:436`: 테이블에서 완료예정일 컬럼 표시
   - `src/pages/admin-dashboard-page.tsx:477`: 테이블에서 완료예정일 컬럼 표시

#### Task 생성 시 프로젝트 due_date 참조

1. **Task 생성 폼** (`src/components/task/task-form-dialog.tsx`)
   - 라인 126: `projectDueDate` 변수로 프로젝트 `due_date` 참조
   - 라인 128: `maxDate`로 프로젝트 완료예정일 사용
   - 라인 336: Input의 `max` 속성에 `maxDate` 사용
   - 라인 346-350: 프로젝트 완료예정일보다 늦은 날짜 선택 시 에러 메시지

#### API 레이어

1. **프로젝트 API** (`src/api/project.ts`)
   - `createProject`: 프로젝트 생성 시 `due_date` 포함 가능
   - `updateProject`: 프로젝트 수정 시 `due_date` 포함 가능
   - `getProjectById`, `getProjects`: 응답에 `due_date` 포함

### 1.3 Task 마감일 필수 여부 현황

#### 현재 상태

- ❌ **Task `due_date`는 현재 optional (nullable)**
- ❌ **Task 생성 스키마** (`src/schemas/task/task-schema.ts:20`): `due_date: z.string().optional().nullable()`
- ❌ **Task 수정 스키마** (`src/schemas/task/task-schema.ts:31`): `due_date: z.string().optional().nullable()`
- ❌ **DB 스키마**: `due_date TIMESTAMPTZ` (nullable)

#### D-Day 계산 로직

- ✅ `src/components/task/task-card.tsx:64-90`: D-Day 계산 및 표시 로직 구현됨
- ✅ `calculateDaysDifference`: 마감일과 오늘 날짜 차이 계산
- ✅ `getDDayText`: D-?, D-Day, D+? 형식으로 표시
- ✅ `getDueDateColorClass`: 마감일 임박 시 색상 변경

---

## 2️⃣ 변경 설계 (계획서)

### 2.1 DB 레벨 변경 계획

#### 선택지 비교

**옵션 A: 컬럼 삭제**

- ✅ 장점:
  - 완전히 제거되어 혼란 방지
  - 스토리지 절약
  - 타입 정의가 깔끔해짐
- ❌ 단점:
  - 기존 데이터 손실 (하지만 nullable이므로 중요하지 않을 수 있음)
  - 마이그레이션 필요

**옵션 B: 컬럼 유지 (nullable, 미사용)**

- ✅ 장점:
  - 마이그레이션 없음
  - 기존 데이터 보존
- ❌ 단점:
  - 스키마에 불필요한 컬럼 남음
  - 향후 혼란 가능성
  - 타입 정의에 계속 포함됨

**결정: 옵션 A (컬럼 삭제)**

- 이유: 완전한 제거가 장기적으로 유지보수에 유리하며, nullable이므로 기존 데이터 손실 영향이 적음

#### 마이그레이션 계획

1. **인덱스 삭제**

   ```sql
   DROP INDEX IF EXISTS public.idx_projects_due_date;
   ```

   - 파일: 새 마이그레이션 파일 생성
   - 참고: `supabase/migrations/20260109000003_cleanup_indexes.sql:57`에 이미 주석 처리됨

2. **컬럼 삭제**

   ```sql
   ALTER TABLE public.projects DROP COLUMN IF EXISTS due_date;
   ```

   - 파일: 새 마이그레이션 파일 생성

3. **마이그레이션 파일명**
   - 예: `20260114000001_remove_projects_due_date.sql`

#### 타입 업데이트 필요 여부

- ✅ **필수**: `supabase gen types typescript --linked > src/database.type.ts` 실행 필요
- 영향 범위:
  - `projects.Row.due_date` 제거
  - `projects.Insert.due_date` 제거
  - `projects.Update.due_date` 제거

#### RLS/뷰/함수/트리거 점검 체크리스트

- ✅ RLS 정책: 프로젝트 `due_date` 참조 없음 (확인 완료)
- ✅ 뷰: 프로젝트 `due_date` 참조 없음 (확인 완료)
- ✅ 함수: 프로젝트 `due_date` 참조 없음 (확인 완료)
- ✅ 트리거: 프로젝트 `due_date` 참조 없음 (확인 완료)
- ✅ 인덱스: `idx_projects_due_date` 삭제 필요 (확인 완료)

### 2.2 프론트엔드 변경 계획

#### 프로젝트 생성/수정 UI

1. **프로젝트 생성 폼** (`src/components/project/project-form-dialog.tsx`)
   - 라인 64, 69: 기본값에서 `due_date: null` 제거
   - 라인 106: 수정 모드 초기값에서 `due_date` 제거
   - 라인 193-207: 완료예정일 입력 필드 전체 제거

2. **프로젝트 수정 폼** (`src/components/project/project-form-dialog.tsx`)
   - 동일하게 완료예정일 입력 필드 제거

3. **프로젝트 스키마** (`src/schemas/project/project-schema.ts`)
   - `projectCreateSchema`에서 `due_date` 필드 제거
   - `projectUpdateSchema`에서 `due_date` 필드 제거

#### 프로젝트 상세/목록 표시 제거

1. **프로젝트 상세 페이지** (`src/pages/project-detail-page.tsx`)
   - 라인 209-231: 프로젝트 `due_date` 검증 로직 제거
   - 라인 239: 프로젝트 수정 API 호출 시 `due_date` 제거
   - 라인 359-362: 프로젝트 정보 카드에서 완료예정일 표시 제거

2. **프로젝트 카드** (`src/components/project/project-card.tsx`)
   - 라인 100-102: 완료예정일 표시 제거

3. **대시보드 페이지들**
   - `src/pages/member-dashboard-page.tsx`:
     - 라인 165-174: 완료예정일 기준 정렬 옵션 제거 (`dueDateNewest`, `dueDateOldest`)
     - 라인 436: 테이블에서 완료예정일 컬럼 제거
   - `src/pages/admin-dashboard-page.tsx`:
     - 라인 191-200: 완료예정일 기준 정렬 옵션 제거
     - 라인 477: 테이블에서 완료예정일 컬럼 제거

#### API 요청/응답 모델

1. **프로젝트 API** (`src/api/project.ts`)
   - `createProject`: `due_date` 필드 제거 (타입에서 자동 제거됨)
   - `updateProject`: `due_date` 필드 제거 (타입에서 자동 제거됨)
   - 응답 타입: `Project` 타입에서 자동으로 `due_date` 제거됨 (DB 타입 업데이트 후)

#### Task 생성 시 프로젝트 due_date 참조 제거

1. **Task 생성 폼** (`src/components/task/task-form-dialog.tsx`)
   - 라인 126: `projectDueDate` 변수 제거
   - 라인 128: `maxDate` 계산 로직 수정 (프로젝트 `due_date` 제거)
   - 라인 336: Input의 `max` 속성 제거 (또는 무제한으로 변경)
   - 라인 346-350: 프로젝트 완료예정일 검증 로직 제거

**주의**: Task 마감일은 여전히 필수이지만, 프로젝트 완료예정일과의 상관관계 검증은 제거됨

---

## 3️⃣ Task 마감일 필수 보장

### 3.1 현재 문제점

- ❌ Task `due_date`가 optional (nullable)
- ❌ Task 생성 스키마에서 필수 검증 없음
- ❌ DB 스키마에서 NOT NULL 제약 없음

### 3.2 변경 계획

#### DB 레벨

1. **컬럼 제약 변경**
   ```sql
   ALTER TABLE public.tasks
   ALTER COLUMN due_date SET NOT NULL;
   ```

   - 파일: 새 마이그레이션 파일 생성
   - 예: `20260114000002_make_task_due_date_required.sql`

#### 프론트엔드 스키마

1. **Task 생성 스키마** (`src/schemas/task/task-schema.ts:20`)

   ```typescript
   // 변경 전
   due_date: z.string().optional().nullable(),

   // 변경 후
   due_date: z.string().min(1, "마감일을 입력해주세요.").refine(
     (val) => {
       const selectedDate = new Date(val);
       const today = new Date();
       today.setHours(0, 0, 0, 0);
       selectedDate.setHours(0, 0, 0, 0);
       return selectedDate >= today;
     },
     { message: "마감일은 오늘 날짜를 포함한 이후 날짜만 선택할 수 있습니다." }
   ),
   ```

2. **Task 수정 스키마** (`src/schemas/task/task-schema.ts:31`)
   - 수정 모드에서도 마감일은 필수로 유지 (변경 불가 또는 필수 유지)
   - 또는 수정 모드에서는 선택사항으로 유지 (기존 Task는 마감일이 있을 수 있으므로)

**권장**: 수정 모드에서도 필수로 유지 (일관성)

#### UI 개선

1. **Task 생성 폼** (`src/components/task/task-form-dialog.tsx`)
   - 라인 331: Label에 필수 표시 추가 (`<span className="text-destructive">*</span>`)
   - 라인 77, 83: 기본값에서 `due_date: null` 제거 (빈 문자열 또는 undefined)
   - 라인 97: 수정 모드 초기값 설정 시 `due_date`가 없으면 에러 처리

2. **폼 제출 버튼 비활성화**
   - 라인 436: `due_date`가 없으면 제출 버튼 비활성화 조건 추가

### 3.3 D-Day 계산 데이터 점검 체크리스트

- ✅ **마감일 데이터**: Task `due_date` (TIMESTAMPTZ)
- ✅ **기준 시각**: 클라이언트의 `new Date()` 사용 (현재 구현)
- ⚠️ **타임존 처리**:
  - 현재: 클라이언트 타임존 사용
  - 권장: 서버 타임존 또는 UTC 기준으로 통일 검토 필요
- ✅ **계산 로직**: `calculateDaysDifference` 함수 구현됨
- ✅ **표시 형식**: D-?, D-Day, D+? 형식 구현됨
- ✅ **UI 표시**: Task 카드에서 마감일 및 D-Day 표시됨

**주의사항**:

- 현재는 클라이언트 타임존을 사용하므로, 사용자별로 다른 결과가 나올 수 있음
- 프로덕션 환경에서는 서버 타임존 또는 UTC 기준으로 통일하는 것을 권장

---

## 4️⃣ 영향 범위 리스트

### 4.1 DB/백엔드 영향 범위

#### 직접 영향

- ✅ `projects` 테이블: `due_date` 컬럼 삭제
- ✅ `idx_projects_due_date` 인덱스 삭제
- ✅ 타입 정의 업데이트 필요

#### 간접 영향

- ✅ RLS 정책: 영향 없음 (확인 완료)
- ✅ 트리거/함수: 영향 없음 (확인 완료)
- ✅ 뷰: 영향 없음 (확인 완료)

### 4.2 프론트엔드 영향 범위

#### 직접 영향

1. **스키마/타입**
   - `src/schemas/project/project-schema.ts`: `due_date` 필드 제거
   - `src/database.type.ts`: 타입 재생성 필요

2. **컴포넌트**
   - `src/components/project/project-form-dialog.tsx`: 완료예정일 입력 필드 제거
   - `src/components/project/project-card.tsx`: 완료예정일 표시 제거
   - `src/components/task/task-form-dialog.tsx`: 프로젝트 `due_date` 참조 제거

3. **페이지**
   - `src/pages/project-detail-page.tsx`: 완료예정일 표시 및 검증 로직 제거
   - `src/pages/member-dashboard-page.tsx`: 완료예정일 정렬 및 표시 제거
   - `src/pages/admin-dashboard-page.tsx`: 완료예정일 정렬 및 표시 제거

4. **API**
   - `src/api/project.ts`: 타입 업데이트 후 자동으로 `due_date` 제거됨

#### 간접 영향

- ✅ Task 마감일 관련 로직: 영향 없음 (유지됨)
- ✅ D-Day 계산 로직: 영향 없음 (Task 마감일 기반)

---

## 5️⃣ 단계별 작업 순서

### Phase 1: 백엔드 (DB 마이그레이션)

1. **마이그레이션 파일 생성**
   - `supabase/migrations/20260114000001_remove_projects_due_date.sql`
   - 인덱스 삭제 + 컬럼 삭제

2. **마이그레이션 실행**

   ```bash
   supabase migration up
   ```

3. **타입 재생성**

   ```bash
   supabase gen types typescript --linked > src/database.type.ts
   ```

4. **검증**
   - DB에서 `projects.due_date` 컬럼 삭제 확인
   - 타입 정의에서 `due_date` 제거 확인

### Phase 2: Task 마감일 필수화 (백엔드)

1. **마이그레이션 파일 생성**
   - `supabase/migrations/20260114000002_make_task_due_date_required.sql`
   - `ALTER TABLE tasks ALTER COLUMN due_date SET NOT NULL;`

2. **마이그레이션 실행**

   ```bash
   supabase migration up
   ```

3. **타입 재생성**

   ```bash
   supabase gen types typescript --linked > src/database.type.ts
   ```

4. **검증**
   - DB에서 `tasks.due_date` NOT NULL 제약 확인
   - 기존 NULL 값이 있으면 마이그레이션 실패 (데이터 정리 필요)

### Phase 3: 프론트엔드 (타입 업데이트)

1. **타입 정의 확인**
   - `src/database.type.ts`에서 `projects.due_date` 제거 확인
   - `src/database.type.ts`에서 `tasks.due_date` NOT NULL 확인

### Phase 4: 프론트엔드 (프로젝트 관련)

1. **스키마 수정**
   - `src/schemas/project/project-schema.ts`: `due_date` 필드 제거

2. **컴포넌트 수정**
   - `src/components/project/project-form-dialog.tsx`: 완료예정일 입력 필드 제거
   - `src/components/project/project-card.tsx`: 완료예정일 표시 제거

3. **페이지 수정**
   - `src/pages/project-detail-page.tsx`: 완료예정일 표시 및 검증 로직 제거
   - `src/pages/member-dashboard-page.tsx`: 완료예정일 정렬 및 표시 제거
   - `src/pages/admin-dashboard-page.tsx`: 완료예정일 정렬 및 표시 제거

4. **API 수정**
   - `src/api/project.ts`: 타입 업데이트로 자동 반영됨 (명시적 수정 불필요)

### Phase 5: 프론트엔드 (Task 관련)

1. **Task 생성 폼 수정**
   - `src/components/task/task-form-dialog.tsx`: 프로젝트 `due_date` 참조 제거

2. **Task 스키마 수정**
   - `src/schemas/task/task-schema.ts`: `due_date` 필수로 변경

3. **Task 생성 폼 UI 개선**
   - `src/components/task/task-form-dialog.tsx`: 마감일 필수 표시 및 검증 강화

---

## 6️⃣ 리스크/주의사항

### 6.1 데이터 무결성

#### 리스크

- ⚠️ **기존 프로젝트 데이터**: `due_date`가 NULL인 경우가 많을 수 있음 (영향 없음)
- ⚠️ **기존 Task 데이터**: `due_date`가 NULL인 경우가 있을 수 있음 (Phase 2 마이그레이션 실패 가능)

#### 대응 방안

- Phase 2 실행 전에 NULL 값이 있는 Task 확인 및 데이터 정리 필요
  ```sql
  SELECT COUNT(*) FROM tasks WHERE due_date IS NULL;
  ```
- NULL 값이 있으면 마이그레이션 전에 기본값 설정 또는 데이터 정리 필요

### 6.2 호환성

#### 리스크

- ⚠️ **기존 API 호출**: 프로젝트 생성/수정 시 `due_date`를 보내는 코드가 있으면 에러 발생 가능

#### 대응 방안

- 프론트엔드에서 `due_date` 필드를 완전히 제거하여 API 호출 시 포함되지 않도록 함
- 타입 정의 업데이트로 컴파일 타임에 에러 감지 가능

### 6.3 Task 마감일 검증

#### 리스크

- ⚠️ **프로젝트 완료예정일 제거**: Task 마감일이 프로젝트 완료예정일보다 늦어도 생성 가능해짐

#### 대응 방안

- 비즈니스 로직상 문제없다고 판단됨 (프로젝트 완료예정일이 더 이상 의미 없음)
- 필요시 별도의 비즈니스 규칙 추가 가능

### 6.4 정렬 기능

#### 리스크

- ⚠️ **대시보드 정렬**: 완료예정일 기준 정렬 옵션 제거로 사용자 혼란 가능

#### 대응 방안

- UI에서 완료예정일 정렬 옵션을 완전히 제거하여 선택 불가능하게 함
- 대체 정렬 옵션 제공 (생성일, 고객명 등)

---

## 7️⃣ 검증 체크리스트 (수동 테스트 시나리오)

### 7.1 프로젝트 생성

- [ ] 프로젝트 생성 폼에 완료예정일 입력 필드가 없음
- [ ] 프로젝트 생성 시 완료예정일 없이 생성 가능
- [ ] 프로젝트 생성 후 상세 페이지에서 완료예정일이 표시되지 않음

### 7.2 프로젝트 수정

- [ ] 프로젝트 수정 폼에 완료예정일 입력 필드가 없음
- [ ] 프로젝트 수정 시 완료예정일 관련 검증 로직이 없음
- [ ] 프로젝트 수정 후 완료예정일이 표시되지 않음

### 7.3 프로젝트 목록/상세

- [ ] 프로젝트 상세 페이지에서 완료예정일이 표시되지 않음
- [ ] 프로젝트 카드에서 완료예정일이 표시되지 않음
- [ ] 대시보드 테이블에서 완료예정일 컬럼이 없음
- [ ] 대시보드 정렬 옵션에서 완료예정일 기준 정렬이 없음

### 7.4 Task 생성

- [ ] Task 생성 폼에 마감일 입력 필드가 있음 (필수 표시 포함)
- [ ] Task 생성 시 마감일을 입력하지 않으면 에러 메시지 표시
- [ ] Task 생성 시 마감일을 입력하지 않으면 제출 버튼 비활성화
- [ ] Task 생성 시 프로젝트 완료예정일과의 검증 로직이 없음
- [ ] Task 생성 후 마감일이 정상적으로 저장됨
- [ ] Task 카드에서 마감일 및 D-Day가 정상적으로 표시됨

### 7.5 Task 수정

- [ ] Task 수정 폼에 마감일 입력 필드가 있음
- [ ] Task 수정 시 마감일 수정 가능
- [ ] Task 수정 후 마감일이 정상적으로 업데이트됨

### 7.6 D-Day 계산

- [ ] Task 마감일이 오늘보다 미래인 경우: D-? 형식으로 표시
- [ ] Task 마감일이 오늘인 경우: D-Day 형식으로 표시
- [ ] Task 마감일이 오늘보다 과거인 경우: D+? 형식으로 표시
- [ ] 마감일 임박 시 색상 변경이 정상 작동함

### 7.7 API 호출

- [ ] 프로젝트 생성 API 호출 시 `due_date` 필드가 포함되지 않음
- [ ] 프로젝트 수정 API 호출 시 `due_date` 필드가 포함되지 않음
- [ ] 프로젝트 조회 API 응답에 `due_date` 필드가 없음
- [ ] Task 생성 API 호출 시 `due_date` 필드가 포함됨 (필수)
- [ ] Task 수정 API 호출 시 `due_date` 필드 수정 가능

### 7.8 타입 체크

- [ ] TypeScript 컴파일 에러 없음
- [ ] `Project` 타입에 `due_date` 필드가 없음
- [ ] `Task` 타입에 `due_date` 필드가 있음 (필수)

---

## 8️⃣ 불확실하거나 애매한 부분

### 8.1 발견된 불확실한 부분

1. **Task 마감일 필수화 시 기존 NULL 데이터**
   - 현재 DB에 `due_date`가 NULL인 Task가 있는지 확인 필요
   - 있다면 마이그레이션 전에 데이터 정리 방안 필요

2. **Task 수정 모드에서 마감일 필수 여부**
   - 생성 모드: 필수
   - 수정 모드: 필수로 유지할지, 선택사항으로 유지할지 결정 필요
   - **권장**: 수정 모드에서도 필수로 유지 (일관성)

3. **타임존 처리**
   - 현재 D-Day 계산이 클라이언트 타임존 사용
   - 서버 타임존 또는 UTC 기준으로 통일할지 결정 필요
   - **권장**: 프로덕션 환경에서는 서버 타임존 또는 UTC 기준 통일

4. **프로젝트 완료예정일 제거 후 Task 마감일 검증**
   - 현재: Task 마감일이 프로젝트 완료예정일보다 늦으면 생성 불가
   - 변경 후: 프로젝트 완료예정일이 없으므로 검증 로직 제거
   - **확인 필요**: 비즈니스 로직상 문제없는지 확인

### 8.2 추가 확인 필요 사항

1. **기존 프로젝트 데이터**
   - `due_date`가 NULL이 아닌 프로젝트가 있는지 확인
   - 있다면 해당 데이터를 어떻게 처리할지 결정

2. **기존 Task 데이터**
   - `due_date`가 NULL인 Task가 있는지 확인
   - 있다면 마이그레이션 전에 데이터 정리 필요

3. **정렬 옵션 UI**
   - 대시보드에서 완료예정일 정렬 옵션을 완전히 제거할지, 비활성화만 할지 결정
   - **권장**: 완전히 제거 (코드 정리)

---

## 9️⃣ 최종 체크리스트

### 백엔드

- [ ] 마이그레이션 파일 생성 (`remove_projects_due_date.sql`)
- [ ] 마이그레이션 파일 생성 (`make_task_due_date_required.sql`)
- [ ] 마이그레이션 실행 및 검증
- [ ] 타입 재생성 및 검증

### 프론트엔드 (프로젝트)

- [ ] 프로젝트 스키마에서 `due_date` 제거
- [ ] 프로젝트 생성/수정 폼에서 완료예정일 입력 필드 제거
- [ ] 프로젝트 상세 페이지에서 완료예정일 표시 제거
- [ ] 프로젝트 카드에서 완료예정일 표시 제거
- [ ] 대시보드에서 완료예정일 정렬 및 표시 제거

### 프론트엔드 (Task)

- [ ] Task 생성 폼에서 프로젝트 `due_date` 참조 제거
- [ ] Task 스키마에서 `due_date` 필수로 변경
- [ ] Task 생성 폼 UI에서 마감일 필수 표시 및 검증 강화

### 테스트

- [ ] 수동 테스트 시나리오 실행
- [ ] TypeScript 컴파일 에러 확인
- [ ] 런타임 에러 확인

---

## 📝 참고 파일 목록

### 마이그레이션 파일

- `supabase/migrations/20250101000001_create_projects_table.sql`
- `supabase/migrations/20250101000002_create_tasks_table.sql`
- `supabase/migrations/20260109000003_cleanup_indexes.sql`

### 프론트엔드 파일

- `src/schemas/project/project-schema.ts`
- `src/schemas/task/task-schema.ts`
- `src/components/project/project-form-dialog.tsx`
- `src/components/project/project-card.tsx`
- `src/components/task/task-form-dialog.tsx`
- `src/components/task/task-card.tsx`
- `src/pages/project-detail-page.tsx`
- `src/pages/member-dashboard-page.tsx`
- `src/pages/admin-dashboard-page.tsx`
- `src/api/project.ts`
- `src/api/task.ts`
- `src/database.type.ts`

---

**작성일**: 2026-01-14
**작성자**: Tasko 개발 에이전트
**상태**: 계획 완료 (코드 작성 전)
