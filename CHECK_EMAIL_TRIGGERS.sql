-- 이메일 트리거 함수 확인 쿼리
-- Supabase Dashboard SQL Editor에서 실행하여 현재 상태 확인

-- ============================================================================
-- 1. 트리거 함수 존재 확인
-- ============================================================================
SELECT 
  proname AS function_name,
  prosrc AS function_source
FROM pg_proc
WHERE proname IN ('send_task_created_email', 'send_task_status_change_email')
ORDER BY proname;

-- ============================================================================
-- 2. 트리거 존재 및 활성화 상태 확인
-- ============================================================================
SELECT 
  tgname AS trigger_name,
  tgtype,
  tgenabled AS enabled,
  tgrelid::regclass AS table_name
FROM pg_trigger
WHERE tgname IN ('trigger_send_task_created_email', 'trigger_send_task_status_change_email')
ORDER BY tgname;

-- ============================================================================
-- 3. 함수 소스 코드에서 하드코딩 값 확인
-- ============================================================================
-- send_task_created_email 함수에 하드코딩된 URL이 있는지 확인
SELECT 
  proname,
  CASE 
    WHEN prosrc LIKE '%dcovjxmrqomuuwcgiwie.supabase.co%' THEN '하드코딩됨 ✓'
    WHEN prosrc LIKE '%current_setting%' THEN '환경 변수 사용 (하드코딩 아님)'
    ELSE '확인 필요'
  END AS url_status,
  CASE 
    WHEN prosrc LIKE '%Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9%' THEN '하드코딩됨 ✓'
    WHEN prosrc LIKE '%current_setting%' THEN '환경 변수 사용 (하드코딩 아님)'
    ELSE '확인 필요'
  END AS auth_status
FROM pg_proc
WHERE proname IN ('send_task_created_email', 'send_task_status_change_email')
ORDER BY proname;

-- ============================================================================
-- 4. 최근 이메일 로그 확인
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

-- ============================================================================
-- 5. 실패한 이메일 확인
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


