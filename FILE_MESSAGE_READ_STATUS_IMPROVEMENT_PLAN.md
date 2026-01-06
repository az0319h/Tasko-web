# FILE 메시지 읽음 처리 개선 계획서

## 📋 현재 상황 분석

### ✅ 정상 동작하는 부분
1. **DB 스키마**: `read_by` 컬럼이 이미 존재하며, FILE 메시지도 포함됨
2. **백엔드 함수**: `mark_task_messages_as_read` 함수는 message_type을 구분하지 않고 모든 메시지에 대해 동작
3. **읽음 처리 로직**: 채팅 화면 진입 시 모든 메시지(USER, FILE, SYSTEM)에 대해 읽음 처리가 실행됨
4. **읽음 상태 확인**: `isMessageReadByCounterpart` 함수는 message_type을 구분하지 않고 `read_by` 배열만 확인

### ❌ 문제점
**프론트엔드 UI 렌더링**: FILE 메시지에 읽음 표시가 없음
- USER 메시지: 시간 + "읽음" 표시 (816-820줄)
- FILE 메시지: 시간만 표시 (759-761줄)

## 🔍 상세 분석

### 1. DB 스키마 분석

#### 현재 상태
```sql
-- messages 테이블 구조
- id: UUID (PK)
- task_id: UUID
- user_id: UUID
- content: TEXT
- message_type: message_type enum ('USER' | 'SYSTEM' | 'FILE')
- read_by: JSONB DEFAULT '[]'  -- ✅ 이미 존재
- file_url: TEXT                -- ✅ FILE 메시지용 컬럼 존재
- file_name: TEXT
- file_type: TEXT
- file_size: BIGINT
- created_at: TIMESTAMPTZ
- deleted_at: TIMESTAMPTZ
```

**결론**: ✅ **DB 스키마 수정 불필요**
- `read_by` 컬럼이 이미 존재하며 FILE 메시지도 동일하게 처리됨
- 추가 컬럼(`read_at`, `read_by` 등) 불필요

### 2. 백엔드 함수 분석

#### `mark_task_messages_as_read` 함수
```sql
-- 현재 구현 (20250101000026_update_message_read_functions_assigner_assignee_only.sql)
UPDATE public.messages
SET read_by = COALESCE(read_by, '[]'::jsonb) || jsonb_build_array(reader_id::text)
WHERE task_id = task_id_param
  AND deleted_at IS NULL
  AND (
    (is_reader_assigner AND user_id = task_record.assignee_id) OR
    (is_reader_assignee AND user_id = task_record.assigner_id)
  )
  AND NOT (read_by ? reader_id::text);
```

**분석**:
- ✅ message_type 조건이 없음 → 모든 타입(USER, FILE, SYSTEM)에 대해 동작
- ✅ FILE 메시지도 정상적으로 읽음 처리됨

**결론**: ✅ **백엔드 함수 수정 불필요**

### 3. RLS 정책 분석

#### 현재 RLS 정책
```sql
-- UPDATE 정책 (20250101000008_create_rls_policies_messages.sql)
CREATE POLICY "messages_update_own_user_messages"
ON public.messages
FOR UPDATE
USING (
  auth.uid() = user_id
  AND message_type = 'USER'  -- ⚠️ USER만 허용
)
```

**분석**:
- ⚠️ RLS 정책은 `message_type = 'USER'`만 UPDATE 허용
- ✅ 하지만 읽음 처리는 `SECURITY DEFINER` 함수를 통해 수행되므로 RLS를 우회함
- ✅ 실제로 FILE 메시지도 읽음 처리가 정상 동작함 (함수 내부에서 직접 UPDATE)

**결론**: ✅ **RLS 정책 수정 불필요**
- 읽음 처리는 함수를 통해 수행되므로 RLS 정책의 영향을 받지 않음
- 다만, 향후 직접 UPDATE가 필요한 경우를 대비해 FILE 타입도 허용하도록 수정 가능 (선택사항)

### 4. Storage 정책 분석

**분석**:
- 읽음 처리는 `read_by` 컬럼 업데이트만 필요
- Storage와는 무관함

**결론**: ✅ **Storage 정책 수정 불필요**

### 5. 프론트엔드 분석

#### 현재 구현
```typescript
// USER 메시지 렌더링 (816-820줄)
{isMine && isMessageRead(message) && (
  <span className="text-xs text-muted-foreground">
    읽음
  </span>
)}

// FILE 메시지 렌더링 (759-761줄)
<span className="text-xs text-muted-foreground mt-1 px-1">
  {formatMessageTime(message.created_at)}
</span>
// ⚠️ 읽음 표시 없음
```

**문제점**:
- FILE 메시지 렌더링 부분에 읽음 표시가 없음
- `isMessageRead` 함수는 이미 message_type을 구분하지 않고 동작함

**결론**: ❌ **프론트엔드 수정 필요**
- FILE 메시지 렌더링 부분에 읽음 표시 추가 필요

## 🎯 구현 계획

### 수정 포인트 요약

| 구분 | 수정 필요 여부 | 이유 |
|------|---------------|------|
| **DB 스키마** | ❌ 불필요 | `read_by` 컬럼 이미 존재 |
| **백엔드 함수** | ❌ 불필요 | 이미 모든 메시지 타입 지원 |
| **RLS 정책** | ⚠️ 선택사항 | 함수를 통해 우회하므로 필수 아님 |
| **Storage 정책** | ❌ 불필요 | Storage와 무관 |
| **프론트엔드** | ✅ **필수** | UI에 읽음 표시 추가 필요 |

### 구현 단계

#### 1단계: 프론트엔드 수정 (필수)

**파일**: `src/pages/task-detail-page.tsx`

**수정 위치**: FILE 메시지 렌더링 부분 (759-761줄)

**수정 내용**:
```typescript
// 현재 코드
<span className="text-xs text-muted-foreground mt-1 px-1">
  {formatMessageTime(message.created_at)}
</span>

// 수정 후 코드
<div className="flex items-center gap-1 mt-1 px-1">
  <span className="text-xs text-muted-foreground">
    {formatMessageTime(message.created_at)}
  </span>
  {/* 읽음 표시 (본인이 보낸 메시지만) */}
  {isMine && isMessageRead(message) && (
    <span className="text-xs text-muted-foreground">
      읽음
    </span>
  )}
</div>
```

**변경 사항**:
- 단일 `<span>` → `<div>` + `flex` 레이아웃으로 변경
- USER 메시지와 동일한 읽음 표시 로직 추가
- `isMine && isMessageRead(message)` 조건으로 읽음 표시

**예상 코드 라인 수**: 약 5-7줄 추가/수정

#### 2단계: RLS 정책 개선 (선택사항, 권장)

**파일**: `supabase/migrations/[새마이그레이션].sql`

**수정 내용**:
```sql
-- 기존 정책 삭제
DROP POLICY IF EXISTS "messages_update_own_user_messages" ON public.messages;

-- 새로운 정책 생성 (USER + FILE 허용)
CREATE POLICY "messages_update_own_user_file_messages"
ON public.messages
FOR UPDATE
USING (
  auth.uid() = user_id
  AND message_type IN ('USER', 'FILE')  -- FILE 추가
)
WITH CHECK (
  auth.uid() = user_id
  AND message_type IN ('USER', 'FILE')  -- FILE 추가
);
```

**이유**:
- 현재는 함수를 통해 우회하지만, 향후 직접 UPDATE가 필요한 경우를 대비
- 일관성 있는 정책 유지

**주의사항**:
- 이 변경은 필수가 아니며, 현재 동작에는 영향 없음
- 선택적으로 적용 가능

#### 3단계: DELETE 정책 개선 (선택사항, 권장)

**파일**: `supabase/migrations/[새마이그레이션].sql`

**수정 내용**:
```sql
-- 기존 정책 삭제
DROP POLICY IF EXISTS "messages_delete_own_user_messages" ON public.messages;

-- 새로운 정책 생성 (USER + FILE 허용)
CREATE POLICY "messages_delete_own_user_file_messages"
ON public.messages
FOR DELETE
USING (
  auth.uid() = user_id
  AND message_type IN ('USER', 'FILE')  -- FILE 추가
);
```

**이유**:
- 현재 코드에서 FILE 메시지도 삭제 가능하도록 구현되어 있음
- RLS 정책과 실제 동작을 일치시킴

## 📊 구현 난이도 및 예상 시간

### 난이도 평가

| 작업 | 난이도 | 예상 시간 | 우선순위 |
|------|--------|----------|---------|
| **프론트엔드 UI 수정** | **하** | **10-15분** | **필수** |
| RLS 정책 개선 (UPDATE) | 하 | 5-10분 | 선택 |
| RLS 정책 개선 (DELETE) | 하 | 5-10분 | 선택 |

**전체 예상 시간**:
- **최소 (필수 작업만)**: 10-15분
- **권장 (정책 개선 포함)**: 20-30분

### 난이도 상세 분석

#### 프론트엔드 수정 (난이도: 하)
- ✅ 기존 코드 패턴 그대로 복사
- ✅ USER 메시지와 동일한 로직 적용
- ✅ 복잡한 로직 없음
- ✅ 테스트 용이 (UI 확인만)

#### RLS 정책 개선 (난이도: 하)
- ✅ 기존 정책 삭제 후 재생성
- ✅ 단순히 `'USER'` → `IN ('USER', 'FILE')` 변경
- ✅ 마이그레이션 파일 생성만 필요

## 🛠️ MCP 서버 활용 가능 여부

### Supabase MCP 서버
- ✅ **활용 가능**: `apply_migration` 함수로 RLS 정책 수정 가능
- ✅ **활용 가능**: `execute_sql` 함수로 테스트 쿼리 실행 가능
- ✅ **활용 가능**: `get_advisors` 함수로 보안/성능 이슈 확인 가능

### Context7 MCP 서버
- ⚠️ **불필요**: 이 작업은 기존 코드 수정이므로 문서 참조 불필요

## 📝 구현 체크리스트

### 필수 작업
- [ ] `src/pages/task-detail-page.tsx` 파일 수정
  - [ ] FILE 메시지 렌더링 부분에 읽음 표시 추가
  - [ ] USER 메시지와 동일한 스타일 적용
- [ ] 테스트
  - [ ] FILE 메시지 전송 후 읽음 표시 확인
  - [ ] 상대방이 읽지 않은 경우 "읽음" 표시 안 됨 확인
  - [ ] 상대방이 읽은 경우 "읽음" 표시 확인

### 선택 작업 (권장)
- [ ] RLS 정책 개선 마이그레이션 생성
  - [ ] UPDATE 정책에 FILE 타입 추가
  - [ ] DELETE 정책에 FILE 타입 추가
- [ ] 마이그레이션 테스트
  - [ ] 직접 UPDATE 쿼리 테스트 (선택사항)
  - [ ] 직접 DELETE 쿼리 테스트 (이미 동작 확인됨)

## 🔍 검증 방법

### 1. 기능 테스트
1. 사용자 A가 FILE 메시지 전송
2. 사용자 B가 채팅 화면 진입
3. 사용자 A 화면에서 "읽음" 표시 확인

### 2. 코드 검증
```typescript
// FILE 메시지 렌더링 부분 확인
if (message.message_type === "FILE") {
  // ... 기존 코드 ...
  
  // ✅ 읽음 표시 추가 확인
  {isMine && isMessageRead(message) && (
    <span className="text-xs text-muted-foreground">
      읽음
    </span>
  )}
}
```

### 3. DB 검증 (선택사항)
```sql
-- FILE 메시지의 read_by 확인
SELECT 
  id,
  message_type,
  file_name,
  read_by
FROM messages
WHERE message_type = 'FILE'
ORDER BY created_at DESC
LIMIT 5;
```

## ⚠️ 주의사항

1. **기존 로직 유지**: TEXT 메시지 읽음 처리 로직은 그대로 유지
2. **스타일 일관성**: USER 메시지와 동일한 스타일 적용
3. **조건 확인**: `isMine && isMessageRead(message)` 조건 정확히 적용
4. **테스트**: 실제 두 사용자로 테스트하여 읽음 표시 정상 동작 확인

## 📌 결론

### 핵심 요약
1. **DB 스키마**: 수정 불필요 ✅
2. **백엔드 함수**: 수정 불필요 ✅
3. **RLS 정책**: 선택적 개선 가능 (현재 동작에는 영향 없음) ⚠️
4. **Storage 정책**: 수정 불필요 ✅
5. **프론트엔드**: **수정 필수** ❌ → ✅

### 최종 권장사항
- **즉시 적용**: 프론트엔드 UI 수정 (10-15분)
- **향후 개선**: RLS 정책 개선 (5-10분, 선택사항)

### 구현 난이도
- **전체 난이도**: **하 (Low)**
- **예상 작업 시간**: **10-30분** (필수 작업만: 10-15분)

### MCP 서버 활용
- ✅ **Supabase MCP**: 마이그레이션 적용 및 테스트에 활용 가능
- ⚠️ **Context7 MCP**: 불필요

---

**작성일**: 2025-01-XX  
**작성자**: AI Assistant  
**검토 상태**: 대기 중


