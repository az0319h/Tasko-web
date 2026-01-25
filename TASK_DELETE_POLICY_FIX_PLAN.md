# Task 삭제 정책 수정 계획

**작성 일시**: 2026-01-26  
**요구사항**: Task 생성자(지시자)만 Task를 삭제할 수 있어야 함

---

## 🎯 요구사항

- ✅ **Task 생성자(지시자, assigner_id)만 삭제 가능**
- ❌ **관리자는 삭제 불가** (지시자만 가능)
- ✅ 프론트엔드와 백엔드 정책 일치

---

## 📋 현재 상태

### 현재 적용된 정책

**파일**: `supabase/migrations/migrations_refactoring/complete_refactoring.sql`  
**라인**: 215-220

```sql
-- DELETE 정책: 관리자만 삭제 가능
DROP POLICY IF EXISTS "tasks_delete_admin_only" ON public.tasks;
CREATE POLICY "tasks_delete_admin_only"
ON public.tasks
FOR DELETE
USING (is_admin(auth.uid()));
```

**문제**: 관리자만 삭제 가능하도록 설정되어 있어, 지시자는 삭제할 수 없음

---

## 🔧 수정 계획

### 수정할 파일

1. **개별 마이그레이션 파일**: `supabase/migrations/migrations_refactoring/03_tasks_rls_policies.sql`
2. **통합 마이그레이션 파일**: `supabase/migrations/migrations_refactoring/complete_refactoring.sql`

### 수정 내용

#### 1. DELETE 정책 변경

**현재 (215-220줄)**:
```sql
-- DELETE 정책: 관리자만 삭제 가능
DROP POLICY IF EXISTS "tasks_delete_admin_only" ON public.tasks;
CREATE POLICY "tasks_delete_admin_only"
ON public.tasks
FOR DELETE
USING (is_admin(auth.uid()));
```

**변경 후**:
```sql
-- DELETE 정책: 지시자만 삭제 가능
DROP POLICY IF EXISTS "tasks_delete_admin_only" ON public.tasks;
DROP POLICY IF EXISTS "tasks_delete_assigner_only" ON public.tasks;
CREATE POLICY "tasks_delete_assigner_only"
ON public.tasks
FOR DELETE
USING (auth.uid() = assigner_id);
```

#### 2. 기존 정책 제거 부분 수정

**현재 (235줄)**:
```sql
DROP POLICY IF EXISTS "tasks_delete_assigner_only" ON public.tasks;
```

**변경 후**: 
- 이 줄은 제거 (위에서 이미 처리됨)

#### 3. 정책 코멘트 수정

**현재 (250-251줄)**:
```sql
COMMENT ON POLICY "tasks_delete_admin_only" ON public.tasks IS 
'태스크 삭제 정책: 관리자만 태스크 삭제 가능';
```

**변경 후**:
```sql
COMMENT ON POLICY "tasks_delete_assigner_only" ON public.tasks IS 
'태스크 삭제 정책: 지시자만 태스크 삭제 가능';
```

---

## 📝 수정 상세

### 파일 1: `03_tasks_rls_policies.sql`

**수정 위치**: 49-54줄

**변경 전**:
```sql
-- DELETE 정책: 관리자만 삭제 가능
DROP POLICY IF EXISTS "tasks_delete_admin_only" ON public.tasks;
CREATE POLICY "tasks_delete_admin_only"
ON public.tasks
FOR DELETE
USING (is_admin(auth.uid()));
```

**변경 후**:
```sql
-- DELETE 정책: 지시자만 삭제 가능
DROP POLICY IF EXISTS "tasks_delete_admin_only" ON public.tasks;
DROP POLICY IF EXISTS "tasks_delete_assigner_only" ON public.tasks;
CREATE POLICY "tasks_delete_assigner_only"
ON public.tasks
FOR DELETE
USING (auth.uid() = assigner_id);
```

**수정 위치**: 69줄

**변경 전**:
```sql
DROP POLICY IF EXISTS "tasks_delete_assigner_only" ON public.tasks;
```

**변경 후**: 
- 이 줄 제거 (위에서 이미 처리됨)

**수정 위치**: 84-85줄

**변경 전**:
```sql
COMMENT ON POLICY "tasks_delete_admin_only" ON public.tasks IS 
'태스크 삭제 정책: 관리자만 태스크 삭제 가능';
```

**변경 후**:
```sql
COMMENT ON POLICY "tasks_delete_assigner_only" ON public.tasks IS 
'태스크 삭제 정책: 지시자만 태스크 삭제 가능';
```

### 파일 2: `complete_refactoring.sql`

**수정 위치**: 215-220줄

**변경 전**:
```sql
-- DELETE 정책: 관리자만 삭제 가능
DROP POLICY IF EXISTS "tasks_delete_admin_only" ON public.tasks;
CREATE POLICY "tasks_delete_admin_only"
ON public.tasks
FOR DELETE
USING (is_admin(auth.uid()));
```

**변경 후**:
```sql
-- DELETE 정책: 지시자만 삭제 가능
DROP POLICY IF EXISTS "tasks_delete_admin_only" ON public.tasks;
DROP POLICY IF EXISTS "tasks_delete_assigner_only" ON public.tasks;
CREATE POLICY "tasks_delete_assigner_only"
ON public.tasks
FOR DELETE
USING (auth.uid() = assigner_id);
```

**수정 위치**: 235줄

**변경 전**:
```sql
DROP POLICY IF EXISTS "tasks_delete_assigner_only" ON public.tasks;
```

**변경 후**: 
- 이 줄 제거 (위에서 이미 처리됨)

**수정 위치**: 250-251줄

**변경 전**:
```sql
COMMENT ON POLICY "tasks_delete_admin_only" ON public.tasks IS 
'태스크 삭제 정책: 관리자만 태스크 삭제 가능';
```

**변경 후**:
```sql
COMMENT ON POLICY "tasks_delete_assigner_only" ON public.tasks IS 
'태스크 삭제 정책: 지시자만 태스크 삭제 가능';
```

---

## ✅ 수정 후 예상 결과

1. ✅ **지시자만 삭제 가능**: `auth.uid() = assigner_id` 조건으로 지시자만 삭제 가능
2. ✅ **관리자 삭제 불가**: 관리자도 지시자가 아니면 삭제 불가
3. ✅ **프론트엔드와 일치**: 프론트엔드의 `canDelete = isAssigner` 로직과 일치
4. ✅ **API 주석과 일치**: API 코드의 "지시자만 가능" 주석과 일치

---

## ⚠️ 주의사항

1. **두 파일 모두 수정 필요**: 
   - `03_tasks_rls_policies.sql` (개별 파일)
   - `complete_refactoring.sql` (통합 파일)

2. **마이그레이션 실행 순서**:
   - 개별 파일 수정 후 통합 파일 재생성 권장
   - 또는 통합 파일만 수정해도 됨 (개별 파일은 참고용)

3. **데이터베이스 적용**:
   - 수정된 마이그레이션 파일을 Supabase에 적용해야 함
   - 또는 새로운 마이그레이션 파일 생성 권장

---

## 📌 다음 단계

1. ✅ 수정 계획 확인 완료
2. ⏸️ 코드 수정 대기 중 (사용자 승인 필요)
3. ⏳ 마이그레이션 파일 수정
4. ⏳ 데이터베이스에 적용
5. ⏳ 테스트 및 검증

---

**참고**: 이 문서는 수정 계획만 정리한 것이며, 실제 코드 수정은 아직 수행하지 않았습니다.
