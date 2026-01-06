# 클라이언트 사이드 페이지네이션 리팩토링 계획서

## 📋 목표
순수 React (CSR) 방식으로 동작하는 클라이언트 사이드 페이지네이션 구현
- 서버는 전체 데이터만 한 번 반환
- 모든 필터링/검색/페이지네이션은 클라이언트에서 처리
- URL 기반 상태 관리 제거
- 깜빡임 없는 부드러운 UX

## 🔍 현재 문제점 분석

### 1. 서버 페이지네이션 구현 상태
- ✅ `getProjects()` API가 page, pageSize, search, status, sortOrder 파라미터를 받음
- ✅ Supabase 쿼리에 `.range()`, `.or()`, `.eq()` 등 필터링 적용
- ✅ count 쿼리로 총 개수 반환

### 2. 프론트엔드 상태 관리
- ❌ URL 기반 상태 관리 (`useSearchParams`, `searchParams`)
- ❌ 서버 재요청으로 인한 데이터 refetch
- ❌ 페이지 변경 시마다 서버 요청 발생

## 🎯 리팩토링 계획

### Phase 1: API 레이어 수정
**파일: `src/api/project.ts`**

**변경 사항:**
```typescript
// 변경 전: 서버 페이지네이션
export async function getProjects(params?: {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: "all" | "inProgress" | "done";
  sortOrder?: "newest" | "oldest";
}): Promise<{ data: Project[]; count: number }>

// 변경 후: 전체 데이터만 반환
export async function getProjects(): Promise<Project[]>
```

**구현:**
- 모든 파라미터 제거
- 필터링/검색/페이지네이션 로직 제거
- 단순히 전체 프로젝트 목록만 반환
- `.select("*")` + `.order("created_at", { ascending: false })`만 사용

---

### Phase 2: React Query 훅 수정
**파일: `src/hooks/queries/use-projects.ts`**

**변경 사항:**
```typescript
// 변경 전: 파라미터 기반 서버 페이지네이션
export function useProjects(params?: UseProjectsParams)

// 변경 후: 단순 전체 데이터 fetch
export function useProjects()
```

**구현:**
- 파라미터 인터페이스 제거
- queryKey를 `["projects"]`로 단순화
- queryFn을 `getProjects`로 직접 연결 (파라미터 없음)
- 반환 타입을 `Project[]`로 변경

---

### Phase 3: 페이지 컴포넌트 리팩토링
**파일: `src/pages/index-page.tsx`**

#### 3.1 URL 기반 상태 관리 제거
**제거할 코드:**
- `import { useSearchParams } from "react-router"`
- `const [searchParams, setSearchParams] = useSearchParams()`
- `searchParams.get("search")`, `searchParams.get("status")` 등
- `updateSearchParams()` 함수
- URL 업데이트 관련 `useEffect`들

#### 3.2 로컬 상태로 전환
**추가할 상태:**
```typescript
// 검색 및 필터 상태
const [searchQuery, setSearchQuery] = useState("");
const [statusFilter, setStatusFilter] = useState<ProjectStatusFilter>("all");
const [sortOrder, setSortOrder] = useState<SortOrder>("newest");

// 페이지네이션 상태
const [currentPage, setCurrentPage] = useState(1);
const [itemsPerPage, setItemsPerPage] = useState(10);
const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
```

#### 3.3 데이터 fetch 로직
```typescript
// 전체 데이터 한 번만 fetch
const { data: allProjects = [], isLoading } = useProjects();

// 검색어 debounce (서버 재요청 없이 로컬 상태만)
const debouncedSearch = useDebounce(searchQuery, 300);
```

#### 3.4 클라이언트 사이드 필터링/정렬 (useMemo)
```typescript
// 필터링 및 정렬된 프로젝트 목록
const filteredProjects = useMemo(() => {
  let filtered = [...allProjects];

  // 검색 필터
  if (debouncedSearch) {
    const searchLower = debouncedSearch.toLowerCase();
    filtered = filtered.filter(
      (project) =>
        project.title.toLowerCase().includes(searchLower) ||
        project.client_name.toLowerCase().includes(searchLower) ||
        project.patent_name.toLowerCase().includes(searchLower)
    );
  }

  // 상태 필터
  if (statusFilter !== "all") {
    filtered = filtered.filter((project) => project.status === statusFilter);
  }

  // 정렬
  filtered.sort((a, b) => {
    if (sortOrder === "newest") {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    } else {
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    }
  });

  return filtered;
}, [allProjects, debouncedSearch, statusFilter, sortOrder]);
```

#### 3.5 클라이언트 사이드 페이지네이션 (useMemo)
```typescript
// 페이지네이션된 프로젝트 목록
const paginatedProjects = useMemo(() => {
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  return filteredProjects.slice(startIndex, endIndex);
}, [filteredProjects, currentPage, itemsPerPage]);

// 총 페이지 수
const totalPages = Math.ceil(filteredProjects.length / itemsPerPage) || 1;
```

#### 3.6 검색어 변경 시 페이지 리셋
```typescript
// 검색어 변경 시 1페이지로 리셋
useEffect(() => {
  setCurrentPage(1);
}, [debouncedSearch, statusFilter, sortOrder]);
```

#### 3.7 핸들러 함수 수정
```typescript
// 검색어 변경 핸들러
const handleSearchChange = (value: string) => {
  setSearchQuery(value);
  // useEffect에서 자동으로 페이지 리셋됨
};

// 상태 필터 변경 핸들러
const handleStatusFilterChange = (value: ProjectStatusFilter) => {
  setStatusFilter(value);
  // useEffect에서 자동으로 페이지 리셋됨
};

// 정렬 변경 핸들러
const handleSortOrderChange = (value: SortOrder) => {
  setSortOrder(value);
  // useEffect에서 자동으로 페이지 리셋됨
};

// 페이지 변경 핸들러 (URL 업데이트 제거)
const handlePageChange = (page: number) => {
  setCurrentPage(page);
};

// 페이지 크기 변경 핸들러
const handlePageSizeChange = (newPageSize: number) => {
  setItemsPerPage(newPageSize);
  setCurrentPage(1); // 페이지 크기 변경 시 1페이지로
};
```

#### 3.8 UI 컴포넌트 수정
```typescript
// Select 컴포넌트의 onValueChange 수정
<Select
  value={statusFilter}
  onValueChange={handleStatusFilterChange}
>
  ...
</Select>

<Select
  value={sortOrder}
  onValueChange={handleSortOrderChange}
>
  ...
</Select>

// Input 컴포넌트의 onChange 수정
<Input
  value={searchQuery}
  onChange={(e) => handleSearchChange(e.target.value)}
  ...
/>

// 페이지네이션 컴포넌트
<TablePagination
  currentPage={currentPage}
  totalPages={totalPages}
  pageSize={itemsPerPage}
  totalItems={filteredProjects.length} // 필터링된 전체 개수
  selectedCount={selectedRows.size}
  onPageChange={handlePageChange}
  onPageSizeChange={handlePageSizeChange}
/>
```

---

## ✅ 체크리스트

### API 레이어
- [ ] `getProjects()` 파라미터 제거
- [ ] 필터링/검색/페이지네이션 로직 제거
- [ ] 단순 전체 데이터 반환으로 변경

### React Query 훅
- [ ] `useProjects()` 파라미터 제거
- [ ] queryKey 단순화
- [ ] 반환 타입 변경

### 페이지 컴포넌트
- [ ] `useSearchParams` 제거
- [ ] URL 기반 상태 관리 코드 제거
- [ ] 로컬 상태로 전환 (useState)
- [ ] 클라이언트 사이드 필터링 구현 (useMemo)
- [ ] 클라이언트 사이드 페이지네이션 구현 (useMemo)
- [ ] 검색어 변경 시 페이지 리셋 로직 추가
- [ ] 핸들러 함수 수정 (URL 업데이트 제거)
- [ ] UI 컴포넌트 이벤트 핸들러 수정

### UX 개선
- [ ] 로딩 상태 처리 개선 (깜빡임 방지)
- [ ] 데이터 없을 때 빈 상태 표시
- [ ] 페이지네이션 UI 정상 동작 확인

---

## 🚫 금지 사항
- ❌ Next.js 코드 사용
- ❌ 서버 페이지네이션 구현
- ❌ URL 기반 상태 관리
- ❌ router, URL query, replace 사용
- ❌ 검색어 변경 시 서버 재요청
- ❌ Suspense, loading fallback으로 인한 전체 리렌더링

---

## 📊 예상 결과

### 데이터 흐름
```
1. 컴포넌트 마운트
   ↓
2. useProjects() 호출 → 전체 데이터 fetch (최초 1회)
   ↓
3. allProjects 상태 업데이트
   ↓
4. useMemo로 필터링/정렬 (클라이언트)
   ↓
5. useMemo로 페이지네이션 (slice)
   ↓
6. UI 렌더링
```

### 상태 변경 흐름
```
사용자 액션 (검색/필터/페이지 변경)
   ↓
로컬 상태 업데이트 (useState)
   ↓
useMemo 재계산 (필터링/페이지네이션)
   ↓
UI 업데이트 (리렌더링만 발생, 서버 요청 없음)
```

---

## 🎯 최종 목표
- ✅ 서버는 전체 데이터만 한 번 반환
- ✅ 모든 로직은 클라이언트에서 처리
- ✅ URL 기반 상태 관리 없음
- ✅ 깜빡임 없는 부드러운 UX
- ✅ 단순하고 읽기 쉬운 코드

