# can_access_profile() 함수 수정 완료

## 수정 내용

### 문제점
- `can_access_profile()` 함수가 Task를 통해서만 프로필 조회를 허용
- 프로젝트 참여자 중 Task가 없는 경우 프로필 조회 불가
- 멤버가 프로젝트 참여자 목록을 정확히 확인할 수 없음

### 해결책
- Task를 통한 연결 확인 (기존 로직 유지)
- **프로젝트 참여를 통한 연결 확인 추가**
- 같은 프로젝트에 참여한 사용자의 프로필도 조회 가능하도록 수정

## 수정된 함수

```sql
CREATE OR REPLACE FUNCTION public.can_access_profile(target_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    -- 방법 1: Task를 통해 연결된 경우 (기존 로직 유지)
    SELECT 1 FROM public.tasks
    WHERE (tasks.assigner_id = target_user_id OR tasks.assignee_id = target_user_id)
    AND EXISTS (
      SELECT 1 FROM public.project_participants
      WHERE project_participants.project_id = tasks.project_id
      AND project_participants.user_id = (SELECT auth.uid())
    )
  )
  OR EXISTS (
    -- 방법 2: 같은 프로젝트에 참여한 경우 (새로 추가)
    SELECT 1 FROM public.project_participants pp1
    INNER JOIN public.project_participants pp2
      ON pp1.project_id = pp2.project_id
    WHERE pp1.user_id = (SELECT auth.uid())
    AND pp2.user_id = target_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## 동작 방식

### 기존 동작 (Task 기반만)
- Task의 assigner/assignee로 연결된 경우만 프로필 조회 가능
- 프로젝트 참여자 중 Task가 없는 경우 프로필 조회 불가 ❌

### 수정 후 동작 (Task + 프로젝트 참여 기반)
- Task의 assigner/assignee로 연결된 경우 프로필 조회 가능 ✅
- **같은 프로젝트에 참여한 경우 프로필 조회 가능** ✅
- 프로젝트 참여자 중 Task가 없는 경우에도 프로필 조회 가능 ✅

## 예상 효과

### Before (수정 전)
- 멤버가 프로젝트 참여자 목록 조회 시 Task가 없는 참여자 프로필이 null로 반환
- 프론트엔드에서 `profile !== null` 필터링으로 일부 참여자 제외
- 결과: 멤버 화면에서 일부 참여자가 표시되지 않음 ❌

### After (수정 후)
- 멤버가 프로젝트 참여자 목록 조회 시 모든 참여자 프로필 정상 반환
- 같은 프로젝트에 참여한 모든 사용자의 프로필 조회 가능
- 결과: 멤버 화면에서도 모든 참여자가 정상 표시됨 ✅

## 적용된 마이그레이션

- **파일**: `supabase/migrations/20260110000012_fix_can_access_profile_for_project_participants.sql`
- **상태**: ✅ 적용 완료

## 검증 방법

1. 관리자가 프로젝트 생성 및 참여자 추가 (Task 없음)
2. 멤버로 로그인하여 프로젝트 상세 페이지 접근
3. 모든 참여자가 표시되는지 확인
4. Task 생성 시 모든 참여자가 선택 목록에 나타나는지 확인

## 참고 사항

- 기존 Task 기반 접근 조건은 유지되어 하위 호환성 보장
- 프로젝트 참여 관계를 기준으로 프로필 접근 권한 판단
- 프론트엔드 로직 변경 불필요 (RLS 정책 수정으로 해결)

