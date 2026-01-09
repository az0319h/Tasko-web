-- ============================================================================
-- 이메일 발송 문제 진단 SQL 쿼리
-- Supabase Dashboard SQL Editor에서 실행하여 현재 상태 확인
-- ============================================================================

-- 1. 트리거 존재 및 활성화 상태 확인
-- ============================================================================
SELECT 
  tgname AS trigger_name,
  CASE 
    WHEN tgenabled = 'O' THEN '활성화됨 ✓'
    WHEN tgenabled = 'D' THEN '비활성화됨 ✗'
    ELSE '알 수 없음'
  END AS status,
  tgrelid::regclass AS table_name,
  tgtype::text AS trigger_type
FROM pg_trigger
WHERE tgname IN ('trigger_send_task_created_email', 'trigger_send_task_status_change_email')
ORDER BY tgname;

-- 2. 트리거 함수 존재 확인
-- ============================================================================
SELECT 
  proname AS function_name,
  CASE 
    WHEN prosrc LIKE '%dcovjxmrqomuuwcgiwie.supabase.co%' THEN '하드코딩됨 ✓'
    WHEN prosrc LIKE '%current_setting%' THEN '환경 변수 사용 ✗'
    ELSE '확인 필요'
  END AS url_config,
  CASE 
    WHEN prosrc LIKE '%Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9%' THEN '하드코딩됨 ✓'
    WHEN prosrc LIKE '%current_setting%' THEN '환경 변수 사용 ✗'
    ELSE '확인 필요'
  END AS auth_config,
  CASE 
    WHEN prosrc LIKE '%net.http_post%' THEN 'http_post 사용 ✓'
    ELSE 'http_post 없음 ✗'
  END AS http_call
FROM pg_proc
WHERE proname IN ('send_task_created_email', 'send_task_status_change_email')
ORDER BY proname;

-- 3. pg_net 확장 확인
-- ============================================================================
SELECT 
  extname AS extension_name,
  extversion AS version
FROM pg_extension
WHERE extname = 'pg_net';

-- 4. net.http_post 함수 시그니처 확인
-- ============================================================================
SELECT 
  p.proname AS function_name,
  pg_get_function_arguments(p.oid) AS arguments,
  pg_get_function_result(p.oid) AS return_type
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'net' 
  AND p.proname = 'http_post';

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
  sent_at
FROM public.email_logs
ORDER BY created_at DESC
LIMIT 20;

-- 6. 실패한 이메일 로그 확인
-- ============================================================================
SELECT 
  id,
  task_id,
  recipient_email,
  status,
  error_message,
  created_at
FROM public.email_logs
WHERE status = 'failed'
ORDER BY created_at DESC
LIMIT 10;

-- 7. 트리거 함수 소스 코드 확인 (디버깅용)
-- ============================================================================
SELECT 
  proname AS function_name,
  prosrc AS source_code
FROM pg_proc
WHERE proname IN ('send_task_created_email', 'send_task_status_change_email')
ORDER BY proname;


