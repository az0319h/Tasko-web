# 프로젝트 참여자 RLS 정책 롤백 완료

## 롤백 완료 사항

### 1. RLS 정책 롤백 ✅

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

### 2. 함수 상태

**함수:** `is_project_participant`
- 파라미터 이름이 `query_user_id`, `query_project_id`로 변경되어 있음
- 하지만 동작은 동일하므로 그대로 유지
- 다른 객체가 의존하고 있어 변경하지 않음

## 롤백 전후 비교

### 롤백 전 (문제 발생)
- 직접 서브쿼리 방식 사용
- 프로젝트가 망가짐

### 롤백 후 (복원 완료)
- 이전 정책으로 복원
- `is_project_participant` 함수 사용
- `(SELECT auth.uid()) = user_id` 조건 포함

## 현재 상태

✅ RLS 정책이 이전 상태로 복원되었습니다.
✅ 프로젝트가 정상 작동해야 합니다.

## 참고 사항

- 함수 파라미터 이름은 변경되었지만 동작은 동일합니다.
- 정책은 완전히 이전 상태로 롤백되었습니다.
- 문제가 지속되면 추가 확인이 필요할 수 있습니다.


