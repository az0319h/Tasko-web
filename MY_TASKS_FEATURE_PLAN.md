# 나의 태스크 기능 구현 계획서

## 📋 개요
자기 자신에게 할당하는 독립적인 Task 기능을 구현합니다. 이 기능은 알림, 캘린더, 일반 Task 목록과 완전히 분리되어 독립적으로 동작합니다.

---

## 1️⃣ 요구사항 정리

### 1.1 핵심 요구사항
- ✅ **독립성**: 알림, 캘린더, 일반 Task 목록에 포함되지 않음
- ✅ **프라이버시**: 자기 할당 Task는 본인만 볼 수 있음 (관리자도 제외)
- ✅ **생성 위치**: "나의 태스크" 탭에서만 생성 가능
- ✅ **초기 상태**: 생성 시 즉시 "진행중(IN_PROGRESS)" 상태
- ✅ **완료 플로우**: "완료" 버튼으로 "승인됨(APPROVED)" 상태로 변경
- ✅ **채팅 기능**: 내부 채팅 기능 유지 (자기 자신과 채팅 가능)

### 1.2 UI 요구사항
- ✅ 대시보드에 "나의 태스크" 탭 추가 (관리자/멤버 모두)
- ✅ "나의 태스크" 탭에서는 "나에게 Task 생성" 버튼만 표시
- ✅ 담당자 선택 필드 숨김 (자기 자신으로 고정)
- ✅ 일반 Task 생성 버튼 숨김

### 1.3 카테고리
- 검토 (REVIEW)
- 계약 (CONTRACT)
- 명세서 (SPECIFICATION)
- 수정 (REVISION)
- 출원 (APPLICATION)

---

## 2️⃣ 데이터베이스 설계

### 2.1 테이블 변경
**`tasks` 테이블에 컬럼 추가:**
```sql
ALTER TABLE public.tasks 
ADD COLUMN is_self_task BOOLEAN NOT NULL DEFAULT false;
```

**제약조건 수정:**
- 기존: `assigner_id != assignee_id` (자기 할당 불가)
- 변경: `is_self_task = true`일 때만 `assigner_id = assignee_id` 허용

### 2.2 RLS 정책
**SELECT 정책:**
- 자기 할당 Task: 본인만 접근 가능 (관리자도 제외)
- 일반 Task: 기존 정책 유지 (관리자 또는 지시자/담당자)

**DELETE 정책:**
- 자기 할당 Task: 본인만 삭제 가능
- 일반 Task: 관리자만 삭제 가능

### 2.3 트리거 함수 수정
**이메일 알림 제외:**
- `send_task_created_email()`: `is_self_task = true`일 때 early return
- `send_task_status_change_email()`: `is_self_task = true`일 때 early return

**캘린더 일정 제외:**
- `create_task_schedule()`: `is_self_task = true`일 때 early return

**알림 제외:**
- `create_task_created_notification()`: `is_self_task = true`일 때 early return
- `create_task_status_changed_notification()`: `is_self_task = true`일 때 early return
- `create_task_deleted_notification()`: `is_self_task = true`일 때 early return

### 2.4 인덱스 추가
```sql
-- 자기 할당 Task 조회 최적화
CREATE INDEX idx_tasks_is_self_task 
ON public.tasks(is_self_task) 
WHERE is_self_task = true;

CREATE INDEX idx_tasks_self_task_user 
ON public.tasks(assigner_id, is_self_task) 
WHERE is_self_task = true;
```

---

## 3️⃣ API 설계

### 3.1 새로운 API 함수
**`getSelfTasks(excludeApproved?: boolean)`**
- 자기 할당 Task 목록 조회
- `is_self_task = true` AND `assigner_id = currentUserId` 필터

### 3.2 기존 API 함수 수정
**`createTask()`**
- `is_self_task` 파라미터 추가
- `is_self_task = true`일 때:
  - `assignee_id` 자동 설정 (현재 사용자)
  - `task_status` 자동 설정 (`IN_PROGRESS`)
  - 일반 Task 생성 시 자기 할당 시도 시 에러 메시지

**`getTasksForAdmin()`**
- `is_self_task = false` 필터 추가

**`getTasksForMember()`**
- `is_self_task = false` 필터 추가

**`getTaskSchedules()`**
- `is_self_task = false` 필터 추가

**`updateTaskStatus()`**
- 자기 할당 Task: `IN_PROGRESS → APPROVED` 직접 전환 허용

---

## 4️⃣ 프론트엔드 구현

### 4.1 대시보드 탭 추가
**관리자/멤버 대시보드:**
- `DashboardTab` 타입에 `"self-tasks"` 추가
- "나의 태스크" 탭 추가
- `useSelfTasks()` 훅 사용

### 4.2 Task 생성 모달 수정
**`TaskFormDialog` 컴포넌트:**
- `defaultSelfTask` prop 추가
- `defaultSelfTask = true`일 때:
  - 담당자 선택 필드 숨김
  - 현재 사용자 이름 표시 (읽기 전용)
  - `is_self_task` Switch 제거 (외부에서 제어)

### 4.3 Task 상세 페이지 수정
**`TaskDetailPage` 컴포넌트:**
- 자기 할당 Task 감지 (`is_self_task === true`)
- "완료" 버튼 추가 (자기 할당 Task만 표시)
- 상태 변경 버튼 숨김 (자기 할당 Task는 완료만 가능)

### 4.4 승인된 태스크 탭 수정
- `is_self_task = false` 필터 추가

---

## 5️⃣ 마이그레이션 파일 구조

### 5.1 마이그레이션 파일 위치
```
supabase/migrations/my-tasks/
├── 20260205000000_combined_my_tasks_migrations.sql
└── 20260205000001_exclude_self_tasks_from_notifications.sql
```

### 5.2 마이그레이션 실행 순서
1. `20260205000000_combined_my_tasks_migrations.sql`
   - `is_self_task` 컬럼 추가
   - 제약조건 수정
   - RLS 정책 수정
   - 인덱스 추가
   - 이메일/캘린더 트리거 수정

2. `20260205000001_exclude_self_tasks_from_notifications.sql`
   - 알림 트리거 함수 수정

---

## 6️⃣ 구현 체크리스트

### 6.1 데이터베이스
- [x] `is_self_task` 컬럼 추가
- [x] 제약조건 수정
- [x] RLS 정책 수정
- [x] 인덱스 추가
- [x] 이메일 트리거 수정
- [x] 캘린더 트리거 수정
- [x] 알림 트리거 수정

### 6.2 API
- [x] `getSelfTasks()` 함수 추가
- [x] `createTask()` 수정
- [x] `getTasksForAdmin()` 수정
- [x] `getTasksForMember()` 수정
- [x] `getTaskSchedules()` 수정
- [x] `updateTaskStatus()` 수정

### 6.3 프론트엔드
- [x] 대시보드 탭 추가
- [x] `useSelfTasks()` 훅 추가
- [x] Task 생성 모달 수정
- [x] Task 상세 페이지 수정
- [x] 승인된 태스크 탭 필터 추가

---

## 7️⃣ 독립성 보장

### 7.1 제외되는 항목
- ✅ 이메일 알림
- ✅ 캘린더 일정
- ✅ 일반 알림
- ✅ 관리자 전체 태스크 목록
- ✅ 멤버 담당 업무 목록
- ✅ 승인된 태스크 목록

### 7.2 포함되는 항목
- ✅ "나의 태스크" 탭
- ✅ Task 상세 페이지 (본인만 접근 가능)
- ✅ 내부 채팅 기능

---

## 8️⃣ 테스트 시나리오

### 8.1 생성 테스트
1. "나의 태스크" 탭에서 Task 생성
2. 담당자가 자기 자신으로 고정되는지 확인
3. 상태가 "진행중"으로 설정되는지 확인
4. 이메일/알림이 발송되지 않는지 확인

### 8.2 조회 테스트
1. 관리자 대시보드에서 "나의 태스크" 탭 확인
2. 멤버 대시보드에서 "나의 태스크" 탭 확인
3. 다른 사용자의 자기 할당 Task가 보이지 않는지 확인
4. 관리자도 다른 사용자의 자기 할당 Task를 볼 수 없는지 확인

### 8.3 완료 테스트
1. 자기 할당 Task 상세 페이지에서 "완료" 버튼 클릭
2. 상태가 "승인됨"으로 변경되는지 확인
3. 이메일/알림이 발송되지 않는지 확인

### 8.4 독립성 테스트
1. 자기 할당 Task가 캘린더에 표시되지 않는지 확인
2. 자기 할당 Task가 일반 Task 목록에 포함되지 않는지 확인
3. 자기 할당 Task가 승인된 태스크 탭에 포함되지 않는지 확인

---

## 9️⃣ 마이그레이션 실행

### 9.1 실행 방법
```bash
# MCP 서버를 통해 마이그레이션 적용
# 또는 Supabase Dashboard에서 직접 실행
```

### 9.2 타입 업데이트
```bash
npm run type-gen
```

---

## 🔟 완료 상태

✅ **모든 구현 완료**
- 데이터베이스 마이그레이션 완료
- API 함수 구현 완료
- 프론트엔드 UI 구현 완료
- 독립성 보장 완료
