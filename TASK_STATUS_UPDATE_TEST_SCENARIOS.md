# Task 상태 변경 테스트 시나리오

## 테스트 목표
- RLS 정책 수정 후 task 상태 변경이 정상 동작하는지 확인
- DB 반영, 이메일 전송, 프론트 성공/실패 표시가 모두 일관되게 동작하는지 확인

## 사전 준비
1. 테스트용 Task 생성 (Admin 계정으로)
   - assigner: User A (assigner 역할)
   - assignee: User B (assignee 역할)
   - 상태: ASSIGNED

2. 테스트 계정 준비
   - Admin 계정
   - User A (assigner)
   - User B (assignee)
   - User C (관련 없는 사용자)

## 테스트 시나리오

### 시나리오 1: assignee가 ASSIGNED → IN_PROGRESS 변경
**예상 결과:**
- ✅ DB에 상태가 IN_PROGRESS로 반영됨
- ✅ 트리거 실행되어 이메일 발송됨 (assigner와 assignee 모두에게)
- ✅ 프론트엔드에 성공 토스트 메시지 표시됨
- ✅ `email_logs` 테이블에 로그 기록됨

**검증 방법:**
1. User B로 로그인
2. Task 상태를 IN_PROGRESS로 변경
3. DB 확인: `SELECT task_status FROM tasks WHERE id = 'task_id'`
4. 이메일 로그 확인: `SELECT * FROM email_logs WHERE task_id = 'task_id' ORDER BY created_at DESC LIMIT 2`
5. 프론트엔드에서 성공 메시지 확인

### 시나리오 2: assignee가 IN_PROGRESS → WAITING_CONFIRM 변경
**예상 결과:**
- ✅ DB에 상태가 WAITING_CONFIRM으로 반영됨
- ✅ 트리거 실행되어 이메일 발송됨 (assigner에게만)
- ✅ 프론트엔드에 성공 토스트 메시지 표시됨

**검증 방법:**
1. User B로 로그인
2. Task 상태를 WAITING_CONFIRM으로 변경
3. DB 확인
4. 이메일 로그 확인 (assigner에게만 발송되었는지)
5. 프론트엔드에서 성공 메시지 확인

### 시나리오 3: assigner가 WAITING_CONFIRM → APPROVED 변경
**예상 결과:**
- ✅ DB에 상태가 APPROVED로 반영됨
- ✅ 트리거 실행되어 이메일 발송됨 (assignee에게만)
- ✅ 프론트엔드에 성공 토스트 메시지 표시됨

**검증 방법:**
1. User A로 로그인
2. Task 상태를 APPROVED로 변경
3. DB 확인
4. 이메일 로그 확인 (assignee에게만 발송되었는지)
5. 프론트엔드에서 성공 메시지 확인

### 시나리오 4: assigner가 WAITING_CONFIRM → REJECTED 변경
**예상 결과:**
- ✅ DB에 상태가 REJECTED로 반영됨
- ✅ 트리거 실행되어 이메일 발송됨 (assignee에게만)
- ✅ 프론트엔드에 성공 토스트 메시지 표시됨

**검증 방법:**
1. User A로 로그인
2. Task 상태를 REJECTED로 변경
3. DB 확인
4. 이메일 로그 확인
5. 프론트엔드에서 성공 메시지 확인

### 시나리오 5: Admin이 일반 필드(title, description) 수정
**예상 결과:**
- ✅ DB에 필드가 반영됨
- ✅ 프론트엔드에 성공 토스트 메시지 표시됨
- ✅ 이메일 발송되지 않음 (일반 필드 수정이므로)

**검증 방법:**
1. Admin으로 로그인
2. Task의 title 또는 description 수정
3. DB 확인
4. 이메일 로그 확인 (발송되지 않았는지)

### 시나리오 6: Admin이 task_status 직접 변경 시도
**예상 결과:**
- ❌ 애플리케이션 레벨에서 차단됨 ("Admin은 Task 상태를 변경할 수 없습니다.")
- ❌ DB 변경되지 않음
- ❌ 이메일 발송되지 않음

**검증 방법:**
1. Admin으로 로그인
2. Task 상태 변경 시도
3. 에러 메시지 확인
4. DB 확인 (변경되지 않았는지)

### 시나리오 7: assigner/assignee가 다른 필드(title) 변경 시도
**예상 결과:**
- ❌ 애플리케이션 레벨에서 차단됨 (updateTaskStatus 함수는 task_status만 변경)
- ❌ 또는 RLS 정책에 의해 차단됨

**검증 방법:**
1. User A 또는 User B로 로그인
2. Task의 title 변경 시도 (updateTask 함수 사용)
3. 에러 메시지 확인
4. DB 확인 (변경되지 않았는지)

### 시나리오 8: 관련 없는 사용자(User C)가 상태 변경 시도
**예상 결과:**
- ❌ RLS 정책에 의해 차단됨
- ❌ 명확한 에러 메시지 표시됨
- ❌ DB 변경되지 않음

**검증 방법:**
1. User C로 로그인
2. Task 상태 변경 시도
3. 에러 메시지 확인 ("상태 변경 권한이 없습니다...")
4. DB 확인 (변경되지 않았는지)

### 시나리오 9: 잘못된 상태 전환 시도 (예: ASSIGNED → APPROVED)
**예상 결과:**
- ❌ 애플리케이션 레벨에서 차단됨 (상태 전환 유효성 검증)
- ❌ 명확한 에러 메시지 표시됨
- ❌ DB 변경되지 않음

**검증 방법:**
1. User B로 로그인
2. ASSIGNED 상태에서 APPROVED로 변경 시도
3. 에러 메시지 확인
4. DB 확인 (변경되지 않았는지)

### 시나리오 10: Optimistic Update 롤백 테스트
**예상 결과:**
- ✅ 상태 변경 실패 시 UI가 이전 상태로 롤백됨
- ✅ 에러 토스트 메시지 표시됨

**검증 방법:**
1. 네트워크를 끊거나 권한 없는 사용자로 상태 변경 시도
2. UI가 이전 상태로 롤백되는지 확인
3. 에러 메시지 확인

## SQL 쿼리 (검증용)

### Task 상태 확인
```sql
SELECT 
  id,
  title,
  task_status,
  assigner_id,
  assignee_id,
  updated_at
FROM tasks
WHERE id = 'task_id';
```

### 이메일 로그 확인
```sql
SELECT 
  id,
  task_id,
  recipient_email,
  recipient_name,
  subject,
  status,
  error_message,
  created_at,
  sent_at
FROM email_logs
WHERE task_id = 'task_id'
ORDER BY created_at DESC;
```

### 최근 상태 변경 확인
```sql
SELECT 
  m.id,
  m.task_id,
  m.content,
  m.message_type,
  m.created_at,
  p.email as user_email
FROM messages m
JOIN profiles p ON m.user_id = p.id
WHERE m.task_id = 'task_id'
  AND m.message_type = 'SYSTEM'
ORDER BY m.created_at DESC;
```

## 예상 문제 및 해결 방법

### 문제 1: RLS 정책이 여전히 차단함
**증상:** 상태 변경 시도 시 "상태 변경 권한이 없습니다" 에러
**해결:** RLS 정책 확인, 사용자가 assigner 또는 assignee인지 확인

### 문제 2: 이메일이 발송되지 않음
**증상:** DB는 변경되었지만 이메일 로그가 없음
**해결:** 
- 트리거 확인: `SELECT * FROM pg_trigger WHERE tgname LIKE '%task_status%'`
- Edge Function 로그 확인
- `email_logs` 테이블 확인

### 문제 3: 프론트엔드에서 성공 메시지가 표시되지만 DB가 변경되지 않음
**증상:** Optimistic Update로 인해 UI는 변경되었지만 실제 DB는 변경되지 않음
**해결:** 
- 네트워크 탭에서 실제 API 응답 확인
- 에러가 발생했는지 확인
- Optimistic Update 롤백이 제대로 작동하는지 확인

