-- Fix Task Created Email Trigger: Correct net.http_post function signature
-- This migration fixes the incorrect net.http_post call format in send_task_created_email function
-- The correct signature is: net.http_post(url, body, params, headers)

CREATE OR REPLACE FUNCTION public.send_task_created_email()
RETURNS TRIGGER AS $$
DECLARE
  assigner_email TEXT;
  assignee_email TEXT;
  assigner_name TEXT;
  assignee_name TEXT;
  project_title TEXT;
  request_body JSONB;
  function_url TEXT;
BEGIN
  -- Get assigner and assignee emails and names from profiles
  SELECT email, COALESCE(full_name, email) INTO assigner_email, assigner_name
  FROM public.profiles
  WHERE id = NEW.assigner_id;

  SELECT email, COALESCE(full_name, email) INTO assignee_email, assignee_name
  FROM public.profiles
  WHERE id = NEW.assignee_id;

  -- Get project title
  SELECT title INTO project_title
  FROM public.projects
  WHERE id = NEW.project_id;

  -- Build request body for Edge Function
  -- Task creation: both assigner and assignee receive emails with different templates
  request_body := jsonb_build_object(
    'eventType', 'TASK_CREATED',
    'taskId', NEW.id::TEXT,
    'assignerEmail', assigner_email,
    'assigneeEmail', assignee_email,
    'assignerName', assigner_name,
    'assigneeName', assignee_name,
    'taskTitle', NEW.title,
    'taskDescription', NEW.description,
    'projectTitle', project_title,
    'projectId', NEW.project_id::TEXT,
    'dueDate', NEW.due_date::TEXT,
    'recipients', ARRAY['assigner', 'assignee']
  );

  -- Hardcoded Edge Function URL (same as status change trigger)
  function_url := 'https://dcovjxmrqomuuwcgiwie.supabase.co/functions/v1/send-task-email';

  -- Call Edge Function via HTTP (non-blocking)
  -- Correct function signature: net.http_post(url, body, params, headers)
  PERFORM net.http_post(
    url := function_url,
    body := request_body,
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjb3ZqeG1ycW9tdXV3Y2dpd2llIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjAwNjMyNywiZXhwIjoyMDgxNTgyMzI3fQ.0nK3qmclkR2urRsAytgRthpdb-OwaX6rJLLiOIsQH1o'
    )
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the transaction
    RAISE WARNING 'Failed to send task creation email notification: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update comment
COMMENT ON FUNCTION public.send_task_created_email() IS 'Trigger function that sends email notifications when task is created via Edge Function. Uses hardcoded URL and Service Role Key (same as status change trigger). Fixed net.http_post function signature.';


