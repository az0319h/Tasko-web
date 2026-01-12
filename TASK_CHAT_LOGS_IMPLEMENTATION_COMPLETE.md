# Task 채팅 로그 전면 재구현 완료

## 원인 분석 (3줄 요약)

1. **기존 로직의 근본 문제**: `message_logs`가 `system_message_id` 기반으로 메시지 범위를 시간으로 추론하는 방식이었는데, 트리거 실행 순서 문제와 복잡한 카운트 업데이트 로직으로 인해 정확한 메시지 참조가 불가능했음.
2. **프론트엔드 필터링의 한계**: 백엔드에서 명시적으로 어떤 메시지가 로그에 속하는지 저장하지 않고, 프론트엔드에서 시간 범위로 필터링하여 UI와 DB 간 불일치 발생.
3. **데이터 일관성 문제**: 카운트 업데이트 트리거가 실패하거나 지연되면 `file_count`/`text_count`가 0으로 유지되어 UI에 "아무 내용도 존재하지 않음"이 표시됨.

## 구현 완료 내용

### 1. 마이그레이션 SQL

#### 기존 구조 제거
- `20260112000004_remove_old_message_logs_system.sql`: 기존 message_logs 관련 모든 트리거, 함수, 정책, 테이블 제거

#### 새 구조 생성
- `20260112000005_create_task_chat_logs_system.sql`: 
  - `chat_log_type` ENUM 생성 (START, REQUEST_CONFIRM, APPROVE, REJECT)
  - `task_chat_logs` 테이블 생성
  - `task_chat_log_items` 테이블 생성 (명시적 메시지 참조)
  - 인덱스 및 RLS 정책 생성

- `20260112000006_create_chat_log_function.sql`:
  - `create_task_chat_log` 함수 생성 (상태 변경 시 로그 생성 및 메시지 참조)

### 2. 타입 업데이트

**주의**: `database.type.ts`는 Supabase CLI로 자동 생성되므로 다음 명령 실행 필요:
```bash
npm run type-gen
```

**API 타입 정의** (`src/api/message.ts`):
- `ChatLogType`: "START" | "REQUEST_CONFIRM" | "APPROVE" | "REJECT"
- `ChatLog`: 로그 메타데이터
- `ChatLogWithItems`: 로그 + 참조된 메시지 목록 + 생성자 정보

### 3. API 로직 수정

#### `src/api/task.ts` - `updateTaskStatus` 함수
- 상태 변경 전에 `create_task_chat_log` RPC 함수 호출
- 승인됨(APPROVED) 상태 이후에는 로그 생성하지 않음
- 로그 생성 실패 시에도 상태 변경은 계속 진행 (경고만)

#### `src/api/message.ts` - `getChatLogsByTaskId` 함수
- 새 채팅 로그 조회 함수 추가
- 로그와 참조된 메시지들을 함께 조회
- FK 이름 문제를 피하기 위해 단계별 조회 방식 사용

### 4. 프론트엔드 컴포넌트 수정

#### 새 컴포넌트
- `src/components/task/chat-log-group.tsx`: 새 로그 그룹 컴포넌트 (명시적 메시지 참조 사용)

#### 수정된 파일
- `src/hooks/queries/use-chat-logs.ts`: 새 채팅 로그 조회 훅
- `src/pages/task-detail-page.tsx`: 
  - `useChatLogs` 훅 사용
  - `ChatLogGroup` 컴포넌트 사용
  - 타임라인 렌더링 로직 수정 (로그에 참조되지 않은 메시지만 일반 채팅으로 표시)

### 5. 변경된 파일 목록

#### 백엔드 (마이그레이션)
1. `supabase/migrations/20260112000004_remove_old_message_logs_system.sql`
2. `supabase/migrations/20260112000005_create_task_chat_logs_system.sql`
3. `supabase/migrations/20260112000006_create_chat_log_function.sql`

#### 프론트엔드
1. `src/api/message.ts` - 타입 정의 및 조회 함수 수정
2. `src/api/task.ts` - 상태 변경 함수에 로그 생성 로직 추가
3. `src/hooks/queries/use-chat-logs.ts` - 새 훅 추가
4. `src/components/task/chat-log-group.tsx` - 새 컴포넌트 추가
5. `src/pages/task-detail-page.tsx` - 렌더링 로직 수정
6. `src/hooks/index.ts` - 새 훅 export 추가

## 테스트 시나리오

### 시나리오 1: 시작 전 텍스트만
1. Task 생성
2. 텍스트 메시지 3개 전송
3. "시작" 버튼 클릭
4. **검증**: "시작 이전 대화" 로그 박스에 3개 메시지가 모두 표시됨

### 시나리오 2: 시작 전 파일 포함
1. Task 생성
2. 파일 메시지 2개, 텍스트 메시지 1개 전송
3. "시작" 버튼 클릭
4. **검증**: 
   - 로그 박스 헤더에 파일 2개, 텍스트 1개 표시
   - 로그 박스 펼치면 3개 메시지 모두 표시

### 시나리오 3: 확인요청 전후 연속 메시지
1. Task 생성 → "시작" 클릭
2. 시작 후 메시지 2개 전송
3. "확인 요청" 버튼 클릭
4. 확인 요청 후 메시지 3개 전송
5. **검증**:
   - "확인 요청 이전 대화" 로그 박스에 시작 후 메시지 2개만 표시
   - 확인 요청 후 메시지 3개는 일반 채팅으로 표시 (로그에 참조되지 않음)

### 시나리오 4: 승인 이후 일반 채팅 계속 + 로그 생성 안됨 검증
1. Task 생성 → "시작" → "확인 요청" → "승인" 클릭
2. 승인 후 메시지 5개 전송
3. **검증**:
   - 승인 후 메시지들이 일반 채팅으로 표시됨
   - 새로운 로그 박스가 생성되지 않음 (승인 이후 로그 생성 안 함)

## 다음 단계

1. ✅ 마이그레이션 파일 작성 완료
2. ⏳ 마이그레이션 적용: Supabase에 마이그레이션 적용
3. ⏳ 타입 재생성: `npm run type-gen` 실행하여 `database.type.ts` 업데이트
4. ⏳ 통합 테스트 수행 (4개 시나리오)
5. ⏳ 필요시 마이그레이션 수정 및 재적용

## 핵심 변경사항 요약

### 백엔드
- **기존**: `message_logs` 테이블 (시간 기반 범위 추론)
- **신규**: `task_chat_logs` + `task_chat_log_items` 테이블 (명시적 메시지 참조)
- **로그 생성**: 상태 변경 시 RPC 함수 호출로 트랜잭션 처리
- **승인 이후**: 로그 생성 안 함 (일반 채팅만 계속)

### 프론트엔드
- **기존**: `MessageGroup` 컴포넌트 (시간 범위 필터링)
- **신규**: `ChatLogGroup` 컴포넌트 (명시적 메시지 참조)
- **렌더링**: 로그에 참조되지 않은 메시지만 일반 채팅으로 표시

## 주의사항

- **타입 재생성 필수**: `database.type.ts`는 Supabase CLI로 자동 생성되므로 마이그레이션 적용 후 반드시 재생성 필요
- **기존 데이터**: 기존 `message_logs` 데이터는 마이그레이션으로 삭제됨 (의도된 동작)
- **RLS 정책**: 새 테이블의 RLS 정책은 프로젝트 참여자 기반으로 작동하며, 상태 변경 권한자만 로그 생성 가능
