# 2단계 완료: 핵심 기능 페이지

## 📁 생성된 파일 구조

```
src/
├── pages/
│   ├── index-page.tsx                    ✅ 프로젝트 목록 페이지 (홈 대시보드)
│   └── project-detail-page.tsx           ✅ 프로젝트 상세 페이지
├── components/
│   ├── project/
│   │   ├── project-form-dialog.tsx       ✅ 프로젝트 생성/수정 폼 다이얼로그
│   │   └── project-delete-dialog.tsx     ✅ 프로젝트 삭제 확인 다이얼로그
│   └── task/
│       ├── task-form-dialog.tsx           ✅ Task 생성 폼 다이얼로그
│       └── task-delete-dialog.tsx        ✅ Task 삭제 확인 다이얼로그
├── schemas/
│   ├── project/
│   │   └── project-schema.ts             ✅ 프로젝트 폼 스키마 (zod)
│   └── task/
│       └── task-schema.ts                ✅ Task 폼 스키마 (zod)
└── hooks/
    └── queries/
        └── use-profiles.ts                ✅ 프로필 목록 조회 훅
```

## 📋 각 컴포넌트의 책임

### 페이지 컴포넌트

#### `index-page.tsx` (홈 대시보드)
- **책임**: 프로젝트 목록 표시 및 관리
- **주요 기능**:
  - 프로젝트 목록 테이블 표시 (shadcn/ui Table)
  - 실시간 검색 (debounce 300ms)
  - 상태 필터링 (전체/진행중/완료)
  - 정렬 (최신순/오래된순)
  - URL 쿼리 파라미터로 상태 유지
  - Admin 권한에 따른 프로젝트 생성 버튼 표시
  - Admin 권한에 따른 수정/삭제 메뉴 표시
- **Supabase 연결**: `useProjects()` 훅을 통해 RLS 정책 적용된 프로젝트 목록 조회

#### `project-detail-page.tsx` (프로젝트 상세)
- **책임**: 프로젝트 상세 정보 및 Task 목록 표시
- **주요 기능**:
  - 프로젝트 정보 카드 표시
  - Task 목록 테이블 표시
  - Admin 권한에 따른 Task 생성 버튼
  - Task 삭제 기능 (Admin만)
- **Supabase 연결**: 
  - `useProject(id)` 훅으로 프로젝트 상세 조회
  - `useTasks(projectId)` 훅으로 Task 목록 조회

### 다이얼로그 컴포넌트

#### `project-form-dialog.tsx`
- **책임**: 프로젝트 생성/수정 폼
- **주요 기능**:
  - 프로젝트 정보 입력 폼 (제목, 클라이언트명, 특허명, 완료예정일, 공개 여부)
  - react-hook-form + zod 유효성 검사
  - 생성/수정 모드 자동 전환
- **Supabase 연결**: `useCreateProject()`, `useUpdateProject()` 뮤테이션 훅 사용

#### `project-delete-dialog.tsx`
- **책임**: 프로젝트 삭제 확인
- **주요 기능**:
  - 삭제 확인 모달
  - 삭제할 프로젝트명 표시
- **Supabase 연결**: `useDeleteProject()` 뮤테이션 훅 사용

#### `task-form-dialog.tsx`
- **책임**: Task 생성 폼
- **주요 기능**:
  - Task 정보 입력 폼 (제목, 설명, 담당자, 할당받은 사람, 마감일)
  - 프로필 완료된 사용자만 선택 가능
  - 담당자와 할당받은 사람이 같을 수 없도록 검증
- **Supabase 연결**: `useCreateTask()` 뮤테이션 훅 사용

#### `task-delete-dialog.tsx`
- **책임**: Task 삭제 확인
- **주요 기능**:
  - 삭제 확인 모달
  - 삭제할 Task 제목 표시
- **Supabase 연결**: `useDeleteTask()` 뮤테이션 훅 사용

### 스키마

#### `project-schema.ts`
- **책임**: 프로젝트 폼 데이터 유효성 검사
- **필드**:
  - `title`: 필수, 1-200자
  - `client_name`: 필수, 1-100자
  - `patent_name`: 필수, 1-100자
  - `due_date`: 선택, 날짜 형식
  - `is_public`: 기본값 true

#### `task-schema.ts`
- **책임**: Task 폼 데이터 유효성 검사
- **필드**:
  - `title`: 필수, 1-200자
  - `description`: 선택, 최대 1000자
  - `assigner_id`: 필수, UUID
  - `assignee_id`: 필수, UUID
  - `due_date`: 선택, 날짜 형식

### 훅

#### `use-profiles.ts`
- **책임**: 프로필 완료된 사용자 목록 조회
- **필터링**: `profile_completed = true`, `is_active = true`
- **정렬**: 이름 순서

## 🔗 Supabase 연결 지점

### 1. 프로젝트 목록 페이지 (`index-page.tsx`)
- **연결 지점**: `useProjects()` 훅
- **RLS 정책**: 
  - Admin: 모든 프로젝트 조회 가능
  - Member: Public 프로젝트 또는 Task 참여한 Private 프로젝트만 조회 가능
- **필터링**: 클라이언트 측에서 검색어, 상태, 정렬 처리

### 2. 프로젝트 상세 페이지 (`project-detail-page.tsx`)
- **연결 지점**: 
  - `useProject(id)`: 프로젝트 상세 조회
  - `useTasks(projectId)`: Task 목록 조회
- **RLS 정책**: 프로젝트 접근 권한이 있으면 Task 목록 조회 가능

### 3. 프로젝트 CRUD (`project-form-dialog.tsx`, `project-delete-dialog.tsx`)
- **연결 지점**: 
  - `useCreateProject()`: 프로젝트 생성 (Admin만)
  - `useUpdateProject()`: 프로젝트 수정 (Admin만)
  - `useDeleteProject()`: 프로젝트 삭제 (Admin만)
- **RLS 정책**: RLS 정책에 의해 Admin만 CRUD 가능

### 4. Task CRUD (`task-form-dialog.tsx`, `task-delete-dialog.tsx`)
- **연결 지점**:
  - `useCreateTask()`: Task 생성 (Admin만)
  - `useDeleteTask()`: Task 삭제 (Admin만)
- **RLS 정책**: RLS 정책에 의해 Admin만 생성/삭제 가능

### 5. 프로필 목록 (`use-profiles.ts`)
- **연결 지점**: Supabase `profiles` 테이블 직접 쿼리
- **필터링**: 프로필 완료된 사용자만 조회

## ✅ 완료된 기능

### 홈 대시보드 (프로젝트 목록)
- ✅ 프로젝트 목록 테이블 표시
- ✅ 실시간 검색 (debounce 300ms)
- ✅ 상태 필터링 (전체/진행중/완료)
- ✅ 정렬 (최신순/오래된순)
- ✅ URL 쿼리 파라미터로 상태 유지
- ✅ 권한별 프로젝트 목록 조회 (RLS 정책 적용)
- ✅ Admin 권한에 따른 생성/수정/삭제 버튼 표시

### 프로젝트 관리
- ✅ 프로젝트 생성 폼 (Dialog)
- ✅ 프로젝트 수정 폼 (Dialog)
- ✅ 프로젝트 삭제 확인 (AlertDialog)
- ✅ 폼 유효성 검사 (react-hook-form + zod)
- ✅ 성공/실패 토스트 메시지

### 프로젝트 상세 페이지
- ✅ 프로젝트 정보 카드 표시
- ✅ Task 목록 테이블 표시
- ✅ Task 생성 기능 (Admin만)
- ✅ Task 삭제 기능 (Admin만)
- ✅ 담당자 이름 표시 (프로필 조회)

## 📝 사용 예시

### 프로젝트 목록 페이지 접근
```
URL: /
- 검색: ?search=카메라
- 필터: ?status=inProgress
- 정렬: ?sort=oldest
- 조합: ?search=카메라&status=inProgress&sort=newest
```

### 프로젝트 상세 페이지 접근
```
URL: /projects/{project-id}
- 프로젝트 정보 및 Task 목록 표시
- Task 생성/삭제 기능 (Admin만)
```

### 프로젝트 생성
```typescript
// Admin 사용자가 프로젝트 생성 버튼 클릭
// → ProjectFormDialog 열림
// → 폼 작성 후 제출
// → useCreateProject() 뮤테이션 실행
// → 성공 시 프로젝트 목록 자동 갱신
```

### 프로젝트 수정
```typescript
// Admin 사용자가 프로젝트 행의 메뉴 클릭 → 수정 선택
// → ProjectFormDialog 열림 (기존 데이터로 채워짐)
// → 폼 수정 후 제출
// → useUpdateProject() 뮤테이션 실행
// → 성공 시 프로젝트 목록 자동 갱신
```

### 프로젝트 삭제
```typescript
// Admin 사용자가 프로젝트 행의 메뉴 클릭 → 삭제 선택
// → ProjectDeleteDialog 열림
// → 확인 클릭
// → useDeleteProject() 뮤테이션 실행
// → 성공 시 프로젝트 목록 자동 갱신
```

## 🎯 다음 단계 준비

2단계가 완료되었으므로 다음 단계에서 구현할 수 있습니다:
- Task 상세 페이지
- Task 상태 관리 시스템 (5단계 워크플로우)
- Task 수정 기능 (assigner/assignee만 가능)
- 실시간 채팅 시스템

---

**다음 단계로 진행할까요?**

