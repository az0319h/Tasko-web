# 프로젝트 참여자 RLS 정책 롤백 완료

## 롤백 완료 사항

### 1. project_participants SELECT 정책 롤백 ✅

**롤백된 정책:**
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

**변경 내용:**
- 직접 서브쿼리 방식 → 이전 정책으로 복원
- `is_project_participant` 함수를 사용하는 방식으로 복원
- `(SELECT auth.uid()) = user_id` 조건 추가 (자신의 레코드 조회 가능)

### 2. can_access_profile() 함수 롤백 ✅

**롤백된 함수:**
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

**변경 내용:**
- 프로젝트 참여를 통한 연결 확인 제거
- Task를 통한 연결만 확인하는 원래 함수로 복원
- `has_project_access` 함수 사용

## 롤백 전후 비교

### 롤백 전 (문제 발생)
- 직접 서브쿼리 방식 사용
- 프로젝트 참여를 통한 프로필 조회 추가
- 프로젝트 로직이 꼬인 상태

### 롤백 후 (복원 완료)
- 이전 정책으로 복원
- `is_project_participant` 함수 사용
- `(SELECT auth.uid()) = user_id` 조건 포함
- 원래 `can_access_profile()` 함수로 복원

## 현재 상태

✅ RLS 정책이 이전 상태로 복원되었습니다.
✅ 함수가 이전 상태로 복원되었습니다.
✅ 프로젝트가 정상 작동해야 합니다.

## 적용된 마이그레이션

- **마이그레이션 파일**: `20260110000010_rollback_project_participants_rls_final.sql`
- **롤백 대상**: `20260110000009_fix_project_participants_rls_final.sql`

## 참고 사항

- 정책은 완전히 이전 상태로 롤백되었습니다.
- 함수도 원래 상태로 복원되었습니다.
- 문제가 지속되면 추가 확인이 필요할 수 있습니다.


