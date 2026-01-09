# Task REJECTED 상태에서 지시자/담당자 삭제 원인 분석 보고서

## A. 재현 시나리오 (단계별)

### 시나리오 1: 프로젝트 참여자 삭제 시도
1. 프로젝트에 member1이 참여자로 등록됨
2. member1이 assigner 또는 assignee인 Task가 존재
3. 해당 Task의 상태가 `REJECTED`로 변경됨
4. Admin이 프로젝트 참여자 관리에서 member1 삭제 시도
5. **결과: member1이 삭제됨** (버그)

### 시나리오 2: 프로젝트 삭제 시도
1. 프로젝트에 member1이 참여자로 등록됨
2. member1이 assigner 또는 assignee인 Task가 존재
3. 해당 Task의 상태가 `REJECTED`로 변경됨
4. Admin이 프로젝트 삭제 시도
5. **결과: 프로젝트 삭제 가능으로 판단됨** (버그)

---

## B. 실제 삭제/제거가 발생하는 레이어

### 1. Frontend 로직 (애플리케이션 레벨)

**파일:** `src/api/project.ts`

#### `removeProjectParticipant()` 함수 (244-282줄)
```typescript
// 진행중인 Task 확인 (ASSIGNED, IN_PROGRESS, WAITING_CONFIRM 상태)
const hasActiveTasks = tasks.some(
  (task) =>
    (task.assigner_id === userId || task.assignee_id === userId) &&
    (task.task_status === "ASSIGNED" ||
     task.task_status === "IN_PROGRESS" ||
     task.task_status === "WAITING_CONFIRM")
);
```

**문제점:**
- `REJECTED` 상태가 "진행중인 Task" 체크에서 **제외**되어 있음
- `REJECTED` 상태의 Task는 "진행중"으로 간주되지 않아 참여자 삭제가 가능해짐

#### `canDeleteProject()` 함수 (289-339줄)
```typescript
// 모든 Task가 APPROVED 상태인지 확인
const allApproved = tasks.every((task) => task.task_status === "APPROVED");

if (allApproved) {
  return { canDelete: true };
}

// APPROVED가 아닌 Task가 있으면 삭제 불가
const nonApprovedTasks = tasks.filter((task) => task.task_status !== "APPROVED");
```

**문제점:**
- `REJECTED` 상태도 "APPROVED가 아닌 Task"로 분류되어 프로젝트 삭제를 막음
- 하지만 `REJECTED`는 "완료/종료" 상태가 아니라 "반려" 상태임
- 프로젝트 삭제 조건 검증 로직이 `REJECTED`를 올바르게 처리하지 못함

### 2. DB Foreign Key 설정

**파일:** `supabase/migrations/20260110000001_phase1_complete_schema_setup.sql` (106줄)

```sql
user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
```

**설명:**
- `project_participants.user_id`가 `profiles(id)`를 참조하며 `ON DELETE CASCADE` 설정
- `profiles` 레코드가 삭제되면 `project_participants`도 자동 삭제됨
- 하지만 이는 `profiles` 삭제 시의 동작이며, Task 상태 변경과는 직접적인 연관 없음

**파일:** `supabase/migrations/20250101000002_create_tasks_table.sql` (10-11줄)

```sql
assigner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
assignee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
```

**설명:**
- `tasks.assigner_id`와 `assignee_id`가 `profiles(id)`를 참조하며 `ON DELETE RESTRICT` 설정
- `profiles` 삭제 시 Task가 존재하면 삭제가 차단됨
- 이는 Task 상태와 무관하게 작동함

### 3. DB Trigger

**확인 결과:**
- Task 상태 변경 시 실행되는 트리거들:
  - `trigger_send_task_status_change_email`: 이메일 발송
  - `trigger_create_task_status_change_system_message`: 시스템 메시지 생성
- **이 트리거들은 `profiles`나 `project_participants`를 삭제하지 않음**

---

## C. 가장 유력한 원인 1~3개

### 원인 1: `removeProjectParticipant()` 함수의 "진행중인 Task" 체크 로직 오류 (최우선)

**위치:** `src/api/project.ts` 258-267줄

**문제:**
- `REJECTED` 상태가 "진행중인 Task" 체크에서 제외됨
- `REJECTED`는 "반려" 상태로, 재작업 가능한 상태임
- 하지만 현재 로직은 `REJECTED`를 "완료/종료" 상태로 오해하여 참여자 삭제를 허용함

**영향:**
- `REJECTED` 상태의 Task가 있는 참여자도 삭제 가능해짐
- 지시자(assigner) 또는 담당자(assignee)가 의도치 않게 프로젝트에서 제거됨

### 원인 2: `canDeleteProject()` 함수의 Task 상태 검증 로직 오류

**위치:** `src/api/project.ts` 326-334줄

**문제:**
- `REJECTED` 상태를 "APPROVED가 아닌 Task"로 분류하여 프로젝트 삭제를 막음
- 하지만 `REJECTED`는 "완료/종료" 상태가 아니라 "반려" 상태임
- 프로젝트 삭제 조건이 `REJECTED`를 올바르게 처리하지 못함

**영향:**
- `REJECTED` 상태의 Task가 있으면 프로젝트 삭제가 불가능해짐
- 하지만 이는 의도된 동작일 수 있음 (반려된 Task는 재작업 가능하므로)

### 원인 3: 상태 정의와 로직의 불일치

**위치:** 전반적인 상태 처리 로직

**문제:**
- `REJECTED`는 "반려" 상태로, 재작업 가능한 상태임 (`REJECTED → IN_PROGRESS` 전환 가능)
- 하지만 참여자 삭제/프로젝트 삭제 로직에서는 `REJECTED`를 "완료/종료" 상태로 오해함
- 상태 정의와 실제 로직이 일치하지 않음

---

## D. 근거

### 파일 경로 및 함수/정책/FK 이름

#### 1. `removeProjectParticipant()` 함수
- **파일:** `src/api/project.ts`
- **함수명:** `removeProjectParticipant`
- **라인:** 244-282줄
- **문제 코드:**
  ```typescript
  // 진행중인 Task 확인 (ASSIGNED, IN_PROGRESS, WAITING_CONFIRM 상태)
  const hasActiveTasks = tasks.some(
    (task) =>
      (task.assigner_id === userId || task.assignee_id === userId) &&
      (task.task_status === "ASSIGNED" ||
       task.task_status === "IN_PROGRESS" ||
       task.task_status === "WAITING_CONFIRM")
  );
  ```
- **근거:** `REJECTED` 상태가 체크에서 제외되어 있음

#### 2. `canDeleteProject()` 함수
- **파일:** `src/api/project.ts`
- **함수명:** `canDeleteProject`
- **라인:** 289-339줄
- **문제 코드:**
  ```typescript
  // 모든 Task가 APPROVED 상태인지 확인
  const allApproved = tasks.every((task) => task.task_status === "APPROVED");
  
  // APPROVED가 아닌 Task가 있으면 삭제 불가
  const nonApprovedTasks = tasks.filter((task) => task.task_status !== "APPROVED");
  ```
- **근거:** `REJECTED`를 "APPROVED가 아닌 Task"로 분류하여 프로젝트 삭제를 막음

#### 3. Foreign Key 설정
- **파일:** `supabase/migrations/20260110000001_phase1_complete_schema_setup.sql`
- **라인:** 106줄
- **FK 이름:** `project_participants_user_id_fkey`
- **설정:** `ON DELETE CASCADE`
- **근거:** `profiles` 삭제 시 `project_participants`도 자동 삭제됨 (하지만 Task 상태 변경과는 무관)

#### 4. Task 상태 전환 정의
- **파일:** `src/lib/task-status.ts`
- **라인:** 12-14줄
- **정의:**
  ```typescript
  REJECTED: ["IN_PROGRESS"], // 반려 후 재작업 가능
  ```
- **근거:** `REJECTED`는 재작업 가능한 상태로 정의되어 있음

---

## E. 삭제가 아니라 "조회 불가"라면 그 이유

### 분석 결과: 실제 DELETE 발생

**근거:**
1. `removeProjectParticipant()` 함수에서 `project_participants` 테이블에 직접 `DELETE` 쿼리 실행:
   ```typescript
   const { error } = await (supabase as any)
     .from("project_participants")
     .delete()
     .eq("project_id", projectId)
     .eq("user_id", userId);
   ```

2. `REJECTED` 상태가 "진행중인 Task" 체크에서 제외되어 있어, `hasActiveTasks`가 `false`로 평가됨

3. 따라서 `if (hasActiveTasks)` 블록이 실행되지 않아 참여자 삭제가 진행됨

**결론:**
- 실제 DB 레코드 삭제가 발생함
- RLS 정책이나 조회 필터로 인한 "보이지 않음" 현상이 아님
- `REJECTED` 상태의 Task가 있는 참여자도 삭제 가능한 버그

---

## 요약

**근본 원인:**
`removeProjectParticipant()` 함수의 "진행중인 Task" 체크 로직에서 `REJECTED` 상태가 제외되어 있어, `REJECTED` 상태의 Task가 있는 참여자도 삭제 가능한 버그가 발생함.

**영향:**
- `REJECTED` 상태의 Task가 있는 지시자(assigner) 또는 담당자(assignee)가 프로젝트에서 의도치 않게 제거됨
- 반려된 Task는 재작업 가능한 상태이므로, 참여자는 유지되어야 함

**수정 필요 위치:**
- `src/api/project.ts` 258-267줄: `REJECTED` 상태를 "진행중인 Task" 체크에 포함시켜야 함

