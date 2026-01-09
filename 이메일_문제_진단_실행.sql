-- ============================================================================
-- 이메일 전송 문제 진단 SQL 스크립트
-- Supabase Dashboard → SQL Editor에서 실행하여 현재 상태 확인
-- ============================================================================

-- ============================================================================
-- 1. 트리거 존재 및 활성화 상태 확인
-- ============================================================================
SELECT 
  tgname AS trigger_name,
  CASE 
    WHEN tgenabled = 'O' THEN '✅ 활성화됨'
    WHEN tgenabled = 'D' THEN '❌ 비활성화됨'
    WHEN tgenabled = 'R' THEN '⚠️ 복제 전용'
    WHEN tgenabled = 'A' THEN '⚠️ 항상 활성화'
    ELSE '❓ 알 수 없음'
  END AS status,
  tgrelid::regclass AS table_name,
  CASE 
    WHEN tgtype & 2 = 2 THEN 'BEFORE'
    WHEN tgtype & 4 = 4 THEN 'AFTER'
    ELSE 'INSTEAD OF'
  END AS trigger_timing,
  CASE 
    WHEN tgtype & 8 = 8 THEN 'INSERT'
    WHEN tgtype & 16 = 16 THEN 'DELETE'
    WHEN tgtype & 32 = 32 THEN 'UPDATE'
    ELSE 'UNKNOWN'
  END AS trigger_event
FROM pg_trigger
WHERE tgname IN ('trigger_send_task_created_email', 'trigger_send_task_status_change_email')
ORDER BY tgname;

-- ============================================================================
-- 2. 트리거 함수 존재 및 설정 확인
-- ============================================================================
SELECT 
  proname AS function_name,
  CASE 
    WHEN prosrc LIKE '%dcovjxmrqomuuwcgiwie.supabase.co%' THEN '✅ 하드코딩됨'
    WHEN prosrc LIKE '%current_setting%' THEN '⚠️ 환경 변수 사용'
    ELSE '❓ 확인 필요'
  END AS url_config,
  CASE 
    WHEN prosrc LIKE '%Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjb3ZqeG1ycW9tdXV3Y2dpd2llIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjAwNjMyNywiZXhwIjoyMDgxNTgyMzI3fQ.0nK3qmclkR2urRsAytgRthpdb-OwaX6rJLLiOIsQH1o%' THEN '✅ 하드코딩됨'
    WHEN prosrc LIKE '%current_setting%' THEN '⚠️ 환경 변수 사용'
    ELSE '❓ 확인 필요'
  END AS auth_config,
  CASE 
    WHEN prosrc LIKE '%net.http_post%' THEN '✅ http_post 사용'
    ELSE '❌ http_post 없음'
  END AS http_call,
  CASE 
    WHEN prosrc LIKE '%params :=%' THEN '✅ params 파라미터 사용'
    ELSE '⚠️ params 파라미터 없음'
  END AS params_usage
FROM pg_proc
WHERE proname IN ('send_task_created_email', 'send_task_status_change_email')
ORDER BY proname;

-- ============================================================================
-- 3. pg_net 확장 확인
-- ============================================================================
SELECT 
  extname AS extension_name,
  extversion AS version,
  CASE 
    WHEN extname = 'pg_net' THEN '✅ 설치됨'
    ELSE '❌ 설치 안됨'
  END AS status
FROM pg_extension
WHERE extname = 'pg_net';

-- ============================================================================
-- 4. net.http_post 함수 시그니처 확인
-- ============================================================================
SELECT 
  p.proname AS function_name,
  pg_get_function_arguments(p.oid) AS arguments,
  pg_get_function_result(p.oid) AS return_type,
  n.nspname AS schema_name
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'net' 
  AND p.proname = 'http_post'
ORDER BY p.proname;

-- ============================================================================
-- 5. 최근 이메일 로그 확인
-- ============================================================================
SELECT 
  id,
  task_id,
  recipient_email,
  recipient_name,
  subject,
  status,
  error_message,
  created_at,
  sent_at,
  CASE 
    WHEN status = 'sent' THEN '✅ 발송 성공'
    WHEN status = 'failed' THEN '❌ 발송 실패'
    ELSE '❓ 알 수 없음'
  END AS status_label
FROM public.email_logs
ORDER BY created_at DESC
LIMIT 20;

-- ============================================================================
-- 6. 실패한 이메일 로그 확인
-- ============================================================================
SELECT 
  id,
  task_id,
  recipient_email,
  status,
  error_message,
  created_at,
  CASE 
    WHEN error_message IS NULL THEN '⚠️ 에러 메시지 없음'
    ELSE '✅ 에러 메시지 있음'
  END AS error_status
FROM public.email_logs
WHERE status = 'failed'
ORDER BY created_at DESC
LIMIT 10;

-- ============================================================================
-- 7. 이메일 발송 통계
-- ============================================================================
SELECT 
  status,
  COUNT(*) AS count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) AS percentage
FROM public.email_logs
GROUP BY status
ORDER BY count DESC;

-- ============================================================================
-- 8. 최근 24시간 이메일 발송 현황
-- ============================================================================
SELECT 
  DATE_TRUNC('hour', created_at) AS hour,
  status,
  COUNT(*) AS count
FROM public.email_logs
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', created_at), status
ORDER BY hour DESC, status;

-- ============================================================================
-- 9. 트리거 함수 소스 코드 확인 (디버깅용)
-- ============================================================================
-- 주의: 소스 코드가 길 수 있으므로 필요시에만 실행
SELECT 
  proname AS function_name,
  LEFT(prosrc, 500) AS source_code_preview,
  LENGTH(prosrc) AS source_code_length
FROM pg_proc
WHERE proname IN ('send_task_created_email', 'send_task_status_change_email')
ORDER BY proname;

-- ============================================================================
-- 10. 최근 Task 생성/상태 변경 확인 (트리거 실행 여부 확인)
-- ============================================================================
SELECT 
  id,
  title,
  task_status,
  assigner_id,
  assignee_id,
  created_at,
  updated_at,
  CASE 
    WHEN created_at >= NOW() - INTERVAL '24 hours' THEN '✅ 최근 생성'
    ELSE '⏰ 오래됨'
  END AS recent_status
FROM public.tasks
ORDER BY created_at DESC
LIMIT 10;

-- ============================================================================
-- 11. Task 상태 변경 이력 확인 (트리거 실행 여부 확인)
-- ============================================================================
SELECT 
  t.id AS task_id,
  t.title AS task_title,
  t.task_status AS current_status,
  t.updated_at AS last_updated,
  CASE 
    WHEN t.updated_at >= NOW() - INTERVAL '24 hours' THEN '✅ 최근 변경'
    ELSE '⏰ 오래됨'
  END AS recent_status,
  COUNT(el.id) AS email_log_count
FROM public.tasks t
LEFT JOIN public.email_logs el ON el.task_id = t.id::TEXT
WHERE t.updated_at >= NOW() - INTERVAL '7 days'
GROUP BY t.id, t.title, t.task_status, t.updated_at
ORDER BY t.updated_at DESC
LIMIT 20;

-- ============================================================================
-- 진단 완료
-- ============================================================================
-- 위 쿼리 결과를 확인하여 다음을 체크하세요:
-- 1. 트리거가 활성화되어 있는지 (1번 쿼리)
-- 2. 트리거 함수가 하드코딩 방식인지 (2번 쿼리)
-- 3. pg_net 확장이 설치되어 있는지 (3번 쿼리)
-- 4. net.http_post 함수 시그니처 확인 (4번 쿼리)
-- 5. 이메일 로그에 발송 시도가 있는지 (5번 쿼리)
-- 6. 실패한 이메일의 에러 메시지 확인 (6번 쿼리)
-- 7. 이메일 발송 통계 확인 (7번 쿼리)
-- 8. 최근 24시간 발송 현황 확인 (8번 쿼리)
-- 9. 트리거 함수 소스 코드 확인 (9번 쿼리 - 필요시)
-- 10. 최근 Task 생성 확인 (10번 쿼리)
-- 11. Task 상태 변경 이력 확인 (11번 쿼리)


