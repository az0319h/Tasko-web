# Task 상태 변경 시 이메일 발송 문제 해결 계획서

## 📋 문제 현황

### 현재 상황
- ✅ **Task 생성 시 이메일 발송**: 정상 작동
- ❌ **상태 변경 시 이메일 발송**: 일부 케이스에서 미작동

### 이메일 발송 조건 (계획)
1. `ASSIGNED → IN_PROGRESS`: assigner, assignee 모두
2. `IN_PROGRESS → WAITING_CONFIRM`: assigner만
3. `WAITING_CONFIRM → APPROVED`: assignee만
4. `WAITING_CONFIRM → REJECTED`: assignee만
5. `REJECTED → IN_PROGRESS`: assigner만

---

## 🔍 원인 분석

### 1. Task 생성 시 이메일 발송 (정상 작동)

**트리거:**
- `trigger_send_task_created_email` (AFTER INSERT)
- 함수: `send_task_created_email()` (SECURITY DEFINER)

**특징:**
- `auth.uid()` 사용 안 함 (changer 정보 불필요)
- INSERT 이벤트는 RLS 정책이 단순 (`auth.uid() IS NOT NULL`)
- 트리거 실행 보장됨

**발송 흐름:**
```
INSERT → 트리거 실행 → Edge Function 호출 → 이메일 발송 ✅
```

---

### 2. 상태 변경 시 이메일 발송 (문제 발생)

**트리거:**
- `trigger_send_task_status_change_email` (AFTER UPDATE OF task_status)
- 함수: `send_task_status_change_email()` (SECURITY DEFINER)

**문제점:**

#### 문제 1: `auth.uid()` NULL 가능성
```sql
-- 트리거 함수 내부 (47줄)
SELECT COALESCE(full_name, email) INTO changer_name
FROM public.profiles
WHERE id = auth.uid();  -- ⚠️ SECURITY DEFINER 트리거에서 auth.uid()가 NULL일 수 있음
```

**원인:**
- 트리거 함수가 `SECURITY DEFINER`로 실행되면, 함수 내부에서 `auth.uid()`가 NULL이 될 수 있음
- 특히 UPDATE 트리거에서 RLS 정책을 우회하는 경우 `auth.uid()` 컨텍스트가 손실될 수 있음

**영향:**
- `changer_name`이 NULL이 되거나 조회 실패
- 하지만 이 부분은 이메일 발송을 막지는 않음 (COALESCE로 처리)

#### 문제 2: 트리거 실행 조건 불일치
```sql
-- 트리거 정의 (20250101000010_create_task_status_change_trigger.sql)
CREATE TRIGGER trigger_send_task_status_change_email
  AFTER UPDATE OF task_status ON public.tasks
  FOR EACH ROW
  WHEN (OLD.task_status IS DISTINCT FROM NEW.task_status)  -- ✅ 정상
  EXECUTE FUNCTION public.send_task_status_change_email();
```

**트리거 함수 내부 조건:**
```sql
-- 함수 내부 (26-33줄)
IF NOT (
  (OLD.task_status = 'ASSIGNED' AND NEW.task_status = 'IN_PROGRESS') OR
  (OLD.task_status = 'IN_PROGRESS' AND NEW.task_status = 'WAITING_CONFIRM') OR
  (NEW.task_status IN ('APPROVED', 'REJECTED') AND OLD.task_status = 'WAITING_CONFIRM') OR
  (OLD.task_status = 'REJECTED' AND NEW.task_status = 'IN_PROGRESS')
) THEN
  RETURN NEW;  -- ⚠️ 조건 불일치 시 조용히 종료
END IF;
```

**가능한 원인:**
- 실제 상태 전환이 위 조건과 다를 수 있음
- 예: `ASSIGNED → WAITING_CONFIRM` (비정상 전환)은 이메일 발송 안 됨

#### 문제 3: RLS 정책으로 인한 UPDATE 실패
- RLS 정책이 UPDATE를 차단하면 트리거가 실행되지 않음
- 하지만 최근 RLS 정책 수정으로 이 문제는 해결됨

#### 문제 4: Edge Function URL 설정 누락
```sql
-- 함수 내부 (94-99줄)
function_url := current_setting('app.edge_function_url', true);

IF function_url IS NULL OR function_url = '' THEN
  function_url := 'https://' || current_setting('app.supabase_project_ref', true) || '.supabase.co/functions/v1/send-task-email';
END IF;
```

**확인 필요:**
- `app.edge_function_url` 설정 여부
- `app.supabase_project_ref` 설정 여부
- `app.supabase_service_role_key` 설정 여부

---

## 🎯 해결 방안

### 방안 1: 트리거 함수에서 `auth.uid()` 대체 (권장)

**문제:**
- `SECURITY DEFINER` 트리거에서 `auth.uid()`가 NULL일 수 있음

**해결:**
- 트리거 함수에 `changer_id`를 파라미터로 전달하는 방식은 불가능 (트리거는 파라미터를 받지 않음)
- 대신 `NEW`와 `OLD`를 비교하여 변경자를 추론하거나, 시스템 메시지에서 변경자 정보를 가져오기

**구현:**
```sql
-- 방법 1: 시스템 메시지에서 최근 변경자 조회
SELECT user_id INTO changer_id
FROM messages
WHERE task_id = NEW.id
  AND message_type = 'SYSTEM'
ORDER BY created_at DESC
LIMIT 1;

-- 방법 2: auth.uid() NULL 체크 후 기본값 사용
IF auth.uid() IS NULL THEN
  changer_name := '시스템';
ELSE
  SELECT COALESCE(full_name, email) INTO changer_name
  FROM public.profiles
  WHERE id = auth.uid();
END IF;
```

### 방안 2: 트리거 실행 조건 로깅 추가

**문제:**
- 트리거가 실행되지 않는 이유를 파악하기 어려움

**해결:**
- 트리거 함수에 로깅 추가하여 실행 여부 확인

**구현:**
```sql
-- 트리거 함수 시작 부분에 로깅 추가
RAISE NOTICE 'Trigger executed: OLD.status=%, NEW.status=%', OLD.task_status, NEW.task_status;

-- 조건 체크 전후에도 로깅
IF OLD.task_status = NEW.task_status THEN
  RAISE NOTICE 'Status unchanged, skipping email';
  RETURN NEW;
END IF;
```

### 방안 3: 환경 변수 설정 확인 및 설정

**문제:**
- Edge Function URL이 제대로 설정되지 않았을 수 있음

**해결:**
- Supabase 설정에서 환경 변수 확인 및 설정

**필요한 설정:**
- `app.edge_function_url`: Edge Function URL
- `app.supabase_project_ref`: 프로젝트 참조 ID
- `app.supabase_service_role_key`: 서비스 역할 키

### 방안 4: 트리거 함수 에러 처리 강화

**문제:**
- 트리거 함수에서 에러가 발생해도 조용히 실패할 수 있음

**해결:**
- EXCEPTION 블록에서 에러 로깅 강화

**구현:**
```sql
EXCEPTION
  WHEN OTHERS THEN
    -- 에러를 로그 테이블에 기록
    INSERT INTO email_logs (
      task_id,
      recipient_email,
      subject,
      status,
      error_message
    ) VALUES (
      NEW.id,
      'system',
      'Trigger Error',
      'failed',
      SQLERRM
    );
    RAISE WARNING 'Failed to send email notification: %', SQLERRM;
    RETURN NEW;
END;
```

---

## 📝 수정 계획

### 단계 1: 트리거 함수 수정 (우선순위 높음)

**파일:** `supabase/migrations/20250101000024_fix_status_change_email_trigger.sql`

**수정 내용:**
1. `auth.uid()` NULL 체크 추가
2. 에러 로깅 강화
3. 디버깅을 위한 NOTICE 로그 추가

**예상 효과:**
- `auth.uid()` NULL 문제 해결
- 트리거 실행 여부 추적 가능

### 단계 2: 환경 변수 설정 확인

**작업:**
1. Supabase 대시보드에서 환경 변수 확인
2. 누락된 변수 설정

**필요 변수:**
- `app.edge_function_url`
- `app.supabase_project_ref`
- `app.supabase_service_role_key`

### 단계 3: 테스트 및 검증

**테스트 시나리오:**
1. `ASSIGNED → IN_PROGRESS` 전환 테스트
2. `IN_PROGRESS → WAITING_CONFIRM` 전환 테스트
3. `WAITING_CONFIRM → APPROVED` 전환 테스트
4. `WAITING_CONFIRM → REJECTED` 전환 테스트
5. `REJECTED → IN_PROGRESS` 전환 테스트

**검증 항목:**
- 트리거 실행 여부 (PostgreSQL 로그 확인)
- Edge Function 호출 여부 (Edge Function 로그 확인)
- 이메일 발송 여부 (`email_logs` 테이블 확인)
- 실제 이메일 수신 여부

---

## 🔧 구현 세부사항

### 트리거 함수 수정 예시

```sql
CREATE OR REPLACE FUNCTION public.send_task_status_change_email()
RETURNS TRIGGER AS $$
DECLARE
  assigner_email TEXT;
  assignee_email TEXT;
  assigner_name TEXT;
  assignee_name TEXT;
  changer_name TEXT;
  changer_id UUID;
  project_title TEXT;
  recipients_array TEXT[];
  request_body JSONB;
  function_url TEXT;
BEGIN
  -- 디버깅: 트리거 실행 확인
  RAISE NOTICE 'Trigger executed: OLD.status=%, NEW.status=%', OLD.task_status, NEW.task_status;

  -- Only trigger for specific status transitions
  IF OLD.task_status = NEW.task_status THEN
    RAISE NOTICE 'Status unchanged, skipping email';
    RETURN NEW;
  END IF;

  -- Check if this is a valid status transition that requires email
  IF NOT (
    (OLD.task_status = 'ASSIGNED' AND NEW.task_status = 'IN_PROGRESS') OR
    (OLD.task_status = 'IN_PROGRESS' AND NEW.task_status = 'WAITING_CONFIRM') OR
    (NEW.task_status IN ('APPROVED', 'REJECTED') AND OLD.task_status = 'WAITING_CONFIRM') OR
    (OLD.task_status = 'REJECTED' AND NEW.task_status = 'IN_PROGRESS')
  ) THEN
    RAISE NOTICE 'Status transition not eligible for email: % -> %', OLD.task_status, NEW.task_status;
    RETURN NEW;
  END IF;

  -- Get assigner and assignee emails and names from profiles
  SELECT email, COALESCE(full_name, email) INTO assigner_email, assigner_name
  FROM public.profiles
  WHERE id = NEW.assigner_id;

  SELECT email, COALESCE(full_name, email) INTO assignee_email, assignee_name
  FROM public.profiles
  WHERE id = NEW.assignee_id;

  -- Get changer name (user who triggered the status change)
  -- SECURITY DEFINER 트리거에서 auth.uid()가 NULL일 수 있으므로 체크 필요
  changer_id := auth.uid();
  IF changer_id IS NULL THEN
    -- 시스템 메시지에서 최근 변경자 조회 시도
    SELECT user_id INTO changer_id
    FROM messages
    WHERE task_id = NEW.id
      AND message_type = 'SYSTEM'
    ORDER BY created_at DESC
    LIMIT 1;
    
    IF changer_id IS NULL THEN
      changer_name := '시스템';
    ELSE
      SELECT COALESCE(full_name, email) INTO changer_name
      FROM public.profiles
      WHERE id = changer_id;
    END IF;
  ELSE
    SELECT COALESCE(full_name, email) INTO changer_name
    FROM public.profiles
    WHERE id = changer_id;
  END IF;

  -- Get project title
  SELECT title INTO project_title
  FROM public.projects
  WHERE id = NEW.project_id;

  -- Determine recipients based on status transition
  IF OLD.task_status = 'ASSIGNED' AND NEW.task_status = 'IN_PROGRESS' THEN
    recipients_array := ARRAY['assigner', 'assignee'];
  ELSIF OLD.task_status = 'IN_PROGRESS' AND NEW.task_status = 'WAITING_CONFIRM' THEN
    recipients_array := ARRAY['assigner'];
  ELSIF OLD.task_status = 'WAITING_CONFIRM' AND NEW.task_status IN ('APPROVED', 'REJECTED') THEN
    recipients_array := ARRAY['assignee'];
  ELSIF OLD.task_status = 'REJECTED' AND NEW.task_status = 'IN_PROGRESS' THEN
    recipients_array := ARRAY['assigner'];
  ELSE
    recipients_array := ARRAY['assigner', 'assignee'];
  END IF;

  -- Build request body for Edge Function
  request_body := jsonb_build_object(
    'eventType', 'STATUS_CHANGED',
    'taskId', NEW.id::TEXT,
    'oldStatus', OLD.task_status,
    'newStatus', NEW.task_status,
    'assignerEmail', assigner_email,
    'assigneeEmail', assignee_email,
    'assignerName', assigner_name,
    'assigneeName', assignee_name,
    'changerId', COALESCE(changer_id::TEXT, ''),
    'changerName', changer_name,
    'taskTitle', NEW.title,
    'taskDescription', NEW.description,
    'projectTitle', project_title,
    'projectId', NEW.project_id::TEXT,
    'dueDate', NEW.due_date::TEXT,
    'recipients', recipients_array
  );

  -- Get Edge Function URL from environment
  function_url := current_setting('app.edge_function_url', true);
  
  IF function_url IS NULL OR function_url = '' THEN
    function_url := 'https://' || current_setting('app.supabase_project_ref', true) || '.supabase.co/functions/v1/send-task-email';
  END IF;

  -- 디버깅: Edge Function URL 확인
  RAISE NOTICE 'Calling Edge Function: %', function_url;

  -- Call Edge Function via HTTP (non-blocking)
  PERFORM net.http_post(
    url := function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key', true)
    ),
    body := request_body::text
  );

  RAISE NOTICE 'Edge Function call completed';
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- 에러 로깅 강화
    RAISE WARNING 'Failed to send email notification: %', SQLERRM;
    RAISE WARNING 'Error details: OLD.status=%, NEW.status=%, function_url=%', OLD.task_status, NEW.task_status, function_url;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## ✅ 검증 체크리스트

### 수정 전 검증
- [ ] 현재 상태 변경 시 이메일 미발송 케이스 확인
- [ ] PostgreSQL 로그에서 트리거 실행 여부 확인
- [ ] Edge Function 로그에서 호출 여부 확인
- [ ] 환경 변수 설정 확인

### 수정 후 검증
- [ ] 모든 상태 전환 케이스 테스트
- [ ] 트리거 실행 로그 확인
- [ ] Edge Function 호출 로그 확인
- [ ] `email_logs` 테이블에 기록 확인
- [ ] 실제 이메일 수신 확인

---

## 📌 참고사항

1. **Task 생성 시 이메일이 정상 작동하는 이유:**
   - INSERT 트리거는 RLS 정책이 단순하여 항상 실행됨
   - `auth.uid()` 사용 안 함 (changer 정보 불필요)

2. **상태 변경 시 이메일이 실패하는 이유:**
   - UPDATE 트리거에서 `auth.uid()`가 NULL일 수 있음
   - 트리거 함수 내부 조건 체크에서 걸러질 수 있음
   - 환경 변수 미설정으로 Edge Function 호출 실패 가능

3. **우선순위:**
   - 트리거 함수 수정 (auth.uid() NULL 체크) → 최우선
   - 환경 변수 설정 확인 → 높음
   - 로깅 추가 → 중간
   - 에러 처리 강화 → 낮음

