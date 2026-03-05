-- send-confirm-email Edge Function을 RPC로 호출 (send-task-reference-email 패턴)
-- 브라우저 fetch 대신 Postgres net.http_post 사용 → FunctionsFetchError 회피

CREATE OR REPLACE FUNCTION public.send_confirm_email_rpc(
  p_task_id UUID,
  p_subject TEXT,
  p_html_body TEXT,
  p_attachment JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_task RECORD;
  v_function_url TEXT := 'https://dcovjxmrqomuuwcgiwie.supabase.co/functions/v1/send-confirm-email';
  v_service_role_key TEXT := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjb3ZqeG1ycW9tdXV3Y2dpd2llIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjAwNjMyNywiZXhwIjoyMDgxNTgyMzI3fQ.0nK3qmclkR2urRsAytgRthpdb-OwaX6rJLLiOIsQH1o';
  v_request_body JSONB;
  v_request_id BIGINT;
BEGIN
  -- 업무 조회 및 권한 확인 (담당자만 호출 가능)
  SELECT id, assignee_id, task_category, task_status
  INTO v_task
  FROM public.tasks
  WHERE id = p_task_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION '업무를 찾을 수 없습니다.';
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다.';
  END IF;

  IF v_task.assignee_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION '담당자만 컨펌 이메일을 발송할 수 있습니다.';
  END IF;

  IF v_task.task_category <> 'REVIEW' OR v_task.task_status <> 'APPROVED' THEN
    RAISE EXCEPTION '검토·승인 상태의 업무에만 컨펌 이메일을 발송할 수 있습니다.';
  END IF;

  -- Edge Function 요청 바디 구성
  v_request_body := jsonb_build_object(
    'taskId', p_task_id::TEXT,
    'subject', p_subject,
    'htmlBody', p_html_body,
    'attachment', COALESCE(p_attachment, 'null'::jsonb)
  );

  -- send-task-reference-email과 동일하게 net.http_post로 호출
  SELECT net.http_post(
    url := v_function_url,
    body := v_request_body,
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_role_key
    )
  ) INTO v_request_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', '컨펌 이메일 발송 요청이 접수되었습니다.',
    'requestId', v_request_id
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Edge Function 호출 실패: %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION public.send_confirm_email_rpc(UUID, TEXT, TEXT, JSONB) IS
  'send-confirm-email Edge Function을 net.http_post로 호출. 브라우저 fetch 실패(FunctionsFetchError) 회피. send-task-reference-email 패턴.';

-- RLS: authenticated 사용자만 호출 가능 (함수 내부에서 담당자 여부 검사)
GRANT EXECUTE ON FUNCTION public.send_confirm_email_rpc(UUID, TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_confirm_email_rpc(UUID, TEXT, TEXT, JSONB) TO service_role;
