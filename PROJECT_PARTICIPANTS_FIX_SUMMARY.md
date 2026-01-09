# 프로젝트 참여자 조회 문제 수정 완료 보고

## ✅ 수정 완료 사항

### 1. RLS 정책 수정 (순환 참조 제거)

**마이그레이션:** `20260110000007_fix_project_participants_rls_circular_reference.sql`

**변경 내용:**
- 기존: `is_project_participant` 함수를 호출하는 방식 (순환 참조 발생)
- 수정: 직접 서브쿼리를 사용하는 방식 (순환 참조 방지)

**수정된 정책:**
```sql
CREATE POLICY "project_participants_select_participant_or_admin"
ON public.project_participants
FOR SELECT
USING (
  is_admin((SELECT auth.uid()))
  OR
  EXISTS (
    SELECT 1 
    FROM public.project_participants pp
    WHERE pp.project_id = project_participants.project_id
    AND pp.user_id = (SELECT auth.uid())
  )
);
```

**작동 원리:**
- 서브쿼리는 같은 프로젝트(`project_id`) 내의 참여자만 확인
- RLS 정책이 재적용되어도 같은 프로젝트 내의 참여자만 확인하므로 순환 참조 발생하지 않음
- 사용자 A가 프로젝트 X의 참여자인 경우, 프로젝트 X의 모든 참여자 레코드 조회 가능

### 2. 함수 최적화

**마이그레이션:** `20260110000008_fix_is_project_participant_function_rls_bypass.sql`

**변경 내용:**
- 함수를 최적화하여 다른 용도(Task 생성 정책 등)에서 사용할 수 있도록 수정
- `STABLE` 속성 추가로 성능 최적화
- `SET search_path` 설정으로 보안 강화

---

## 📋 수정 전후 비교

### 수정 전
- **CEO**: 4명 표시 ✅
- **정동운**: 3명 표시 (CEO 누락) ❌
- **진달래**: 3명 표시 (정동운 누락) ❌
- **Task 생성**: 실패 (참여자 목록 불일치로 인해)

### 수정 후 (예상)
- **CEO**: 4명 표시 ✅
- **정동운**: 4명 표시 ✅
- **진달래**: 4명 표시 ✅
- **Task 생성**: 성공 (모든 참여자에게 Task 할당 가능)

---

## 🧪 테스트 필요 사항

### 1. 참여자 목록 조회 테스트
- [ ] CEO로 로그인하여 모든 참여자 조회 확인
- [ ] 정동운으로 로그인하여 모든 참여자 조회 확인
- [ ] 진달래로 로그인하여 모든 참여자 조회 확인
- [ ] 홍성진으로 로그인하여 모든 참여자 조회 확인

### 2. Task 생성 테스트
- [ ] 각 사용자가 다른 참여자에게 Task 생성 가능한지 확인
- [ ] Task 생성 시 assignee 선택 드롭다운에 모든 참여자 표시되는지 확인
- [ ] Task 생성 후 Task 목록에 정상적으로 표시되는지 확인

### 3. 프로젝트 진행 시나리오 테스트
- [ ] 여러 참여자가 동시에 Task를 생성하고 관리할 수 있는지 확인
- [ ] 프로젝트 참여자 관리 기능이 정상 작동하는지 확인

---

## 🔍 기술적 세부 사항

### 순환 참조 문제 해결 방법

**문제:**
```
RLS 정책 → is_project_participant 함수 호출
  → 함수 내부에서 project_participants 테이블 조회
    → RLS 정책 다시 적용
      → is_project_participant 함수 다시 호출
        → 무한 루프 발생
```

**해결:**
```
RLS 정책 → 직접 서브쿼리 사용
  → 같은 프로젝트 내의 참여자만 확인
    → RLS 정책 재적용되어도 같은 프로젝트만 확인
      → 순환 참조 발생하지 않음
```

### RLS 정책 동작 방식

1. **Admin**: `is_admin()` 함수로 모든 레코드 조회 가능
2. **프로젝트 참여자**: 
   - 서브쿼리로 현재 사용자가 해당 프로젝트의 참여자인지 확인
   - 참여자인 경우, 해당 프로젝트의 모든 참여자 레코드 조회 가능
   - 서브쿼리는 같은 프로젝트만 확인하므로 순환 참조 없음

---

## ⚠️ 주의 사항

1. **서브쿼리 성능**: 프로젝트 참여자가 많은 경우 성능에 영향을 줄 수 있음
   - 현재는 인덱스가 있어 성능 문제 없을 것으로 예상
   - 필요시 성능 모니터링 필요

2. **다른 RLS 정책과의 호환성**: 
   - `is_project_participant` 함수는 다른 정책(Task 생성 등)에서도 사용됨
   - 함수는 그대로 유지하되, `project_participants` 테이블의 SELECT 정책만 수정

3. **롤백 계획**: 
   - 문제 발생 시 마이그레이션 롤백 가능
   - 기존 정책으로 복원 가능

---

## 📝 다음 단계

1. ✅ RLS 정책 수정 완료
2. ✅ 함수 최적화 완료
3. ⏳ 실제 환경에서 테스트 필요
4. ⏳ 문제 재발 여부 모니터링
5. ⏳ 성능 모니터링 (필요시)

---

## 🔗 관련 파일

- **분석 문서**: `PROJECT_PARTICIPANTS_CRITICAL_FIX_PLAN.md`
- **마이그레이션 1**: `supabase/migrations/20260110000007_fix_project_participants_rls_circular_reference.sql`
- **마이그레이션 2**: `supabase/migrations/20260110000008_fix_is_project_participant_function_rls_bypass.sql`
- **API 코드**: `src/api/project.ts` (수정 불필요)
- **프론트엔드**: `src/pages/project-detail-page.tsx` (수정 불필요)

---

## ✅ 결론

RLS 정책의 순환 참조 문제를 해결하기 위해 직접 서브쿼리 방식을 사용하여 정책을 수정했습니다. 이제 모든 프로젝트 참여자가 해당 프로젝트의 모든 참여자를 볼 수 있어야 합니다.

**실제 환경에서 테스트하여 문제가 해결되었는지 확인해주세요.**


