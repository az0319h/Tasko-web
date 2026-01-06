# 채팅 메시지 읽음 처리 정책 개선 계획서

## 📋 개요

현재 채팅 메시지의 읽음 처리는 모든 사용자를 대상으로 하고 있습니다. 이를 **지시자(assigner) ↔ 담당자(assignee) 사이에서만** 읽음 처리가 이루어지도록 개선합니다.

---

## 🎯 정책 정의

### 1. 읽음 처리 주체

**현재 정책:**
- 모든 사용자가 읽음 처리에 포함됨
- `read_by` JSONB 배열에 모든 사용자 ID 저장

**개선 정책:**
- 읽음 처리는 **오직 지시자(assigner) ↔ 담당자(assignee) 사이에서만** 발생
- 관리자(Admin)는 지시자/담당자가 아닌 경우 읽음 처리에 영향 없음
- 관리자가 지시자 또는 담당자인 경우는 일반 사용자와 동일하게 처리

### 2. 읽음 처리 규칙

#### 2.1. 지시자가 보낸 메시지
- **담당자(assignee)가 확인한 경우에만** 읽음 처리
- 관리자가 확인하더라도 담당자가 아니면 읽음 처리하지 않음

#### 2.2. 담당자가 보낸 메시지
- **지시자(assigner)가 확인한 경우에만** 읽음 처리
- 관리자가 확인하더라도 지시자가 아니면 읽음 처리하지 않음

#### 2.3. 관리자 예외 규칙
- 관리자가 **지시자이거나 담당자인 경우**: 일반 사용자와 동일하게 읽음 처리
- 관리자가 **단순 Admin 권한만 가진 제3자인 경우**: 읽음 처리에 영향 없음

### 3. UX 표현

**현재:**
- 읽음 표시: "✓✓" (읽음) / "✓" (안 읽음)

**개선:**
- 읽음 표시: **"읽음"** 텍스트로 명확하게 표시
- 읽음 표시는 **내가 보낸 메시지에만** 노출

---

## 🔍 현재 구조 분석

### 1. 데이터베이스 구조

**현재 `messages` 테이블:**
```sql
read_by JSONB DEFAULT '[]'::jsonb
-- 모든 사용자 ID를 배열로 저장
```

**현재 함수:**
```sql
-- mark_message_as_read: 모든 사용자를 읽음 처리
-- mark_task_messages_as_read: 모든 사용자를 읽음 처리
```

### 2. 현재 로직

**읽음 처리 함수:**
- `mark_message_as_read`: 특정 메시지를 현재 사용자가 읽음 처리
- `mark_task_messages_as_read`: Task의 모든 메시지를 현재 사용자가 읽음 처리
- **문제점**: Task의 assigner/assignee 여부를 확인하지 않음

**읽음 상태 확인:**
- `isMessageRead`: `read_by` 배열에 현재 사용자 ID가 있는지 확인
- **문제점**: 상대방이 assigner/assignee인지 확인하지 않음

---

## 📐 설계 방안

### 옵션 A: `read_by` 구조 변경 (권장)

**방식:**
- `read_by` JSONB 구조를 변경하여 읽음 처리 주체를 명확히 구분
- 예: `{"read_by_assigner": true/false, "read_by_assignee": true/false}`

**장점:**
- 읽음 상태 확인이 명확하고 빠름
- 불필요한 사용자 ID 저장 불필요
- 쿼리 성능 향상

**단점:**
- 기존 데이터 마이그레이션 필요
- 구조 변경으로 인한 코드 수정 범위 큼

---

### 옵션 B: `read_by` 유지 + 로직 변경 (권장)

**방식:**
- `read_by` JSONB 배열 구조 유지
- 읽음 처리 시 Task의 assigner/assignee 여부를 확인하여 처리
- 읽음 상태 확인 시 상대방이 assigner/assignee인지 확인

**장점:**
- 기존 구조 유지로 마이그레이션 부담 적음
- 점진적 개선 가능
- 기존 데이터 호환성 유지

**단점:**
- 읽음 처리 로직이 복잡해짐
- 불필요한 사용자 ID가 배열에 남을 수 있음 (정리 필요)

---

**권장 방안: 옵션 B (점진적 개선)**

이유:
1. 기존 데이터 호환성 유지
2. 마이그레이션 부담 최소화
3. 향후 필요 시 옵션 A로 전환 가능

---

## 🔧 구현 계획

### 1. 데이터베이스 변경

#### 1.1. 읽음 처리 함수 수정

**`mark_message_as_read` 함수:**
```sql
CREATE OR REPLACE FUNCTION public.mark_message_as_read(
  message_id UUID,
  reader_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  task_record RECORD;
  message_sender_id UUID;
  is_reader_assigner BOOLEAN;
  is_reader_assignee BOOLEAN;
  is_sender_assigner BOOLEAN;
  is_sender_assignee BOOLEAN;
BEGIN
  -- 메시지와 Task 정보 조회
  SELECT 
    m.user_id,
    t.assigner_id,
    t.assignee_id
  INTO task_record
  FROM public.messages m
  JOIN public.tasks t ON m.task_id = t.id
  WHERE m.id = message_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Message not found';
  END IF;
  
  message_sender_id := task_record.user_id;
  
  -- 읽는 사람이 assigner/assignee인지 확인
  is_reader_assigner := (reader_id = task_record.assigner_id);
  is_reader_assignee := (reader_id = task_record.assignee_id);
  
  -- 보낸 사람이 assigner/assignee인지 확인
  is_sender_assigner := (message_sender_id = task_record.assigner_id);
  is_sender_assignee := (message_sender_id = task_record.assignee_id);
  
  -- 읽음 처리 조건 확인
  -- 1. 지시자가 보낸 메시지 → 담당자가 읽은 경우만 처리
  -- 2. 담당자가 보낸 메시지 → 지시자가 읽은 경우만 처리
  -- 3. 관리자가 지시자/담당자인 경우는 일반 사용자와 동일하게 처리
  
  IF (is_sender_assigner AND is_reader_assignee) OR
     (is_sender_assignee AND is_reader_assigner) THEN
    -- 읽음 처리: read_by 배열에 추가 (중복 방지)
    UPDATE public.messages
    SET read_by = COALESCE(read_by, '[]'::jsonb) || jsonb_build_array(reader_id::text)
    WHERE id = message_id
      AND NOT (read_by ? reader_id::text);
  END IF;
END;
$$;
```

**`mark_task_messages_as_read` 함수:**
```sql
CREATE OR REPLACE FUNCTION public.mark_task_messages_as_read(
  task_id_param UUID,
  reader_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  task_record RECORD;
  is_reader_assigner BOOLEAN;
  is_reader_assignee BOOLEAN;
BEGIN
  -- Task 정보 조회
  SELECT assigner_id, assignee_id
  INTO task_record
  FROM public.tasks
  WHERE id = task_id_param;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found';
  END IF;
  
  -- 읽는 사람이 assigner/assignee인지 확인
  is_reader_assigner := (reader_id = task_record.assigner_id);
  is_reader_assignee := (reader_id = task_record.assignee_id);
  
  -- 읽는 사람이 assigner 또는 assignee가 아니면 처리하지 않음
  IF NOT (is_reader_assigner OR is_reader_assignee) THEN
    RETURN;
  END IF;
  
  -- Task의 모든 메시지에 대해 읽음 처리
  -- 단, 상대방(assigner 또는 assignee)이 보낸 메시지만 처리
  UPDATE public.messages
  SET read_by = COALESCE(read_by, '[]'::jsonb) || jsonb_build_array(reader_id::text)
  WHERE task_id = task_id_param
    AND deleted_at IS NULL  -- 삭제되지 않은 메시지만
    AND (
      -- 지시자가 읽는 경우: 담당자가 보낸 메시지만 읽음 처리
      (is_reader_assigner AND user_id = task_record.assignee_id) OR
      -- 담당자가 읽는 경우: 지시자가 보낸 메시지만 읽음 처리
      (is_reader_assignee AND user_id = task_record.assigner_id)
    )
    AND NOT (read_by ? reader_id::text);  -- 중복 방지
END;
$$;
```

#### 1.2. 기존 데이터 정리 (선택사항)

**불필요한 읽음 처리 데이터 정리:**
```sql
-- Task의 assigner/assignee가 아닌 사용자의 읽음 처리를 제거
-- (선택사항: 기존 데이터 정리용)
UPDATE public.messages m
SET read_by = (
  SELECT jsonb_agg(elem)
  FROM jsonb_array_elements(m.read_by) elem
  WHERE elem::text IN (
    SELECT jsonb_build_array(t.assigner_id, t.assignee_id)::text
    FROM public.tasks t
    WHERE t.id = m.task_id
  )
)
WHERE EXISTS (
  SELECT 1
  FROM public.tasks t
  WHERE t.id = m.task_id
  AND jsonb_array_length(m.read_by) > 0
);
```

**주의사항:**
- 이 작업은 선택사항이며, 기존 데이터 정리가 필요한 경우에만 실행
- 프로덕션 환경에서는 신중하게 진행

---

### 2. API 레이어 변경

#### 2.1. 읽음 상태 확인 함수 수정

**`src/api/message.ts`:**

```typescript
/**
 * 메시지가 읽혔는지 확인 (assigner ↔ assignee 기준)
 * @param message 메시지 정보
 * @param currentUserId 현재 사용자 ID
 * @param task Task 정보 (assigner_id, assignee_id 포함)
 * @returns 읽음 여부
 */
export function isMessageReadByCounterpart(
  message: MessageWithProfile,
  currentUserId: string,
  task: { assigner_id: string; assignee_id: string }
): boolean {
  // 본인이 보낸 메시지만 읽음 표시
  if (message.user_id !== currentUserId) {
    return false;
  }

  // 읽음 처리 주체 확인
  const isCurrentUserAssigner = currentUserId === task.assigner_id;
  const isCurrentUserAssignee = currentUserId === task.assignee_id;
  const isSenderAssigner = message.user_id === task.assigner_id;
  const isSenderAssignee = message.user_id === task.assignee_id;

  // 읽음 처리 주체가 아닌 경우 false
  if (!isCurrentUserAssigner && !isCurrentUserAssignee) {
    return false;
  }

  // 상대방 ID 확인
  const counterpartId = isSenderAssigner 
    ? task.assignee_id  // 지시자가 보낸 메시지 → 담당자 확인
    : task.assigner_id; // 담당자가 보낸 메시지 → 지시자 확인

  // read_by 배열에 상대방 ID가 있는지 확인
  const readBy = message.read_by || [];
  if (!Array.isArray(readBy)) {
    return false;
  }

  return readBy.includes(counterpartId);
}
```

---

### 3. UI 레이어 변경

#### 3.1. 읽음 표시 텍스트 변경

**`src/pages/task-detail-page.tsx`:**

```typescript
// 기존
{isMessageRead(message) ? "✓✓" : "✓"}

// 변경 후
{isMessageReadByCounterpart(message, currentUserId, task) ? "읽음" : ""}
```

#### 3.2. 읽음 상태 확인 로직 수정

**`src/pages/task-detail-page.tsx`:**

```typescript
// 기존 isMessageRead 함수 제거 또는 수정
// 새로운 함수로 교체
const isMessageReadByCounterpart = (message: MessageWithProfile): boolean => {
  if (!currentUserId || !task) return false;
  
  // 본인이 보낸 메시지만 읽음 표시
  if (message.user_id !== currentUserId) return false;
  
  // 읽음 처리 주체 확인
  const isCurrentUserAssigner = currentUserId === task.assigner_id;
  const isCurrentUserAssignee = currentUserId === task.assignee_id;
  
  // 읽음 처리 주체가 아닌 경우 false
  if (!isCurrentUserAssigner && !isCurrentUserAssignee) {
    return false;
  }
  
  // 상대방 ID 확인
  const isSenderAssigner = message.user_id === task.assigner_id;
  const counterpartId = isSenderAssigner 
    ? task.assignee_id  // 지시자가 보낸 메시지 → 담당자 확인
    : task.assigner_id; // 담당자가 보낸 메시지 → 지시자 확인
  
  // read_by 배열에 상대방 ID가 있는지 확인
  const readBy = message.read_by || [];
  if (!Array.isArray(readBy)) return false;
  
  return readBy.includes(counterpartId);
};
```

---

### 4. Realtime 처리

**현재 구조:**
- `useRealtimeMessages` 훅에서 `messages` 테이블의 UPDATE 이벤트 구독
- `read_by` 필드 업데이트 시 쿼리 무효화

**변경 사항:**
- Realtime 구독 구조는 유지
- 읽음 처리 로직만 변경되므로 추가 변경 불필요
- `read_by` 필드 업데이트 시 자동으로 UI 반영됨

---

## 📊 변경 파일 목록

### 데이터베이스
1. `supabase/migrations/YYYYMMDDHHMMSS_update_message_read_policy.sql`
   - `mark_message_as_read` 함수 수정
   - `mark_task_messages_as_read` 함수 수정

### API 레이어
2. `src/api/message.ts`
   - `isMessageReadByCounterpart` 함수 추가 (또는 기존 함수 수정)

### UI 레이어
3. `src/pages/task-detail-page.tsx`
   - `isMessageRead` 함수를 `isMessageReadByCounterpart`로 교체
   - 읽음 표시를 "✓✓" → "읽음" 텍스트로 변경

---

## ⚠️ 주의사항

### 1. 기존 데이터 호환성
- 기존 `read_by` 배열에 저장된 데이터는 그대로 유지
- 새로운 로직에서만 assigner/assignee 기준으로 확인
- 기존 데이터 정리는 선택사항

### 2. 성능 고려
- Task 정보 조회가 추가되므로 JOIN 또는 별도 쿼리 필요
- 인덱스 확인 필요: `messages.task_id`, `tasks.id`

### 3. RLS 정책
- 현재 RLS 정책은 변경 불필요
- 읽음 처리는 함수 내부에서 권한 확인

### 4. 테스트 시나리오

**시나리오 1: 지시자가 메시지 전송**
- 지시자가 메시지 전송
- 담당자가 채팅 화면 진입 → 읽음 처리됨
- 지시자 메시지에 "읽음" 표시
- 관리자(제3자)가 채팅 화면 진입 → 읽음 처리 안 됨

**시나리오 2: 담당자가 메시지 전송**
- 담당자가 메시지 전송
- 지시자가 채팅 화면 진입 → 읽음 처리됨
- 담당자 메시지에 "읽음" 표시
- 관리자(제3자)가 채팅 화면 진입 → 읽음 처리 안 됨

**시나리오 3: 관리자가 지시자인 경우**
- 관리자가 지시자로 Task 생성
- 관리자가 메시지 전송
- 담당자가 채팅 화면 진입 → 읽음 처리됨
- 관리자 메시지에 "읽음" 표시 (일반 사용자와 동일)

**시나리오 4: 관리자가 담당자인 경우**
- 관리자가 담당자로 지정됨
- 관리자가 메시지 전송
- 지시자가 채팅 화면 진입 → 읽음 처리됨
- 관리자 메시지에 "읽음" 표시 (일반 사용자와 동일)

---

## ✅ 검증 항목

1. **읽음 처리 정확성**
   - [ ] 지시자가 보낸 메시지는 담당자가 읽은 경우만 읽음 처리
   - [ ] 담당자가 보낸 메시지는 지시자가 읽은 경우만 읽음 처리
   - [ ] 관리자(제3자)는 읽음 처리에 영향 없음

2. **UI 표시**
   - [ ] 읽음 표시가 "읽음" 텍스트로 표시됨
   - [ ] 읽음 표시가 내가 보낸 메시지에만 노출됨
   - [ ] 읽지 않은 경우 표시 없음

3. **Realtime 동작**
   - [ ] 상대방이 메시지를 읽으면 실시간으로 "읽음" 표시됨
   - [ ] 읽음 처리 후 UI가 즉시 업데이트됨

4. **에지 케이스**
   - [ ] 관리자가 지시자/담당자인 경우 정상 동작
   - [ ] 삭제된 메시지는 읽음 처리 안 됨
   - [ ] SYSTEM 메시지는 읽음 처리 안 됨

---

## 📝 구현 순서

1. **1단계: 데이터베이스 함수 수정**
   - `mark_message_as_read` 함수 수정
   - `mark_task_messages_as_read` 함수 수정
   - 마이그레이션 적용

2. **2단계: API 레이어 수정**
   - `isMessageReadByCounterpart` 함수 추가
   - 기존 함수 수정 또는 교체

3. **3단계: UI 레이어 수정**
   - 읽음 상태 확인 로직 수정
   - 읽음 표시 텍스트 변경

4. **4단계: 테스트 및 검증**
   - 각 시나리오별 테스트
   - Realtime 동작 확인

---

**작성일:** 2025-01-XX  
**작성자:** AI Assistant  
**상태:** 설계 완료, 구현 대기


