# 관리자 대시보드 "담당 업무" 탭 버그 리포트

**발견 일시**: 2026-01-25  
**문제**: 관리자 대시보드의 "담당 업무" 탭에서 현재 관리자가 지시자/담당자가 아닌 태스크가 표시됨  
**영향**: 관리자 대시보드만 영향 (멤버 대시보드는 정상 작동)

---

## 🔍 문제 현상

### 증상
- 로그인한 관리자: `bass.to.tasko@gmail.com` (시스템 관리자)
- "담당 업무" 탭에서 표시되는 태스크들의 지시자/담당자가 모두 다른 사용자:
  - 지시자: 김성수 (bass@basspat.co)
  - 담당자: 홍성진 (hong@basspat.co)
- 현재 관리자는 이 태스크들의 지시자도 담당자도 아님

### 비교
- ✅ **멤버 대시보드**: 정상 작동 (자신이 지시자/담당자인 태스크만 표시)
- ❌ **관리자 대시보드**: 버그 발생 (모든 태스크가 표시됨)

---

## 🔎 원인 분석

### 1. 코드 버그 (주요 원인)

**파일**: `src/pages/admin-dashboard-page.tsx`

**문제 위치**: 라인 1006, 1016

**현재 코드**:
```typescript
{/* 담당 업무 탭 */}
<TabsContent value="my-tasks" className="space-y-4">
  {/* ... 필터 및 검색 ... */}
  <tbody>
    {paginatedAllTasks.length === 0 ? (  // ❌ 버그: paginatedAllTasks 사용
      // ...
    ) : (
      paginatedAllTasks.map((task) => {  // ❌ 버그: paginatedAllTasks 사용
        // ...
      })
    )}
  </tbody>
  {/* 페이지네이션 */}
  {sortedMyTasks.length > 0 && (  // ✅ 올바름: sortedMyTasks 사용
    <TablePagination
      currentPage={myTasksCurrentPage}  // ✅ 올바름: myTasksCurrentPage 사용
      // ...
    />
  )}
</TabsContent>
```

**문제점**:
- 담당 업무 탭에서 `paginatedAllTasks`를 사용하고 있음
- `paginatedAllTasks`는 "전체 태스크" 탭용 데이터 (모든 태스크)
- 담당 업무 탭에서는 `paginatedMyTasks`를 사용해야 함

**올바른 코드** (멤버 대시보드 참고):
```typescript
{/* 담당 업무 탭 */}
<TabsContent value="my-tasks" className="space-y-4">
  {/* ... */}
  <tbody>
    {paginatedMyTasks.length === 0 ? (  // ✅ 올바름
      // ...
    ) : (
      paginatedMyTasks.map((task) => {  // ✅ 올바름
        // ...
      })
    )}
  </tbody>
</TabsContent>
```

### 2. 데이터 흐름 분석

#### 정상적인 데이터 흐름 (의도된 동작)
1. **담당 업무 탭**:
   - `useTasksForMember(true)` 호출
   - `getTasksForMember(excludeApproved: true)` API 호출
   - API에서 `.or(`assigner_id.eq.${userId},assignee_id.eq.${userId}`)` 필터 적용
   - RLS 정책 `tasks_select_admin_or_assigned` 적용:
     - 관리자: `is_admin(auth.uid())` → 모든 태스크 RLS 통과
     - API 필터: `assigner_id = userId OR assignee_id = userId` → 자신의 태스크만 반환
   - 결과: 관리자이지만 자신이 지시자/담당자인 태스크만 표시되어야 함

#### 실제 동작 (버그)
1. **담당 업무 탭**:
   - `useTasksForMember(true)` 호출 → `myTasks` 데이터 로드 (올바름)
   - `paginatedMyTasks` 계산 (올바름)
   - 하지만 테이블 렌더링에서 `paginatedAllTasks` 사용 (버그)
   - `paginatedAllTasks`는 `useTasksForAdmin(false)` 기반 → 모든 태스크 표시

### 3. RLS 정책과의 상호작용

**RLS 정책**: `tasks_select_admin_or_assigned`
```sql
CREATE POLICY "tasks_select_admin_or_assigned"
ON public.tasks
FOR SELECT
USING (
  is_admin(auth.uid())  -- 관리자는 모든 태스크 조회 가능
  OR auth.uid() = assigner_id
  OR auth.uid() = assignee_id
);
```

**RLS 정책의 동작**:
- 관리자는 RLS 레벨에서 모든 태스크를 볼 수 있음
- 하지만 API 레벨에서 `.or(`assigner_id.eq.${userId},assignee_id.eq.${userId}`)` 필터가 추가로 적용되어야 함
- `getTasksForMember` API는 이 필터를 올바르게 적용함

**문제**:
- 코드 버그로 인해 `paginatedAllTasks`를 사용
- `paginatedAllTasks`는 `allTasks` (모든 태스크) 기반
- RLS로 모든 태스크가 통과하고, API 필터가 적용되지 않은 데이터가 표시됨

---

## 📊 비교 분석

### 멤버 대시보드 (정상 작동)
**파일**: `src/pages/member-dashboard-page.tsx` (라인 1028)
```typescript
<TabsContent value="my-tasks">
  <tbody>
    {paginatedMyTasks.length === 0 ? (  // ✅ 올바름
      // ...
    ) : (
      paginatedMyTasks.map((task) => {  // ✅ 올바름
        // ...
      })
    )}
  </tbody>
</TabsContent>
```

### 관리자 대시보드 (버그)
**파일**: `src/pages/admin-dashboard-page.tsx` (라인 1006, 1016)
```typescript
<TabsContent value="my-tasks">
  <tbody>
    {paginatedAllTasks.length === 0 ? (  // ❌ 버그
      // ...
    ) : (
      paginatedAllTasks.map((task) => {  // ❌ 버그
        // ...
      })
    )}
  </tbody>
</TabsContent>
```

---

## 🎯 근본 원인

### 1차 원인: 코드 버그
- 담당 업무 탭에서 잘못된 변수 사용 (`paginatedAllTasks` 대신 `paginatedMyTasks` 사용해야 함)
- 복사-붙여넣기 과정에서 변수명을 변경하지 않아 발생한 것으로 추정

### 2차 원인: RLS 정책과 API 필터의 상호작용
- RLS 정책이 관리자에게 모든 태스크를 허용
- API 필터(`getTasksForMember`)가 추가 필터링을 수행해야 하지만, 코드 버그로 인해 적용되지 않음

---

## ✅ 해결 방안

### 수정 필요 사항
1. `src/pages/admin-dashboard-page.tsx` 라인 1006, 1016
   - `paginatedAllTasks` → `paginatedMyTasks`로 변경

### 예상 수정 코드
```typescript
{/* 담당 업무 탭 */}
<TabsContent value="my-tasks" className="space-y-4">
  {/* ... */}
  <tbody>
    {paginatedMyTasks.length === 0 ? (  // 수정
      // ...
    ) : (
      paginatedMyTasks.map((task) => {  // 수정
        // ...
      })
    )}
  </tbody>
</TabsContent>
```

---

## 📝 추가 확인 사항

### 데이터 소스 확인
- ✅ `useTasksForMember(true)`: 올바르게 사용됨 (라인 142)
- ✅ `paginatedMyTasks`: 올바르게 계산됨 (라인 734)
- ✅ 페이지네이션: 올바르게 `sortedMyTasks` 사용 (라인 1098)
- ❌ 테이블 렌더링: 잘못된 변수 `paginatedAllTasks` 사용 (라인 1006, 1016)

### RLS 정책 확인
- ✅ `tasks_select_admin_or_assigned`: 정상 작동
- ✅ `getTasksForMember` API: 필터 로직 정상

---

## 🎯 결론

**주요 원인**: 관리자 대시보드의 담당 업무 탭에서 잘못된 변수(`paginatedAllTasks`)를 사용하여 모든 태스크가 표시됨

**해결 방법**: `paginatedAllTasks`를 `paginatedMyTasks`로 변경

**영향 범위**: 관리자 대시보드의 "담당 업무" 탭만 영향 (멤버 대시보드는 정상)
