# 일정 자동 배정 기능 테스트 가이드

## 테스트 목표
새로운 일정 자동 배정 로직이 정상 동작하는지 확인

## 테스트 시나리오

### 시나리오 1: Task 생성 시 마감일 오전 9시~오후 7시 사이 가장 빠른 빈 시간에 배정
**목표**: 마감일 오전 9시에 빈 시간이 있으면 해당 시간에 배정되는지 확인

**테스트 단계**:
1. 특정 사용자에게 Task 생성 (마감일: 오늘)
2. 해당 사용자의 오늘 9시~19시 사이 일정 확인
3. 새로 생성된 Task의 일정 확인

**예상 결과**:
- 일정이 오늘 9시~19시 사이에 배정됨
- `is_all_day = false`
- 일정 지속 시간이 정확히 1시간

**검증 쿼리**:
```sql
SELECT 
  ts.id,
  ts.start_time,
  ts.end_time,
  ts.is_all_day,
  EXTRACT(HOUR FROM ts.start_time) as start_hour,
  EXTRACT(EPOCH FROM (ts.end_time - ts.start_time))/3600 as duration_hours,
  t.title,
  t.due_date,
  t.assignee_id
FROM task_schedules ts
INNER JOIN tasks t ON ts.task_id = t.id
WHERE t.id = '생성된_Task_ID';
```

### 시나리오 2: 해당 날짜에 빈 시간이 없을 때 다음 날로 이동하여 배정
**목표**: 마감일 9시~19시 사이에 빈 시간이 없으면 다음 날 9시부터 검색하는지 확인

**테스트 단계**:
1. 특정 사용자에게 오늘 9시~19시 사이에 일정을 모두 배정
2. 해당 사용자에게 Task 생성 (마감일: 오늘)
3. 새로 생성된 Task의 일정 확인

**예상 결과**:
- 일정이 다음 날 9시~19시 사이에 배정됨
- 또는 마감일 이후 날짜에 배정됨
- `DATE(ts.start_time) > DATE(t.due_date)` 또는 `DATE(ts.start_time) = DATE(t.due_date)`이고 시간이 19시 이후

**검증 쿼리**:
```sql
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
WHERE t.id = '생성된_Task_ID';
```

### 시나리오 3: 배정된 일정이 is_all_day = false이고 정확히 1시간인지 확인
**목표**: 새로 생성된 일정이 시간 기반 일정이고 정확히 1시간인지 확인

**테스트 단계**:
1. Task 생성
2. 생성된 일정 확인

**예상 결과**:
- `is_all_day = false`
- `EXTRACT(EPOCH FROM (ts.end_time - ts.start_time))/3600 = 1` (정확히 1시간)

**검증 쿼리**:
```sql
SELECT 
  ts.id,
  ts.is_all_day,
  ts.start_time,
  ts.end_time,
  EXTRACT(EPOCH FROM (ts.end_time - ts.start_time))/3600 as duration_hours,
  t.title,
  t.assignee_id
FROM task_schedules ts
INNER JOIN tasks t ON ts.task_id = t.id
WHERE t.created_at > NOW() - INTERVAL '1 hour'
ORDER BY ts.start_time DESC;
```

### 시나리오 4: 여러 Task 동시 생성 시 각각 다른 시간에 배정
**목표**: 같은 담당자에게 여러 Task를 동시에 생성했을 때 각각 다른 시간에 배정되는지 확인

**테스트 단계**:
1. 같은 사용자에게 여러 Task를 빠르게 연속 생성
2. 각 Task의 일정 확인

**예상 결과**:
- 각 Task가 서로 다른 시간에 배정됨
- 일정이 겹치지 않음
- 각 일정이 1시간씩 배정됨

**검증 쿼리**:
```sql
SELECT 
  ts.id,
  ts.start_time,
  ts.end_time,
  t.id as task_id,
  t.title,
  t.assignee_id,
  t.created_at
FROM task_schedules ts
INNER JOIN tasks t ON ts.task_id = t.id
WHERE t.assignee_id = '테스트_사용자_ID'
  AND t.created_at > NOW() - INTERVAL '1 hour'
ORDER BY ts.start_time;
```

**겹침 확인 쿼리**:
```sql
-- 일정이 겹치는지 확인
SELECT 
  ts1.id as schedule1_id,
  ts1.start_time as schedule1_start,
  ts1.end_time as schedule1_end,
  ts2.id as schedule2_id,
  ts2.start_time as schedule2_start,
  ts2.end_time as schedule2_end,
  t1.id as task1_id,
  t2.id as task2_id
FROM task_schedules ts1
INNER JOIN tasks t1 ON ts1.task_id = t1.id
INNER JOIN task_schedules ts2 ON ts2.task_id != ts1.task_id
INNER JOIN tasks t2 ON ts2.task_id = t2.id
WHERE t1.assignee_id = t2.assignee_id
  AND t1.created_at > NOW() - INTERVAL '1 hour'
  AND t2.created_at > NOW() - INTERVAL '1 hour'
  AND (
    (ts1.start_time < ts2.end_time AND ts1.end_time > ts2.start_time)
  )
ORDER BY ts1.start_time;
```

## 통합 테스트

### 종합 검증 쿼리
```sql
-- 최근 생성된 모든 일정의 자동 배정 상태 확인
SELECT 
  ts.id,
  ts.start_time,
  ts.end_time,
  ts.is_all_day,
  EXTRACT(HOUR FROM ts.start_time) as start_hour,
  EXTRACT(EPOCH FROM (ts.end_time - ts.start_time))/3600 as duration_hours,
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
5. ✅ 마감일 이후 최대 30일까지 검색하여 배정
6. ✅ 빈 시간이 없으면 다음 날로 이동하여 배정

## 문제 발생 시 확인 사항

1. **일정이 생성되지 않는 경우**:
   - Task에 `assignee_id`와 `due_date`가 있는지 확인
   - 트리거 함수 확인: `SELECT routine_name FROM information_schema.routines WHERE routine_name = 'create_task_schedule';`
   - 트리거 확인: `SELECT trigger_name FROM information_schema.triggers WHERE trigger_name = 'trigger_create_task_schedule';`

2. **일정이 잘못된 시간에 배정되는 경우**:
   - 트리거 함수의 로직 확인
   - 기존 일정과의 겹침 확인 로직 확인
   - 시간대 설정 확인

3. **일정이 30일 이상 지연되는 경우**:
   - 해당 사용자의 일정 밀도 확인
   - 트리거 함수의 최대 검색 범위 확인 (30일)
