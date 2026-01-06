# 읽음 처리 관련 DB 정책(RLS) 확인 결과

## 📋 확인 범위

1. messages 테이블에서 read_by/읽음 관련 UPDATE가 assigner 또는 assignee에 대해 RLS에 의해 차단되지 않는지
2. Admin(제3자)이 읽음 관련 UPDATE를 시도할 수 없는지
3. Realtime 이벤트 발생 시 RLS 때문에 읽음 상태가 누락될 가능성은 없는지

---

## ✅ 확인 결과 요약

**결론: 문제 없음. 구현 진행 가능.**

이유:
- 읽음 처리 함수는 `SECURITY DEFINER`로 실행되므로 RLS를 우회함
- 함수 내부에서 assigner/assignee 체크를 추가하면 Admin(제3자) 차단 가능
- Realtime 이벤트는 정상 발생함

---

## 🔍 상세 확인 결과

### 1. 현재 RLS 정책 상태

**messages 테이블 RLS 정책:**

| 정책명 | 명령 | 조건 |
|--------|------|------|
| `messages_select_task_access` | SELECT | Task 접근 권한이 있으면 조회 가능 |
| `messages_insert_task_access` | INSERT | Task 접근 권한이 있고 본인 메시지만 생성 |
| `messages_update_own_user_messages` | UPDATE | **본인이 보낸 USER/FILE 메시지만 수정 가능** |
| `messages_delete_own_user_messages` | DELETE | 본인이 보낸 USER 메시지만 삭제 가능 |

**문제점:**
- UPDATE 정책: `auth.uid() = user_id AND (message_type = 'USER' OR message_type = 'FILE')`
- 읽음 처리는 **상대방이 읽는 것**이므로, 이 정책에 의해 차단될 수 있음
- 예: 담당자가 지시자의 메시지를 읽음 처리하려고 하면 `auth.uid() = user_id` 조건에 맞지 않아 실패

---

### 2. 읽음 처리 함수 확인

**현재 함수 상태:**

```sql
-- 함수 소유자: postgres (SUPERUSER)
-- SECURITY DEFINER: true
-- RLS 우회: 가능 (SUPERUSER 권한으로 실행)
```

**함수 정의:**
- `mark_message_as_read`: SECURITY DEFINER
- `mark_task_messages_as_read`: SECURITY DEFINER

**SECURITY DEFINER의 동작:**
- 함수는 **함수 소유자(postgres)의 권한**으로 실행됨
- postgres는 SUPERUSER이므로 **RLS를 완전히 우회**함
- 함수 내부의 UPDATE는 RLS 정책에 영향받지 않음

**결론:**
- ✅ RLS에 의해 차단되지 않음
- ✅ assigner/assignee 모두 읽음 처리 가능
- ⚠️ 하지만 현재 함수는 assigner/assignee 체크를 하지 않아 Admin(제3자)도 호출 가능

---

### 3. Admin(제3자) 차단 여부 확인

**현재 상태:**
- 함수는 누구나 호출 가능 (RPC 호출)
- 함수 내부에서 assigner/assignee 체크를 하지 않음
- 따라서 Admin(제3자)도 읽음 처리를 할 수 있음

**개선 방안:**
- 함수 내부에서 assigner/assignee 체크 추가
- 계획서에 이미 포함되어 있음

**개선 후 함수 로직:**
```sql
-- 읽는 사람이 assigner/assignee인지 확인
is_reader_assigner := (reader_id = task_record.assigner_id);
is_reader_assignee := (reader_id = task_record.assignee_id);

-- 읽는 사람이 assigner 또는 assignee가 아니면 처리하지 않음
IF NOT (is_reader_assigner OR is_reader_assignee) THEN
  RETURN;  -- Admin(제3자)는 여기서 차단됨
END IF;
```

**결론:**
- ⚠️ 현재는 Admin(제3자)도 호출 가능
- ✅ 계획서의 함수 수정안 적용 시 차단됨

---

### 4. Realtime 이벤트 발생 확인

**Realtime 동작 방식:**
- `messages` 테이블의 UPDATE 이벤트를 구독
- `read_by` 필드가 업데이트되면 Realtime 이벤트 발생

**SECURITY DEFINER 함수의 UPDATE:**
- RLS를 우회하므로 UPDATE가 정상 실행됨
- UPDATE가 실행되면 Realtime 이벤트도 정상 발생함
- 다만 함수 내부에서 조건에 맞지 않으면 UPDATE가 실행되지 않으므로, Realtime 이벤트도 발생하지 않음

**시나리오별 확인:**

| 시나리오 | UPDATE 실행 | Realtime 이벤트 | 결과 |
|---------|------------|----------------|------|
| assigner가 담당자 메시지 읽음 | ✅ 실행됨 | ✅ 발생함 | ✅ 정상 |
| 담당자가 지시자 메시지 읽음 | ✅ 실행됨 | ✅ 발생함 | ✅ 정상 |
| Admin(제3자)가 메시지 읽음 시도 | ❌ 실행 안 됨 | ❌ 발생 안 함 | ✅ 차단됨 (개선 후) |

**결론:**
- ✅ Realtime 이벤트는 정상 발생함
- ✅ RLS 때문에 읽음 상태가 누락될 가능성 없음
- ✅ 조건에 맞지 않으면 UPDATE가 실행되지 않으므로, 불필요한 Realtime 이벤트도 발생하지 않음

---

## 📊 최종 검증 결과

### ✅ 확인 항목 1: RLS 차단 여부
- **결과**: 문제 없음
- **이유**: SECURITY DEFINER 함수는 RLS를 우회함
- **조치**: 추가 조치 불필요

### ✅ 확인 항목 2: Admin(제3자) 차단
- **현재 상태**: 차단 안 됨 (함수 내부 체크 없음)
- **개선 후**: 차단됨 (함수 내부에서 assigner/assignee 체크)
- **조치**: 계획서의 함수 수정안 적용 필요

### ✅ 확인 항목 3: Realtime 이벤트 누락
- **결과**: 문제 없음
- **이유**: SECURITY DEFINER 함수의 UPDATE는 정상 실행되며 Realtime 이벤트도 정상 발생
- **조치**: 추가 조치 불필요

---

## 🎯 구현 전 최종 확인 사항

### 1. 함수 수정 필요성
- ✅ 계획서의 함수 수정안이 올바름
- ✅ assigner/assignee 체크 로직이 포함되어 있음
- ✅ Admin(제3자) 차단 로직이 포함되어 있음

### 2. RLS 정책 변경 필요성
- ❌ RLS 정책 변경 불필요
- ✅ SECURITY DEFINER 함수가 RLS를 우회하므로 기존 정책 유지 가능

### 3. 추가 보안 고려사항
- ✅ 함수 내부에서 assigner/assignee 체크로 충분
- ✅ 함수 호출 권한은 RPC 권한으로 제어됨 (인증된 사용자만 호출 가능)

---

## ✅ 최종 결론

**구현 진행 가능.**

**이유:**
1. ✅ RLS에 의해 차단되지 않음 (SECURITY DEFINER 함수)
2. ✅ Admin(제3자) 차단 가능 (함수 내부 체크 추가)
3. ✅ Realtime 이벤트 정상 발생 (RLS 우회)

**구현 시 주의사항:**
- 계획서의 함수 수정안을 정확히 적용할 것
- 함수 내부에서 assigner/assignee 체크를 반드시 포함할 것
- 테스트 시 Admin(제3자) 시나리오도 포함할 것

---

**확인일:** 2025-01-XX  
**확인자:** AI Assistant  
**상태:** 확인 완료, 구현 진행 가능


