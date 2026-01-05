# Task 상태 변경 UX 개선 수정 계획서

## 📋 개요

Task 상태 변경 시 사용자 확인 Dialog 추가 및 반려 후 재작업 플로우 개선

---

## 🎯 핵심 요구사항

### 1. 상태 변경 확인 Dialog
- **업무 시작** (ASSIGNED → IN_PROGRESS)
- **업무 완료 요청** (IN_PROGRESS → WAITING_CONFIRM)
- **승인** (WAITING_CONFIRM → APPROVED)
- **거절(반려)** (WAITING_CONFIRM → REJECTED)

위 모든 상태 변경 시 shadcn Dialog 또는 AlertDialog를 사용하여 사용자에게 한 번 더 확인을 받은 뒤에만 동작하도록 수정

### 2. 반려(거절) 플로우 개선 ⭐ **수정됨**
- 담당자가 업무 완료 요청을 반려하면:
  - 담당자에게 반려 이메일은 기존처럼 정상 발송 ✅
  - **REJECTED 상태에서는 자동으로 IN_PROGRESS로 변경되지 않음**
  - **작업자(assignee)에게만 "다시 업무를 진행하겠습니다" 버튼 노출**
  - 버튼 클릭 시 확인 Dialog 표시 후 IN_PROGRESS로 변경
  - **REJECTED → IN_PROGRESS 전환 시 이메일 알림 발송** (업무 재진행 시작 이벤트)
- 반려가 여러 번 발생하더라도:
  - 계속해서 다시 완료 요청이 가능해야 함
  - UX 상 흐름이 자연스럽게 이어져야 함
- **UX 의도:**
  - 반려 이후 재작업은 사용자의 명확한 의사 표현을 통해서만 가능
  - 상태 변경이 아닌 '행위(Action)' 중심 UX 유지

### 3. 승인 이후 상태
- 최종 승인 상태가 되면:
  - 더 이상 "업무 완료 요청" 버튼은 노출되지 않아야 함 ✅ (이미 구현됨)
  - 상태는 종료 상태로 고정 ✅ (이미 구현됨)

---

## 🔍 현재 상태 분석

### 현재 상태 전환 매트릭스
```typescript
const STATUS_TRANSITION_MATRIX: Record<TaskStatus, TaskStatus[]> = {
  ASSIGNED: ["IN_PROGRESS"],
  IN_PROGRESS: ["WAITING_CONFIRM"],
  WAITING_CONFIRM: ["APPROVED", "REJECTED"],
  APPROVED: [], // 최종 상태
  REJECTED: [], // 최종 상태 ❌ 문제: 재작업 불가
};
```

### 현재 사용자 역할별 권한
- **assignee (작업자)**:
  - ASSIGNED → IN_PROGRESS ✅
  - IN_PROGRESS → WAITING_CONFIRM ✅
  - REJECTED → IN_PROGRESS ❌ (불가능)

- **assigner (지시자)**:
  - WAITING_CONFIRM → APPROVED ✅
  - WAITING_CONFIRM → REJECTED ✅

### 현재 UI 상태
- 상태 변경 버튼이 바로 실행됨 (확인 Dialog 없음) ❌
- REJECTED 상태에서 "다시 시작" 버튼이 없음 ❌
- 승인 후 완료 요청 버튼 숨김 ✅ (이미 구현됨)

---

## 📊 상태 전이 다이어그램

### 개선 전
```
ASSIGNED → IN_PROGRESS → WAITING_CONFIRM → APPROVED (종료)
                                    ↓
                                 REJECTED (종료) ❌
```

### 개선 후
```
ASSIGNED → IN_PROGRESS → WAITING_CONFIRM → APPROVED (종료)
                                    ↓
                                 REJECTED → IN_PROGRESS → WAITING_CONFIRM → ...
                                    ↑                              ↓
                                    └────────── 반복 가능 ──────────┘
```

### 상태 전이 단계 설명

1. **ASSIGNED (할당됨)**
   - 작업자(assignee)가 "업무 시작" 버튼 클릭
   - 확인 Dialog 표시: "업무를 시작하시겠습니까?"
   - 확인 시 → IN_PROGRESS

2. **IN_PROGRESS (진행 중)**
   - 작업자(assignee)가 "업무 완료 요청" 버튼 클릭
   - 확인 Dialog 표시: "업무 완료를 요청하시겠습니까?"
   - 확인 시 → WAITING_CONFIRM

3. **WAITING_CONFIRM (확인 대기)**
   - 지시자(assigner)가 "승인" 버튼 클릭
     - 확인 Dialog 표시: "업무를 승인하시겠습니까?"
     - 확인 시 → APPROVED (종료)
   - 지시자(assigner)가 "거절" 버튼 클릭
     - 확인 Dialog 표시: "업무를 반려하시겠습니까?"
     - 확인 시 → REJECTED

4. **REJECTED (반려됨)** ⭐ **신규 추가**
   - **상태가 자동으로 IN_PROGRESS로 변경되지 않음**
   - **작업자(assignee)에게만 "다시 업무를 진행하겠습니다" 버튼 노출**
   - 버튼 클릭 시 확인 Dialog 표시: "다시 업무를 진행하시겠습니까?"
   - 확인 시 → IN_PROGRESS
   - **REJECTED → IN_PROGRESS 전환 시 이메일 알림 발송** (지시자에게 알림)
   - 이후 IN_PROGRESS → WAITING_CONFIRM → (승인/반려) 반복 가능

5. **APPROVED (승인됨)**
   - 종료 상태 (변경 불가)

---

## 🛠️ 변경이 필요한 영역

### 1. 프론트엔드 (FE) ⚠️ **주요 변경**

#### 1.1 상태 전환 로직 수정
**파일:** `src/lib/task-status.ts`

**변경 사항:**
- `STATUS_TRANSITION_MATRIX`에 `REJECTED: ["IN_PROGRESS"]` 추가
- `canUserChangeStatus` 함수에 `REJECTED → IN_PROGRESS` (assignee만) 추가

**이유:**
- 반려 후 재작업을 허용하기 위해 상태 전환 매트릭스 수정 필요

#### 1.2 상태 변경 확인 Dialog 컴포넌트 생성
**파일:** `src/components/dialog/task-status-change-dialog.tsx` (신규)

**기능:**
- 상태 변경 전 확인 Dialog 표시
- 각 상태 전환별 맞춤 메시지 표시
- 확인/취소 버튼 제공

**Dialog 메시지 예시:**
- ASSIGNED → IN_PROGRESS: "업무를 시작하시겠습니까?"
- IN_PROGRESS → WAITING_CONFIRM: "업무 완료를 요청하시겠습니까?"
- WAITING_CONFIRM → APPROVED: "업무를 승인하시겠습니까?"
- WAITING_CONFIRM → REJECTED: "업무를 반려하시겠습니까?"
- REJECTED → IN_PROGRESS: "다시 업무를 진행하시겠습니까?" ⭐ **수정됨**

#### 1.3 Task 상세 페이지 수정
**파일:** `src/pages/task-detail-page.tsx`

**변경 사항:**
- 상태 변경 버튼 클릭 시 즉시 실행하지 않고 Dialog 표시
- **REJECTED 상태일 때 작업자(assignee)에게만 "다시 업무를 진행하겠습니다" 버튼 추가** ⭐ **수정됨**
- Dialog 확인 후에만 `updateTaskStatus` 호출

#### 1.4 프로젝트 상세 페이지 수정
**파일:** `src/pages/project-detail-page.tsx`

**변경 사항:**
- `TaskTableRow` 컴포넌트에서 상태 변경 시 Dialog 표시
- **REJECTED 상태일 때 작업자(assignee)에게만 "다시 업무를 진행하겠습니다" 버튼 추가** ⭐ **수정됨**

#### 1.5 상태 변경 버튼 표시 로직 수정
**파일:** `src/pages/task-detail-page.tsx`, `src/pages/project-detail-page.tsx`

**변경 사항:**
- `canChangeToInProgress` 조건에 `REJECTED` 상태 추가
- **REJECTED 상태에서 작업자(assignee)에게만 "다시 업무를 진행하겠습니다" 버튼 표시** ⭐ **수정됨**
- 지시자(assigner)에게는 버튼이 표시되지 않음

---

### 2. 백엔드 (DB / RLS) ✅ **변경 불필요**

#### 2.1 RLS 정책
**현재 상태:** ✅ 이미 수정 완료
- `tasks_update_status_assigner_assignee` 정책이 assigner/assignee의 UPDATE를 허용
- REJECTED → IN_PROGRESS 전환도 동일한 정책으로 처리 가능

**변경 필요 여부:** ❌ 불필요

#### 2.2 데이터베이스 스키마
**현재 상태:** ✅ 변경 불필요
- `task_status` enum에 REJECTED 상태 이미 존재
- 추가 컬럼이나 테이블 변경 불필요

**변경 필요 여부:** ❌ 불필요

---

### 3. Edge Function / 트리거 ⚠️ **변경 필요** ⭐ **수정됨**

#### 3.1 이메일 발송 트리거
**현재 상태:** ⚠️ **수정 필요**
- `trigger_send_task_status_change_email` 트리거가 상태 변경 시 이메일 발송
- **현재 트리거는 REJECTED → IN_PROGRESS 전환을 감지하지 않음** ❌

**트리거 로직 확인:**
```sql
-- 현재 트리거는 다음 전환만 이메일 발송:
-- ASSIGNED → IN_PROGRESS
-- IN_PROGRESS → WAITING_CONFIRM
-- WAITING_CONFIRM → APPROVED/REJECTED
-- REJECTED → IN_PROGRESS ❌ (현재 미지원)
```

**변경 필요 사항:**
- **REJECTED → IN_PROGRESS 전환 시 이메일 발송 추가 필요** ⭐
- 트리거 함수 `send_task_status_change_email()` 수정 필요
- REJECTED → IN_PROGRESS 전환 시 지시자(assigner)에게 이메일 발송
- 이메일 내용: "작업자가 업무를 다시 시작했습니다" 또는 유사한 메시지

**수정 내용:**
1. 트리거 함수의 상태 전환 조건에 `REJECTED → IN_PROGRESS` 추가
2. 수신자 설정: `recipients_array := ARRAY['assigner']` (지시자에게만 발송)

**변경 필요 여부:** ✅ **필요** (마이그레이션 파일 생성 필요)

#### 3.2 Edge Function
**현재 상태:** ⚠️ **템플릿 추가 필요**
- `send-task-email` Edge Function은 이미 `STATUS_CHANGED` 이벤트를 처리
- `oldStatus`와 `newStatus`를 받아서 처리하므로 기본 로직은 수정 불필요
- **하지만 이메일 템플릿에 REJECTED → IN_PROGRESS 케이스가 없음** ❌

**이메일 템플릿 확인 결과:**
- 현재 `getEmailTemplate` 함수는 다음 케이스만 처리:
  - ASSIGNED → IN_PROGRESS ✅
  - IN_PROGRESS → WAITING_CONFIRM ✅
  - WAITING_CONFIRM → APPROVED ✅
  - WAITING_CONFIRM → REJECTED ✅
  - **REJECTED → IN_PROGRESS ❌ (없음)**

**변경 필요 사항:**
- `getEmailTemplate` 함수에 REJECTED → IN_PROGRESS 케이스 추가 필요
- 이메일 제목: "[Tasko] 업무 재진행 시작: {taskTitle}"
- 이메일 내용: "작업자가 업무를 다시 시작했습니다" 또는 유사한 메시지
- 수신자: assigner (지시자)

**변경 필요 여부:** ✅ **필요** (Edge Function 파일 수정)

---

### 4. API 레이어 ✅ **변경 불필요**

#### 4.1 Task API
**파일:** `src/api/task.ts`

**현재 상태:** ✅ 변경 불필요
- `updateTaskStatus` 함수는 상태 전환 매트릭스를 사용하여 검증
- `STATUS_TRANSITION_MATRIX`만 수정하면 자동으로 REJECTED → IN_PROGRESS 허용

**변경 필요 여부:** ❌ 불필요

---

## 📝 상세 구현 계획

### 단계 1: 상태 전환 로직 수정
**우선순위:** 높음

1. `src/lib/task-status.ts` 수정
   - `STATUS_TRANSITION_MATRIX`에 `REJECTED: ["IN_PROGRESS"]` 추가
   - `canUserChangeStatus` 함수에 `REJECTED → IN_PROGRESS` (assignee만) 추가

**예상 소요 시간:** 15분

### 단계 2: 상태 변경 확인 Dialog 컴포넌트 생성
**우선순위:** 높음

1. `src/components/dialog/task-status-change-dialog.tsx` 생성
   - shadcn AlertDialog 사용
   - 상태별 맞춤 메시지 표시
   - 확인/취소 버튼

**예상 소요 시간:** 30분

### 단계 3: Task 상세 페이지 수정
**우선순위:** 높음

1. `src/pages/task-detail-page.tsx` 수정
   - 상태 변경 버튼 클릭 시 Dialog 표시
   - REJECTED 상태일 때 "다시 시작" 버튼 추가
   - Dialog 확인 후 `updateTaskStatus` 호출

**예상 소요 시간:** 30분

### 단계 4: 프로젝트 상세 페이지 수정
**우선순위:** 중간

1. `src/pages/project-detail-page.tsx` 수정
   - `TaskTableRow` 컴포넌트에서 상태 변경 시 Dialog 표시
   - REJECTED 상태일 때 "다시 시작" 버튼 추가

**예상 소요 시간:** 30분

### 단계 5: 트리거 수정 (이메일 발송 추가) ⭐ **신규 추가**
**우선순위:** 높음

1. `supabase/migrations/20250101000022_add_rejected_to_in_progress_email_trigger.sql` 생성
   - `send_task_status_change_email()` 함수 수정
   - REJECTED → IN_PROGRESS 전환 시 이메일 발송 로직 추가
   - 수신자: assigner (지시자)

**예상 소요 시간:** 30분

### 단계 6: Edge Function 이메일 템플릿 확인 및 추가 ⭐ **신규 추가**
**우선순위:** 중간

1. `supabase/functions/send-task-email/index.ts` 확인
   - REJECTED → IN_PROGRESS 케이스 이메일 템플릿 확인
   - 없으면 추가: "작업자가 업무를 다시 시작했습니다"

**예상 소요 시간:** 20분

### 단계 7: 테스트 및 검증
**우선순위:** 높음

1. 각 상태 전환 시나리오 테스트
2. Dialog 동작 확인
3. 반려 후 재작업 플로우 확인
4. **REJECTED → IN_PROGRESS 전환 시 이메일 발송 확인** ⭐ **신규 추가**

**예상 소요 시간:** 1시간

---

## ⚠️ 예상 리스크 및 대안

### 리스크 1: REJECTED → IN_PROGRESS 전환 시 이메일 발송 ⭐ **수정됨**
**문제:**
- 현재 트리거는 REJECTED → IN_PROGRESS 전환을 감지하지 않음
- **요구사항에 따라 이메일 발송 필요** ✅

**해결 방안:**
- **트리거 함수 수정 필요** ✅
- REJECTED → IN_PROGRESS 전환 시 지시자(assigner)에게 이메일 발송
- 이메일 내용: "작업자가 업무를 다시 시작했습니다" 또는 유사한 메시지
- 마이그레이션 파일 생성 필요

**권장:** 트리거 수정하여 이메일 발송 구현

### 리스크 2: 반려 횟수 제한 없음
**문제:**
- 반려가 무한 반복될 수 있음
- 악의적인 사용자나 실수로 인한 문제 가능

**대안:**
- **옵션 1 (권장):** 제한 없음 (현재 계획)
  - 유연한 워크플로우 유지
  - 필요 시 나중에 제한 추가 가능
- **옵션 2:** 반려 횟수 제한 추가
  - DB에 `rejection_count` 컬럼 추가 필요
  - 복잡도 증가

**권장:** 옵션 1 (제한 없음, 필요 시 나중에 추가)

### 리스크 3: Dialog UX 일관성
**문제:**
- 모든 상태 변경에 Dialog를 추가하면 사용자 경험이 느려질 수 있음
- 하지만 실수 방지를 위해 필요함

**대안:**
- **옵션 1 (권장):** 모든 상태 변경에 Dialog 사용
  - 실수 방지
  - 일관된 UX
- **옵션 2:** 중요한 상태 변경만 Dialog 사용
  - 승인/반려만 Dialog 사용
  - 시작/완료 요청은 즉시 실행

**권장:** 옵션 1 (모든 상태 변경에 Dialog 사용)

### 리스크 4: 기존 REJECTED 상태 Task 처리
**문제:**
- 현재 DB에 REJECTED 상태인 Task가 2개 존재
- 이 Task들도 "다시 시작" 버튼이 표시되어야 함

**대안:**
- **자동 해결:** 상태 전환 로직 수정 시 자동으로 처리됨
- 추가 작업 불필요

---

## 📋 변경 파일 목록

### 신규 생성
1. `src/components/dialog/task-status-change-dialog.tsx`

### 수정
1. `src/lib/task-status.ts`
2. `src/pages/task-detail-page.tsx`
3. `src/pages/project-detail-page.tsx`

### 변경 없음
1. `src/api/task.ts` (변경 불필요)

### 추가 수정 필요 ⭐ **신규 추가**
1. `supabase/migrations/20250101000022_add_rejected_to_in_progress_email_trigger.sql` (신규 생성)
   - 트리거 함수 수정: REJECTED → IN_PROGRESS 이메일 발송 추가
2. `supabase/functions/send-task-email/index.ts` (확인 필요)
   - REJECTED → IN_PROGRESS 이메일 템플릿 확인 및 추가

---

## ✅ 검증 체크리스트

### 기능 검증
- [ ] ASSIGNED → IN_PROGRESS: Dialog 표시 및 동작 확인
- [ ] IN_PROGRESS → WAITING_CONFIRM: Dialog 표시 및 동작 확인
- [ ] WAITING_CONFIRM → APPROVED: Dialog 표시 및 동작 확인
- [ ] WAITING_CONFIRM → REJECTED: Dialog 표시 및 동작 확인
- [ ] REJECTED → IN_PROGRESS: Dialog 표시 및 동작 확인 (신규)
- [ ] REJECTED → IN_PROGRESS → WAITING_CONFIRM: 재작업 플로우 확인 (신규)
- [ ] 승인 후 완료 요청 버튼 숨김 확인 ✅ (이미 구현됨)

### UX 검증
- [ ] Dialog 메시지가 명확한지 확인
- [ ] 취소 버튼 동작 확인
- [ ] 확인 버튼 동작 확인
- [ ] 로딩 상태 표시 확인

### 데이터 검증
- [ ] DB에 상태가 정확히 반영되는지 확인
- [ ] **이메일 발송 여부 확인 (REJECTED → IN_PROGRESS는 지시자에게 발송)** ⭐ **수정됨**
- [ ] SYSTEM 메시지 생성 확인
- [ ] **REJECTED 상태에서 작업자에게만 버튼 표시 확인** ⭐ **신규 추가**

---

## 📅 예상 소요 시간

- 상태 전환 로직 수정: 15분
- Dialog 컴포넌트 생성: 30분
- Task 상세 페이지 수정: 30분
- 프로젝트 상세 페이지 수정: 30분
- 트리거 수정 (이메일 발송 추가): 30분 ⭐ **신규 추가**
- Edge Function 템플릿 확인 및 추가: 20분 ⭐ **신규 추가**
- 테스트 및 검증: 1시간

**총 예상 시간: 약 3시간 35분** (기존 2시간 45분 + 50분 추가)

---

## 🎯 최종 목표

1. ✅ 모든 상태 변경 시 확인 Dialog 표시
2. ✅ 반려 후 재작업 플로우 구현
   - REJECTED 상태에서 작업자에게만 "다시 업무를 진행하겠습니다" 버튼 표시
   - 확인 Dialog 후 IN_PROGRESS로 변경
   - REJECTED → IN_PROGRESS 전환 시 이메일 알림 발송
3. ✅ 승인 후 완료 요청 버튼 숨김 (이미 구현됨)
4. ✅ 일관된 UX 제공
5. ✅ 행위(Action) 중심 UX 유지 (상태 자동 변경 없음)

---

## 📌 추가 UX 정책 반영 사항 ⭐ **신규 추가**

### 1. REJECTED 상태 처리 방식
- ✅ REJECTED 상태에서 자동으로 IN_PROGRESS로 변경되지 않음
- ✅ 작업자(assignee)에게만 "다시 업무를 진행하겠습니다" 버튼 제공
- ✅ 명확한 액션 버튼으로 행위(Action) 중심 UX 유지

### 2. 다시 진행 버튼 동작
- ✅ 거절된 작업의 담당자(작업자)에게만 노출
- ✅ 확인 Dialog(shadcn) 표시 후 사용자 확인 시 IN_PROGRESS로 변경

### 3. 이메일 알림 정책
- ✅ REJECTED → IN_PROGRESS 전환은 "업무 재진행 시작" 이벤트로 취급
- ✅ 다시 진행 버튼 클릭 후 상태가 IN_PROGRESS로 변경되면 이메일 알림 발송
- ✅ 수신자: 지시자(assigner)

### 4. 구현 영향 분석
- ✅ RLS 정책: 변경 불필요 (이미 수정 완료)
- ⚠️ 트리거: 변경 필요 (REJECTED → IN_PROGRESS 이메일 발송 추가)
- ⚠️ Edge Function: 변경 필요 (이메일 템플릿 추가)

---

## 📌 다음 단계

**승인 대기 중...**

이 계획서를 검토하신 후, "이 방향으로 진행하자"라고 승인해 주시면 단계별로 구현을 진행하겠습니다.

### 주요 변경 사항 요약
1. ✅ 프론트엔드: Dialog 추가, REJECTED 상태 버튼 표시 로직 수정
2. ⚠️ 백엔드 트리거: REJECTED → IN_PROGRESS 이메일 발송 추가 (마이그레이션 필요)
3. ⚠️ Edge Function: REJECTED → IN_PROGRESS 이메일 템플릿 추가

