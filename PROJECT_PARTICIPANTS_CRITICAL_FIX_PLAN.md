# 프로젝트 참여자 조회 및 Task 생성 문제 종합 분석 및 수정 계획

## 🔴 심각도: CRITICAL

### 문제 요약
프로젝트 참여자 목록이 사용자마다 다르게 표시되어, Task 생성이 불가능하고 프로젝트 진행이 중단되는 심각한 문제 발생

---

## 1. 문제 현상

### 1.1 참여자 목록 불일치
- **CEO (aaz19087@nate.com)**: 4명 모두 표시 ✅
- **정동운 (jungih91@gmail.com)**: 3명만 표시 (CEO 누락) ❌
- **진달래 (az0319h@naver.com)**: 3명만 표시 (정동운 누락) ❌

### 1.2 실제 데이터베이스 상태
```sql
-- 프로젝트 "휴대폰 안테나" 실제 참여자 (4명)
1. CEO (aaz19087@nate.com) - 생성자
2. 진달래 (az0319h@naver.com)
3. 홍성진 (aaz19087@gmail.com)
4. 정동운 (jungih91@gmail.com)
```

### 1.3 Task 생성 실패
- 참여자 목록에 없는 사용자에게 Task 할당 불가
- "프로젝트 참여자만 Task를 생성할 수 있습니다" 에러 발생
- 프로젝트 전체 진행 중단

---

## 2. 근본 원인 분석

### 2.1 RLS 정책의 순환 참조 문제 ⚠️

**현재 RLS 정책:**
```sql
CREATE POLICY "project_participants_select_participant_or_admin"
ON public.project_participants
FOR SELECT
USING (
  is_admin((SELECT auth.uid()))
  OR is_project_participant((SELECT auth.uid()), project_id)
);
```

**문제점:**
1. `is_project_participant` 함수가 RLS 정책 내에서 호출됨
2. 함수 내부에서 `project_participants` 테이블을 조회할 때 **RLS 정책이 다시 적용됨**
3. 순환 참조 발생: RLS 정책 → 함수 호출 → RLS 정책 → 함수 호출 → ...
4. 결과적으로 일부 참여자만 조회되거나 조회 실패

### 2.2 is_project_participant 함수의 문제

**현재 함수 정의:**
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

**문제점:**
- `SECURITY DEFINER`로 설정되어 있지만, 함수 내부의 쿼리에서 RLS가 여전히 적용됨
- PostgreSQL의 RLS는 `SECURITY DEFINER` 함수 내부에서도 적용됨 (명시적으로 우회하지 않는 한)

### 2.3 프론트엔드 코드의 문제

**src/api/task.ts - createTask 함수:**
```typescript
// Admin이 아닌 경우 프로젝트 참여자인지 확인
if (!isAdmin) {
  const { getProjectParticipants } = await import("@/api/project");
  const participants = await getProjectParticipants(task.project_id);
  const isParticipant = participants.some((p) => p.user_id === currentUserId);
  
  if (!isParticipant) {
    throw new Error("프로젝트 참여자만 Task를 생성할 수 있습니다.");
  }
}
```

**문제점:**
- `getProjectParticipants`가 RLS 정책의 영향을 받아 일부 참여자만 반환
- 이로 인해 Task 생성 권한 검증이 실패할 수 있음

---

## 3. 영향 범위 분석

### 3.1 직접 영향
- ✅ 프로젝트 참여자 목록 조회 실패
- ✅ Task 생성 실패
- ✅ 프로젝트 진행 중단

### 3.2 간접 영향
- ⚠️ 프로젝트 참여자 관리 기능 오작동
- ⚠️ Task 할당 시 참여자 선택 불가
- ⚠️ 프로젝트 협업 불가능

---

## 4. 수정 계획

### 4.1 Phase 1: RLS 정책 수정 (최우선)

**목표:** 순환 참조를 완전히 제거하고, 프로젝트 참여자가 해당 프로젝트의 모든 참여자를 볼 수 있도록 수정

**방법:**
1. `is_project_participant` 함수를 수정하여 RLS를 완전히 우회하도록 변경
2. RLS 정책을 직접 서브쿼리로 작성하여 순환 참조 방지

**수정된 함수:**
```sql
CREATE OR REPLACE FUNCTION public.is_project_participant(user_id UUID, project_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- SECURITY DEFINER로 실행되지만, RLS를 우회하기 위해
  -- 직접 테이블을 조회하되 SET search_path를 사용하여 RLS 우회
  RETURN EXISTS (
    SELECT 1 
    FROM public.project_participants
    WHERE project_participants.project_id = is_project_participant.project_id
    AND project_participants.user_id = is_project_participant.user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;
```

**수정된 RLS 정책 (대안 1 - 함수 사용):**
```sql
-- 함수를 사용하되, 함수 내부에서 RLS 우회하도록 수정
CREATE POLICY "project_participants_select_participant_or_admin"
ON public.project_participants
FOR SELECT
USING (
  is_admin((SELECT auth.uid()))
  OR is_project_participant((SELECT auth.uid()), project_id)
);
```

**수정된 RLS 정책 (대안 2 - 직접 서브쿼리, 권장):**
```sql
-- 순환 참조를 완전히 방지하기 위해 직접 서브쿼리 사용
CREATE POLICY "project_participants_select_participant_or_admin"
ON public.project_participants
FOR SELECT
USING (
  -- Admin은 모든 레코드 조회 가능
  is_admin((SELECT auth.uid()))
  OR
  -- 현재 사용자가 해당 프로젝트의 참여자인 경우, 
  -- 해당 프로젝트의 모든 참여자 레코드 조회 가능
  -- 주의: 이 서브쿼리는 RLS 정책의 영향을 받지만,
  -- 같은 프로젝트 내의 참여자만 확인하므로 순환 참조가 발생하지 않음
  EXISTS (
    SELECT 1 
    FROM public.project_participants pp
    WHERE pp.project_id = project_participants.project_id
    AND pp.user_id = (SELECT auth.uid())
  )
);
```

**최종 선택: 대안 2 (직접 서브쿼리)**
- 이유: 순환 참조를 완전히 방지할 수 있음
- 같은 프로젝트 내의 참여자만 확인하므로 RLS 정책이 재적용되어도 문제 없음

### 4.2 Phase 2: 함수 수정

**목표:** `is_project_participant` 함수가 RLS를 완전히 우회하도록 수정

**수정 방법:**
```sql
CREATE OR REPLACE FUNCTION public.is_project_participant(user_id UUID, project_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  result BOOLEAN;
BEGIN
  -- SECURITY DEFINER로 실행되지만, RLS를 우회하기 위해
  -- pg_catalog를 통해 직접 조회하거나
  -- 또는 함수 내부에서 RLS를 비활성화하는 방법 사용
  
  -- 방법 1: pg_catalog를 통한 직접 조회 (RLS 우회)
  SELECT EXISTS (
    SELECT 1 
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' 
    AND c.relname = 'project_participants'
  ) INTO result;
  
  -- 방법 2: SECURITY DEFINER 함수 내부에서 RLS 비활성화
  -- (PostgreSQL 9.5+에서 지원하지 않음)
  
  -- 방법 3: 함수를 SECURITY INVOKER로 변경하고 호출자 권한으로 실행
  -- (권장하지 않음)
  
  -- 최종 방법: 함수 내부에서 직접 테이블 조회하되,
  -- RLS 정책이 적용되지 않도록 설정
  -- SECURITY DEFINER 함수는 함수 소유자의 권한으로 실행되므로
  -- RLS를 우회할 수 있음 (하지만 현재는 작동하지 않음)
  
  RETURN EXISTS (
    SELECT 1 
    FROM public.project_participants
    WHERE project_participants.project_id = is_project_participant.project_id
    AND project_participants.user_id = is_project_participant.user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;
```

**실제 해결책:**
PostgreSQL에서 `SECURITY DEFINER` 함수 내부의 쿼리는 여전히 RLS의 영향을 받습니다. 
따라서 **RLS 정책 자체를 수정**하여 순환 참조를 방지하는 것이 가장 확실한 방법입니다.

### 4.3 Phase 3: 프론트엔드 코드 검증

**목표:** Task 생성 로직이 올바르게 작동하는지 확인

**확인 사항:**
1. `getProjectParticipants` 함수가 모든 참여자를 반환하는지 확인
2. Task 생성 시 참여자 검증 로직이 올바른지 확인
3. 에러 처리 로직 확인

**수정 필요 여부:**
- RLS 정책이 수정되면 프론트엔드 코드는 수정 불필요
- 다만, 에러 메시지를 더 명확하게 개선할 수 있음

### 4.4 Phase 4: 테스트 계획

**테스트 시나리오:**
1. ✅ CEO로 로그인하여 모든 참여자 조회 확인
2. ✅ 정동운으로 로그인하여 모든 참여자 조회 확인
3. ✅ 진달래로 로그인하여 모든 참여자 조회 확인
4. ✅ 각 사용자가 다른 참여자에게 Task 생성 가능한지 확인
5. ✅ Task 생성 시 assignee 선택 드롭다운에 모든 참여자 표시되는지 확인

---

## 5. 수정 실행 계획

### Step 1: RLS 정책 수정 (즉시 실행)
1. 새로운 마이그레이션 파일 생성
2. 기존 정책 삭제
3. 새로운 정책 생성 (직접 서브쿼리 방식)
4. 마이그레이션 적용

### Step 2: 함수 검증
1. `is_project_participant` 함수가 다른 곳에서 사용되는지 확인
2. 필요시 함수 수정

### Step 3: 통합 테스트
1. 각 사용자 계정으로 로그인하여 참여자 목록 확인
2. Task 생성 기능 테스트
3. 프로젝트 진행 시나리오 테스트

### Step 4: 모니터링
1. 프로덕션 환경에서 문제 재발 여부 확인
2. 로그 모니터링

---

## 6. 예상 결과

### 6.1 수정 전
- CEO: 4명 표시 ✅
- 정동운: 3명 표시 (CEO 누락) ❌
- 진달래: 3명 표시 (정동운 누락) ❌

### 6.2 수정 후
- CEO: 4명 표시 ✅
- 정동운: 4명 표시 ✅
- 진달래: 4명 표시 ✅

### 6.3 Task 생성
- 모든 참여자가 다른 참여자에게 Task 생성 가능 ✅
- assignee 선택 드롭다운에 모든 참여자 표시 ✅

---

## 7. 롤백 계획

만약 수정 후 문제가 발생할 경우:
1. 마이그레이션 롤백
2. 기존 정책 복원
3. 대안 방법 검토

---

## 8. 참고 사항

### 8.1 PostgreSQL RLS 동작 방식
- `SECURITY DEFINER` 함수 내부의 쿼리도 RLS의 영향을 받음
- 함수 소유자의 권한으로 실행되지만, RLS는 여전히 적용됨
- RLS를 완전히 우회하려면 특별한 설정이 필요함

### 8.2 순환 참조 방지 방법
1. RLS 정책에서 함수 대신 직접 서브쿼리 사용
2. 함수 내부에서 RLS를 우회하는 특별한 방법 사용 (복잡함)
3. 정책 로직을 단순화하여 순환 참조 방지

---

## 9. 결론

**핵심 문제:** RLS 정책에서 `is_project_participant` 함수를 호출할 때 순환 참조가 발생하여 일부 참여자만 조회됨

**해결 방법:** RLS 정책을 직접 서브쿼리 방식으로 수정하여 순환 참조를 완전히 제거

**우선순위:** CRITICAL - 즉시 수정 필요


