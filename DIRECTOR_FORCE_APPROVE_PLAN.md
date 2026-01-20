# 지시자 강제 승인 기능 구현 계획

## 📋 요구사항

**목표**: task:id 상세 페이지에서 지시자(assigner)가 모든 상태 변경 로직을 건너뛰고 강제로 "승인됨(APPROVED)" 상태로 바로 변경할 수 있는 기능 추가

**현재 상황**:
- 일반 승인: WAITING_CONFIRM → APPROVED (정상 워크플로우)
- 강제 승인: **어떤 상태에서든** → APPROVED (모든 검증 로직 건너뛰기)

---

## ✅ 구현 가능 여부

### **구현 가능합니다!**

**이유**:
1. **RLS 정책**: 이미 `tasks_update_admin_or_assigner_assignee` 정책이 있어서 assigner는 UPDATE 권한이 있음
2. **API 레벨 제어**: 상태 전환 검증은 애플리케이션 레벨(`updateTaskStatus` 함수)에서 수행되므로, 별도의 강제 승인 함수를 만들면 검증을 건너뛸 수 있음
3. **권한 확인**: 지시자(assigner_id) 확인 로직이 이미 존재함

---

## 🎯 구현 계획

### 1. 백엔드 (API) - 강제 승인 함수 추가

**파일**: `src/api/task.ts`

**새 함수**: `forceApproveTask(taskId: string)`

**기능**:
- ✅ 지시자(assigner) 권한만 확인
- ✅ 현재 상태와 무관하게 `APPROVED`로 변경
- ✅ 상태 전환 매트릭스 검증 **건너뛰기**
- ✅ 역할별 권한 검증 **건너뛰기**
- ✅ RLS 정책은 그대로 사용 (assigner만 UPDATE 가능)

**구현 로직**:
```typescript
// 1. 인증 확인
// 2. Task 조회
// 3. 지시자(assigner_id) 확인만 수행
// 4. 이미 APPROVED 상태면 에러 반환
// 5. 상태를 APPROVED로 직접 UPDATE (검증 로직 없이)
// 6. 트리거는 자동으로 작동 (이메일 발송, 시스템 메시지 생성)
```

**주의사항**:
- 일반 `updateTaskStatus`와 분리하여 명확히 구분
- 함수명에 `force`를 포함하여 의도 명확화
- 이미 APPROVED 상태인 경우 에러 처리

---

### 2. 프론트엔드 (UI) - 강제 승인 버튼 추가

**파일**: `src/pages/task-detail-page.tsx`

**위치**: 기존 승인/거절 버튼 근처 또는 별도 섹션

**표시 조건**:
- ✅ 현재 사용자가 지시자(assigner)인 경우만 표시
- ✅ Task 상태가 `APPROVED`가 아닌 경우만 표시
- ✅ 기존 승인 버튼과 구분되도록 스타일링 (예: 경고 색상 또는 별도 아이콘)

**UI 옵션**:
1. **옵션 A**: 기존 승인 버튼 옆에 작은 "강제 승인" 버튼 추가
2. **옵션 B**: 드롭다운 메뉴로 "일반 승인" / "강제 승인" 선택
3. **옵션 C**: 별도 섹션에 "관리자 기능"으로 배치

**권장**: 옵션 A 또는 B (사용자 실수 방지를 위해 확인 Dialog 필수)

---

### 3. 확인 Dialog 추가

**파일**: `src/components/dialog/task-force-approve-dialog.tsx` (신규)

**기능**:
- 현재 상태와 목표 상태(APPROVED) 표시
- 경고 메시지: "모든 상태 변경 로직을 건너뛰고 강제로 승인 처리합니다. 계속하시겠습니까?"
- 확인/취소 버튼

**메시지 예시**:
```
⚠️ 강제 승인

현재 상태: [현재 상태]
목표 상태: 승인됨

모든 상태 변경 로직을 건너뛰고 강제로 승인 처리합니다.
이 작업은 되돌릴 수 없습니다.

계속하시겠습니까?
```

---

### 4. Hook 추가 (선택사항)

**파일**: `src/hooks/mutations/use-force-approve-task.ts` (신규)

**기능**:
- React Query mutation으로 강제 승인 함수 래핑
- 성공/실패 처리
- 캐시 무효화 (task 상세 정보 갱신)

---

## 🔄 데이터 흐름

```
사용자 클릭 (강제 승인 버튼)
  ↓
확인 Dialog 표시
  ↓
사용자 확인
  ↓
forceApproveTask API 호출
  ↓
백엔드 검증:
  - 인증 확인 ✅
  - Task 조회 ✅
  - 지시자 확인 ✅ (유일한 검증)
  - 상태 전환 검증 ❌ (건너뛰기)
  - 역할별 권한 검증 ❌ (건너뛰기)
  ↓
UPDATE tasks SET task_status = 'APPROVED'
  ↓
트리거 자동 실행:
  - 이메일 발송 (send_task_status_change_email)
  - 시스템 메시지 생성 (create_task_status_change_system_message)
  ↓
프론트엔드 캐시 갱신
  ↓
UI 업데이트
```

---

## ⚠️ 주의사항

### 1. 보안
- ✅ RLS 정책으로 assigner만 UPDATE 가능 (보안 유지)
- ✅ API 레벨에서 지시자 확인 (이중 검증)
- ⚠️ 일반 승인과 구분하여 남용 방지 (확인 Dialog 필수)

### 2. 데이터 일관성
- ✅ 트리거는 자동으로 작동하므로 이메일/메시지는 정상 발송됨
- ⚠️ 상태 전환 로그는 일반 승인과 동일하게 기록됨 (구분 불가)
- 💡 필요시 `force_approved` 플래그 컬럼 추가 고려 (나중에)

### 3. 사용자 경험
- ✅ 확인 Dialog로 실수 방지
- ✅ 버튼 스타일로 일반 승인과 구분
- ✅ 성공/실패 토스트 메시지

---

## 📝 구현 단계

### Phase 1: 백엔드 API
1. `src/api/task.ts`에 `forceApproveTask` 함수 추가
2. 지시자 권한 확인 로직만 포함
3. 상태 전환 검증 로직 제외

### Phase 2: 프론트엔드 UI
1. `src/pages/task-detail-page.tsx`에 강제 승인 버튼 추가
2. 표시 조건 설정 (지시자 + APPROVED 아님)
3. 클릭 핸들러 연결

### Phase 3: 확인 Dialog
1. `src/components/dialog/task-force-approve-dialog.tsx` 생성
2. 경고 메시지 및 확인/취소 버튼
3. `task-detail-page.tsx`에 통합

### Phase 4: Hook (선택사항)
1. `src/hooks/mutations/use-force-approve-task.ts` 생성
2. React Query mutation 래핑
3. 캐시 무효화 처리

### Phase 5: 테스트
1. 지시자가 아닌 사용자 접근 차단 확인
2. 다양한 상태에서 강제 승인 테스트
3. 이메일/메시지 발송 확인
4. UI 업데이트 확인

---

## 🎨 UI 디자인 제안

### 버튼 배치 예시
```
[일반 승인] [거절] | [⚠️ 강제 승인]
```

또는

```
[승인] [거절]
  ↓
[강제 승인 (모든 검증 건너뛰기)]
```

### 버튼 스타일
- 일반 승인: 기본 색상 (Primary)
- 강제 승인: 경고 색상 (Destructive 또는 Warning)
- 아이콘: ⚠️ 또는 🚨

---

## ✅ 결론

**구현 가능**: ✅

**주요 포인트**:
1. RLS 정책은 이미 assigner UPDATE를 허용함
2. 상태 전환 검증은 API 레벨에서 수행되므로 별도 함수로 건너뛸 수 있음
3. 트리거는 자동으로 작동하므로 추가 작업 불필요
4. 확인 Dialog로 실수 방지 필수

**예상 작업 시간**: 2-3시간

**우선순위**: 중간 (일반 승인 기능이 정상 작동하므로 급하지 않음)
