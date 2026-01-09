# Task 6: 대시보드 및 칸반 보드 UI 구현 - 분석 및 수정 계획

## 📋 Task 6 요구사항 요약

### 목표
역할별 대시보드, 칸반 보드 탭 전환, 프로젝트 카드 아코디언 기능을 구현

### 주요 요구사항
1. **역할별 대시보드 분기**: Admin과 Member가 각각 다른 대시보드 보기
2. **탭 전환**: 칸반 보드 탭과 전체 프로젝트 탭 간 전환
3. **칸반 보드**: 4개 컬럼(검토/계약/명세서/출원)으로 Task 표시
4. **멤버 대시보드**: 담당자/지시자 Task만 표시 (APPROVED 제외)
5. **프로젝트 카드 아코디언**: 같은 프로젝트의 여러 Task를 아코디언으로 표시
6. **검색 기능**: Task/프로젝트 검색

---

## 🔍 현재 구현 상태 분석

### ✅ 이미 구현된 것

#### 1. 칸반 보드 컴포넌트 (`src/components/task/kanban-board.tsx`)
- ✅ 4개 컬럼 구현 (검토/계약/명세서/출원)
- ✅ 카테고리별 Task 분류 및 표시
- ✅ 역할 필터 (MY_ASSIGNER, MY_ASSIGNEE, MY_TASKS)
- ✅ 상태 필터
- ✅ 검색 기능 (Task 제목, 담당자명, 지시자명)
- ✅ 컬럼별 '+ 새 테스크' 버튼
- ✅ 반응형 디자인 (모바일 x축 스크롤)
- ⚠️ **현재 위치**: 프로젝트 상세 페이지에서만 사용 중

#### 2. 프로젝트 목록 페이지 (`src/pages/index-page.tsx`)
- ✅ 프로젝트 목록 테이블 표시
- ✅ 검색 기능 (프로젝트 제목, 고객명)
- ✅ 정렬 기능 (최신순/오래된순)
- ✅ 클라이언트 사이드 페이지네이션
- ✅ 프로젝트 생성 버튼 (Admin만)
- ❌ **부족한 점**: 역할별 분기 없음, 탭 전환 없음, 칸반 보드 통합 없음

#### 3. 관련 훅 및 API
- ✅ `useProjects()`: 프로젝트 목록 조회 (RLS 자동 필터링)
- ✅ `useTasks(projectId)`: 프로젝트별 Task 목록 조회
- ✅ `useCurrentProfile()`: 현재 사용자 프로필 조회
- ✅ `useIsAdmin()`: Admin 권한 확인
- ❌ **부족한 점**: 멤버용 전체 Task 조회 훅 없음

---

## ❌ 미구현 항목

### 1. 역할별 대시보드 분기 로직 (Sub Task 6.1)
**현재 상태**: `index-page.tsx`에 역할별 분기 없음
- ❌ Admin/Member 분기 로직 없음
- ❌ AdminDashboardPage 컴포넌트 없음
- ❌ MemberDashboardPage 컴포넌트 없음

### 2. Admin 대시보드 (Sub Task 6.2)
**요구사항**:
- 탭 버튼: [칸반 보드] [전체 프로젝트]
- 칸반 보드 탭: 담당자/지시자 Task만 표시 (APPROVED 제외)
- 전체 프로젝트 탭: 모든 프로젝트 목록 표시
- 프로젝트 생성 버튼

**현재 상태**: 미구현

### 3. Member 대시보드 (Sub Task 6.3)
**요구사항**:
- 탭 버튼: [칸반 보드] [전체 프로젝트]
- 칸반 보드 탭: 담당자/지시자 Task만 표시 (APPROVED 제외)
- 전체 프로젝트 탭: 참여 프로젝트만 표시
- `useTasksForMember()` 훅: 담당자인 Task 조회

**현재 상태**: 미구현

### 4. 칸반 보드 탭 구현 (멤버 대시보드용) (Sub Task 6.4)
**요구사항**:
- 담당자/지시자 Task만 필터링 (task_status != 'APPROVED')
- 프로젝트별로 Task 그룹화
- 카테고리별로 Task 그룹화
- 프로젝트 카드 생성 (같은 프로젝트의 여러 Task가 같은 컬럼에 있으면 아코디언으로 표시)

**현재 상태**: 
- ✅ 칸반 보드 컴포넌트는 있으나, 프로젝트별 그룹화 및 아코디언 기능 없음
- ❌ APPROVED 제외 필터링 없음

### 5. 프로젝트 카드 컴포넌트 (Sub Task 6.5)
**요구사항**:
- 프로젝트 정보 표시: 기회, 고객명, 완료 예정일, Task 개수
- 아코디언 기능: 같은 프로젝트의 여러 Task를 아코디언으로 표시
- 기회 클릭 시 프로젝트 상세 페이지로 이동
- 아코디언 펼치기/접기 기능

**현재 상태**: 미구현

### 6. 검색 기능 (Sub Task 6.6)
**요구사항**:
- 검색 입력창 컴포넌트
- useDebounce 훅 사용 (300ms)
- 검색어로 Task/프로젝트 필터링 (기회, 고객명, Task 제목, 담당자명)
- 검색 결과를 칸반 보드에 반영

**현재 상태**: 
- ✅ 칸반 보드 내부에 검색 기능 있음
- ❌ 대시보드 레벨 통합 검색 없음

### 7. 클라이언트 사이드 페이지네이션 (Sub Task 6.7)
**요구사항**:
- 전체 프로젝트 탭용 페이지네이션
- 필터링된 프로젝트 목록을 slice로 페이지네이션
- 필터 변경 시 1페이지로 리셋

**현재 상태**: ✅ 이미 구현됨 (`index-page.tsx`)

---

## 🔧 수정 및 구현 계획

### Phase 1: 역할별 대시보드 분기 구조 구축

#### 1.1 `index-page.tsx` 수정
**변경 사항**:
- 역할별 분기 로직 추가
- `useCurrentProfile()` 또는 `useIsAdmin()` 사용하여 역할 확인
- Admin이면 `AdminDashboardPage` 렌더링
- Member이면 `MemberDashboardPage` 렌더링

**구조**:
```typescript
export default function IndexPage() {
  const { data: isAdmin } = useIsAdmin();
  
  if (isAdmin) {
    return <AdminDashboardPage />;
  }
  
  return <MemberDashboardPage />;
}
```

#### 1.2 `AdminDashboardPage` 컴포넌트 생성
**위치**: `src/pages/admin-dashboard-page.tsx`
**기능**:
- 탭 상태 관리 (칸반 보드 / 전체 프로젝트)
- 칸반 보드 탭: 전체 Task 표시 (APPROVED 제외)
- 전체 프로젝트 탭: 기존 `index-page.tsx` 로직 재사용

#### 1.3 `MemberDashboardPage` 컴포넌트 생성
**위치**: `src/pages/member-dashboard-page.tsx`
**기능**:
- 탭 상태 관리 (칸반 보드 / 전체 프로젝트)
- 칸반 보드 탭: 담당자/지시자 Task만 표시 (APPROVED 제외)
- 전체 프로젝트 탭: 참여 프로젝트만 표시 (RLS 자동 필터링)

---

### Phase 2: 멤버용 Task 조회 훅 구현

#### 2.1 `useTasksForMember()` 훅 구현
**위치**: `src/hooks/queries/use-tasks.ts` 또는 새 파일
**기능**:
- 현재 사용자가 담당자 또는 지시자인 Task만 조회
- 모든 프로젝트에서 Task 조회 (프로젝트별이 아님)
- APPROVED 상태 제외 옵션

**API 함수 필요**:
- `getTasksForMember(userId, excludeApproved?)` 함수 구현
- `src/api/task.ts`에 추가

**쿼리 로직**:
```sql
SELECT * FROM tasks
WHERE (assignee_id = userId OR assigner_id = userId)
AND task_status != 'APPROVED'  -- 옵션
ORDER BY created_at DESC
```

---

### Phase 3: 칸반 보드 대시보드 통합

#### 3.1 칸반 보드 컴포넌트 확장
**현재**: 프로젝트별 Task만 표시
**필요**: 프로젝트별 그룹화 및 아코디언 기능

**변경 사항**:
- `KanbanBoard` 컴포넌트에 `groupByProject` prop 추가
- 프로젝트별로 Task 그룹화
- 프로젝트 카드 아코디언 기능 추가

#### 3.2 프로젝트 카드 컴포넌트 생성
**위치**: `src/components/project/project-card.tsx`
**기능**:
- 프로젝트 정보 표시
- 아코디언 기능 (같은 프로젝트의 여러 Task)
- 프로젝트 상세 페이지 링크

---

### Phase 4: 검색 기능 통합

#### 4.1 대시보드 레벨 검색 구현
**위치**: 각 대시보드 페이지
**기능**:
- 칸반 보드 탭: Task 검색 (기존 칸반 보드 검색 활용)
- 전체 프로젝트 탭: 프로젝트 검색 (기존 검색 활용)
- 탭 전환 시 검색어 유지 또는 초기화 (선택)

---

## 📝 수정이 필요한 파일 목록

### 새로 생성할 파일
1. `src/pages/admin-dashboard-page.tsx` - Admin 대시보드 페이지
2. `src/pages/member-dashboard-page.tsx` - Member 대시보드 페이지
3. `src/components/project/project-card.tsx` - 프로젝트 카드 컴포넌트 (아코디언)
4. `src/api/task.ts` - `getTasksForMember()` 함수 추가

### 수정할 파일
1. `src/pages/index-page.tsx` - 역할별 분기 로직 추가
2. `src/components/task/kanban-board.tsx` - 프로젝트별 그룹화 및 아코디언 기능 추가
3. `src/hooks/queries/use-tasks.ts` - `useTasksForMember()` 훅 추가

---

## ⚠️ 주의사항 및 고려사항

### 1. Task 5와의 중복
- **Task 5.7**: 칸반 보드 컴포넌트 구현 (이미 완료됨)
- **Task 6.4**: 칸반 보드 탭 구현 (멤버 대시보드용)
- **해결**: 기존 칸반 보드 컴포넌트를 확장하여 재사용

### 2. 프로젝트별 그룹화 로직
- 대시보드 칸반 보드는 여러 프로젝트의 Task를 표시
- 같은 프로젝트의 여러 Task가 같은 컬럼에 있으면 아코디언으로 표시
- 프로젝트 카드 내부에 Task 카드 목록 표시

### 3. 성능 고려사항
- 멤버용 Task 조회 시 모든 프로젝트에서 조회하므로 인덱스 확인 필요
- 프로젝트별 그룹화는 클라이언트 사이드에서 처리
- 아코디언 펼치기/접기 시 렌더링 최적화

### 4. APPROVED 제외 필터링
- 멤버 대시보드 칸반 보드: APPROVED 제외 필터링 필수
- Admin 대시보드 칸반 보드: APPROVED 제외 필터링 권장 (요구사항 확인 필요)

### 5. 검색 기능 통합
- 칸반 보드 내부 검색과 대시보드 레벨 검색 통합 방안 고려
- 탭 전환 시 검색어 유지 여부 결정 필요

---

## 🎯 구현 우선순위

### 우선순위 1: 기본 구조 구축
1. ✅ 역할별 대시보드 분기 로직 (`index-page.tsx`)
2. ✅ Admin 대시보드 페이지 생성
3. ✅ Member 대시보드 페이지 생성
4. ✅ 탭 전환 기능 구현

### 우선순위 2: Task 조회 및 필터링
5. ✅ `getTasksForMember()` API 함수 구현
6. ✅ `useTasksForMember()` 훅 구현
7. ✅ APPROVED 제외 필터링 적용

### 우선순위 3: 칸반 보드 통합
8. ✅ 칸반 보드 컴포넌트 확장 (프로젝트별 그룹화)
9. ✅ 프로젝트 카드 컴포넌트 생성
10. ✅ 아코디언 기능 구현

### 우선순위 4: 검색 기능 통합
11. ✅ 대시보드 레벨 검색 통합
12. ✅ 탭 전환 시 검색어 처리

---

## 📊 Task 6 Sub Tasks 완료 체크리스트

- [ ] **6.1**: 역할별 대시보드 분기 로직 구현
- [ ] **6.2**: Admin 대시보드 구현
- [ ] **6.3**: Member 대시보드 구현
- [ ] **6.4**: 칸반 보드 탭 구현 (멤버 대시보드용)
- [ ] **6.5**: 프로젝트 카드 컴포넌트 구현
- [ ] **6.6**: 검색 기능 구현
- [ ] **6.7**: 클라이언트 사이드 페이지네이션 구현 (✅ 이미 완료)

---

## 🔄 tasks.json 수정 제안

### Sub Task 6.4 수정 제안
**현재**:
- "칸반 보드 컴포넌트 재사용"
- "담당자/지시자 Task만 필터링 (task_status != 'APPROVED')"
- "프로젝트별로 Task 그룹화"
- "카테고리별로 Task 그룹화"
- "프로젝트 카드 생성 (같은 프로젝트의 여러 Task가 같은 컬럼에 있으면 아코디언으로 표시)"

**수정 제안**:
- 칸반 보드 컴포넌트는 이미 구현되어 있으므로, 프로젝트별 그룹화 기능만 추가
- 프로젝트 카드 아코디언 기능은 Sub Task 6.5와 통합
- APPROVED 제외 필터링은 API 레벨 또는 클라이언트 레벨에서 처리

### Sub Task 6.6 수정 제안
**현재**: 검색 기능 구현
**수정 제안**: 
- 칸반 보드 내부 검색 기능은 이미 구현되어 있음
- 대시보드 레벨 검색 통합만 추가하면 됨

---

## ✅ 결론

Task 6번은 대부분의 기반이 이미 구축되어 있습니다:
- ✅ 칸반 보드 컴포넌트 (프로젝트 상세 페이지에서 사용 중)
- ✅ 프로젝트 목록 페이지 (검색, 필터링, 페이지네이션)
- ✅ 관련 훅 및 API

**주요 작업**:
1. 역할별 대시보드 분기 구조 구축
2. 멤버용 Task 조회 훅 및 API 구현
3. 칸반 보드 컴포넌트 확장 (프로젝트별 그룹화)
4. 프로젝트 카드 아코디언 컴포넌트 구현
5. 대시보드 레벨 검색 통합

**예상 소요 시간**: 3-4일

