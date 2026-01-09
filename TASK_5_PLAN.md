# Task 5: Task 관리 기능 구현 - 기획 요약

## 📋 Task 5 개요

**목표**: 하나의 프로젝트 안에서 Task 관리 플로우가 완결되어야 함
- 프로젝트 상세 → Task 생성
- Task 목록 확인
- Task 상태 전환
- Task 담당자 관리
까지 끊김 없이 동작해야 함

---

## 🎯 Acceptance Criteria (@tasks.json 기준)

1. ✅ 프로젝트 참여자가 Task를 생성할 수 있음
2. ⚠️ Task 생성 시 카테고리 필수 선택 (생성 후 변경 불가) - **현재 누락**
3. ✅ Task 생성 시 assigner는 자동으로 현재 로그인한 사용자로 설정
4. ✅ Task 수정/삭제는 지시자만 가능
5. ✅ Task 상태 변경은 지시자만 가능 (Optimistic Update 적용)
6. ❌ 칸반 보드에 4개 컬럼(검토/계약/명세서/출원)이 표시됨 - **미구현**
7. ❌ 각 컬럼에 해당 카테고리의 Task가 표시됨 - **미구현**
8. ✅ 상태 변경 시 즉시 UI 반영됨 (깜빡임 없음)

---

## 📊 현재 구현 상태 분석

### ✅ 완료된 Sub-tasks

#### 5.1 Task API 함수 구현 ✅
- `getTasksByProjectId()`: 프로젝트별 Task 목록 조회 (assigner/assignee 프로필 JOIN)
- `getTaskById()`: 단일 Task 조회 (프로필 JOIN)
- `createTask()`: Task 생성 (assigner_id 자동 설정)
- `updateTask()`: Task 수정 (카테고리, assigner_id, assignee_id 수정 불가)
- `updateTaskStatus()`: 상태 변경 (지시자 권한 검증)
- `deleteTask()`: Task 삭제 (지시자 권한 검증)

#### 5.2 Task React Query 훅 구현 ✅
- `useTasks(projectId)`: 프로젝트별 Task 목록 조회 (staleTime 30초)
- `useTask(id)`: 단일 Task 조회
- `useCreateTask()`: Task 생성 뮤테이션 (캐시 무효화)
- `useUpdateTask()`: Task 수정 뮤테이션 (캐시 무효화)
- `useUpdateTaskStatus()`: 상태 변경 뮤테이션 (Optimistic Update 적용)
- `useDeleteTask()`: Task 삭제 뮤테이션 (캐시 무효화)

#### 5.3 Task 상태 전환 로직 구현 ✅
- `src/lib/task-status.ts` 파일 존재
- `isValidStatusTransition()`: 상태 전환 유효성 검증
- `canUserChangeStatus()`: 사용자 역할별 상태 전환 허용 확인
- `getStatusTransitionErrorMessage()`: 상태 전환 에러 메시지 생성
- `STATUS_TRANSITION_MATRIX`: 상태 전환 매트릭스 정의

#### 5.4 Task 생성 다이얼로그 구현 ⚠️ **부분 완료**
- `src/components/task/task-form-dialog.tsx` 존재
- React Hook Form + Zod 스키마 적용 ✅
- 입력 필드: 제목(title), 설명(description), 담당자(assigner_id), 할당받은 사람(assignee_id), 마감일(due_date) ✅
- **누락**: 카테고리(task_category) 필드 ❌
- **누락**: 담당자 선택이 프로젝트 참여자만 표시되지 않음 (전체 프로필 표시) ❌
- **누락**: 마감일 검증 로직 (오늘 이전 날짜 불가, 프로젝트 완료 예정일 이전만) ❌

#### 5.5 Task 수정 다이얼로그 구현 ✅
- Task 생성 다이얼로그 재사용
- 기존 Task 데이터로 폼 초기화 ✅
- 수정 불가능한 필드 비활성화: 카테고리, 담당자, 지시자 ✅
- 수정 가능한 필드: 제목, 설명, 마감일 ✅
- 폼 제출 시 updateTask API 호출 ✅

#### 5.6 Task 상태 변경 다이얼로그 구현 ✅
- `src/components/dialog/task-status-change-dialog.tsx` 존재
- 현재 상태에서 가능한 다음 상태 옵션 표시 ✅
- 상태 변경 이유 입력 필드 (선택사항) ✅
- 확인 다이얼로그 표시 ✅
- 폼 제출 시 updateTaskStatus API 호출 (Optimistic Update) ✅

#### 5.9 프로젝트 상세 페이지 구현 ✅
- `src/pages/project-detail-page.tsx` 존재
- 프로젝트 정보 표시 ✅
- 참여자 관리 버튼 표시 (Admin만) ✅
- Task 목록 테이블 표시 ✅
- Task 상태별 필터링 (Tabs) ✅
- Task 생성/수정/삭제 다이얼로그 통합 ✅

### ❌ 미구현 Sub-tasks

#### 5.7 칸반 보드 컴포넌트 구현 ❌
- `src/components/task/kanban-board.tsx` **없음**
- 4개 컬럼 컴포넌트 (검토/계약/명세서/출원) **미구현**
- 각 컬럼에 해당 카테고리의 Task 카드 표시 **미구현**
- 컬럼별 '+ 새 테스크' 버튼 **미구현**
- 검색 기능 (Task 제목, 담당자명으로 필터링) **미구현**
- 반응형 디자인 (모바일에서 x축 스크롤) **미구현**

#### 5.8 Task 카드 컴포넌트 구현 ❌
- `src/components/task/task-card.tsx` **없음**
- Task 정보 표시 (제목, 담당자, 마감일, 상태) **미구현**
- 수정/삭제 버튼 표시 (지시자만) **미구현**
- 상태 변경 버튼 표시 (지시자만) **미구현**
- 카드 클릭 시 Task 상세 페이지로 이동 **미구현**

---

## 🔧 필요한 작업 목록

### 우선순위 1: Task 생성 다이얼로그 보완 (5.4)

1. **카테고리 필드 추가**
   - `task-schema.ts`에 `task_category` 필드 추가 (필수)
   - `task-form-dialog.tsx`에 카테고리 선택 필드 추가
   - 4개 옵션: 검토(REVIEW) / 계약(CONTRACT) / 명세서(SPECIFICATION) / 출원(APPLICATION)
   - 생성 모드에서만 표시, 수정 모드에서는 읽기 전용

2. **담당자 선택 개선**
   - 프로젝트 참여자만 표시하도록 수정
   - `useProjectParticipants(projectId)` 훅 사용
   - 현재 사용자 제외
   - 프로필 인증된 사용자만 표시

3. **마감일 검증 로직 추가**
   - 오늘 이전 날짜 선택 불가
   - 프로젝트 완료 예정일 이전만 선택 가능
   - Zod 스키마에 검증 로직 추가

### 우선순위 2: 칸반 보드 컴포넌트 구현 (5.7)

1. **칸반 보드 기본 구조**
   - `src/components/task/kanban-board.tsx` 생성
   - 4개 컬럼 컴포넌트 (KanbanColumn)
   - 각 컬럼: 검토(REVIEW) / 계약(CONTRACT) / 명세서(SPECIFICATION) / 출원(APPLICATION)

2. **Task 카드 표시**
   - 각 컬럼에 해당 카테고리의 Task 카드 표시
   - Task 카드 컴포넌트 재사용 (5.8)

3. **기능 구현**
   - 컬럼별 '+ 새 테스크' 버튼 (권한에 따라)
   - 검색 기능 (Task 제목, 담당자명으로 필터링)
   - 반응형 디자인 (모바일에서 x축 스크롤)

### 우선순위 3: Task 카드 컴포넌트 구현 (5.8)

1. **Task 카드 기본 구조**
   - `src/components/task/task-card.tsx` 생성
   - Task 정보 표시: 제목, 담당자, 마감일, 상태

2. **버튼 및 액션**
   - 수정/삭제 버튼 표시 (지시자만)
   - 상태 변경 버튼 표시 (지시자만)
   - 카드 클릭 시 Task 상세 페이지로 이동

### 우선순위 4: 프로젝트 상세 페이지 통합 (5.9 보완)

1. **칸반 보드 통합**
   - 프로젝트 상세 페이지에 칸반 보드 탭 추가
   - 기존 테이블 뷰와 칸반 보드 뷰 전환 가능하도록

---

## 🚶 사용자 플로우

### 플로우 1: Task 생성
```
1. 프로젝트 상세 페이지 접근
2. "Task 생성" 버튼 클릭 (Admin만 표시)
3. Task 생성 다이얼로그 열림
4. 입력:
   - 제목 (필수)
   - 설명 (선택)
   - 카테고리 선택 (필수): 검토/계약/명세서/출원 중 선택
   - 담당자 선택 (필수): 프로젝트 참여자 중 선택 (현재 사용자 제외)
   - 마감일 선택 (선택, 프로젝트 완료 예정일 이전만)
5. "생성" 버튼 클릭
6. Task 생성 완료, 목록에 즉시 반영
```

### 플로우 2: Task 상태 전환
```
1. 프로젝트 상세 페이지에서 Task 목록 확인
2. 상태 변경 버튼 클릭 (지시자/담당자만 표시)
3. 상태 변경 다이얼로그 열림
4. 가능한 다음 상태 선택
5. 상태 변경 이유 입력 (선택)
6. "확인" 버튼 클릭
7. Optimistic Update로 즉시 UI 반영
8. 서버 동기화 완료
```

### 플로우 3: Task 수정/삭제
```
1. 프로젝트 상세 페이지에서 Task 목록 확인
2. 수정/삭제 버튼 클릭 (지시자만 표시)
3. 수정: Task 수정 다이얼로그 열림
   - 제목, 설명, 마감일만 수정 가능
   - 카테고리, 담당자, 지시자는 읽기 전용
4. 삭제: 삭제 확인 다이얼로그 표시
5. 확인 후 수정/삭제 실행
```

### 플로우 4: 칸반 보드 뷰
```
1. 프로젝트 상세 페이지 접근
2. "칸반 보드" 탭 선택
3. 4개 컬럼 표시: 검토 / 계약 / 명세서 / 출원
4. 각 컬럼에 해당 카테고리의 Task 카드 표시
5. 검색 기능으로 Task 필터링
6. 컬럼별 '+ 새 테스크' 버튼으로 Task 생성
```

---

## 📁 필요한 파일 목록

### 수정할 파일
1. `src/schemas/task/task-schema.ts` - 카테고리 필드 추가
2. `src/components/task/task-form-dialog.tsx` - 카테고리 필드, 담당자 필터링, 마감일 검증 추가
3. `src/pages/project-detail-page.tsx` - 칸반 보드 통합

### 새로 생성할 파일
1. `src/components/task/kanban-board.tsx` - 칸반 보드 컴포넌트
2. `src/components/task/task-card.tsx` - Task 카드 컴포넌트

---

## ⚠️ 주의사항

1. **카테고리 필드**
   - 생성 시 필수 선택
   - 생성 후 변경 불가 (수정 모드에서 읽기 전용)

2. **담당자 선택**
   - 프로젝트 참여자만 표시
   - 현재 사용자 제외
   - 프로필 인증된 사용자만 표시

3. **마감일 검증**
   - 오늘 이전 날짜 선택 불가
   - 프로젝트 완료 예정일 이전만 선택 가능

4. **칸반 보드**
   - Task 6에서 대시보드와 함께 구현될 수 있지만, Task 5 범위 내에서 기본 구조는 구현 필요
   - 프로젝트 상세 페이지에서 칸반 보드 뷰 제공

5. **권한 관리**
   - Task 생성: 프로젝트 참여자 (현재는 Admin만 가능하지만 기획상 참여자 가능)
   - Task 수정/삭제: 지시자만
   - Task 상태 변경: 지시자/담당자 (역할에 따라 다른 상태 전환 가능)

---

## 🎯 완료 기준

Task 5가 완료되려면:

1. ✅ Task 생성 시 카테고리 필수 선택 가능
2. ✅ 프로젝트 참여자만 담당자로 선택 가능
3. ✅ 마감일 검증 로직 정상 동작
4. ✅ 칸반 보드에 4개 컬럼 표시
5. ✅ 각 컬럼에 해당 카테고리의 Task 카드 표시
6. ✅ Task 카드에서 수정/삭제/상태 변경 가능
7. ✅ 프로젝트 상세 페이지에서 Task 관리 플로우 완결

---

**작성일**: 2025-01-XX
**상태**: 기획 요약 완료, 구현 준비 완료


