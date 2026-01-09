# 프로젝트 참여자 노출 불일치 원인 분석 보고서

## 1. 재현 조건

1. 관리자가 프로젝트를 생성하고 여러 참여자를 추가
2. 관리자 화면에서 프로젝트 상세 페이지 접근 → 모든 참여자 표시됨 ✅
3. 멤버 화면에서 동일 프로젝트 상세 페이지 접근 → 일부 참여자만 표시됨 ❌
4. 특히 Task가 없는 프로젝트에서 문제가 두드러짐

## 2. 원인 분석

### 2.1 핵심 문제: 복합 원인 (DB RLS + API JOIN + 프론트엔드 필터링)

문제는 **단일 원인이 아닌 3단계 복합 문제**입니다:

1. **DB RLS 정책**: `profiles` SELECT 정책이 Task 기반으로만 프로필 조회 허용
2. **API JOIN**: `project_participants`와 `profiles` JOIN 시 RLS 정책 적용
3. **프론트엔드 필터링**: `profile !== null` 조건으로 null 프로필 참여자 제외

### 2.2 상세 원인 분석

#### A. `project_participants` SELECT 정책 (정상 작동)

**현재 정책** (`20260110000010_rollback_project_participants_rls_final.sql`):
```sql
CREATE POLICY "project_participants_select_participant_or_admin"
ON public.project_participants
FOR SELECT
USING (
  is_admin((SELECT auth.uid()))
  OR (SELECT auth.uid()) = user_id
  OR is_project_participant((SELECT auth.uid()), project_id)
);
```

**분석 결과**:
- ✅ 관리자: `is_admin()`이 true → 모든 `project_participants` 레코드 조회 가능
- ✅ 멤버: `is_project_participant()` 함수로 프로젝트 참여 여부 확인 → 프로젝트 참여자는 해당 프로젝트의 모든 참여자 레코드 조회 가능
- ⚠️ **주의**: `is_project_participant()` 함수 내부에서 `project_participants` 테이블을 다시 조회하면서 RLS 정책이 재적용되지만, 같은 프로젝트 내의 참여자만 확인하므로 순환 참조는 발생하지 않음

**결론**: `project_participants` SELECT 정책 자체는 정상 작동합니다.

#### B. `profiles` SELECT 정책 (문제 발생 지점)

**현재 정책** (실제 적용된 정책):
```sql
-- 정책 1: 관리자는 모든 프로필 조회 가능
CREATE POLICY "Admins can view all profiles"
ON public.profiles FOR SELECT
USING (is_admin(auth.uid()));

-- 정책 2: 본인 프로필 조회 가능
CREATE POLICY "Users can view own profile"
ON public.profiles FOR SELECT
USING (auth.uid() = id);

-- 정책 3: Task를 통해 연결된 프로필 조회 가능
CREATE POLICY "profiles_select_same_project"
ON public.profiles FOR SELECT
USING (can_access_profile(id));
```

**`can_access_profile()` 함수 정의**:
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
- ❌ `can_access_profile()` 함수는 **Task를 통해서만** 프로필 조회를 허용합니다
- ❌ 프로젝트 참여자 중 **Task가 없는 경우 프로필 조회 불가**
- ❌ JOIN 시 프로필이 `null`로 반환됨

**동작 시나리오**:

1. **관리자 조회 시**:
   ```
   project_participants 조회 → RLS: is_admin() = true → 모든 레코드 반환
   profiles JOIN → RLS: is_admin() = true → 모든 프로필 반환
   결과: 모든 참여자 + 프로필 정보 정상 표시 ✅
   ```

2. **멤버 조회 시**:
   ```
   project_participants 조회 → RLS: is_project_participant() = true → 프로젝트 참여자 레코드 반환
   profiles JOIN → RLS:
     - 본인 프로필: auth.uid() = id → 조회 가능 ✅
     - 다른 참여자 프로필: can_access_profile() 호출
       → Task가 있는 경우: 조회 가능 ✅
       → Task가 없는 경우: 조회 불가 → null 반환 ❌
   결과: Task가 없는 참여자의 프로필이 null로 반환됨
   ```

#### C. API 쿼리 (`getProjectParticipants`)

**현재 구현** (`src/api/project.ts:165-180`):
```typescript
export async function getProjectParticipants(projectId: string): Promise<ProjectParticipant[]> {
  const { data, error } = await (supabase as any)
    .from("project_participants")
    .select(`
      *,
      profile:profiles!project_participants_user_id_fkey(id, email, full_name, profile_completed, is_active)
    `)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  // ...
}
```

**분석 결과**:
- ✅ `project_participants` 조회는 정상 작동
- ❌ `profiles` JOIN 시 RLS 정책이 적용되어, 멤버는 Task가 없는 참여자의 프로필을 조회할 수 없음
- ❌ 결과적으로 `profile: null`인 참여자 레코드가 반환됨

#### D. 프론트엔드 필터링 (문제 악화)

**현재 구현** (`src/pages/project-detail-page.tsx:298-299`):
```typescript
{participants
  .filter((participant) => participant.profile !== null)
  .map((participant) => {
    // ...
  })}
```

**분석 결과**:
- ❌ `profile !== null` 조건으로 필터링하여, 프로필이 null인 참여자를 화면에서 제외
- ❌ 이로 인해 Task가 없는 참여자가 화면에 표시되지 않음

**동일한 필터링이 적용된 위치**:
- `src/pages/project-detail-page.tsx:299`
- `src/components/project/participant-management-dialog.tsx:232`

## 3. 왜 관리자에서는 보이고 멤버에서는 누락되는가?

### 논리적 설명

1. **관리자 조회 흐름**:
   ```
   project_participants SELECT 정책: is_admin() = true
   → 모든 project_participants 레코드 반환
   
   profiles JOIN 시 SELECT 정책: is_admin() = true
   → 모든 profiles 레코드 반환
   
   결과: 모든 참여자 + 프로필 정보 정상 표시 ✅
   ```

2. **멤버 조회 흐름**:
   ```
   project_participants SELECT 정책: is_project_participant() = true
   → 프로젝트 참여자 레코드 반환 (정상)
   
   profiles JOIN 시 SELECT 정책:
   - 본인: auth.uid() = id → 조회 가능 ✅
   - 다른 참여자: can_access_profile() 호출
     → Task가 있는 경우: 조회 가능 ✅
     → Task가 없는 경우: 조회 불가 → null 반환 ❌
   
   프론트엔드 필터링: profile !== null
   → 프로필이 null인 참여자 제외 ❌
   
   결과: Task가 없는 참여자가 화면에 표시되지 않음 ❌
   ```

### 핵심 문제점

**`can_access_profile()` 함수의 제한적 동작**:
- 현재 함수는 Task를 통해서만 프로필 조회를 허용합니다
- 프로젝트 참여를 통한 연결은 확인하지 않습니다
- 따라서 프로젝트 참여자 중 Task가 없는 경우 프로필 조회 불가

## 4. 해결 방향

### 4.1 즉시 해결 방안 (권장)

**`can_access_profile()` 함수 수정**:
- Task를 통한 연결 확인 (기존 유지)
- **프로젝트 참여를 통한 연결 확인 추가**
- 같은 프로젝트에 참여한 사용자의 프로필도 조회 가능하도록 수정

**수정 위치**: `supabase/migrations/` (새 마이그레이션 파일)

**수정 내용**:
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
  )
  OR EXISTS (
    -- 방법 2: 같은 프로젝트에 참여한 경우 (추가 필요)
    SELECT 1 FROM public.project_participants pp1
    INNER JOIN public.project_participants pp2
      ON pp1.project_id = pp2.project_id
    WHERE pp1.user_id = (SELECT auth.uid())
    AND pp2.user_id = target_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 4.2 대안 해결 방안

**프론트엔드 필터링 제거** (임시 방안, 권장하지 않음):
- `profile !== null` 필터링 제거
- 프로필이 null인 경우에도 참여자 표시 (하지만 프로필 정보 없음)

**문제점**:
- 프로필 정보가 없어서 사용자 식별 불가
- 근본적인 해결책이 아님

### 4.3 추가 검토 사항

1. **`is_project_participant()` 함수의 순환 참조 가능성**:
   - 현재는 문제 없지만, 함수 내부에서 RLS가 재적용되므로 성능 이슈 가능성
   - 필요시 직접 서브쿼리로 대체 고려

2. **인덱스 확인**:
   - `project_participants(project_id, user_id)` 인덱스 존재 확인 필요
   - JOIN 성능 최적화

3. **외래키 제약조건**:
   - `project_participants.user_id → profiles.id` 제약조건 정상 작동 확인

## 5. 영향도 분석

### 5.1 현재 영향

- ❌ 멤버가 프로젝트 참여자 목록을 정확히 확인할 수 없음
- ❌ Task 생성 시 참여자 선택이 제한됨 (일부 참여자가 목록에 없음)
- ❌ 프로젝트 협업에 심각한 문제 발생

### 5.2 해결 후 예상 효과

- ✅ 멤버도 프로젝트의 모든 참여자를 확인 가능
- ✅ Task 생성 시 모든 참여자에게 할당 가능
- ✅ 프로젝트 협업 정상화

## 6. 검증 방법

해결 후 다음 시나리오로 검증:

1. 관리자가 프로젝트 생성 및 참여자 추가 (Task 없음)
2. 멤버로 로그인하여 프로젝트 상세 페이지 접근
3. 모든 참여자가 표시되는지 확인
4. Task 생성 시 모든 참여자가 선택 목록에 나타나는지 확인

## 7. 실제 데이터 검증 결과

**검증 쿼리 결과**:
- 프로젝트: "사과 레시피 등록 패키지" (ID: `a62b6b97-5a1c-4adc-9f22-bf379f4db3aa`)
- 참여자 수: 2명 (관리자 + 멤버)
- Task 수: 0개
- Task가 있는 참여자: 0명

**결과 분석**:
- ✅ 인덱스: `project_participants(project_id, user_id)` 복합 인덱스 존재
- ✅ 외래키 제약조건: 모든 제약조건 정상 작동
- ❌ **문제 확인**: Task가 없는 프로젝트에서 멤버가 다른 참여자의 프로필을 조회할 수 없음

## 8. 결론

**원인**: `can_access_profile()` 함수가 Task를 통해서만 프로필 조회를 허용하여, 프로젝트 참여자 중 Task가 없는 경우 프로필이 null로 반환되고, 프론트엔드에서 이를 필터링하여 화면에 표시되지 않음

**발생 위치**: 
1. **DB RLS 정책** (`profiles` SELECT 정책의 `can_access_profile()` 함수) - 핵심 원인
2. **API JOIN** (`getProjectParticipants`의 `profiles` JOIN) - RLS 정책 적용 지점
3. **프론트엔드 필터링** (`profile !== null` 조건) - 문제 악화 요인

**해결 방향**: `can_access_profile()` 함수를 수정하여 프로젝트 참여를 통한 연결도 확인하도록 개선

**우선순위**: 🔴 최우선 긴급 (프로젝트 진행 불가능)

