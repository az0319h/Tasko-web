# 읽음 처리 기능 변경으로 인한 영향 범위 분석

## 🚨 문제 상황

프로젝트 전체 기능이 정상 동작하지 않는 상태로 보고됨.

---

## 📋 변경 사항 요약

### 1. DB 함수 변경
- `mark_message_as_read`: assigner/assignee 체크 추가
- `mark_task_messages_as_read`: assigner/assignee 체크 추가

### 2. API 레이어 변경
- `isMessageReadByCounterpart` 함수 추가
- `task` 정보를 파라미터로 받음

### 3. UI 레이어 변경
- `isMessageRead` 함수가 `task` 정보를 참조하도록 변경
- 읽음 표시를 "✓✓" → "읽음" 텍스트로 변경

---

## 🔍 잠재적 문제점 분석

### 문제 1: `task` 참조 시점 문제 ⚠️ **가능성 높음**

**위치:** `src/pages/task-detail-page.tsx` 375-381줄

**문제:**
```typescript
const isMessageRead = (message: MessageWithProfile): boolean => {
  if (!currentUserId || !task) return false;
  return isMessageReadByCounterpart(message, currentUserId, {
    assigner_id: task.assigner_id,
    assignee_id: task.assignee_id,
  });
};
```

**잠재적 시나리오:**
1. `messages.map`이 실행되는 시점에 `task`가 아직 로딩 중일 수 있음
2. React의 렌더링 사이클에서 `task`가 일시적으로 `null`이 될 수 있음
3. `task`가 없을 때 `task.assigner_id` 접근 시 에러 발생

**현재 방어 코드:**
- `if (!currentUserId || !task) return false;` 체크가 있음
- 하지만 `messages.map` 내부에서 호출될 때 `task`가 없을 수 있음

---

### 문제 2: `readBy` 배열 타입 불일치 ⚠️ **가능성 있음**

**위치:** `src/api/message.ts` 265줄

**문제:**
```typescript
return readBy.includes(counterpartId);
```

**잠재적 시나리오:**
- `readBy` 배열에 저장된 값: `reader_id::text` (문자열)
- `counterpartId`: UUID (문자열)
- 하지만 타입 변환이나 비교 로직에서 문제가 발생할 수 있음

**확인 필요:**
- `readBy` 배열의 실제 타입
- `counterpartId`의 타입
- 비교 로직 정확성

---

### 문제 3: DB 함수에서 에러 발생 시 전체 시스템 영향 ⚠️ **가능성 낮음**

**위치:** `mark_task_messages_as_read` 함수

**문제:**
- 함수 내부에서 에러가 발생하면 읽음 처리가 실패
- 하지만 이는 읽음 처리만 실패하고 다른 기능에는 영향 없어야 함

**확인 필요:**
- 함수 실행 시 에러 로그 확인
- 에러가 발생해도 다른 기능에 영향이 없는지 확인

---

### 문제 4: UI 렌더링 시 에러로 인한 전체 페이지 멈춤 ⚠️ **가능성 높음**

**위치:** `src/pages/task-detail-page.tsx` 755줄

**문제:**
```typescript
{isMine && isMessageRead(message) && (
  <span className="text-xs text-muted-foreground">
    읽음
  </span>
)}
```

**잠재적 시나리오:**
- `isMessageRead(message)` 호출 시 에러 발생
- React 렌더링 중 에러로 인해 전체 컴포넌트가 크래시
- 에러 바운더리가 없으면 전체 페이지가 멈춤

---

## 🎯 즉시 확인 필요 사항

### 1. 브라우저 콘솔 에러 확인
- JavaScript 런타임 에러 확인
- React 렌더링 에러 확인

### 2. 네트워크 요청 확인
- API 호출 실패 여부
- DB 함수 호출 실패 여부

### 3. 코드 실행 흐름 확인
- `task`가 로딩되는 시점
- `messages.map`이 실행되는 시점
- `isMessageRead`가 호출되는 시점

---

## 🔧 즉시 수정 가능한 방어 코드

### 수정 1: `isMessageRead` 함수 안전성 강화

**현재 코드:**
```typescript
const isMessageRead = (message: MessageWithProfile): boolean => {
  if (!currentUserId || !task) return false;
  return isMessageReadByCounterpart(message, currentUserId, {
    assigner_id: task.assigner_id,
    assignee_id: task.assignee_id,
  });
};
```

**개선 코드:**
```typescript
const isMessageRead = (message: MessageWithProfile): boolean => {
  if (!currentUserId || !task || !task.assigner_id || !task.assignee_id) {
    return false;
  }
  try {
    return isMessageReadByCounterpart(message, currentUserId, {
      assigner_id: task.assigner_id,
      assignee_id: task.assignee_id,
    });
  } catch (error) {
    console.error("읽음 상태 확인 중 에러:", error);
    return false;
  }
};
```

### 수정 2: `isMessageReadByCounterpart` 함수 타입 안전성 강화

**현재 코드:**
```typescript
return readBy.includes(counterpartId);
```

**개선 코드:**
```typescript
// 타입 안전성 강화
const readByArray = Array.isArray(readBy) ? readBy : [];
const counterpartIdStr = String(counterpartId);
return readByArray.some((id) => String(id) === counterpartIdStr);
```

---

## 📊 영향 범위

### 직접 영향 받는 기능
1. ✅ Task 상세 페이지 - 읽음 표시
2. ✅ 채팅 메시지 렌더링
3. ⚠️ 메시지 읽음 처리 (DB 함수)

### 간접 영향 받을 수 있는 기능
1. ⚠️ 전체 페이지 렌더링 (에러로 인한 크래시 시)
2. ⚠️ 다른 페이지 (에러 전파 시)

---

## 🚨 즉시 조치 사항

1. **방어 코드 추가** (try-catch, null 체크 강화)
2. **에러 로그 확인** (브라우저 콘솔, 서버 로그)
3. **롤백 준비** (필요 시 마이그레이션 롤백)

---

**분석일:** 2025-01-XX  
**상태:** 문제 원인 분석 중


