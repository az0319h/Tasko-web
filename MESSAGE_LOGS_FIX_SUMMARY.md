# Message Logs 버그 수정 완료 요약

## 문제 원인

1. **트리거 실행 순서 문제**
   - `trigger_02_create_message_log_on_status_change`가 `trigger_create_task_status_change_system_message`보다 먼저 실행됨
   - 결과: 로그 생성 시점에 시스템 메시지가 아직 생성되지 않아 잘못된 `system_message_id` 참조

2. **메시지 카운트 업데이트 트리거 로직 문제**
   - 첫 로그의 경우 "다음 로그 찾기" 로직이 잘못됨 (`previous_system_message_id` 기반으로 찾음)
   - 상태 변경 이후 생성된 메시지가 카운트에 포함되지 않음

3. **기존 로그 데이터 미반영**
   - 백필 로직이 없어 기존 로그의 카운트가 0으로 유지됨

## 수정 내용

### 1. 트리거 실행 순서 수정
**마이그레이션**: `fix_trigger_order_for_message_logs`
- 시스템 메시지 생성 트리거를 `trigger_01_...`로 변경하여 로그 생성 트리거보다 먼저 실행되도록 보장
- 이메일 발송 트리거를 `trigger_03_...`로 변경하여 로그 생성 이후 실행되도록 보장

### 2. 메시지 카운트 업데이트 트리거 로직 수정
**마이그레이션**: `fix_message_log_count_trigger_logic_v2`
- 첫 로그: Task 생성 ~ 다음 상태 변경 시점까지 (상태 변경 이후 메시지 포함)
- 중간 로그: 이전 상태 변경 ~ 현재 상태 변경 시점까지
- 거부됨(REJECTED) 로그: 이전 상태 변경 ~ 다음 상태 변경 시점까지
- 승인됨(APPROVED) 로그: 이전 상태 변경 ~ 현재 상태 변경 시점까지만

**핵심 수정사항**:
- 다음 로그 찾기 로직을 `created_at` 기반으로 변경 (기존: `previous_system_message_id` 기반)
- 상태 변경 이후 메시지도 올바르게 카운트되도록 수정

### 3. 기존 로그 데이터 백필
**마이그레이션**: `fix_backfill_message_log_counts_v2`
- 모든 기존 로그의 `file_count`와 `text_count` 재계산
- 수정된 로직으로 기존 데이터도 올바르게 반영

## 배열 참조 방식 검토

### 제안된 방식
`message_logs` 테이블에 메시지 ID 배열 컬럼 추가:
```sql
ALTER TABLE message_logs ADD COLUMN message_ids UUID[];
ALTER TABLE message_logs ADD COLUMN file_ids UUID[];
```

### 장단점 비교

#### 배열 참조 방식
**장점**:
- 명시적으로 어떤 메시지들이 로그에 속하는지 저장 가능
- 쿼리 시 JOIN 없이 직접 참조 가능

**단점**:
- 메시지 추가/삭제 시마다 배열 업데이트 필요 (트리거 복잡도 증가)
- JSONB 배열 인덱싱이 복잡하고 성능 이슈 가능
- 메시지가 많아지면 배열 크기 증가로 스토리지 비효율
- 배열 동기화 문제 (트리거 실패 시 데이터 불일치)

#### 현재 방식 (시간 범위 기반)
**장점**:
- 시간 범위 기반이므로 메시지 추가/삭제 시 자동으로 범위에 포함
- 스토리지 효율적 (카운트만 저장)
- 쿼리 성능 우수 (인덱스 활용 가능)
- 확장성 좋음 (메시지 수와 무관)

**단점**:
- 메시지 조회 시 시간 범위 기반 필터링 필요 (하지만 이미 구현됨)

### 결론
**현재 방식(시간 범위 기반)을 유지하는 것을 권장합니다.**

이유:
1. 이미 프론트엔드에서 시간 범위 기반 필터링이 구현되어 있음
2. 데이터 일관성과 성능 측면에서 우수
3. 유지보수 용이성 (트리거 복잡도 낮음)
4. 확장성 좋음

만약 배열 방식이 필요하다면, 별도의 `message_log_messages` 조인 테이블을 사용하는 것이 배열보다 나음:
```sql
CREATE TABLE message_log_messages (
  log_id UUID REFERENCES message_logs(id),
  message_id UUID REFERENCES messages(id),
  PRIMARY KEY (log_id, message_id)
);
```

## 테스트 결과

### 백필 후 데이터 확인
```sql
SELECT id, title, status, file_count, text_count 
FROM message_logs 
ORDER BY created_at DESC;
```

결과:
- ✅ 첫 번째 로그: `text_count=2` (정확함)
- ✅ 다른 로그들도 올바르게 카운트됨

### 향후 테스트 시나리오

1. **텍스트만 포함**
   - 업무 할당 후 텍스트 메시지 주고받기
   - 상태 변경 시 로그 박스에 텍스트 메시지들이 표시되는지 확인

2. **파일 포함**
   - 파일 메시지 업로드 후 상태 변경
   - 로그 박스 헤더의 파일 카운트와 박스 내부 파일 렌더링 확인

3. **연속 상태 변경**
   - `ASSIGNED -> IN_PROGRESS -> WAITING_CONFIRM` 연속 변경
   - 각 단계 사이의 대화 기록이 각각의 로그 박스에 올바르게 분리되어 들어가는지 확인

## 변경된 파일

### 백엔드 (마이그레이션)
1. `fix_trigger_order_for_message_logs` - 트리거 순서 수정
2. `fix_message_log_count_trigger_logic_v2` - 카운트 업데이트 트리거 로직 수정
3. `fix_backfill_message_log_counts_v2` - 기존 로그 데이터 백필

### 프론트엔드 (이전에 수정됨)
1. `src/components/task/message-group.tsx` - 필터링 범위 수정 (`>=` 사용)
2. `src/pages/task-detail-page.tsx` - 초기 시스템 메시지 렌더링 추가

## 다음 단계

1. ✅ 트리거 순서 수정 완료
2. ✅ 메시지 카운트 업데이트 로직 수정 완료
3. ✅ 기존 로그 데이터 백필 완료
4. ⏳ 프론트엔드 테스트 (이미 수정됨)
5. ⏳ 통합 테스트 수행
