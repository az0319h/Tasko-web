# 프로젝트 참여자 RLS 정책 수정 계획

## 문제점 분석

### 1. project_participants 테이블 SELECT 정책 문제

**현재 정책** (`20260110000002_phase2_rls_policies_verification.sql`):
```sql
CREATE POLICY "project_participants_select_participant_or_admin"
ON public.project_participants
FOR SELECT
USING (
  is_admin((SELECT auth.uid()))
  OR (SELECT auth.uid()) = user_id  -- ❌ 문제: 자신의 레코드만 조회 가능
  OR is_project_participant((SELECT auth.uid()), project_id)  -- ⚠️ 순환 참조 가능성
);
```

**문제점**:
- `(SELECT auth.uid()) = user_id` 조건으로 인해 각 사용자가 자신의 레코드만 볼 수 있음
- 프로젝트 참여자라도 다른 참여자의 레코드는 조회 불가
- `is_project_participant()` 함수 호출 시 순환 참조 발생 가능

**실제 동작 시나리오**:
- 관리자: `is_admin()`이 true → 모든 레코드 조회 가능 ✅
- 멤버: `auth.uid() = user_id` → 자신의 레코드만 조회 ❌
- `is_project_participant()` 호출 시:
  - 함수 내부에서 `project_participants` 조회
  - RLS 정책 재적용 → 자신의 레코드만 반환
  - 결과: 자신의 레코드만 보임 ❌

### 2. is_project_participant() 함수 순환 참조 문제

**현재 함수 정의** (`20260110000004_update_task_insert_policy_participants.sql`):
```sql
CREATE OR REPLACE FUNCTION public.is_project_participant(user_id UUID, project_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.project_participants
    WHERE project_participants.project_id = is_project_participant.project_id
    AND project_participants.user_id = is_project_participant.user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**문제점**:
- `SECURITY DEFINER`로 설정되어 있지만, 함수 내부에서 `project_participants` 테이블을 조회할 때 RLS 정책이 다시 적용됨
- RLS 정책에서 `is_project_participant()` 함수를 호출하고, 함수 내부에서 다시 `project_participants`를 조회하면 순환 참조 발생
- 결과적으로 함수가 제대로 작동하지 않거나 자신의 레코드만 반환할 수 있음

### 3. can_access_profile() 함수의 제한적 동작

**현재 함수 정의** (`20250101000014_create_rls_policies_profiles.sql`):
```sql
CREATE OR REPLACE FUNCTION public.can_access_profile(target_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.tasks
    WHERE (tasks.assigner_id = target_user_id OR tasks.assignee_id = target_user_id)
    AND has_project_access(auth.uid(), tasks.project_id)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**문제점**:
- Task를 통해 연결된 프로필만 조회 가능
- 프로젝트 참여자 중 Task가 없는 경우 프로필 조회 불가
- `project_participants` JOIN 시 프로필이 null로 반환될 수 있음

**현재 profiles SELECT 정책** (`20260110000002_phase2_rls_policies_verification.sql`):
```sql
CREATE POLICY "profiles_select_own_or_admin_or_same_project"
ON public.profiles
FOR SELECT
USING (
  (SELECT auth.uid()) = id
  OR is_admin((SELECT auth.uid()))
  OR can_access_profile(id)  -- ❌ Task가 없는 경우 프로필 조회 불가
);
```

## 해결 방안

### 1. project_participants SELECT 정책 수정

**목표**: 프로젝트 참여자가 해당 프로젝트의 모든 참여자 레코드를 볼 수 있도록 수정

**방법**: `(SELECT auth.uid()) = user_id` 조건 제거 및 순환 참조 방지를 위한 직접 서브쿼리 사용

**수정된 정책**:
```sql
CREATE POLICY "project_participants_select_participant_or_admin"
ON public.project_participants
FOR SELECT
USING (
  -- Admin은 모든 레코드 조회 가능
  is_admin((SELECT auth.uid()))
  OR
  -- 현재 사용자가 해당 프로젝트의 참여자인 경우,
  -- 해당 프로젝트의 모든 참여자 레코드 조회 가능
  -- 직접 서브쿼리를 사용하여 순환 참조 방지
  EXISTS (
    SELECT 1 
    FROM public.project_participants pp
    WHERE pp.project_id = project_participants.project_id
    AND pp.user_id = (SELECT auth.uid())
  )
);
```

**설명**:
- `(SELECT auth.uid()) = user_id` 조건 제거 → 프로젝트 참여자가 다른 참여자 레코드도 조회 가능
- `is_project_participant()` 함수 대신 직접 서브쿼리 사용 → 순환 참조 방지
- 같은 프로젝트(`project_id`) 내의 참여자만 확인하므로 RLS 정책이 재적용되어도 문제 없음

### 2. can_access_profile() 함수 개선

**목표**: 프로젝트 참여자도 프로필 조회 가능하도록 개선

**방법**: Task뿐만 아니라 `project_participants`를 통한 프로젝트 참여 여부도 확인

**수정된 함수**:
```sql
CREATE OR REPLACE FUNCTION public.can_access_profile(target_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    -- 방법 1: Task를 통해 연결된 경우
    SELECT 1 FROM public.tasks
    WHERE (tasks.assigner_id = target_user_id OR tasks.assignee_id = target_user_id)
    AND EXISTS (
      SELECT 1 FROM public.project_participants
      WHERE project_participants.project_id = tasks.project_id
      AND project_participants.user_id = (SELECT auth.uid())
    )
    UNION
    -- 방법 2: 같은 프로젝트에 참여한 경우
    SELECT 1 FROM public.project_participants pp1
    INNER JOIN public.project_participants pp2
      ON pp1.project_id = pp2.project_id
    WHERE pp1.user_id = (SELECT auth.uid())
    AND pp2.user_id = target_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**설명**:
- Task를 통해 연결된 경우와 프로젝트 참여를 통해 연결된 경우 모두 확인
- 프로젝트 참여자 중 Task가 없는 경우에도 프로필 조회 가능
- `project_participants` JOIN 시 프로필이 null로 반환되는 문제 해결

### 3. is_project_participant() 함수 최적화 (선택사항)

**목표**: 함수의 안정성 향상

**방법**: 함수 내부에서 RLS 영향을 최소화하도록 최적화

**현재 함수는 이미 `SECURITY DEFINER`로 설정되어 있으므로, RLS 정책에서 직접 서브쿼리를 사용하는 것이 더 안전함**

## 수정 계획

### 단계 1: project_participants SELECT 정책 수정

**파일**: `supabase/migrations/20260110000009_fix_project_participants_rls_final.sql`

**작업 내용**:
1. 기존 정책 삭제
2. 새로운 SELECT 정책 생성 (순환 참조 방지)
3. 정책 설명 추가

### 단계 2: can_access_profile() 함수 개선

**파일**: `supabase/migrations/20260110000009_fix_project_participants_rls_final.sql`

**작업 내용**:
1. 기존 함수 수정
2. Task를 통한 연결과 프로젝트 참여를 통한 연결 모두 확인
3. 함수 설명 업데이트

### 단계 3: 테스트 및 검증

**검증 항목**:
1. 관리자가 모든 프로젝트 참여자 레코드를 조회할 수 있는지 확인
2. 프로젝트 참여자가 해당 프로젝트의 모든 참여자 레코드를 조회할 수 있는지 확인
3. 프로젝트 참여자가 다른 참여자의 프로필을 조회할 수 있는지 확인
4. Task가 없는 프로젝트 참여자의 프로필도 조회 가능한지 확인
5. 순환 참조 문제가 발생하지 않는지 확인

## 예상 효과

### Before (현재)
- ❌ 프로젝트 참여자가 자신의 레코드만 조회 가능
- ❌ 다른 참여자의 프로필 조회 불가 (Task가 없는 경우)
- ⚠️ 순환 참조 가능성

### After (수정 후)
- ✅ 프로젝트 참여자가 해당 프로젝트의 모든 참여자 레코드 조회 가능
- ✅ 프로젝트 참여자가 다른 참여자의 프로필 조회 가능
- ✅ 순환 참조 문제 해결
- ✅ `project_participants` JOIN 시 프로필 정보 정상 반환

## 주의사항

1. **마이그레이션 순서**: 기존 마이그레이션 파일을 확인하여 최신 정책이 적용되도록 주의
2. **RLS 정책 우선순위**: 여러 정책이 있을 경우 OR 조건으로 통합되어 작동
3. **성능 고려**: 서브쿼리 사용 시 인덱스가 제대로 설정되어 있는지 확인
4. **보안**: 프로젝트 참여자가 다른 프로젝트의 참여자 정보를 조회하지 못하도록 주의

## 관련 파일

- `supabase/migrations/20260110000002_phase2_rls_policies_verification.sql`
- `supabase/migrations/20260110000006_fix_project_participants_select_policy.sql`
- `supabase/migrations/20260110000007_fix_project_participants_rls_circular_reference.sql`
- `supabase/migrations/20250101000014_create_rls_policies_profiles.sql`
- `supabase/migrations/20260110000004_update_task_insert_policy_participants.sql`


