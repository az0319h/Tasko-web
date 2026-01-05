-- Create Storage bucket for task files
-- This bucket stores files uploaded in task chat

-- Note: Storage buckets are created via Supabase Dashboard or Storage API
-- This migration file documents the bucket configuration

-- Bucket name: task-files
-- Public: true (for easy file access)
-- File size limit: 10MB (enforced at application level)
-- Allowed MIME types: image/*, application/pdf, application/msword, application/vnd.openxmlformats-officedocument.wordprocessingml.document, application/vnd.ms-excel, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet

-- Create or update the bucket (bucket already exists, so we update it)
UPDATE storage.buckets
SET 
  public = true,
  file_size_limit = 10485760, -- 10MB in bytes
  allowed_mime_types = ARRAY[
    'image/*',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
WHERE id = 'task-files';

-- Storage RLS Policies for task-files bucket
-- Users can upload files if they have access to the task
-- Users can read files if they have access to the task

-- Policy: Allow authenticated users to upload files to task-files bucket
-- Note: Tasks don't have is_public field, access is based on assigner/assignee/Admin only
DROP POLICY IF EXISTS "task_files_upload" ON storage.objects;
CREATE POLICY "task_files_upload"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'task-files'
  AND (
    -- Check if user has access to the task (task_id is in the path)
    EXISTS (
      SELECT 1
      FROM public.tasks t
      WHERE t.id::text = (storage.foldername(name))[1]
      AND (
        public.is_admin(auth.uid())
        OR t.assigner_id = auth.uid()
        OR t.assignee_id = auth.uid()
      )
    )
  )
);

-- Policy: Allow authenticated users to read files from task-files bucket
DROP POLICY IF EXISTS "task_files_read" ON storage.objects;
CREATE POLICY "task_files_read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'task-files'
  AND (
    -- Check if user has access to the task
    EXISTS (
      SELECT 1
      FROM public.tasks t
      WHERE t.id::text = (storage.foldername(name))[1]
      AND (
        public.is_admin(auth.uid())
        OR t.assigner_id = auth.uid()
        OR t.assignee_id = auth.uid()
      )
    )
  )
);

-- Policy: Allow users to delete their own uploaded files
DROP POLICY IF EXISTS "task_files_delete" ON storage.objects;
CREATE POLICY "task_files_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'task-files'
  AND auth.uid()::text = (storage.foldername(name))[2]
);

COMMENT ON POLICY "task_files_upload" ON storage.objects IS 'Allow authenticated users to upload files to task-files bucket if they have access to the task';
COMMENT ON POLICY "task_files_read" ON storage.objects IS 'Allow authenticated users to read files from task-files bucket if they have access to the task';
COMMENT ON POLICY "task_files_delete" ON storage.objects IS 'Allow users to delete their own uploaded files';

