# 마감일 임박 알림 스케줄러 설정 가이드

## 개요

마감일 임박 알림을 자동으로 생성하기 위한 pg_cron 스케줄러 설정 가이드입니다.

## 사전 요구사항

- ✅ pg_cron 확장 활성화됨 (마이그레이션에서 자동 설정)
- ✅ pg_net 확장 활성화됨 (마이그레이션에서 자동 설정)
- ✅ Edge Function 배포됨 (`check-due-date-approaching`)

## 스케줄 생성 방법

### 1. Service Role Key 확인

1. Supabase Dashboard에 로그인
2. Settings > API 메뉴로 이동
3. `service_role` key 복사 (⚠️ 보안상 주의: 이 키는 절대 공개하지 마세요)

### 2. 스케줄 생성 SQL 실행

Supabase Dashboard의 SQL Editor에서 다음 SQL을 실행하세요:

```sql
SELECT cron.schedule(
  'check_due_date_approaching_daily',
  '0 0 * * *',  -- 매일 UTC 00:00 (KST 09:00)
  $$
  SELECT net.http_post(
    url := 'https://mbwmxowoyvaxmtnigjwa.supabase.co/functions/v1/check-due-date-approaching',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY_HERE'
    ),
    body := '{}'::jsonb
  );
  $$);
```

**주의**: `YOUR_SERVICE_ROLE_KEY_HERE`를 실제 Service Role Key로 교체하세요.

### 3. 스케줄 확인

스케줄이 정상적으로 생성되었는지 확인:

```sql
SELECT 
  jobid,
  schedule,
  command,
  active
FROM cron.job
WHERE jobname = 'check_due_date_approaching_daily';
```

### 4. 스케줄 실행 로그 확인

스케줄 실행 로그 확인:

```sql
SELECT 
  jobid,
  runid,
  job_pid,
  database,
  username,
  command,
  status,
  return_message,
  start_time,
  end_time
FROM cron.job_run_details
WHERE jobid = (
  SELECT jobid 
  FROM cron.job 
  WHERE jobname = 'check_due_date_approaching_daily'
)
ORDER BY start_time DESC
LIMIT 10;
```

## 스케줄 제거 방법

스케줄을 제거하려면:

```sql
SELECT cron.unschedule('check_due_date_approaching_daily');
```

## 실행 시간

- **스케줄 시간**: 매일 UTC 00:00 (한국 시간 09:00)
- **크론 표현식**: `0 0 * * *`

## Edge Function 동작

1. 마감일이 0-3일 남은 Task 조회
2. 각 Task에 대해 `days_remaining` 계산
3. 중복 체크 (같은 Task, 같은 `days_remaining` 값의 알림이 이미 있는지 확인)
4. 중복이 없으면 알림 생성
5. 당일 알림은 Task 상태가 `APPROVED`가 아닌 경우에만 생성

## 문제 해결

### 스케줄이 실행되지 않는 경우

1. pg_cron 확장이 활성화되어 있는지 확인:
   ```sql
   SELECT * FROM pg_extension WHERE extname = 'pg_cron';
   ```

2. pg_net 확장이 활성화되어 있는지 확인:
   ```sql
   SELECT * FROM pg_extension WHERE extname = 'pg_net';
   ```

3. Edge Function이 배포되어 있는지 확인:
   - Supabase Dashboard > Edge Functions 메뉴에서 확인

4. Service Role Key가 올바른지 확인:
   - Authorization 헤더에 올바른 키가 포함되어 있는지 확인

### Edge Function 호출 실패

1. Edge Function 로그 확인:
   - Supabase Dashboard > Edge Functions > check-due-date-approaching > Logs

2. 네트워크 오류 확인:
   - `cron.job_run_details` 테이블에서 `return_message` 확인

## 보안 주의사항

- ⚠️ Service Role Key는 절대 공개하지 마세요
- ⚠️ 마이그레이션 파일에 Service Role Key를 직접 포함하지 마세요
- ⚠️ Git 저장소에 Service Role Key를 커밋하지 마세요
- ✅ 환경 변수나 Supabase Secrets를 사용하여 관리하세요
