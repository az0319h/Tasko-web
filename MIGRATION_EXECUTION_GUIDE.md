# 마이그레이션 실행 및 타입 업데이트 가이드

## 마이그레이션 파일

통합 마이그레이션 파일이 생성되었습니다:
- `supabase/migrations/schedule_end/20260129000000_combined_schedule_migrations.sql`

이 파일은 다음 두 가지 변경사항을 포함합니다:
1. 일정 자동 배정 로직 개선 (오전 9시~오후 7시 사이 빈 시간에 1시간 배정)
2. Task 승인 시 일정을 삭제하는 대신 종일로 변경

## MCP 서버를 통한 마이그레이션 실행

Task-backend-dev MCP 서버를 통해 마이그레이션을 실행하세요.

### 실행할 SQL 파일
`supabase/migrations/schedule_end/20260129000000_combined_schedule_migrations.sql`

## 타입 업데이트

마이그레이션 실행 후 다음 명령어로 타입을 업데이트하세요:

```bash
# Supabase 로그인 (처음 한 번만)
supabase login

# 타입 재생성
npm run type-gen
```

또는 직접 실행:

```bash
npx supabase gen types typescript --project-id "dcovjxmrqomuuwcgiwie" --schema public > src/database.type.ts
```

## 마이그레이션 내용 확인

### 1. create_task_schedule() 함수 변경
- 기존: 마감일에 종일로 배정
- 변경: 오전 9시~오후 7시 사이 가장 빠른 빈 시간에 1시간 배정
- 검색 범위: 마감일부터 최대 30일까지

### 2. update_schedule_on_approved() 함수 추가
- 기존: delete_schedule_on_approved() - 일정 삭제
- 변경: update_schedule_on_approved() - 일정을 종일로 변경
- 트리거: trigger_delete_schedule_on_approved 제거 → trigger_update_schedule_on_approved 생성

## 검증 쿼리

마이그레이션 실행 후 다음 쿼리로 검증하세요:

```sql
-- 1. 일정 자동 배정 확인
SELECT ts.id, ts.start_time, ts.end_time, ts.is_all_day, t.title, t.task_category, t.due_date 
FROM task_schedules ts 
INNER JOIN tasks t ON ts.task_id = t.id 
WHERE t.created_at > NOW() - INTERVAL '1 day' 
ORDER BY ts.start_time;

-- 2. 트리거 함수 확인
SELECT routine_name, routine_definition 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name IN ('create_task_schedule', 'update_schedule_on_approved');

-- 3. 트리거 확인
SELECT trigger_name, event_manipulation, event_object_table, action_statement 
FROM information_schema.triggers 
WHERE trigger_schema = 'public' 
AND trigger_name IN ('trigger_create_task_schedule', 'trigger_update_schedule_on_approved');
```

## 주의사항

⚠️ **중요**: 
- 테스트 환경에서 먼저 검증 후 원본 DB에 적용하세요
- Point-in-Time Recovery (PITR)를 사용하여 백업하세요
- 마이그레이션 실행 전 데이터베이스 백업 권장
