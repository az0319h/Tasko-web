# 일정 자동 배정 로직 검증 가이드

## 검증 목표
새로운 일정 자동 배정 로직이 정상 동작하는지 확인

## 테스트 시나리오

### 시나리오 1: 마감일 오전 9시에 빈 시간이 있는 경우
**예상 결과**: 해당 시간에 배정

**검증 쿼리**:
```sql
-- 테스트용 Task 생성 (마감일: 오늘, 담당자: 특정 사용자)
-- 이후 생성된 일정 확인
SELECT 
  ts.id,
  ts.start_time,
  ts.end_time,
  ts.is_all_day,
  EXTRACT(HOUR FROM ts.start_time) as start_hour,
  t.title,
  t.due_date,
  t.assignee_id
FROM task_schedules ts
INNER JOIN tasks t ON ts.task_id = t.id
WHERE t.created_at > NOW() - INTERVAL '1 hour'
ORDER BY ts.start_time DESC
LIMIT 5;
```

**확인 사항**:
- `is_all_day = false`
- `start_time`의 시간이 9시~19시 사이인지 확인
- `end_time - start_time = 1 hour`인지 확인

### 시나리오 2: 마감일 오전 9시~오후 7시 사이에 빈 시간이 없는 경우
**예상 결과**: 다음 날 오전 9시부터 검색하여 배정

**검증 쿼리**:
```sql
-- 특정 사용자에게 오늘 9시~19시 사이에 일정이 모두 차있는 경우
-- 새 Task 생성 후 일정 확인
SELECT 
  ts.id,
  ts.start_time,
  ts.end_time,
  DATE(ts.start_time) as schedule_date,
  EXTRACT(HOUR FROM ts.start_time) as start_hour,
  t.title,
  t.due_date,
  t.assignee_id
FROM task_schedules ts
INNER JOIN tasks t ON ts.task_id = t.id
WHERE t.assignee_id = '특정_사용자_ID'
  AND t.created_at > NOW() - INTERVAL '1 hour'
ORDER BY ts.start_time DESC;
```

**확인 사항**:
- `DATE(ts.start_time) > DATE(t.due_date)`인지 확인 (다음 날에 배정되었는지)
- 또는 `DATE(ts.start_time) = DATE(t.due_date)`이고 시간이 19시 이후인지 확인

### 시나리오 3: 여러 날에 걸쳐 빈 시간이 없는 경우
**예상 결과**: 최대 30일까지 검색하여 배정

**검증 쿼리**:
```sql
-- 여러 날에 걸쳐 일정이 모두 차있는 경우
SELECT 
  ts.id,
  ts.start_time,
  ts.end_time,
  DATE(ts.start_time) as schedule_date,
  DATE(t.due_date) as due_date,
  DATE(ts.start_time) - DATE(t.due_date) as days_offset,
  EXTRACT(HOUR FROM ts.start_time) as start_hour,
  t.title,
  t.assignee_id
FROM task_schedules ts
INNER JOIN tasks t ON ts.task_id = t.id
WHERE t.created_at > NOW() - INTERVAL '1 hour'
ORDER BY ts.start_time DESC;
```

**확인 사항**:
- `days_offset <= 30`인지 확인
- `days_offset >= 0`인지 확인

### 시나리오 4: 같은 담당자에게 여러 task가 동시에 생성되는 경우
**예상 결과**: 각각 다른 시간에 배정

**검증 쿼리**:
```sql
-- 동시에 생성된 여러 Task의 일정 확인
SELECT 
  ts.id,
  ts.start_time,
  ts.end_time,
  ts.is_all_day,
  t.id as task_id,
  t.title,
  t.assignee_id,
  t.created_at
FROM task_schedules ts
INNER JOIN tasks t ON ts.task_id = t.id
WHERE t.assignee_id = '특정_사용자_ID'
  AND t.created_at > NOW() - INTERVAL '1 hour'
ORDER BY ts.start_time;
```

**확인 사항**:
- 각 일정의 시간이 겹치지 않는지 확인
- `ts1.end_time <= ts2.start_time` 또는 `ts2.end_time <= ts1.start_time`인지 확인

### 시나리오 5: Task 승인 시 일정이 종일로 변경되는지 확인
**예상 결과**: Task 승인 시 일정이 종일로 변경됨

**검증 쿼리**:
```sql
-- 승인된 Task의 일정 확인
SELECT 
  ts.id,
  ts.start_time,
  ts.end_time,
  ts.is_all_day,
  t.id as task_id,
  t.title,
  t.task_status,
  t.due_date,
  DATE(ts.start_time) as schedule_date,
  DATE(ts.end_time) - DATE(ts.start_time) as duration_days
FROM task_schedules ts
INNER JOIN tasks t ON ts.task_id = t.id
WHERE t.task_status = 'APPROVED'
ORDER BY t.updated_at DESC
LIMIT 10;
```

**확인 사항**:
- `is_all_day = true`인지 확인
- `DATE(ts.start_time) = DATE(t.due_date)` 또는 `DATE(ts.start_time) = DATE(ts.end_time - INTERVAL '1 second')`인지 확인
- `EXTRACT(HOUR FROM ts.start_time) = 0`인지 확인 (종일 일정은 00:00:00 시작)

### 시나리오 6: 승인된 Task가 일정에 표시되는지 확인
**예상 결과**: 승인된 Task도 일정에 표시됨

**검증 쿼리**:
```sql
-- 승인된 Task의 일정이 존재하는지 확인
SELECT 
  COUNT(*) as approved_task_schedules_count
FROM task_schedules ts
INNER JOIN tasks t ON ts.task_id = t.id
WHERE t.task_status = 'APPROVED';
```

**확인 사항**:
- 프론트엔드에서 승인된 Task가 캘린더에 표시되는지 확인
- 승인된 Task는 종일로 표시되는지 확인

## 종합 검증 쿼리

```sql
-- 최근 생성된 일정들의 자동 배정 상태 종합 확인
SELECT 
  ts.id,
  ts.start_time,
  ts.end_time,
  ts.is_all_day,
  EXTRACT(HOUR FROM ts.start_time) as start_hour,
  DATE(ts.start_time) - DATE(t.due_date) as days_offset,
  t.id as task_id,
  t.title,
  t.task_status,
  t.task_category,
  t.due_date,
  t.assignee_id,
  t.created_at
FROM task_schedules ts
INNER JOIN tasks t ON ts.task_id = t.id
WHERE t.created_at > NOW() - INTERVAL '1 day'
ORDER BY t.created_at DESC, ts.start_time;
```

## 예상 결과 요약

1. ✅ 모든 새 일정은 `is_all_day = false`
2. ✅ 모든 새 일정의 시작 시간은 9시~19시 사이
3. ✅ 모든 새 일정의 지속 시간은 정확히 1시간
4. ✅ 같은 담당자의 일정은 겹치지 않음
5. ✅ 승인된 Task의 일정은 `is_all_day = true`
6. ✅ 승인된 Task의 일정은 마감일 기준 종일로 설정됨

## 문제 발생 시 확인 사항

1. **일정이 생성되지 않는 경우**:
   - Task에 `assignee_id`와 `due_date`가 있는지 확인
   - 트리거 함수가 정상 작동하는지 확인: `SELECT routine_name FROM information_schema.routines WHERE routine_name = 'create_task_schedule';`

2. **일정이 잘못된 시간에 배정되는 경우**:
   - 트리거 함수의 로직 확인
   - 기존 일정과의 겹침 확인 로직 확인

3. **승인 시 일정이 종일로 변경되지 않는 경우**:
   - 트리거 함수 확인: `SELECT routine_name FROM information_schema.routines WHERE routine_name = 'update_schedule_on_approved';`
   - 트리거 확인: `SELECT trigger_name FROM information_schema.triggers WHERE trigger_name = 'trigger_update_schedule_on_approved';`
