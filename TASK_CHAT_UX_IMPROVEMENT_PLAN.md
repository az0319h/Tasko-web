# Task 채팅 기능 UX 개선 계획표

## 📋 개요

Task 채팅 기능의 사용자 경험을 개선하기 위한 상세 계획표입니다. 구현 전 사전 점검 결과와 함께 각 개선 항목의 변경 영역, 구현 방식, 주의사항을 정리했습니다.

---

## 🔍 사전 점검 결과

### 1. Realtime 설정 확인

**현재 상태:**
- ✅ `messages` 테이블에 Realtime 구독 활성화됨
- ✅ `useRealtimeMessages` 훅에서 INSERT/UPDATE/DELETE 이벤트 모두 구독 중
- ✅ 삭제 이벤트도 실시간으로 반영됨

**확인 쿼리 결과:**
- Realtime 채널: `messages:${taskId}` 형식으로 구독 중
- 이벤트 타입: `postgres_changes` (INSERT, UPDATE, DELETE 모두)

**결론:** 메시지 삭제 시 Realtime을 통한 실시간 반영이 가능합니다.

---

### 2. RLS 정책 확인

**현재 RLS 정책 (`messages` 테이블):**

1. **SELECT 정책** (`messages_select_task_access`)
   - Task 접근 권한이 있으면 메시지 조회 가능
   - ✅ Soft delete 구현 시 `deleted_at IS NULL` 조건 추가 필요

2. **INSERT 정책** (`messages_insert_task_access`)
   - Task 접근 권한이 있고 본인 메시지만 생성 가능
   - ✅ 변경 불필요

3. **UPDATE 정책** (`messages_update_own_user_messages`)
   - 본인의 USER 메시지만 수정 가능
   - ⚠️ **문제점**: FILE 메시지도 수정 가능하도록 변경 필요 (soft delete용)

4. **DELETE 정책** (`messages_delete_own_user_messages`)
   - 본인의 USER 메시지만 삭제 가능
   - ⚠️ **문제점**: FILE 메시지도 삭제 가능하도록 변경 필요

**결론:**
- Soft delete 방식 선택 시: UPDATE 정책에 FILE 메시지 포함 필요
- 완전 삭제 방식 선택 시: DELETE 정책에 FILE 메시지 포함 필요

---

### 3. Storage 정책 확인

**현재 상태:**
- ✅ `task-files` bucket 존재 확인
- ✅ Storage RLS 정책 확인 완료
- ❌ 파일 삭제 함수 (`deleteTaskFile`) 없음

**Storage RLS 정책 확인 결과:**

1. **업로드 정책** (`task_files_upload`)
   - Task 접근 권한이 있는 사용자만 업로드 가능
   - ✅ 정상 동작

2. **읽기 정책** (`task_files_read`)
   - Task 접근 권한이 있는 사용자만 읽기 가능
   - ✅ 정상 동작

3. **삭제 정책** (`task_files_delete`) ✅ **이미 존재**
   ```sql
   CREATE POLICY "task_files_delete"
   ON storage.objects
   FOR DELETE
   TO authenticated
   USING (
     bucket_id = 'task-files'
     AND auth.uid()::text = (storage.foldername(name))[2]
   );
   ```
   - 본인이 업로드한 파일만 삭제 가능
   - 파일 경로 형식: `{taskId}/{userId}-{timestamp}.{ext}`
   - 두 번째 폴더(`[2]`)가 `userId`와 일치해야 삭제 가능

**결론:**
- ✅ Storage RLS 정책이 이미 올바르게 설정되어 있음
- ✅ 파일 삭제 기능 구현 시 Storage API만 연동하면 됨
- ✅ 추가 정책 변경 불필요

---

### 4. Soft Delete 컬럼 확인

**현재 `messages` 테이블 구조:**
- `deleted_at` 컬럼 없음
- `is_deleted` 같은 boolean 컬럼 없음

**결론:**
- Soft delete 방식 선택 시 `deleted_at TIMESTAMPTZ` 컬럼 추가 필요

---

## 📝 개선 항목별 상세 계획

---

### 1. 메시지 전송 후 포커스 문제

#### 현재 문제점
- 메시지 전송 후 `textarea`에서 포커스가 빠짐
- 매번 다시 클릭해야 다음 메시지 입력 가능

#### 변경 영역
- **FE**: `src/pages/task-detail-page.tsx`
  - `handleSendMessage` 함수 수정
  - `textareaRef`를 사용한 포커스 복원

#### 구현 방식

**방법 1: 전송 완료 후 즉시 포커스 (권장)**
```typescript
// handleSendMessage 함수 내부
await createMessageWithFiles.mutateAsync({...});
setMessageInput("");
setAttachedFiles([]);

// 포커스 복원
setTimeout(() => {
  textareaRef.current?.focus();
}, 0);
```

**방법 2: 전송 성공 콜백에서 포커스**
```typescript
// useCreateMessageWithFiles 훅의 onSuccess에서 처리
onSuccess: () => {
  textareaRef.current?.focus();
}
```

**권장 방법:** 방법 1 (더 명확하고 제어 가능)

#### 주의할 점
- `setTimeout`을 사용하여 DOM 업데이트 후 포커스 설정
- 전송 실패 시에도 포커스 유지 (에러 복원 로직과 충돌 방지)
- 전송 중(`isPending`) 상태에서는 포커스 복원하지 않음

#### 예상 작업 시간
- 30분

---

### 2. 보낸 메시지 / 파일 삭제 기능

#### 현재 문제점
- 메시지 삭제 기능 없음
- 파일 삭제 기능 없음

#### 삭제 방식 비교

##### 옵션 A: 완전 삭제 (Hard Delete)

**장점:**
- ✅ 데이터베이스 용량 절약
- ✅ 구현이 단순함 (DELETE 쿼리만)
- ✅ 복구 불가능한 완전한 삭제 (법적 요구사항 충족 가능)

**단점:**
- ❌ 삭제된 메시지 복구 불가능
- ❌ 삭제 이력 추적 불가능
- ❌ 실수로 삭제 시 데이터 손실

**구현 복잡도:** 낮음

---

##### 옵션 B: Soft Delete (권장)

**장점:**
- ✅ 삭제된 메시지 복구 가능 (필요 시)
- ✅ 삭제 이력 추적 가능 (`deleted_at` 타임스탬프)
- ✅ 데이터 손실 방지
- ✅ 감사(audit) 목적에 유용

**단점:**
- ❌ 데이터베이스 용량 증가 (삭제된 메시지도 저장)
- ❌ 쿼리 시 `WHERE deleted_at IS NULL` 조건 필요
- ❌ 구현 복잡도 약간 증가

**구현 복잡도:** 중간

---

**권장 방식: Soft Delete**

이유:
1. 사용자 실수로 인한 데이터 손실 방지
2. 향후 복구 기능 추가 가능
3. 감사 목적에 유용
4. 용량 증가는 메시지 데이터 크기가 크지 않아 큰 문제가 되지 않음

---

#### 변경 영역

**DB:**
- `messages` 테이블에 `deleted_at TIMESTAMPTZ` 컬럼 추가
- RLS 정책 수정 (FILE 메시지도 UPDATE 가능하도록)
- SELECT 쿼리에 `deleted_at IS NULL` 조건 추가

**FE:**
- `src/api/message.ts`: `deleteMessage` 함수 추가
- `src/api/storage.ts`: `deleteTaskFile` 함수 추가
- `src/hooks/mutations/use-message.ts`: `useDeleteMessage` 훅 추가
- `src/pages/task-detail-page.tsx`: 삭제 버튼 UI 추가

**Realtime:**
- UPDATE 이벤트 구독으로 삭제 반영 (기존 구독 유지)

---

#### 구현 방식

**1. DB 마이그레이션**
```sql
-- deleted_at 컬럼 추가
ALTER TABLE public.messages
  ADD COLUMN deleted_at TIMESTAMPTZ;

-- 인덱스 추가 (성능 최적화)
CREATE INDEX idx_messages_deleted_at 
ON public.messages(deleted_at) 
WHERE deleted_at IS NULL;

-- RLS 정책 수정 (FILE 메시지도 UPDATE 가능)
DROP POLICY IF EXISTS "messages_update_own_user_messages" ON public.messages;
CREATE POLICY "messages_update_own_user_messages"
ON public.messages
FOR UPDATE
USING (
  (SELECT auth.uid()) = user_id
  AND (message_type = 'USER' OR message_type = 'FILE')
)
WITH CHECK (
  (SELECT auth.uid()) = user_id
  AND (message_type = 'USER' OR message_type = 'FILE')
);
```

**2. API 함수 (`src/api/message.ts`)**
```typescript
/**
 * 메시지 삭제 (Soft Delete)
 */
export async function deleteMessage(messageId: string): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) {
    throw new Error("인증이 필요합니다.");
  }

  // 메시지 조회 (본인 메시지인지 확인)
  const { data: message, error: fetchError } = await supabase
    .from("messages")
    .select("user_id, message_type, file_url")
    .eq("id", messageId)
    .single();

  if (fetchError || !message) {
    throw new Error("메시지를 찾을 수 없습니다.");
  }

  if (message.user_id !== session.session.user.id) {
    throw new Error("본인이 보낸 메시지만 삭제할 수 있습니다.");
  }

  // Soft delete: deleted_at 설정
  const { error: updateError } = await supabase
    .from("messages")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", messageId);

  if (updateError) {
    throw new Error(`메시지 삭제 실패: ${updateError.message}`);
  }

  // 파일 메시지인 경우 Storage에서도 삭제
  if (message.message_type === "FILE" && message.file_url) {
    try {
      await deleteTaskFile(message.file_url);
    } catch (error) {
      // Storage 삭제 실패해도 DB 삭제는 완료됨 (로깅만)
      console.error("Storage 파일 삭제 실패:", error);
    }
  }
}
```

**3. Storage 삭제 함수 (`src/api/storage.ts`)**
```typescript
/**
 * Task 파일 삭제
 */
export async function deleteTaskFile(fileUrl: string): Promise<void> {
  try {
    const urlObj = new URL(fileUrl);
    const pathParts = urlObj.pathname.split("/");
    const bucketIndex = pathParts.findIndex((part) => part === TASK_FILES_BUCKET);
    
    if (bucketIndex === -1) {
      throw new Error("Invalid file URL");
    }
    
    const path = pathParts.slice(bucketIndex + 1).join("/");
    const { error } = await supabase.storage
      .from(TASK_FILES_BUCKET)
      .remove([path]);

    if (error) throw error;
  } catch (err: any) {
    throw new Error(`파일 삭제 실패: ${err.message}`);
  }
}
```

**4. React Query 훅 (`src/hooks/mutations/use-message.ts`)**
```typescript
export function useDeleteMessage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (messageId: string) => deleteMessage(messageId),
    onMutate: async (messageId) => {
      // Optimistic update: 메시지 목록에서 제거
      await queryClient.cancelQueries({ queryKey: ["messages"] });
      
      const previousMessages = queryClient.getQueryData(["messages"]);
      
      queryClient.setQueryData(["messages"], (old: any) => {
        if (!old) return old;
        return old.filter((msg: MessageWithProfile) => msg.id !== messageId);
      });

      return { previousMessages };
    },
    onError: (error, messageId, context) => {
      // 롤백
      if (context?.previousMessages) {
        queryClient.setQueryData(["messages"], context.previousMessages);
      }
      toast.error(error.message || "메시지 삭제에 실패했습니다.");
    },
    onSuccess: (_, messageId) => {
      // 관련 쿼리 무효화
      queryClient.invalidateQueries({ queryKey: ["messages"] });
    },
  });
}
```

**5. 메시지 조회 쿼리 수정 (`src/api/message.ts`)**
```typescript
export async function getMessagesByTaskId(taskId: string): Promise<MessageWithProfile[]> {
  const { data, error } = await supabase
    .from("messages")
    .select(`
      *,
      sender:profiles!messages_user_id_fkey(id, full_name, email)
    `)
    .eq("task_id", taskId)
    .is("deleted_at", null)  // 삭제되지 않은 메시지만 조회
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`메시지 목록 조회 실패: ${error.message}`);
  }

  return (data || []) as MessageWithProfile[];
}
```

**6. UI 추가 (`src/pages/task-detail-page.tsx`)**
- 본인이 보낸 메시지에 삭제 버튼 추가
- 삭제 확인 다이얼로그 (선택사항)
- 삭제 후 즉시 UI에서 제거

---

#### 주의할 점

1. **RLS 정책 수정**
   - FILE 메시지도 UPDATE 가능하도록 정책 변경 필요
   - `(SELECT auth.uid())` 형식 사용 (성능 최적화)

2. **Storage 삭제**
   - 파일 삭제 실패해도 DB 삭제는 완료 (에러 로깅만)
   - Storage RLS 정책 확인 필요

3. **Realtime 반영**
   - UPDATE 이벤트로 삭제 반영 (기존 구독 유지)
   - Optimistic update로 즉시 UI 반영

4. **쿼리 성능**
   - `deleted_at IS NULL` 조건에 인덱스 추가
   - Partial index 사용 (`WHERE deleted_at IS NULL`)

5. **타입 정의**
   - `database.type.ts`에 `deleted_at` 필드 추가
   - `Message` 타입에 `deleted_at` 추가

---

#### 예상 작업 시간
- DB 마이그레이션: 30분
- API 함수 구현: 1시간
- React Query 훅: 30분
- UI 구현: 1시간
- 테스트: 1시간
- **총계: 약 4시간**

---

### 3. 파일 + 텍스트 동시 전송 시 표시 순서

#### 현재 문제점
- 텍스트 메시지가 먼저 생성됨 (`createMessageWithFiles` 함수)
- 파일 메시지가 나중에 생성됨
- UI에서 생성 순서대로 표시됨

#### 변경 영역
- **FE**: `src/api/message.ts`의 `createMessageWithFiles` 함수
- **DB**: 변경 불필요 (생성 순서만 변경)

#### 구현 방식

**현재 로직:**
```typescript
// 1. 텍스트 메시지 먼저 생성
if (content && content.trim()) {
  messages.push(textMessage);
}

// 2. 파일 메시지들 생성
for (const file of files) {
  messages.push(fileMessage);
}
```

**변경 후 로직:**
```typescript
// 1. 파일 메시지들 먼저 생성
for (const file of files) {
  const fileMessage = await createFileMessage(...);
  messages.push(fileMessage);
}

// 2. 텍스트 메시지 나중에 생성
if (content && content.trim()) {
  const textMessage = await createMessage(...);
  messages.push(textMessage);
}
```

**또는 더 나은 방법: 타임스탬프 조정**

파일과 텍스트를 동시에 생성하되, `created_at`을 동일하게 설정:

```typescript
const batchTimestamp = new Date().toISOString();

// 파일 메시지들 생성 (동일한 타임스탬프)
for (const file of files) {
  const { data: fileMessage, error } = await supabase
    .from("messages")
    .insert({
      ...fileData,
      created_at: batchTimestamp,  // 동일한 타임스탬프
    })
    .select()
    .single();
  messages.push(fileMessage);
}

// 텍스트 메시지 생성 (동일한 타임스탬프)
if (content && content.trim()) {
  const { data: textMessage, error } = await supabase
    .from("messages")
    .insert({
      ...textData,
      created_at: batchTimestamp,  // 동일한 타임스탬프
    })
    .select()
    .single();
  messages.push(textMessage);
}
```

**권장 방법:** 파일 먼저 생성, 텍스트 나중에 생성 (더 단순하고 명확)

---

#### 주의할 점

1. **트랜잭션 고려**
   - 파일 업로드 실패 시 텍스트 메시지도 롤백 필요
   - 현재는 각각 독립적으로 생성되므로 부분 실패 가능
   - 향후 트랜잭션 도입 고려

2. **Realtime 반영**
   - 파일 메시지가 먼저 표시되고 텍스트가 나중에 표시됨
   - 사용자 경험상 자연스러움

3. **정렬 순서**
   - `created_at` 기준 정렬이므로 생성 순서가 중요
   - 파일을 먼저 생성하면 파일이 먼저 표시됨

---

#### 예상 작업 시간
- 30분 (함수 내부 로직 순서만 변경)

---

## 📊 전체 작업 일정

| 항목 | 예상 시간 | 우선순위 |
|------|----------|----------|
| 1. 메시지 전송 후 포커스 | 30분 | 높음 |
| 2. 메시지/파일 삭제 기능 | 4시간 | 중간 |
| 3. 파일+텍스트 표시 순서 | 30분 | 낮음 |
| **총계** | **약 5시간** | - |

---

## 🔄 구현 순서 권장

1. **1단계: 메시지 전송 후 포커스** (가장 간단, 즉시 효과)
2. **2단계: 파일+텍스트 표시 순서** (간단한 변경)
3. **3단계: 메시지/파일 삭제 기능** (가장 복잡, DB 변경 필요)

---

## ⚠️ 추가 확인 사항

### Storage RLS 정책 확인 완료 ✅

Storage bucket의 RLS 정책이 이미 올바르게 설정되어 있습니다.

**확인된 정책:**
- `task_files_delete`: 본인이 업로드한 파일만 삭제 가능
- 파일 경로에서 `userId` 추출하여 권한 확인
- 추가 정책 변경 불필요

---

### Realtime 성능 고려

메시지 삭제 시 UPDATE 이벤트가 발생하므로, Realtime 구독 성능에 큰 영향은 없습니다.

---

## ✅ 승인 대기 사항

1. **삭제 방식 선택**
   - [ ] Soft Delete (권장)
   - [ ] Hard Delete

2. **삭제 확인 다이얼로그**
   - [ ] 필요함
   - [ ] 불필요함 (즉시 삭제)

3. **구현 순서 확인**
   - [ ] 위 순서대로 진행
   - [ ] 다른 순서 제안

---

## 📝 참고 사항

- 모든 변경사항은 기존 기능에 영향을 주지 않도록 주의
- Realtime 구독은 기존 구조 유지
- 타입 정의는 `database.type.ts`에 추가
- 마이그레이션은 `supabase/migrations/` 디렉토리에 추가

---

**작성일:** 2025-01-XX  
**작성자:** AI Assistant  
**상태:** 승인 대기

