# tasks.json 구현 전 체크리스트

## 구현 가능 여부
**결론: 구현 가능하나, 아래 항목을 미리 확인·준비해야 합니다.**

---

## 반드시 처리할 사항

### 1. 마이그레이션 폴더 생성
- `supabase/migrations/multi-chat/` 폴더가 **아직 없음**
- 구현 시작 전에 해당 폴더 생성 필요

### 2. 마이그레이션 파일 타임스탬프
- 현재 DB 최신 마이그레이션: `20260211060544` (rollback_file_shares)
- `multi-chat` 마이그레이션은 **이보다 큰 타임스탬프** 사용
- 예: `20260212000001`, `20260212000002` 등
- tasks.json의 `YYYYMMDD000001`은 실제 적용 시 위 규칙에 맞게 변경

### 3. 1-3 마이그레이션 실행 순서
- `can_access_profile` 수정(1-3)은 `task_references` 테이블 생성(1-1) **이후** 실행되어야 함
- 파일명 정렬: `create_task_references` < `update_can_access_profile` 이므로 `000001_create` → `000002_update` 형태로 타임스탬프 분리 권장

### 4. Task 2 RLS 정책 이름
- 실제 DB 정책명 확인 필요
  - messages: `messages_select_admin_or_assigned_or_public`, `messages_insert_assigner_or_assignee_only`
  - task_chat_logs: `task_chat_logs_select_admin_or_assigned_or_public`
- 기존 정책을 **DROP 후 새 조건으로 CREATE**하는 형태로 구현

---

## 선택 확인 사항

### 5. Task 2-7 `remove_task_from_lists_on_unpublish`
- 요구사항: "참조자가 만든 목록 유지 vs 제거" 결정 필요
- tasks.json notes: "요구사항 확인 후 구현"

### 6. Task 4-2 `FOR EACH STATEMENT`
- PostgreSQL `REFERENCING NEW TABLE AS` 전환 테이블 사용 가능 (PG 10+)
- 대안: `FOR EACH ROW` + statement 내 INSERT row 수집
- Supabase `pg_net`은 이미 사용 중이므로 `net.http_post` 호출 가능

### 7. Task 11 타입 재생성
- `task_references` 마이그레이션 적용 **후** `generate_typescript_types` 실행
- Phase 5가 마지막이므로 순서는 올바름

---

## Supabase `multi-chat` 폴더 동작
- `dashboard-table/`, `is-public/`, `my-tasks/` 등 하위 폴더 사용 중
- `multi-chat/`도 동일하게 사용 가능 (파일명 타임스탬프 기준 정렬)

---

## 기존 코드와의 정합성
| 항목 | 상태 |
|------|------|
| pg_net (트리거용) | ✅ 이미 사용 중 |
| messages RLS 정책명 | ✅ 확인됨 |
| task_chat_logs RLS 정책명 | ✅ 확인됨 |
| can_access_profile 함수 | ✅ 존재 (migrations_refactoring 참조) |
| get_unread_message_count | ✅ 존재 (dashboard-table) |
