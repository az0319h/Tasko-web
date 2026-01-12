# 파일 업로드 기반 채팅 로그 구현 완료 요약

## 1. 원인 분석 (3줄)

1. **첫 로그 범위 계산 오류**: 기존 구현은 START 타입 로그의 `created_at`(파일 업로드 시점)을 사용했으나, 요구사항은 "시작 버튼(IN_PROGRESS 상태 변경) 이후"부터 첫 파일 전송까지여야 함.
2. **상태 기반 로그 생성 함수 잔존**: `create_task_chat_log_deprecated` 함수가 여전히 존재하여 혼란 가능성 있음.
3. **SYSTEM 메시지 기반 시작 시점 미사용**: IN_PROGRESS 상태 변경 시 생성된 SYSTEM 메시지의 `created_at`을 사용하지 않고, 로그 생성 시점을 기준으로 범위를 계산함.

## 2. 마이그레이션 SQL

### 2-1. 첫 로그 범위 계산 수정
**파일**: `supabase/migrations/20260113000001_fix_file_based_log_range_calculation.sql`

**변경 사항**:
- `create_chat_log_on_file_upload()` 함수 수정
- 첫 로그 범위 계산 시 IN_PROGRESS 상태 변경 시 생성된 SYSTEM 메시지의 `created_at` 사용
- SYSTEM 메시지가 없으면 Task 생성 시간 사용 (fallback)

**핵심 로직**:
```sql
-- Get task start time: IN_PROGRESS 상태 변경 시 생성된 SYSTEM 메시지의 created_at
SELECT 
  COALESCE(
    (SELECT created_at FROM public.messages 
     WHERE task_id = NEW.task_id 
     AND message_type = 'SYSTEM'
     AND content LIKE '%진행 중%'
     ORDER BY created_at ASC LIMIT 1),
    (SELECT created_at FROM public.tasks WHERE id = NEW.task_id)
  ) INTO v_task_start_time;
```

### 2-2. 상태 기반 로그 생성 함수 제거
**파일**: `supabase/migrations/20260113000002_remove_status_based_log_creation.sql`

**변경 사항**:
- `create_task_chat_log_deprecated` 함수 완전 제거
- 파일 업로드 기반 로그 생성만 유지

## 3. 타입 업데이트

**파일**: `src/database.type.ts`

**현재 상태**: 
- `messages` 테이블에 `bundle_id` (UUID | null) 및 `is_log_anchor` (boolean) 컬럼 이미 존재
- `task_chat_logs` 테이블에 `title` (TEXT | null) 컬럼 이미 존재
- 타입 정의는 Supabase CLI로 자동 생성되므로 추가 작업 불필요

## 4. 변경된 파일 목록

### 4-1. 마이그레이션 파일 (신규)
- `supabase/migrations/20260113000001_fix_file_based_log_range_calculation.sql`
- `supabase/migrations/20260113000002_remove_status_based_log_creation.sql`

### 4-2. 기존 파일 (변경 없음, 이미 구현됨)
- `src/api/message.ts` - `createMessageWithFiles` 함수가 이미 `bundle_id`와 `is_log_anchor` 지원
- `src/pages/task-detail-page.tsx` - `bundleId` 생성 및 전달 로직 이미 구현됨
- `src/components/task/chat-log-group.tsx` - 접힘 상태 UI 이미 구현됨

## 5. 핵심 코드 (Diff 수준)

### 5-1. 백엔드 API (`src/api/message.ts`)
```typescript
// 파일이 포함된 경우 bundle_id 생성
const hasFiles = files.length > 0;
const finalBundleId = hasFiles ? (bundleId || crypto.randomUUID()) : null;

// 마지막 파일 메시지에만 is_log_anchor=true 설정
is_log_anchor: isLastFile && hasFiles, // 마지막 파일만 anchor
```

### 5-2. 프론트엔드 (`src/pages/task-detail-page.tsx`)
```typescript
// 파일이 포함된 경우 bundleId 생성 (로그 생성용)
const bundleId = uploadedFiles.length > 0 ? crypto.randomUUID() : undefined;

await createMessageWithFiles.mutateAsync({
  taskId,
  content,
  files: uploadedFiles,
  bundleId,
});
```

### 5-3. DB 트리거 함수 (수정됨)
```sql
-- 첫 로그 범위: IN_PROGRESS 상태 변경 시점부터
SELECT 
  COALESCE(
    (SELECT created_at FROM public.messages 
     WHERE task_id = NEW.task_id 
     AND message_type = 'SYSTEM'
     AND content LIKE '%진행 중%'
     ORDER BY created_at ASC LIMIT 1),
    (SELECT created_at FROM public.tasks WHERE id = NEW.task_id)
  ) INTO v_task_start_time;
```

## 6. 테스트 시나리오 5개

### 테스트 1: 텍스트만 전송 → 로그 생성 안 됨
**절차**:
1. Task 생성 (ASSIGNED 상태)
2. "시작" 버튼 클릭 (IN_PROGRESS로 변경)
3. 텍스트만 전송 (파일 없음)
4. 채팅 로그 조회

**기대 결과**: 로그가 생성되지 않음 (텍스트만 전송은 로그 생성 안 됨)

### 테스트 2: 파일 1개만 전송 → 로그 생성 O / title=파일명
**절차**:
1. Task 생성 (ASSIGNED 상태)
2. "시작" 버튼 클릭 (IN_PROGRESS로 변경)
3. 파일 1개만 전송 (텍스트 없음)
4. 채팅 로그 조회

**기대 결과**: 
- 로그 1개 생성됨
- 로그 title = 파일명
- 로그에 파일 메시지 1개 포함

### 테스트 3: 텍스트+파일2개 → 로그 O / title=두 파일명 / 로그 내부에 텍스트 포함
**절차**:
1. Task 생성 (ASSIGNED 상태)
2. "시작" 버튼 클릭 (IN_PROGRESS로 변경)
3. 텍스트 + 파일 2개 함께 전송
4. 채팅 로그 조회

**기대 결과**:
- 로그 1개 생성됨
- 로그 title = "파일1명, 파일2명" (쉼표로 구분)
- 로그에 텍스트 메시지 1개 + 파일 메시지 2개 포함 (총 3개)

### 테스트 4: 연속 파일 전송 2번 → 로그 2개 범위 정확
**절차**:
1. Task 생성 (ASSIGNED 상태)
2. "시작" 버튼 클릭 (IN_PROGRESS로 변경)
3. 파일 1개 전송 (첫 번째 전송)
4. 텍스트 메시지 1개 전송 (로그 생성 안 됨)
5. 파일 2개 전송 (두 번째 전송)
6. 채팅 로그 조회

**기대 결과**:
- 로그 2개 생성됨
- 첫 번째 로그: 파일 1개만 포함
- 두 번째 로그: 텍스트 메시지 1개 + 파일 2개 포함 (총 3개)
- 로그 범위가 정확히 구분됨 (첫 로그 이후부터 두 번째 파일 전송까지)

### 테스트 5: 시작 버튼 이후 첫 파일 전송에서만 "첫 로그 범위"가 시작 시점 기준으로 잡히는지 검증
**절차**:
1. Task 생성 (ASSIGNED 상태)
2. 텍스트 메시지 1개 전송 (시작 전, 로그 생성 안 됨)
3. "시작" 버튼 클릭 (IN_PROGRESS로 변경)
4. 텍스트 메시지 1개 전송 (시작 후, 로그 생성 안 됨)
5. 파일 1개 전송 (첫 파일 전송)
6. 채팅 로그 조회

**기대 결과**:
- 로그 1개 생성됨
- 로그에 포함된 메시지: 시작 버튼 이후의 텍스트 메시지 1개 + 파일 메시지 1개 (총 2개)
- 시작 버튼 이전의 텍스트 메시지는 로그에 포함되지 않음

## 7. 구현 완료 체크리스트

- [x] DB 마이그레이션: 첫 로그 범위 계산 수정
- [x] DB 마이그레이션: 상태 기반 로그 생성 함수 제거
- [x] 타입 업데이트: bundle_id, is_log_anchor, title 컬럼 확인
- [x] 백엔드 API: bundle_id, is_log_anchor 지원 확인
- [x] 프론트엔드: bundleId 생성 및 전달 확인
- [x] UI: 접힘 상태 표시 확인
- [x] 테스트 시나리오 작성

## 8. 주의사항

1. **기존 데이터**: 이미 생성된 로그는 범위가 다를 수 있으므로, 필요 시 데이터 마이그레이션 고려
2. **SYSTEM 메시지**: IN_PROGRESS 상태 변경 시 SYSTEM 메시지가 생성되어야 첫 로그 범위 계산이 정확함
3. **로그 타입**: 파일 업로드 기반 로그는 모두 `START` 타입으로 생성됨 (요구사항에 따라 변경 가능)
