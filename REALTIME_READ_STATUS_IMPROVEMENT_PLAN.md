# 실시간 읽음 처리 개선 계획서

## 📋 개요

현재 읽음 처리는 페이지 로드/새로고침 시에만 발생합니다. 이를 **실시간으로 채팅 화면을 보고 있는 상태**에서 상대방 메시지가 도착하면 즉시 읽음 처리가 되도록 개선합니다.

---

## 🎯 요구사항

### 현재 동작 (문제점)
- ❌ 상대방 메시지 도착 후 페이지 새로고침 시 읽음 처리
- ❌ 실시간으로 메시지를 보고 있어도 읽음 처리 안 됨
- ❌ 사용자가 채팅 화면에 있는지 실시간으로 추적하지 않음

### 목표 동작
- ✅ 채팅 화면을 보고 있는 상태에서 상대방 메시지 도착 시 즉시 읽음 처리
- ✅ 실시간으로 채팅 화면에 사용자가 존재함을 추적 (Presence)
- ✅ Typing indicator와 유사한 방식으로 Presence 관리

---

## 🔍 현재 구현 분석

### 읽음 처리 트리거 시점
**위치:** `src/pages/task-detail-page.tsx` (79-84줄)

```typescript
// 채팅 화면 진입 시 모든 메시지 읽음 처리
useEffect(() => {
  if (taskId && currentUserId) {
    markMessagesAsRead.mutate(taskId);
  }
}, [taskId, currentUserId]);
```

**문제점:**
- `taskId` 또는 `currentUserId`가 변경될 때만 실행
- 페이지 로드/새로고침 시에만 동작
- 실시간 메시지 도착 시 읽음 처리 안 됨

### Realtime 구독 구조
**위치:** `src/hooks/queries/use-realtime-messages.ts`

**현재 기능:**
- ✅ 메시지 INSERT/UPDATE/DELETE 이벤트 구독
- ✅ 이벤트 수신 시 쿼리 무효화하여 최신 데이터 가져오기
- ❌ 읽음 처리 로직 없음

### Typing Indicator 구조 (참고)
**위치:** `src/hooks/queries/use-typing-indicator.ts`

**구조:**
- Realtime Broadcast 사용
- `typing:${taskId}` 채널로 입력 중 상태 공유
- `sendTyping()`, `stopTyping()` 함수 제공

---

## 📐 설계 방안

### 옵션 A: Presence 기반 실시간 읽음 처리 (권장)

#### 개념
- **Presence**: 사용자가 채팅 화면에 있는지 실시간으로 추적
- Typing indicator와 유사한 방식으로 Presence 상태 관리
- 새 메시지 도착 시, 현재 사용자가 Presence 상태이면 즉시 읽음 처리

#### 동작 흐름

```
1. 사용자가 채팅 화면 진입
   → Presence 상태 활성화 (Broadcast)
   → 기존 메시지 읽음 처리 (초기 로드)

2. 사용자가 채팅 화면에 있는 동안
   → Presence 상태 유지 (Heartbeat 또는 지속적 Broadcast)
   → 상대방이 메시지 전송 시 Realtime 이벤트 수신
   → 현재 사용자가 Presence 상태이면 즉시 읽음 처리

3. 사용자가 채팅 화면 이탈
   → Presence 상태 비활성화 (Broadcast)
   → 이후 도착하는 메시지는 읽음 처리 안 됨
```

#### 구현 구조

**1. Presence 훅 생성**
- `useChatPresence(taskId, enabled)` 훅 생성
- Realtime Broadcast로 Presence 상태 공유
- Heartbeat 메커니즘으로 상태 유지

**2. 실시간 읽음 처리 로직**
- `useRealtimeMessages` 훅에서 새 메시지 INSERT 이벤트 감지
- 현재 사용자가 Presence 상태인지 확인
- Presence 상태이면 즉시 `markMessageAsRead` 호출

**3. 초기 로드 시 읽음 처리**
- 기존 로직 유지 (페이지 진입 시 모든 메시지 읽음 처리)

---

### 옵션 B: 메시지 도착 시 자동 읽음 처리 (간단하지만 제한적)

#### 개념
- 새 메시지가 도착하면 무조건 읽음 처리
- Presence 추적 없이 단순하게 구현

#### 문제점
- 사용자가 다른 탭을 보고 있어도 읽음 처리됨
- 사용자가 채팅 화면을 떠난 상태에서도 읽음 처리됨
- 요구사항과 맞지 않음

**결론: 옵션 A (Presence 기반) 권장**

---

## 🔧 상세 설계

### 1. Presence 추적 메커니즘

#### 1.1. Presence 훅 구조

**파일:** `src/hooks/queries/use-chat-presence.ts` (신규)

**기능:**
- Realtime Broadcast로 Presence 상태 공유
- Heartbeat로 상태 유지 (주기적 Broadcast)
- 페이지 이탈/비활성화 시 Presence 해제

**API:**
```typescript
export function useChatPresence(
  taskId: string | undefined,
  enabled: boolean = true
): {
  isPresent: boolean; // 현재 사용자가 Presence 상태인지
  activeUsers: string[]; // 현재 채팅 화면에 있는 사용자 목록
}
```

**채널:**
- 채널명: `presence:${taskId}`
- 이벤트: `presence-update`, `presence-leave`
- Payload: `{ userId, userName, timestamp }`

#### 1.2. Heartbeat 메커니즘

**방식:**
- 30초마다 Presence 상태 Broadcast
- 마지막 Broadcast로부터 60초 이상 경과 시 자동으로 Presence 해제
- 페이지 visibility change 이벤트로 즉시 해제 가능

**구현:**
```typescript
// 30초마다 Presence 상태 갱신
useEffect(() => {
  const interval = setInterval(() => {
    if (isPresent) {
      broadcastPresence();
    }
  }, 30000); // 30초

  return () => clearInterval(interval);
}, [isPresent]);
```

#### 1.3. 페이지 이탈 감지

**이벤트:**
- `visibilitychange`: 탭 전환 감지
- `beforeunload`: 페이지 닫기 감지
- React Router `useEffect` cleanup: 라우트 변경 감지

**동작:**
- 페이지가 비활성화되면 즉시 Presence 해제
- 페이지가 다시 활성화되면 Presence 재활성화

---

### 2. 실시간 읽음 처리 로직

#### 2.1. 메시지 INSERT 이벤트 감지

**위치:** `src/hooks/queries/use-realtime-messages.ts` 수정

**추가 기능:**
- INSERT 이벤트 감지 시 새 메시지 ID 추출
- 현재 사용자가 Presence 상태인지 확인
- Presence 상태이면 즉시 읽음 처리

**구현:**
```typescript
.on(
  "postgres_changes",
  {
    event: "INSERT",
    schema: "public",
    table: "messages",
    filter: `task_id=eq.${taskId}`,
  },
  async (payload: RealtimePostgresChangesPayload<any>) => {
    const newMessage = payload.new;
    
    // 현재 사용자가 Presence 상태이고, 상대방 메시지인 경우
    if (isPresent && newMessage.user_id !== currentUserId) {
      // 즉시 읽음 처리
      await markMessageAsRead(newMessage.id);
    }
    
    // 쿼리 무효화 (기존 로직)
    queryClient.invalidateQueries({ queryKey: ["messages", taskId] });
  }
)
```

#### 2.2. 읽음 처리 함수

**위치:** `src/api/message.ts` (기존 함수 활용)

**사용 함수:**
- `markMessageAsRead(messageId)`: 단일 메시지 읽음 처리
- 기존 함수 그대로 사용 가능

**주의사항:**
- assigner/assignee 체크는 함수 내부에서 처리됨 (기존 로직 유지)

---

### 3. 초기 로드 시 읽음 처리 (기존 로직 유지)

**위치:** `src/pages/task-detail-page.tsx`

**동작:**
- 페이지 진입 시 모든 메시지 읽음 처리
- Presence 활성화와 함께 실행

**변경 사항:**
- 기존 로직 유지
- Presence 활성화 후 실행하도록 순서 조정

---

## 📊 데이터 흐름

### 시나리오 1: 사용자 A가 채팅 화면에 있는 상태에서 사용자 B가 메시지 전송

```
1. 사용자 A: 채팅 화면 진입
   → Presence 활성화 (Broadcast)
   → 기존 메시지 읽음 처리

2. 사용자 B: 메시지 전송
   → DB에 메시지 INSERT
   → Realtime INSERT 이벤트 발생

3. 사용자 A: INSERT 이벤트 수신
   → 현재 사용자가 Presence 상태인지 확인 ✅
   → markMessageAsRead(newMessage.id) 호출
   → read_by 배열에 사용자 A ID 추가
   → Realtime UPDATE 이벤트 발생

4. 사용자 B: UPDATE 이벤트 수신
   → 메시지 목록 갱신
   → "읽음" 표시 즉시 반영
```

### 시나리오 2: 사용자 A가 다른 탭을 보고 있는 상태에서 사용자 B가 메시지 전송

```
1. 사용자 A: 다른 탭으로 전환
   → visibilitychange 이벤트 발생
   → Presence 비활성화 (Broadcast)

2. 사용자 B: 메시지 전송
   → DB에 메시지 INSERT
   → Realtime INSERT 이벤트 발생

3. 사용자 A: INSERT 이벤트 수신
   → 현재 사용자가 Presence 상태인지 확인 ❌
   → 읽음 처리 안 함

4. 사용자 A: 채팅 탭으로 다시 전환
   → visibilitychange 이벤트 발생
   → Presence 재활성화
   → 기존 메시지 읽음 처리 (초기 로드 로직)
```

---

## 🗄️ 데이터베이스 변경 사항

### 변경 불필요

**이유:**
- 기존 `read_by` JSONB 배열 구조 유지
- 기존 `mark_message_as_read` 함수 그대로 사용
- 기존 `mark_task_messages_as_read` 함수 그대로 사용

**확인:**
- ✅ `messages.read_by` 필드: 변경 불필요
- ✅ `mark_message_as_read` 함수: 변경 불필요
- ✅ `mark_task_messages_as_read` 함수: 변경 불필요

---

## 📁 파일 변경 계획

### 신규 파일

1. **`src/hooks/queries/use-chat-presence.ts`**
   - Presence 추적 훅
   - Realtime Broadcast로 Presence 상태 관리
   - Heartbeat 메커니즘 구현

### 수정 파일

2. **`src/hooks/queries/use-realtime-messages.ts`**
   - INSERT 이벤트 핸들러 추가
   - Presence 상태 확인 로직 추가
   - 새 메시지 도착 시 읽음 처리 로직 추가

3. **`src/pages/task-detail-page.tsx`**
   - `useChatPresence` 훅 통합
   - 초기 로드 시 읽음 처리 순서 조정

### 변경 불필요 파일

- `src/api/message.ts`: 기존 함수 그대로 사용
- `src/hooks/mutations/use-message.ts`: 기존 훅 그대로 사용
- DB 마이그레이션: 변경 불필요

---

## 🔄 Realtime 이벤트 구조

### 1. Presence Broadcast 이벤트

**채널:** `presence:${taskId}`

**이벤트 타입:**
- `presence-update`: Presence 상태 갱신
- `presence-leave`: Presence 상태 해제

**Payload:**
```typescript
{
  userId: string;
  userName: string;
  timestamp: string; // ISO 8601
}
```

**주기:**
- 초기 활성화 시 즉시 Broadcast
- 이후 30초마다 Heartbeat Broadcast
- 페이지 이탈 시 즉시 `presence-leave` Broadcast

### 2. 메시지 변경 이벤트 (기존)

**채널:** `messages:${taskId}`

**이벤트 타입:**
- `INSERT`: 새 메시지 도착
- `UPDATE`: 메시지 수정 (읽음 처리 포함)
- `DELETE`: 메시지 삭제

**필터:**
- `task_id=eq.${taskId}`

---

## ⚠️ 주의사항 및 고려사항

### 1. 성능 고려

**Presence Broadcast 빈도:**
- 30초마다 Broadcast는 적절한 빈도
- 너무 자주 Broadcast하면 서버 부하 증가
- 너무 드물게 Broadcast하면 정확도 감소

**최적화 방안:**
- Broadcast는 현재 채팅 화면에 있는 사용자에게만 전송
- 불필요한 Broadcast 최소화

### 2. 네트워크 오류 처리

**시나리오:**
- 네트워크 연결 끊김
- Realtime 구독 실패

**처리 방안:**
- Presence Broadcast 실패 시 재시도
- Realtime 구독 실패 시 기존 로직(페이지 로드 시 읽음 처리)으로 폴백

### 3. 동시성 처리

**시나리오:**
- 여러 탭에서 동일 채팅 화면 열기
- 한 탭에서 Presence 활성화, 다른 탭에서 비활성화

**처리 방안:**
- 각 탭은 독립적으로 Presence 관리
- 마지막 활성화된 탭이 Presence 상태 유지
- 모든 탭이 비활성화되면 Presence 해제

### 4. 읽음 처리 정확도

**시나리오:**
- 사용자가 채팅 화면을 보고 있지만 스크롤하지 않음
- 메시지가 화면 밖에 있어서 실제로 보지 못함

**현재 설계:**
- 화면에 있는지만 확인 (스크롤 위치는 확인하지 않음)
- Typing indicator와 동일한 수준의 정확도

**향후 개선 가능:**
- Intersection Observer로 메시지가 실제로 보이는지 확인
- 현재는 단순화하여 구현

---

## 📋 구현 순서

### 1단계: Presence 훅 구현
1. `use-chat-presence.ts` 파일 생성
2. Realtime Broadcast로 Presence 상태 관리
3. Heartbeat 메커니즘 구현
4. 페이지 이탈 감지 구현

### 2단계: 실시간 읽음 처리 로직 구현
1. `use-realtime-messages.ts` 수정
2. INSERT 이벤트 핸들러 추가
3. Presence 상태 확인 로직 추가
4. 새 메시지 도착 시 읽음 처리 로직 추가

### 3단계: 통합 및 테스트
1. `task-detail-page.tsx`에 Presence 훅 통합
2. 초기 로드 시 읽음 처리 순서 조정
3. 테스트 시나리오 검증

---

## ✅ 검증 항목

### 기능 검증

1. **Presence 활성화/비활성화**
   - [ ] 채팅 화면 진입 시 Presence 활성화
   - [ ] 페이지 이탈 시 Presence 비활성화
   - [ ] 탭 전환 시 Presence 상태 변경

2. **실시간 읽음 처리**
   - [ ] 채팅 화면에 있는 상태에서 상대방 메시지 도착 시 즉시 읽음 처리
   - [ ] 다른 탭을 보고 있을 때는 읽음 처리 안 됨
   - [ ] 읽음 처리 후 상대방 화면에 "읽음" 표시 즉시 반영

3. **초기 로드 시 읽음 처리**
   - [ ] 페이지 진입 시 기존 메시지 읽음 처리
   - [ ] Presence 활성화와 함께 실행

### 성능 검증

1. **Presence Broadcast 빈도**
   - [ ] 30초마다 Heartbeat Broadcast
   - [ ] 불필요한 Broadcast 최소화

2. **네트워크 오류 처리**
   - [ ] 네트워크 연결 끊김 시 재시도
   - [ ] Realtime 구독 실패 시 폴백

---

## 📝 요약

### 핵심 변경 사항

1. **Presence 추적 메커니즘 추가**
   - Realtime Broadcast로 사용자 Presence 상태 관리
   - Heartbeat로 상태 유지
   - 페이지 이탈 감지

2. **실시간 읽음 처리 로직 추가**
   - 새 메시지 INSERT 이벤트 감지
   - Presence 상태 확인 후 즉시 읽음 처리

3. **기존 로직 유지**
   - 초기 로드 시 읽음 처리 유지
   - DB 함수 및 구조 변경 불필요

### 예상 효과

- ✅ 사용자가 채팅 화면에 있는 상태에서 상대방 메시지 도착 시 즉시 읽음 처리
- ✅ 실시간으로 읽음 상태 반영
- ✅ Typing indicator와 유사한 수준의 실시간성

---

**작성일:** 2026-01-05  
**상태:** 설계 완료, 구현 대기


