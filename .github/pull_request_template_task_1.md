# 작업 개요

- 데이터베이스 마이그레이션 - is_public 컬럼 및 RLS 정책 수정
- Task ID: 1

---

## 작업 내용

- [x] is_public 컬럼 추가 마이그레이션 파일 작성
- [x] is_public 인덱스 추가
- [x] SELECT RLS 정책 수정 - tasks_select_admin_or_assigned
- [x] UPDATE RLS 정책 수정 - tasks_update_assigner_or_assignee
- [x] 마이그레이션 파일 검증 및 테스트
- [x] MCP 서버를 사용한 마이그레이션 적용 및 타입 자동 업데이트

---

## 수정한 파일

- `src/database.type.ts`

## 추가된 파일

- `supabase/migrations/is-public/20260209000001_add_task_is_public.sql`

## 마이그레이션 파일

- `supabase/migrations/is-public/20260209000001_add_task_is_public.sql`

---

## 브랜치 정보

- 브랜치 명: `feature/task-1-is-public-column-rls-policy`
- 커밋 메시지: `feat(task-1): 데이터베이스 마이그레이션 - is_public 컬럼 및 RLS 정책 수정

tasks 테이블에 is_public 컬럼 추가, 인덱스 생성, RLS 정책 수정

- is_public 컬럼 추가 마이그레이션 파일 작성
- is_public 인덱스 추가
- SELECT RLS 정책 수정 - tasks_select_admin_or_assigned
- UPDATE RLS 정책 수정 - tasks_update_assigner_or_assignee
- 마이그레이션 파일 검증 및 테스트
- MCP 서버를 사용한 마이그레이션 적용 및 타입 자동 업데이트

관련 파일:
- supabase/migrations/is-public/20260209000001_add_task_is_public.sql
- src/database.type.ts`

---

## 기타 참고사항

- ⚠️ 중요: 관리자는 RLS 레벨에서 UPDATE 권한을 받지만, 실제 필드별 제어(is_public만 변경 가능)는 API 레벨에서 수행됨
- ⚠️ 중요: 자기 할당 Task는 is_public 설정과 무관하게 항상 본인만 접근 가능 (관리자도 제외)
- ⚠️ 중요: 마이그레이션 파일 적용 후 반드시 npm run type-gen 실행하여 타입 재생성 필요
- ⚠️ 중요: 모든 마이그레이션은 테스트 환경에서 먼저 검증 후 원본 DB에 적용
- 공개된 Task는 모든 인증된 사용자가 읽기 전용으로 접근 가능하지만, UPDATE/DELETE는 여전히 지시자/담당자/관리자만 가능
- 공개 설정 변경은 관리자만 가능하며, API 레벨에서 엄격하게 검증됨
