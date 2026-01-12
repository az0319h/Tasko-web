# 파일+텍스트 동시 업로드 시 텍스트 누락 문제 해결 요약

## 1. 원인 분석 (3줄)

1. **메시지 생성 순서 문제**: 파일 메시지를 먼저 생성하고 텍스트 메시지를 나중에 생성하는데, 트리거는 마지막 파일 메시지(anchor)가 insert될 때 실행됨.
2. **범위 쿼리 제한**: 로그 생성 트리거에서 `created_at <= NEW.created_at` 조건으로 범위를 잡는데, 텍스트 메시지가 anchor보다 늦게 생성되면 범위 밖으로 빠짐.
3. **bundle_id 기반 수집 누락**: 범위 쿼리만 사용하고 bundle_id로 강제 수집하는 로직이 없어서, 같은 bundle_id의 텍스트 메시지가 누락됨.

## 2. 수정 계획

### 2-1. DB 트리거 수정 (옵션 A 선택)
**파일**: `supabase/migrations/20260113000003_fix_bundle_text_inclusion.sql`

**선택 이유**:
- 옵션 A는 DB 레벨에서 안전하게 처리되며, 레이스 컨디션이나 실패 시나리오에 강함.
- 옵션 B는 프론트/백엔드 전송 순서에 의존하므로 네트워크 지연이나 실패 시 위험함.

**수정 내용**:
1. 기존 범위 쿼리로 메시지 수집 (Step 1)
2. **추가로 bundle_id에 속한 모든 메시지를 강제로 포함** (Step 2)
3. 중복은 `ON CONFLICT (log_id, message_id) DO NOTHING`으로 방지

### 2-2. UI 개선
**파일**: `src/pages/task-detail-page.tsx`

**UX 기준**: 사용자가 채팅창에 진입했을 때 가장 최신 로그(마지막 로그)를 자동으로 펼쳐서 최근 업로드된 파일과 텍스트를 바로 확인할 수 있도록 함.

**수정 내용**:
- `chatLogs`가 로드될 때마다 마지막 로그 ID를 `expandedGroups`에 자동 추가
- 기존 펼침 상태는 유지하되, 마지막 로그는 항상 포함

## 3. 변경 코드 (Diff 수준)

### 3-1. DB 트리거 함수 수정
```sql
-- Step 1: 기존 범위 쿼리로 메시지 수집
FOR v_message_record IN
  SELECT id, created_at
  FROM public.messages
  WHERE task_id = NEW.task_id
    AND message_type IN ('USER', 'FILE')
    AND deleted_at IS NULL
    AND (
      (v_last_log_created_at IS NOT NULL AND created_at > v_last_log_created_at)
      OR
      (v_last_log_created_at IS NULL AND created_at >= v_task_start_time)
    )
    AND created_at <= NEW.created_at
  ORDER BY created_at ASC
LOOP
  v_collected_message_ids := array_append(v_collected_message_ids, v_message_record.id);
  INSERT INTO public.task_chat_log_items (...) VALUES (...);
END LOOP;

-- Step 2: bundle_id에 속한 모든 메시지 강제 포함 (신규 추가)
FOR v_bundle_message_record IN
  SELECT id, created_at
  FROM public.messages
  WHERE task_id = NEW.task_id
    AND bundle_id = NEW.bundle_id
    AND message_type IN ('USER', 'FILE')
    AND deleted_at IS NULL
    AND NOT (id = ANY(v_collected_message_ids)) -- 이미 포함된 메시지는 제외
  ORDER BY created_at ASC
LOOP
  INSERT INTO public.task_chat_log_items (...) VALUES (...)
  ON CONFLICT (log_id, message_id) DO NOTHING; -- 중복 방지
END LOOP;
```

### 3-2. UI 개선 (프론트엔드)
```typescript
// 마지막 로그만 기본 펼침 상태로 설정
useEffect(() => {
  if (chatLogs.length > 0) {
    const lastLog = chatLogs[chatLogs.length - 1];
    setExpandedGroups((prev) => {
      const newSet = new Set(prev);
      newSet.add(lastLog.id);
      return newSet;
    });
  }
}, [chatLogs]);
```

## 4. 변경된 파일 목록

### 4-1. 마이그레이션 파일 (신규)
- `supabase/migrations/20260113000003_fix_bundle_text_inclusion.sql`

### 4-2. 프론트엔드 파일 (수정)
- `src/pages/task-detail-page.tsx` - 마지막 로그 자동 펼침 로직 추가

## 5. 테스트 시나리오 4개

### 테스트 1: 파일만(1개) → 로그에 파일만 포함
**절차**:
1. Task 생성 (ASSIGNED 상태)
2. "시작" 버튼 클릭 (IN_PROGRESS로 변경)
3. 파일 1개만 전송 (텍스트 없음)
4. 채팅 로그 조회

**기대 결과**: 
- 로그 1개 생성됨
- 로그에 파일 메시지 1개만 포함
- 텍스트 메시지는 없음

### 테스트 2: 파일2+텍스트 → 로그에 파일2+텍스트 전부 포함(누락 없음)
**절차**:
1. Task 생성 (ASSIGNED 상태)
2. "시작" 버튼 클릭 (IN_PROGRESS로 변경)
3. 텍스트 + 파일 2개 함께 전송
4. 채팅 로그 조회

**기대 결과**:
- 로그 1개 생성됨
- 로그에 텍스트 메시지 1개 + 파일 메시지 2개 포함 (총 3개)
- 텍스트 메시지가 누락되지 않음

### 테스트 3: 연속 업로드 2번 → 각각의 로그에 각 묶음 텍스트 포함 확인
**절차**:
1. Task 생성 (ASSIGNED 상태)
2. "시작" 버튼 클릭 (IN_PROGRESS로 변경)
3. 텍스트1 + 파일1 전송 (첫 번째 전송)
4. 텍스트2 + 파일2 전송 (두 번째 전송)
5. 채팅 로그 조회

**기대 결과**:
- 로그 2개 생성됨
- 첫 번째 로그: 텍스트1 + 파일1 포함 (총 2개)
- 두 번째 로그: 텍스트2 + 파일2 포함 (총 2개)
- 각 묶음의 텍스트가 해당 로그에 정확히 포함됨

### 테스트 4: 최신 로그만 기본 open 동작 확인
**절차**:
1. Task 생성 (ASSIGNED 상태)
2. "시작" 버튼 클릭 (IN_PROGRESS로 변경)
3. 파일 1개 전송 (첫 번째 로그 생성)
4. 파일 1개 전송 (두 번째 로그 생성)
5. 채팅창 새로고침 또는 재진입

**기대 결과**:
- 로그 2개 모두 표시됨
- 첫 번째 로그: 접힘 상태 (닫혀있음)
- 두 번째 로그: 펼침 상태 (자동으로 열려있음)
- 두 번째 로그를 클릭하면 접힘 상태로 변경됨

## 6. 구현 완료 체크리스트

- [x] 원인 분석 완료
- [x] DB 트리거 수정: bundle_id 전체 수집 로직 추가
- [x] UI 개선: 마지막 로그만 기본 펼침 상태로 렌더
- [x] 테스트 시나리오 작성
- [x] 마이그레이션 적용 완료

## 7. 주의사항

1. **기존 데이터**: 이미 생성된 로그는 텍스트가 누락된 상태일 수 있으므로, 필요 시 데이터 마이그레이션 고려
2. **성능**: bundle_id 기반 추가 수집은 인덱스가 있어야 효율적 (이미 `idx_messages_bundle_id` 인덱스 존재)
3. **중복 방지**: `ON CONFLICT (log_id, message_id) DO NOTHING`으로 중복 삽입 방지
