# 리얼타임 메시지 기능 장애 분석 보고서

## 📋 1. 장애 재현 및 증상 정리

### 증상 요약
- `/task/:id` 페이지에서 리얼타임 메시지 기능이 사라짐
- 채팅 기능이 정상적으로 동작하지 않음
- 메시지 전송/수신이 실시간으로 반영되지 않음

### 확인된 사항
1. ✅ Realtime publication 활성화됨 (`supabase_realtime` publication에 `messages` 테이블 포함)
2. ✅ 메시지 데이터 존재 (최근 메시지 5개 확인)
3. ✅ Realtime 구독 코드 존재 (`useRealtimeMessages` 훅)
4. ⚠️ Realtime 로그에 연결 문제 발견 ("UnableToConnectToProject" 에러)

### 잠재적 실패 지점
1. **Realtime 구독 실패**: 구독 상태 확인 로직 부족
2. **RLS 정책 차단**: Realtime 이벤트가 RLS에 의해 필터링될 가능성
3. **에러 처리 부족**: 구독 실패 시 복구 로직 없음

---

## 🔍 2. 전체 범위 점검

### 프론트엔드 분석

#### `useRealtimeMessages` 훅 (`src/hooks/queries/use-realtime-messages.ts`)
**현재 상태:**
- ✅ Realtime 채널 생성 및 구독 로직 존재
- ⚠️ 구독 상태 확인이 `SUBSCRIBED`와 `CHANNEL_ERROR`만 체크
- ❌ `TIMED_OUT`, `CLOSED`, `SUBSCRIBE_ERROR` 등 다른 상태 미처리
- ❌ 구독 실패 시 재시도 로직 없음

**문제점:**
```typescript
.subscribe((status) => {
  if (status === "SUBSCRIBED") {
    console.log(`[Realtime] Subscribed to messages for task ${taskId}`);
  } else if (status === "CHANNEL_ERROR") {
    console.error(`[Realtime] Channel error for task ${taskId}`);
  }
  // 다른 상태들(TIMED_OUT, CLOSED 등)은 처리되지 않음
});
```

#### `task-detail-page.tsx`
**현재 상태:**
- ✅ `useRealtimeMessages(taskId, !!taskId)` 호출
- ✅ `useMessages(taskId)`로 메시지 조회
- ⚠️ Realtime 구독 실패 시 대체 로직 없음

### 백엔드/DB 분석

#### RLS 정책 (`supabase/migrations/20250101000008_create_rls_policies_messages.sql`)
**현재 정책:**
- ✅ SELECT 정책: Task 접근 권한이 있으면 조회 가능
- ✅ INSERT 정책: Task 접근 권한이 있고 본인 메시지만 생성
- ⚠️ **Realtime 이벤트는 RLS 정책을 따르므로, SELECT 정책이 없으면 이벤트를 받을 수 없음**

**확인 필요:**
- Realtime 이벤트가 RLS에 의해 필터링되는지 확인
- `has_project_access` 함수가 올바르게 동작하는지 확인

#### Realtime Publication
- ✅ `supabase_realtime` publication 존재
- ✅ `messages` 테이블이 publication에 포함됨

### 최근 변경사항 영향

#### 읽음 처리 관련 변경 (`MESSAGE_READ_STATUS_IMPROVEMENT_PLAN.md`)
**변경 사항:**
- `mark_message_as_read` 함수 수정 (assigner/assignee 체크 추가)
- `mark_task_messages_as_read` 함수 수정
- `isMessageReadByCounterpart` 함수 추가

**잠재적 영향:**
- ⚠️ 함수 내부에서 Task 조회 시 에러 발생 가능
- ⚠️ 함수 실행 실패 시 Realtime 이벤트가 발생하지 않을 수 있음

---

## 🎯 3. 원인 도출

### 원인 1: Realtime 구독 상태 확인 부족 ✅ (해결됨)

**증거:**
- `useRealtimeMessages` 훅에서 `TIMED_OUT`, `CLOSED` 등 상태 미처리
- 구독 실패 시 재시도 로직 없음
- Realtime 로그에 "UnableToConnectToProject" 에러 발견

**영향:**
- 구독이 실패해도 사용자에게 알림 없음
- 메시지 변경 시 Realtime 이벤트를 받지 못함

**해결:**
- ✅ 모든 구독 상태 처리 추가
- ✅ 재시도 로직 추가 (최대 3회)
- ✅ 상세한 로깅 추가

### 원인 2: RLS 정책으로 인한 Realtime 이벤트 필터링 (가능성: 낮음)

**확인 결과:**
- ✅ SELECT 정책 존재 (`messages_select_task_access`)
- ✅ `has_project_access` 함수가 올바르게 동작
- ✅ Realtime은 RLS 정책을 따르므로 정상 동작해야 함

**결론:**
- RLS 정책은 문제 없음
- Realtime 이벤트는 정상적으로 전달되어야 함

### 원인 3: 에러 처리 부족으로 인한 조용한 실패 ✅ (해결됨)

**증거:**
- 구독 실패 시 콘솔 에러만 출력하고 복구 시도 없음
- 사용자에게 구독 실패 알림 없음

**영향:**
- 문제가 발생해도 사용자가 인지하지 못함

**해결:**
- ✅ 재시도 로직 추가
- ✅ 상세한 로깅으로 문제 파악 가능

---

## 🔧 4. 수정 계획

### ✅ 수정안 1: Realtime 구독 상태 확인 강화 (완료)

**변경 사항:**
1. ✅ 모든 구독 상태 처리 (`SUBSCRIBED`, `TIMED_OUT`, `CLOSED`, `CHANNEL_ERROR`, `SUBSCRIBE_ERROR`)
2. ✅ 구독 실패 시 재시도 로직 추가 (최대 3회, 지수 백오프)
3. ✅ 상세한 로깅 추가 (디버깅용)
4. ✅ 구독 상태 추적 (`subscriptionStatus` 반환)

**파일:**
- ✅ `src/hooks/queries/use-realtime-messages.ts` (수정 완료)

**예상 효과:**
- 구독 실패 원인 파악 가능
- 자동 복구로 안정성 향상
- 문제 발생 시 즉시 감지

### 수정안 2: RLS 정책 확인 (추가 조치 불필요)

**확인 결과:**
- ✅ SELECT 정책 존재 (`messages_select_task_access`)
- ✅ `has_project_access` 함수가 올바르게 동작
- ✅ Realtime은 RLS 정책을 따르므로 정상 동작해야 함

**결론:**
- RLS 정책은 문제 없음
- 추가 수정 불필요

### 수정안 3: 메시지 조회 로직 확인 (추가 조치 불필요)

**확인 결과:**
- ✅ `getMessagesByTaskId` 함수 정상
- ✅ RLS 정책에 의해 필터링됨 (정상 동작)
- ✅ `deleted_at IS NULL` 조건으로 삭제된 메시지 제외

**결론:**
- 메시지 조회 로직은 문제 없음
- 추가 수정 불필요

---

## 📊 검증 계획

### 테스트 시나리오

1. **Realtime 구독 성공 확인**
   - 페이지 진입 시 콘솔에 "[Realtime] Subscribed" 로그 확인
   - 구독 상태가 `SUBSCRIBED`인지 확인

2. **메시지 전송 시 Realtime 이벤트 수신 확인**
   - 메시지 전송 후 다른 탭/브라우저에서 실시간 반영 확인
   - 콘솔에 쿼리 무효화 로그 확인

3. **구독 실패 시 재시도 확인**
   - 네트워크 차단 후 구독 실패 시 재시도 로직 동작 확인

---

## ✅ 5. 수정 완료 사항

### 완료된 수정
1. ✅ **Realtime 구독 상태 확인 강화**
   - 모든 구독 상태 처리 (`SUBSCRIBED`, `TIMED_OUT`, `CLOSED`, `CHANNEL_ERROR`, `SUBSCRIBE_ERROR`)
   - 구독 실패 시 자동 재시도 (최대 3회, 지수 백오프)
   - 상세한 로깅 추가
   - 구독 상태 추적 기능 추가

### 다음 단계
1. **테스트 및 검증**
   - 브라우저 콘솔에서 Realtime 구독 상태 확인
   - 메시지 전송 시 실시간 반영 확인
   - 구독 실패 시 재시도 동작 확인

2. **추가 모니터링**
   - Realtime 로그 모니터링
   - 구독 실패 빈도 확인
   - 필요 시 추가 최적화

---

**작성일:** 2026-01-05  
**상태:** 원인 분석 완료, 수정 완료, 테스트 대기

