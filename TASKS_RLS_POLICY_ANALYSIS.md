# Tasks RLS 정책 분석 보고서

## 현재 적용된 정책

### SELECT 정책
**정책명**: `tasks_select_assigner_assignee_or_admin`

**조건**:
```sql
is_admin((SELECT auth.uid()))
OR (SELECT auth.uid()) = assigner_id
OR (SELECT auth.uid()) = assignee_id
```

## 시나리오 분석

### 시나리오 1: 관리자 → member1 Task 생성
**상황**:
- 관리자가 Task 생성
- assigner_id = 관리자 ID
- assignee_id = member1 ID
- 프로젝트 참여자: 관리자, member1, member2

**접근 권한**:
- ✅ **관리자**: `is_admin()` = true → Task 조회 가능
- ✅ **member1**: `auth.uid() = assignee_id` = true → Task 조회 가능
- ❌ **member2**: 
  - `is_admin()` = false
  - `auth.uid() = assigner_id` = false (관리자 ID)
  - `auth.uid() = assignee_id` = false (member1 ID)
  - **결과: Task 조회 불가** ❌

### 시나리오 2: 관리자가 member1 → member2 Task 생성
**상황**:
- 관리자가 Task 생성
- assigner_id = member1 ID
- assignee_id = member2 ID
- 프로젝트 참여자: 관리자, member1, member2

**접근 권한**:
- ✅ **관리자**: `is_admin()` = true → Task 조회 가능
- ✅ **member1**: `auth.uid() = assigner_id` = true → Task 조회 가능
- ✅ **member2**: `auth.uid() = assignee_id` = true → Task 조회 가능

## 문제점

### 현재 정책의 문제
1. **프로젝트 참여자 간 가시성 불일치**:
   - assigner/assignee만 Task를 볼 수 있음
   - 같은 프로젝트에 참여한 다른 멤버는 Task를 볼 수 없음
   - 협업에 문제 발생

2. **요구사항과 불일치**:
   - 요구사항: "프로젝트에 참여한 모든 사용자가 서로에게 Task를 생성할 수 있어야 함"
   - 현재 정책: assigner/assignee만 Task 조회 가능
   - 프로젝트 참여자 전체가 Task를 볼 수 있어야 함

## 해결 방향

### 권장 정책 수정
**현재 정책**:
```sql
CREATE POLICY "tasks_select_assigner_assignee_or_admin"
ON public.tasks FOR SELECT
USING (
  is_admin((SELECT auth.uid()))
  OR (SELECT auth.uid()) = assigner_id
  OR (SELECT auth.uid()) = assignee_id
);
```

**수정된 정책**:
```sql
CREATE POLICY "tasks_select_participant_or_admin"
ON public.tasks FOR SELECT
USING (
  is_admin((SELECT auth.uid()))
  OR is_project_participant((SELECT auth.uid()), project_id)
);
```

### 수정 후 예상 동작

#### 시나리오 1: 관리자 → member1 Task 생성
- ✅ **관리자**: `is_admin()` = true → Task 조회 가능
- ✅ **member1**: `is_project_participant()` = true → Task 조회 가능
- ✅ **member2**: `is_project_participant()` = true → Task 조회 가능 ✅

#### 시나리오 2: 관리자가 member1 → member2 Task 생성
- ✅ **관리자**: `is_admin()` = true → Task 조회 가능
- ✅ **member1**: `is_project_participant()` = true → Task 조회 가능
- ✅ **member2**: `is_project_participant()` = true → Task 조회 가능

## 결론

**현재 상태**:
- ❌ member2는 관리자 → member1 Task를 볼 수 없음
- ✅ 관리자는 member1 → member2 Task를 볼 수 있음 (is_admin() 정책으로)

**수정 필요**:
- 프로젝트 참여자 전체가 모든 Task를 볼 수 있도록 정책 수정 필요
- `tasks_select_participant_or_admin` 정책으로 변경 권장

