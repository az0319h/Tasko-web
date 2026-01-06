# 1단계 완료: 공통 레이아웃 및 권한 흐름

## 📁 폴더 구조

```
src/
├── api/
│   ├── project.ts          # 프로젝트 API 함수
│   ├── task.ts              # Task API 함수
│   └── message.ts           # 메시지 API 함수
├── hooks/
│   ├── queries/
│   │   ├── use-projects.ts  # 프로젝트 조회 훅
│   │   ├── use-tasks.ts     # Task 조회 훅
│   │   └── use-messages.ts  # 메시지 조회 훅
│   └── mutations/
│       ├── use-project.ts   # 프로젝트 CRUD 뮤테이션 훅
│       ├── use-task.ts       # Task CRUD 뮤테이션 훅
│       └── use-message.ts    # 메시지 생성 뮤테이션 훅
├── components/
│   ├── ui/
│   │   ├── table.tsx         # shadcn/ui Table 컴포넌트
│   │   └── badge.tsx         # shadcn/ui Badge 컴포넌트
│   └── common/
│       ├── project-status-badge.tsx  # 프로젝트 상태 배지
│       └── task-status-badge.tsx     # Task 상태 배지
├── lib/
│   └── project-permissions.ts  # 권한 확인 유틸리티
└── database.type.ts            # Supabase 타입 정의 (업데이트됨)
```

## 📋 각 컴포넌트의 책임

### API 레이어 (`src/api/`)

#### `project.ts`
- **책임**: 프로젝트 관련 Supabase API 호출
- **주요 함수**:
  - `getProjects()`: 프로젝트 목록 조회 (RLS 정책 적용)
  - `getProjectById()`: 프로젝트 상세 조회
  - `createProject()`: 프로젝트 생성 (Admin만 가능)
  - `updateProject()`: 프로젝트 수정 (Admin만 가능)
  - `deleteProject()`: 프로젝트 삭제 (Admin만 가능)

#### `task.ts`
- **책임**: Task 관련 Supabase API 호출
- **주요 함수**:
  - `getTasksByProjectId()`: 프로젝트의 Task 목록 조회
  - `getTaskById()`: Task 상세 조회
  - `createTask()`: Task 생성 (Admin만 가능)
  - `updateTask()`: Task 수정 (assigner/assignee만 가능)
  - `deleteTask()`: Task 삭제 (Admin만 가능)

#### `message.ts`
- **책임**: 메시지 관련 Supabase API 호출
- **주요 함수**:
  - `getMessagesByTaskId()`: Task의 메시지 목록 조회
  - `createMessage()`: 메시지 생성

### React Query 훅 (`src/hooks/`)

#### Queries (`src/hooks/queries/`)

**`use-projects.ts`**
- `useProjects()`: 프로젝트 목록 조회 훅
  - 캐시 시간: 30초
  - RLS 정책에 따라 권한별로 다른 프로젝트 목록 반환

- `useProject(id)`: 프로젝트 상세 조회 훅
  - ID가 있을 때만 쿼리 실행
  - 캐시 시간: 30초

**`use-tasks.ts`**
- `useTasks(projectId)`: 프로젝트의 Task 목록 조회 훅
  - 프로젝트 ID가 있을 때만 쿼리 실행
  - 캐시 시간: 30초

- `useTask(id)`: Task 상세 조회 훅
  - ID가 있을 때만 쿼리 실행
  - 캐시 시간: 30초

**`use-messages.ts`**
- `useMessages(taskId)`: Task의 메시지 목록 조회 훅
  - Task ID가 있을 때만 쿼리 실행
  - 캐시 시간: 10초 (메시지는 더 자주 갱신)

#### Mutations (`src/hooks/mutations/`)

**`use-project.ts`**
- `useCreateProject()`: 프로젝트 생성 뮤테이션
  - 성공 시 프로젝트 목록 캐시 무효화
  - 성공/실패 토스트 메시지 표시

- `useUpdateProject()`: 프로젝트 수정 뮤테이션
  - 성공 시 프로젝트 목록 및 상세 캐시 무효화
  - 성공/실패 토스트 메시지 표시

- `useDeleteProject()`: 프로젝트 삭제 뮤테이션
  - 성공 시 프로젝트 목록 캐시 무효화
  - 성공/실패 토스트 메시지 표시

**`use-task.ts`**
- `useCreateTask()`: Task 생성 뮤테이션
  - 성공 시 Task 목록 및 프로젝트 목록 캐시 무효화
  - 성공/실패 토스트 메시지 표시

- `useUpdateTask()`: Task 수정 뮤테이션
  - 성공 시 Task 목록 및 상세 캐시 무효화
  - 성공/실패 토스트 메시지 표시

- `useDeleteTask()`: Task 삭제 뮤테이션
  - 성공 시 Task 목록 및 프로젝트 목록 캐시 무효화
  - 성공/실패 토스트 메시지 표시

**`use-message.ts`**
- `useCreateMessage()`: 메시지 생성 뮤테이션
  - 성공 시 메시지 목록 캐시 무효화
  - 에러는 콘솔에만 출력 (토스트 없음)

### 공통 컴포넌트 (`src/components/common/`)

#### `project-status-badge.tsx`
- **책임**: 프로젝트 상태를 시각적으로 표시
- **Props**: `status` (inProgress | done)
- **기능**: 상태에 따라 다른 색상의 배지 표시

#### `task-status-badge.tsx`
- **책임**: Task 상태를 시각적으로 표시
- **Props**: `status` (ASSIGNED | IN_PROGRESS | WAITING_CONFIRM | APPROVED | REJECTED)
- **기능**: 상태에 따라 다른 색상의 배지 표시

### UI 컴포넌트 (`src/components/ui/`)

#### `table.tsx`
- **책임**: shadcn/ui Table 컴포넌트
- **구성 요소**:
  - `Table`: 테이블 컨테이너
  - `TableHeader`: 테이블 헤더
  - `TableBody`: 테이블 본문
  - `TableRow`: 테이블 행
  - `TableHead`: 테이블 헤더 셀
  - `TableCell`: 테이블 데이터 셀

#### `badge.tsx`
- **책임**: shadcn/ui Badge 컴포넌트
- **Variants**: default, secondary, destructive, outline

### 유틸리티 (`src/lib/`)

#### `project-permissions.ts`
- **책임**: 프로젝트 및 Task 접근 권한 확인 함수
- **주요 함수**:
  - `canAccessProject()`: 프로젝트 접근 권한 확인
  - `canEditTask()`: Task 수정 권한 확인
  - `canManageProject()`: 프로젝트 관리 권한 확인 (Admin만)

## 🔗 Supabase 연결 지점

### 1. 타입 정의 (`src/database.type.ts`)
- **연결 지점**: Supabase 데이터베이스 스키마 타입 정의
- **추가된 타입**:
  - `projects` 테이블 타입
  - `tasks` 테이블 타입
  - `messages` 테이블 타입
  - `email_logs` 테이블 타입
  - Enum 타입: `project_status`, `task_status`, `message_type`

### 2. API 함수 (`src/api/`)
- **연결 지점**: Supabase 클라이언트를 통한 데이터베이스 쿼리
- **사용 패턴**:
  ```typescript
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .order("created_at", { ascending: false });
  ```
- **RLS 정책**: 모든 쿼리는 RLS 정책에 의해 자동으로 필터링됨
  - Public 프로젝트: 모든 사용자 조회 가능
  - Private 프로젝트: Admin 또는 Task 참여자만 조회 가능
  - Task 수정: assigner/assignee만 가능 (Admin 불가)

### 3. React Query 훅 (`src/hooks/`)
- **연결 지점**: API 함수를 React Query로 래핑
- **캐싱 전략**:
  - 프로젝트/Task 목록: 30초 캐시
  - 메시지 목록: 10초 캐시 (더 자주 갱신)
- **자동 무효화**: 뮤테이션 성공 시 관련 쿼리 캐시 자동 무효화

### 4. 권한 확인 (`src/lib/project-permissions.ts`)
- **연결 지점**: 사용자 프로필 및 Admin 권한 확인
- **사용 훅**:
  - `useCurrentProfile()`: 현재 사용자 프로필
  - `useIsAdmin()`: Admin 권한 확인

## ✅ 완료된 작업

1. ✅ 데이터베이스 타입 정의 (projects, tasks, messages, email_logs)
2. ✅ 프로젝트 API 함수 구현 (CRUD)
3. ✅ Task API 함수 구현 (CRUD)
4. ✅ 메시지 API 함수 구현 (조회, 생성)
5. ✅ React Query 훅 구현 (queries, mutations)
6. ✅ 공통 컴포넌트 구현 (상태 배지)
7. ✅ UI 컴포넌트 추가 (Table, Badge)
8. ✅ 권한 확인 유틸리티 구현

## 🎯 다음 단계 준비 완료

1단계가 완료되었으므로 다음 단계에서 다음을 구현할 수 있습니다:
- 프로젝트 목록 페이지 (홈 대시보드)
- 프로젝트 상세 페이지
- Task 관리 기능
- 검색 및 필터링 기능

## 📝 사용 예시

### 프로젝트 목록 조회
```typescript
import { useProjects } from "@/hooks";

function ProjectList() {
  const { data: projects, isLoading } = useProjects();
  
  if (isLoading) return <div>로딩 중...</div>;
  
  return (
    <div>
      {projects?.map(project => (
        <div key={project.id}>{project.title}</div>
      ))}
    </div>
  );
}
```

### 프로젝트 생성
```typescript
import { useCreateProject } from "@/hooks";

function CreateProjectForm() {
  const createProject = useCreateProject();
  
  const handleSubmit = async (data: ProjectInsert) => {
    await createProject.mutateAsync(data);
  };
  
  return <form onSubmit={handleSubmit}>...</form>;
}
```

### 권한 확인
```typescript
import { canManageProject } from "@/lib/project-permissions";
import { useIsAdmin } from "@/hooks";

function ProjectActions() {
  const { data: isAdmin } = useIsAdmin();
  
  if (!canManageProject(isAdmin)) {
    return null;
  }
  
  return <button>프로젝트 수정</button>;
}
```

---

**다음 단계로 진행할까요?**

