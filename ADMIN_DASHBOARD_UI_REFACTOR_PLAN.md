# 관리자 대시보드 UI 개편 계획서

## 📋 작업 개요

**목표**: 관리자 대시보드의 "칸반 보드" 탭을 URL params 기반 목록(테이블) UI로 변경  
**제약사항**: 백엔드/DB/RLS/API 수정 금지 (FE만 수정)  
**작업 범위**: `src/pages/admin-dashboard-page.tsx` 및 관련 컴포넌트

---

## 🔍 현재 구조 분석

### 1. 관리자 대시보드 페이지

**파일**: `src/pages/admin-dashboard-page.tsx`

**현재 구조**:

- 두 개의 탭: "칸반 보드" (`kanban`) / "전체 프로젝트" (`projects`)
- URL params: `layout` (탭 선택), `status` (칸반 보드 상태 필터)
- 칸반 보드 탭: `KanbanBoardWithProjects` 컴포넌트 사용
- 전체 프로젝트 탭: 프로젝트 테이블 + 검색/정렬/페이지네이션

**데이터 fetching**:

- `useProjects()`: 모든 프로젝트 조회
- `useTasksForMember(true)`: 담당자/지시자 Task만 조회 (APPROVED 제외)
- `useCurrentProfile()`: 현재 사용자 프로필

### 2. 칸반 보드 컴포넌트

**파일**: `src/components/task/kanban-board-with-projects.tsx`

**현재 기능**:

- 역할 필터: 전체 / 내가 지시자 / 내가 담당자 / 내가 관련된 Task
- 상태 필터: 전체 / 할당됨 / 진행중 / 확인대기 / 거부됨
- 검색: 프로젝트, Task 제목, 담당자명, 지시자명
- 정렬: 마감일 빠른 순 / 마감일 느린 순 / 생성일 순
- 카테고리별 컬럼: 검토 / 계약 / 명세서 / 출원 (4개 컬럼)
- 프로젝트 카드 아코디언으로 표시

### 3. Task 데이터 구조

**타입**: `TaskWithProfiles` (`src/api/task.ts`)

**주요 필드**:

- `id`: Task ID
- `title`: Task 제목 (지시사항)
- `task_category`: REVIEW | CONTRACT | SPECIFICATION | APPLICATION
- `task_status`: ASSIGNED | IN_PROGRESS | WAITING_CONFIRM | REJECTED | APPROVED
- `due_date`: 마감일
- `assigner_id`, `assignee_id`: 지시자/담당자 ID
- `assigner`, `assignee`: 프로필 정보 (full_name, email)
- `project_id`: 프로젝트 ID

### 4. 프로젝트 데이터 구조

**타입**: `Project` (`src/api/project.ts`)

**주요 필드**:

- `id`: 프로젝트 ID
- `title`: 기회명 (기존 opportunity에서 변경됨)
- `client_name`: 고객명

### 5. "내가 관련된 Task" 기준 분석

**현재 구현** (`useTasksForMember`):

```typescript
// src/api/task.ts의 getTasksForMember 함수
.or(`assigner_id.eq.${userId},assignee_id.eq.${userId}`)
```

**결론**:

- ✅ 내가 지시자(`assigner_id`)이거나
- ✅ 내가 담당자(`assignee_id`)이거나
- ❌ 프로젝트 참여자는 별도 필드가 없음 (프로젝트 참여자 테이블은 있지만 Task 레벨 필터링에는 사용 불가)

**FE에서 필터링 가능한 기준**:

- `task.assigner_id === currentUserId` (내가 지시자)
- `task.assignee_id === currentUserId` (내가 담당자)
- 위 두 조건 중 하나라도 만족하면 "내가 관련된 Task"

---

## ✅ 변경 사항 상세

### 1. 탭 이름 변경

**변경 전**: "칸반 보드"  
**변경 후**: "내가 관련된 프로젝트"

**위치**: `src/pages/admin-dashboard-page.tsx` 277번째 줄

```typescript
<TabsTrigger value="kanban">칸반 보드</TabsTrigger>
```

→

```typescript
<TabsTrigger value="kanban">내가 관련된 프로젝트</TabsTrigger>
```

### 2. 제거할 UI 요소

#### 2.1 역할 필터 탭 (제거)

**위치**: `KanbanBoardWithProjects` 컴포넌트 내부 (267-285번째 줄)

- "전체 / 내가 지시자 / 내가 담당자 / 내가 관련된 Task" 탭 제거
- 역할 필터 로직은 제거하되, 기본적으로 "내가 관련된 Task"만 표시하도록 고정

#### 2.2 상태 필터 탭 (제거)

**위치**: `KanbanBoardWithProjects` 컴포넌트 내부 (287-299번째 줄)

- "전체/할당됨/진행중/확인대기/거부됨" 상태 필터 탭 제거
- 대신 테이블 헤더 "상태" 컬럼에 드롭다운으로 이동

#### 2.3 정렬 드롭다운 (제거)

**위치**: `KanbanBoardWithProjects` 컴포넌트 내부 (312-323번째 줄)

- 검색창 오른쪽의 "마감일 빠른 순" 드롭다운 제거
- 대신 테이블 헤더 "마감일" 클릭으로 정렬 토글

#### 2.4 칸반 컬럼 UI (제거)

**위치**: `KanbanBoardWithProjects` 컴포넌트 내부 (326-380번째 줄)

- 4개 카테고리 컬럼(검토/계약/명세서/출원) 제거
- 프로젝트 카드 아코디언 제거

### 3. 추가할 UI 요소

#### 3.1 카테고리 탭 (추가)

**위치**: "내가 관련된 프로젝트" 탭 내부, 검색창 위쪽

**구조**:

```typescript
<Tabs value={category} onValueChange={handleCategoryChange}>
  <TabsList>
    <TabsTrigger value="review">검토</TabsTrigger>
    <TabsTrigger value="contract">계약</TabsTrigger>
    <TabsTrigger value="spec">명세서</TabsTrigger>
    <TabsTrigger value="apply">출원</TabsTrigger>
  </TabsList>
</Tabs>
```

**카테고리 매핑**:

- `review` → `REVIEW`
- `contract` → `CONTRACT`
- `spec` → `SPECIFICATION`
- `apply` → `APPLICATION`

#### 3.2 검색창 (유지)

**위치**: 카테고리 탭 아래

**기능**:

- 기존 검색 로직 그대로 사용
- placeholder: "프로젝트, Task 제목, 담당자명 또는 지시자명으로 검색..."
- 검색어는 `q` params로 저장

#### 3.3 테이블 UI (추가)

**위치**: 검색창 아래

**컬럼 구성** (순서대로):

1. **기회명**: `project.title` (프로젝트 맵에서 조회)
2. **지시사항**: `task.title`
3. **마감일**: `task.due_date` (포맷팅 + D-Day 표시)
4. **지시자**: `task.assigner.full_name || task.assigner.email`
5. **담당자**: `task.assignee.full_name || task.assignee.email`
6. **상태**: `TaskStatusBadge` 컴포넌트 사용

**테이블 헤더 기능**:

- **마감일 헤더 클릭**: `asc` ↔ `desc` 토글 (기본값: `asc`)
- **상태 헤더 클릭**: 드롭다운 열기 (전체/할당됨/진행중/확인대기/거부됨/승인됨)

**행 클릭**: Task 상세 페이지로 이동 (`/tasks/${task.id}`)

---

## 🔗 URL Params 설계

### Params 스펙

| 파라미터   | 타입                                                                                  | 기본값   | 설명                                           |
| ---------- | ------------------------------------------------------------------------------------- | -------- | ---------------------------------------------- |
| `layout`   | `kanban` \| `projects`                                                                | `kanban` | 탭 선택 (기존 유지)                            |
| `category` | `review` \| `contract` \| `spec` \| `apply`                                           | `review` | 카테고리 선택 (새로 추가)                      |
| `q`        | `string`                                                                              | 없음     | 검색어 (새로 추가)                             |
| `sortDue`  | `asc` \| `desc`                                                                       | `asc`    | 마감일 정렬 (새로 추가)                        |
| `status`   | `all` \| `assigned` \| `in_progress` \| `waiting_confirm` \| `rejected` \| `approved` | `all`    | 상태 필터 (기존 `status`와 통합, 값 형식 변경) |

### URL 예시

```
/?layout=kanban&category=review&q=검색어&sortDue=asc&status=all
/?layout=kanban&category=contract&status=in_progress
/?layout=kanban&category=spec&sortDue=desc
```

### Params 변환 로직

**카테고리**:

- URL: `review` → DB: `REVIEW`
- URL: `contract` → DB: `CONTRACT`
- URL: `spec` → DB: `SPECIFICATION`
- URL: `apply` → DB: `APPLICATION`

**상태**:

- URL: `all` → 필터 없음
- URL: `assigned` → DB: `ASSIGNED`
- URL: `in_progress` → DB: `IN_PROGRESS`
- URL: `waiting_confirm` → DB: `WAITING_CONFIRM`
- URL: `rejected` → DB: `REJECTED`
- URL: `approved` → DB: `APPROVED`

---

## 📝 구현 단계

### Phase 1: 파일 구조 분석 및 준비

1. ✅ 현재 구조 분석 완료
2. 새 컴포넌트 생성 계획 수립
   - `MyTasksTable` 컴포넌트 (테이블 UI)
   - 또는 `admin-dashboard-page.tsx` 내부에 직접 구현

### Phase 2: 탭 이름 변경 및 UI 영역 분리

1. "칸반 보드" → "내가 관련된 프로젝트" 탭 이름 변경
2. `KanbanBoardWithProjects` 컴포넌트 사용 제거
3. 새로운 테이블 UI 영역 준비

### Phase 3: URL Params 로직 구현

1. `category` params 읽기/쓰기
2. `q` params 읽기/쓰기 (검색어)
3. `sortDue` params 읽기/쓰기 (마감일 정렬)
4. `status` params 읽기/쓰기 (상태 필터, 기존 `status`와 통합)
5. URL params 초기화 및 기본값 설정
6. 새로고침/뒤로가기 시 상태 복원 로직

### Phase 4: 카테고리 탭 구현

1. 카테고리 탭 UI 추가 (검토/계약/명세서/출원)
2. 카테고리 선택 시 `category` params 업데이트
3. 카테고리별 Task 필터링 로직
4. 탭 전환 시 검색어/정렬/상태 필터 유지

### Phase 5: 검색 기능 연동

1. 검색창 유지 (기존 컴포넌트 재사용)
2. 검색어 입력 시 `q` params 업데이트
3. 기존 검색 로직 재사용 (프로젝트/Task 제목/담당자명/지시자명)

### Phase 6: 테이블 UI 구현

1. 테이블 헤더 (6개 컬럼)
2. 테이블 행 렌더링
   - 프로젝트 맵에서 기회명 조회
   - Task 데이터 표시
   - Task 카드 컴포넌트의 표시 로직 재사용 (마감일 포맷팅, D-Day 등)
3. 빈 상태 처리 (Task가 없을 때)

### Phase 7: 정렬 기능 구현

1. 기본 정렬: 마감일 오름차순 (`sortDue=asc`)
2. 마감일 헤더 클릭 시 `asc` ↔ `desc` 토글
3. 정렬 상태를 `sortDue` params로 저장
4. 마감일이 없는 Task는 뒤로 정렬

### Phase 8: 상태 필터 드롭다운 구현

1. 상태 헤더 클릭 시 드롭다운 열기
2. 드롭다운 옵션: 전체/할당됨/진행중/확인대기/거부됨/승인됨
3. 선택 시 `status` params 업데이트
4. 필터링 로직 적용

### Phase 9: 필터링 로직 통합

1. 카테고리 필터 적용
2. 검색 필터 적용
3. 상태 필터 적용
4. 정렬 적용
5. "내가 관련된 Task" 필터 적용 (기본 고정)

### Phase 10: 리그레션 체크

1. "전체 프로젝트" 탭 정상 동작 확인
2. URL params 변경 시 상태 복원 확인
3. 새로고침/뒤로가기/앞으로가기 동작 확인
4. 검색/정렬/필터 동작 확인

---

## 🗂️ 변경될 파일 목록

### 수정 파일

1. **`src/pages/admin-dashboard-page.tsx`**
   - 탭 이름 변경
   - URL params 로직 추가 (`category`, `q`, `sortDue`, `status`)
   - `KanbanBoardWithProjects` 제거
   - 새로운 테이블 UI 추가
   - 카테고리 탭 추가
   - 필터링/정렬 로직 구현

### 재사용 컴포넌트 (수정 없음)

- `src/components/task/task-card.tsx`: Task 카드 컴포넌트 (참고용, 직접 사용하지 않음)
- `src/components/common/task-status-badge.tsx`: 상태 배지 (테이블에서 사용)
- `src/components/ui/table.tsx`: 테이블 컴포넌트 (shadcn)
- `src/components/ui/tabs.tsx`: 탭 컴포넌트 (shadcn)
- `src/components/ui/select.tsx`: 드롭다운 컴포넌트 (shadcn)
- `src/components/ui/input.tsx`: 입력 컴포넌트 (shadcn)

### 사용하지 않게 되는 컴포넌트 (제거하지 않음, 다른 곳에서 사용 가능)

- `src/components/task/kanban-board-with-projects.tsx`: 관리자 대시보드에서만 제거, 다른 곳에서 사용 가능

---

## 🔧 기술적 세부사항

### 1. 프로젝트 맵 생성

```typescript
const projectMap = useMemo(() => {
  const map = new Map<string, Project>();
  allProjects.forEach((project) => {
    map.set(project.id, project);
  });
  return map;
}, [allProjects]);
```

### 2. "내가 관련된 Task" 필터링

```typescript
const myRelatedTasks = useMemo(() => {
  if (!currentProfile?.id) return [];
  return myTasks.filter(
    (task) => task.assigner_id === currentProfile.id || task.assignee_id === currentProfile.id,
  );
}, [myTasks, currentProfile?.id]);
```

### 3. 카테고리 필터링

```typescript
const categoryFilteredTasks = useMemo(() => {
  const categoryMap: Record<string, TaskCategory> = {
    review: "REVIEW",
    contract: "CONTRACT",
    spec: "SPECIFICATION",
    apply: "APPLICATION",
  };
  const dbCategory = categoryMap[category] || "REVIEW";
  return myRelatedTasks.filter((task) => task.task_category === dbCategory);
}, [myRelatedTasks, category]);
```

### 4. 검색 필터링 (기존 로직 재사용)

```typescript
const searchedTasks = useMemo(() => {
  if (!searchQuery.trim()) return categoryFilteredTasks;
  const query = searchQuery.toLowerCase();
  return categoryFilteredTasks.filter((task) => {
    const titleMatch = task.title.toLowerCase().includes(query);
    const assigneeName = (task.assignee?.full_name || task.assignee?.email || "").toLowerCase();
    const assigneeMatch = assigneeName.includes(query);
    const assignerName = (task.assigner?.full_name || task.assigner?.email || "").toLowerCase();
    const assignerMatch = assignerName.includes(query);
    const project = projectMap.get(task.project_id);
    const projectTitleMatch = project?.title.toLowerCase().includes(query) || false;
    return titleMatch || assigneeMatch || assignerMatch || projectTitleMatch;
  });
}, [categoryFilteredTasks, searchQuery, projectMap]);
```

### 5. 상태 필터링

```typescript
const statusFilteredTasks = useMemo(() => {
  if (status === "all") return searchedTasks;
  const statusMap: Record<string, TaskStatus> = {
    assigned: "ASSIGNED",
    in_progress: "IN_PROGRESS",
    waiting_confirm: "WAITING_CONFIRM",
    rejected: "REJECTED",
    approved: "APPROVED",
  };
  const dbStatus = statusMap[status];
  return searchedTasks.filter((task) => task.task_status === dbStatus);
}, [searchedTasks, status]);
```

### 6. 정렬

```typescript
const sortedTasks = useMemo(() => {
  const sorted = [...statusFilteredTasks];
  sorted.sort((a, b) => {
    if (sortDue === "asc") {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    } else {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return new Date(b.due_date).getTime() - new Date(a.due_date).getTime();
    }
  });
  return sorted;
}, [statusFilteredTasks, sortDue]);
```

### 7. 마감일 포맷팅 (TaskCard 로직 재사용)

```typescript
const formatDate = (dateString: string | null | undefined) => {
  if (!dateString) return null;
  const date = new Date(dateString);
  return date.toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
  });
};

const calculateDaysDifference = (dueDateString: string | null | undefined): number | null => {
  if (!dueDateString) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(dueDateString);
  dueDate.setHours(0, 0, 0, 0);
  const diffTime = dueDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

const getDDayText = (daysDiff: number | null): string => {
  if (daysDiff === null) return "";
  if (daysDiff > 0) return `(D-${daysDiff})`;
  if (daysDiff === 0) return "(D-Day)";
  return `(D+${Math.abs(daysDiff)})`;
};
```

---

## ⚠️ 주의사항

### 1. 백엔드 수정 금지

- API 호출 변경 없음
- `useTasksForMember(true)` 그대로 사용
- `useProjects()` 그대로 사용
- 데이터 구조 변경 없음

### 2. 기존 기능 유지

- "전체 프로젝트" 탭은 기존 그대로 유지
- 검색 로직은 기존과 동일하게 유지
- Task 카드의 표시 로직 참고하여 테이블에 적용

### 3. URL Params 정책

- 기존 프로젝트 스타일 확인 필요
- `replace` vs `push` 정책 일관성 유지
- 기본값이면 params에서 제거할지 유지할지 결정 필요

### 4. 성능 고려

- `useMemo`로 필터링/정렬 최적화
- 프로젝트 맵은 한 번만 생성
- 검색어 debounce 유지 (300ms)

---

## ✅ 완료 조건 체크리스트

### 기능 요구사항

- [ ] "칸반 보드" 탭 이름이 "내가 관련된 프로젝트"로 변경됨
- [ ] 카테고리 탭 4개 (검토/계약/명세서/출원) 동작
- [ ] 테이블 컬럼 6개 (기회명/지시사항/마감일/지시자/담당자/상태) 표시
- [ ] 기본 마감일 오름차순 정렬 (`sortDue=asc`)
- [ ] 마감일 헤더 클릭으로 `asc` ↔ `desc` 토글 + URL 저장
- [ ] 상태 헤더 클릭 드롭다운으로 상태 필터 + URL 저장
- [ ] 검색어 유지 + URL 저장 (`q` params)
- [ ] 새로고침/뒤로가기 시 상태 복원

### UI 요구사항

- [ ] 기존 필터 UI (역할/상태/정렬 드롭다운) 제거됨
- [ ] 칸반 컬럼 UI 제거됨
- [ ] 테이블 UI 정상 표시
- [ ] 빈 상태 처리 (Task가 없을 때)

### 유지 요구사항

- [ ] "전체 프로젝트" 탭 정상 동작
- [ ] 검색창 placeholder 및 UI 유지
- [ ] 검색 로직 기존과 동일

### 기술 요구사항

- [ ] URL params 정확히 저장/복원
- [ ] 필터링/정렬 로직 정확
- [ ] 성능 최적화 (useMemo 사용)
- [ ] 타입 안정성 유지

---

## 📊 예상 작업 시간

- Phase 1-2: 파일 분석 및 구조 변경 (30분)
- Phase 3: URL Params 로직 (1시간)
- Phase 4: 카테고리 탭 (30분)
- Phase 5: 검색 연동 (30분)
- Phase 6: 테이블 UI (2시간)
- Phase 7: 정렬 기능 (30분)
- Phase 8: 상태 필터 드롭다운 (1시간)
- Phase 9: 필터링 로직 통합 (1시간)
- Phase 10: 리그레션 체크 (1시간)

**총 예상 시간**: 약 8시간

---

## 🔍 백엔드 수정 필요 여부

### 분석 결과

**백엔드 수정 불필요**

**이유**:

1. `useTasksForMember(true)`가 이미 "내가 관련된 Task"만 반환 (담당자/지시자)
2. Task 데이터에 `task_category`, `task_status`, `due_date` 등 필요한 필드 모두 포함
3. 프로젝트 데이터는 `useProjects()`로 조회 가능
4. 프로젝트 맵은 FE에서 생성 가능 (`project_id`로 매칭)

**필요한 데이터**:

- ✅ Task 목록: `useTasksForMember(true)`로 조회 가능
- ✅ 프로젝트 목록: `useProjects()`로 조회 가능
- ✅ 프로필 정보: Task에 `assigner`, `assignee` 포함
- ✅ 카테고리: `task.task_category` 필드 사용
- ✅ 상태: `task.task_status` 필드 사용
- ✅ 마감일: `task.due_date` 필드 사용

**결론**: 모든 필요한 데이터가 현재 API 응답에 포함되어 있으므로 백엔드 수정 없이 FE만으로 구현 가능합니다.

---

## 📝 추가 고려사항

### 1. 상태 필터에 "승인됨" 포함 여부

- 현재 `useTasksForMember(true)`는 APPROVED 제외
- 요구사항에 "승인됨(approved)" 옵션이 있음
- 해결: `useTasksForMember(false)`로 변경하거나, 상태 필터가 "approved"일 때만 별도 조회
- **권장**: 상태 필터가 "approved"일 때만 `useTasksForMember(false)` 사용, 아니면 `true` 사용

### 2. URL Params 기본값 처리

- 기본값일 때 params에서 제거할지 유지할지 결정 필요
- 예: `category=review`가 기본값이면 URL에 포함할지 제거할지
- **권장**: 기본값이면 제거 (깔끔한 URL)

### 3. 테이블 행 클릭 동작

- Task 상세 페이지로 이동 (`/tasks/${task.id}`)
- 프로젝트 상세로 이동하는 링크도 필요할 수 있음 (기회명 클릭 시)
- 기회명은 프로젝트 상세 task상세는 지시사항 클릭 시 이동

### 4. 반응형 디자인

- 모바일에서 테이블이 너무 넓을 수 있음(상관 없음 단 x축 스크롤 가능하도록)

---

## 🎯 최종 확인 사항

1. ✅ 백엔드 수정 없이 구현 가능 확인
2. ✅ 필요한 데이터 모두 API 응답에 포함 확인
3. ✅ 기존 컴포넌트 재사용 가능 확인
4. ✅ URL params 설계 완료
5. ✅ 구현 단계 명확히 정의 완료

**계획서 작성 완료. 코드 작성 준비 완료.**
