# send-task-email Edge Function 실행 실패 원인 분석 (실제 데이터 기반)

## 🔴 핵심 문제 요약

**이메일이 발송되지 않는 주요 원인:**

1. **`send_task_created_email` 함수가 존재하지 않는 `projects` 테이블을 참조하여 실행 시 오류 발생**
2. **Edge Function이 `projectTitle`을 필수 필드로 요구하지만, 데이터베이스 트리거는 `clientName`만 전송**
3. **`send_task_created_email` 함수가 잘못된 Edge Function URL 사용**

---

## 📊 실제 확인된 상태

### ✅ 정상 상태
- Edge Function 배포 상태: **ACTIVE** (version 4)
- 트리거 존재: `trigger_send_task_created_email`, `trigger_03_send_task_status_change_email`
- 함수 존재: `send_task_created_email`, `send_task_status_change_email`
- `tasks` 테이블에 `client_name` 컬럼 존재

### ❌ 문제 상태
- `projects` 테이블: **존재하지 않음** (`projects_table_exists: false`)
- `tasks` 테이블에 `project_id` 컬럼: **존재하지 않음**

---

## 🔍 상세 문제 분석

### 문제 1: `send_task_created_email` 함수가 존재하지 않는 테이블 참조

**함수 코드 (실제 데이터베이스에서 확인):**
```sql
-- Get project title
SELECT title INTO project_title
FROM public.projects          -- ⚠️ projects 테이블이 존재하지 않음!
WHERE id = NEW.project_id;    -- ⚠️ project_id 컬럼도 존재하지 않음!

IF project_title IS NULL THEN
  RAISE WARNING '[EMAIL_TRIGGER] Project not found: %', NEW.project_id;
  RETURN NEW;  -- 함수가 여기서 종료되어 Edge Function 호출되지 않음
END IF;
```

**실제 데이터베이스 상태:**
- `projects` 테이블: **존재하지 않음**
- `tasks.project_id` 컬럼: **존재하지 않음**
- `tasks.client_name` 컬럼: **존재함**

**영향:**
- Task 생성 시 트리거가 실행되면 `SELECT title INTO project_title FROM public.projects WHERE id = NEW.project_id;` 쿼리가 실패합니다
- PostgreSQL이 테이블이 존재하지 않으면 오류를 발생시키거나, `project_title`이 NULL이 되어 함수가 조기에 종료됩니다
- Edge Function이 호출되지 않습니다

---

### 문제 2: Edge Function URL 불일치

**`send_task_created_email` 함수에서 사용하는 URL:**
```sql
function_url := 'https://dcovjxmrqomuuwcgiwie.supabase.co/functions/v1/send-task-email';
```

**실제 프로젝트 참조:**
- 실제 프로젝트: `mbwmxowoyvaxmtnigjwa`
- 함수에서 사용: `dcovjxmrqomuuwcgiwie` ❌

**`send_task_status_change_email` 함수에서 사용하는 URL:**
```sql
function_url := 'https://mbwmxowoyvaxmtnigjwa.supabase.co/functions/v1/send-task-email';
```
✅ 올바른 URL 사용

**영향:**
- `send_task_created_email` 함수가 실행되더라도 잘못된 URL로 요청이 전송되어 404 Not Found 또는 인증 실패가 발생할 수 있습니다

---

### 문제 3: Edge Function 코드와 데이터베이스 트리거 간 데이터 구조 불일치

**Edge Function 요구사항 (실제 배포된 코드):**
```typescript
interface EmailRequest {
  projectTitle: string;  // ⚠️ 필수 필드
  projectId?: string;
  // ...
}

// 필수 필드 검증 (line 405)
if (
  !emailData.projectTitle ||  // ⚠️ 필수 필드 검증
  // ...
) {
  return new Response(JSON.stringify({ error: "Missing required fields" }), {
    status: 400,
  });
}
```

**`send_task_status_change_email` 함수가 전송하는 데이터:**
```sql
request_body := jsonb_build_object(
  'clientName', COALESCE(client_name, ''),  -- ✅ clientName 사용
  -- projectTitle 없음 ❌
);
```

**`send_task_created_email` 함수가 전송하려는 데이터:**
```sql
request_body := jsonb_build_object(
  'projectTitle', project_title,  -- ⚠️ NULL이 될 가능성 높음
  'projectId', NEW.project_id::TEXT,  -- ⚠️ 존재하지 않는 컬럼
);
```

**영향:**
- `send_task_status_change_email` 함수가 Edge Function을 호출하면 `projectTitle`이 없어서 400 Bad Request 오류 발생
- `send_task_created_email` 함수는 실행 자체가 실패하므로 Edge Function 호출되지 않음

---

## 🎯 문제 발생 시나리오

### 시나리오 1: Task 생성 시

1. 사용자가 Task 생성
2. `trigger_send_task_created_email` 트리거 실행
3. `send_task_created_email()` 함수 호출
4. 함수 내부에서 `SELECT title INTO project_title FROM public.projects WHERE id = NEW.project_id;` 실행
5. **오류 발생 또는 `project_title`이 NULL**
6. `IF project_title IS NULL THEN RETURN NEW;` 조건에 의해 함수 조기 종료
7. **Edge Function 호출되지 않음** ❌
8. 이메일 발송되지 않음

### 시나리오 2: Task 상태 변경 시

1. 사용자가 Task 상태 변경
2. `trigger_03_send_task_status_change_email` 트리거 실행
3. `send_task_status_change_email()` 함수 호출
4. 함수가 `clientName`을 포함한 요청 본문 생성
5. Edge Function에 HTTP 요청 전송
6. Edge Function이 `projectTitle` 필수 필드 검증
7. **`projectTitle`이 없어서 400 Bad Request 반환** ❌
8. 이메일 발송되지 않음

---

## 📋 해결 필요 사항 (우선순위별)

### 🔴 최우선 (즉시 수정 필요)

1. **`send_task_created_email` 함수 수정**
   - `projects` 테이블 참조 제거
   - `project_id` 컬럼 참조 제거
   - `client_name` 사용하도록 변경
   - Edge Function URL을 올바른 프로젝트 참조로 수정

2. **Edge Function 코드 수정**
   - `projectTitle` 필수 필드 검증 제거
   - `clientName` 선택 필드로 추가
   - 이메일 템플릿에서 `projectTitle` 대신 `clientName` 사용

### 🟡 높음 (데이터 구조 일치)

3. **`send_task_status_change_email` 함수 확인**
   - 이미 올바르게 `clientName`을 사용하고 있음 ✅
   - Edge Function 코드만 수정하면 작동할 것으로 예상

---

## 🔧 수정이 필요한 코드 위치

### 데이터베이스 함수

**파일:** `supabase/migrations/migrations_refactoring/complete_refactoring.sql` (또는 새 마이그레이션)

**`send_task_created_email` 함수:**
- `projects` 테이블 참조 제거
- `project_id` 컬럼 참조 제거
- `client_name` 사용
- Edge Function URL 수정: `dcovjxmrqomuuwcgiwie` → `mbwmxowoyvaxmtnigjwa`
- Edge Function에 `clientName` 전송

### Edge Function 코드

**파일:** `supabase/functions/send-task-email/index.ts`

**수정 필요:**
1. `EmailRequest` 인터페이스 (line 13-32)
   - `projectTitle: string` → `clientName?: string`
   - `projectId?: string` 제거

2. 필수 필드 검증 (line 399-416)
   - `!emailData.projectTitle` 검증 제거

3. 이메일 템플릿 (line 87, 159, 284)
   - `${data.projectTitle}` → `${data.clientName || '미지정'}`
   - "프로젝트:" 라벨 → "고객명:" 또는 "고객:"

---

## 📊 문제 발생 가능성 및 영향도

| 문제 | 발생 가능성 | 영향도 | 현재 상태 |
|------|------------|--------|----------|
| `send_task_created_email` 함수가 `projects` 테이블 참조 | **100%** | 높음 | ✅ 확인됨 |
| Edge Function이 `projectTitle` 필수 필드 요구 | **100%** | 높음 | ✅ 확인됨 |
| Edge Function URL 불일치 (`send_task_created_email`) | **100%** | 중간 | ✅ 확인됨 |
| `send_task_status_change_email` 함수는 정상 | - | - | ✅ 확인됨 |

---

## ✅ 확인된 정상 동작

- Edge Function 배포 상태: ACTIVE
- 트리거 존재: 모두 존재
- `send_task_status_change_email` 함수: 올바른 URL 및 `clientName` 사용
- `tasks.client_name` 컬럼: 존재함

---

## 📝 결론

**이메일이 발송되지 않는 명확한 원인:**

1. **Task 생성 시:** `send_task_created_email` 함수가 존재하지 않는 `projects` 테이블을 참조하여 함수 실행이 실패하고 Edge Function이 호출되지 않습니다.

2. **Task 상태 변경 시:** `send_task_status_change_email` 함수는 정상적으로 실행되지만, Edge Function이 `projectTitle`을 필수 필드로 요구하여 400 Bad Request 오류가 발생합니다.

**즉시 수정 필요:**
- `send_task_created_email` 함수를 `client_name`을 사용하도록 수정
- Edge Function 코드를 `clientName`을 사용하도록 수정
- Edge Function URL을 올바른 프로젝트 참조로 수정
