-- Database Trigger: Automatically send email when task status changes
-- This trigger calls the Edge Function via HTTP when task_status changes
-- Only triggers for specific status transitions: ASSIGNED→IN_PROGRESS, IN_PROGRESS→WAITING_CONFIRM, WAITING_CONFIRM→APPROVED/REJECTED

-- Enable pg_net extension for HTTP requests (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Function to call Edge Function via HTTP
CREATE OR REPLACE FUNCTION public.send_task_status_change_email()
RETURNS TRIGGER AS $$
DECLARE
  assigner_email TEXT;
  assignee_email TEXT;
  changer_name TEXT;
  project_title TEXT;
  request_body JSONB;
  function_url TEXT;
BEGIN
  -- Only trigger for specific status transitions
  IF OLD.task_status = NEW.task_status THEN
    RETURN NEW;
  END IF;

  -- Check if this is a valid status transition that requires email
  IF NOT (
    (OLD.task_status = 'ASSIGNED' AND NEW.task_status = 'IN_PROGRESS') OR
    (OLD.task_status = 'IN_PROGRESS' AND NEW.task_status = 'WAITING_CONFIRM') OR
    (NEW.task_status IN ('APPROVED', 'REJECTED') AND OLD.task_status = 'WAITING_CONFIRM')
  ) THEN
    RETURN NEW;
  END IF;

  -- Get assigner and assignee emails from profiles
  SELECT email INTO assigner_email
  FROM public.profiles
  WHERE id = NEW.assigner_id;

  SELECT email INTO assignee_email
  FROM public.profiles
  WHERE id = NEW.assignee_id;

  -- Get changer name (user who triggered the status change)
  SELECT COALESCE(full_name, email) INTO changer_name
  FROM public.profiles
  WHERE id = auth.uid();

  -- Get project title
  SELECT title INTO project_title
  FROM public.projects
  WHERE id = NEW.project_id;

  -- Build request body for Edge Function
  request_body := jsonb_build_object(
    'taskId', NEW.id::TEXT,
    'oldStatus', OLD.task_status,
    'newStatus', NEW.task_status,
    'assignerEmail', assigner_email,
    'assigneeEmail', assignee_email,
    'changerId', auth.uid()::TEXT,
    'taskTitle', NEW.title,
    'projectTitle', project_title
  );

  -- Get Edge Function URL from environment (set via Supabase config)
  -- In production, this should be: https://[project-ref].supabase.co/functions/v1/send-task-email
  function_url := current_setting('app.edge_function_url', true);
  
  -- Fallback to default pattern if not set
  IF function_url IS NULL OR function_url = '' THEN
    function_url := 'https://' || current_setting('app.supabase_project_ref', true) || '.supabase.co/functions/v1/send-task-email';
  END IF;

  -- Call Edge Function via HTTP (non-blocking)
  -- Use pg_net to make async HTTP request
  PERFORM net.http_post(
    url := function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key', true)
    ),
    body := request_body::text
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the transaction
    RAISE WARNING 'Failed to send email notification: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on tasks table
CREATE TRIGGER trigger_send_task_status_change_email
  AFTER UPDATE OF task_status ON public.tasks
  FOR EACH ROW
  WHEN (OLD.task_status IS DISTINCT FROM NEW.task_status)
  EXECUTE FUNCTION public.send_task_status_change_email();

-- Add comment
COMMENT ON FUNCTION public.send_task_status_change_email() IS 'Trigger function that sends email notifications when task status changes via Edge Function';
COMMENT ON TRIGGER trigger_send_task_status_change_email ON public.tasks IS 'Automatically sends email when task status changes (ASSIGNED→IN_PROGRESS, IN_PROGRESS→WAITING_CONFIRM, WAITING_CONFIRM→APPROVED/REJECTED)';

