# 목 데이터 테스트 시나리오

이 문서는 생성된 목 데이터가 RLS 정책, role 기반 접근 제어, public/private 조건을 통과하는지 검증하는 테스트 시나리오를 설명합니다.

## 목 데이터 요약

### 생성된 데이터 통계
- **Projects**: 7개
  - Public: 4개 (inProgress: 3개, done: 1개)
  - Private: 3개 (inProgress: 2개, done: 1개)
- **Tasks**: 13개
  - 다양한 상태: ASSIGNED, IN_PROGRESS, WAITING_CONFIRM, APPROVED, REJECTED
  - 다양한 assigner/assignee 조합
- **Messages**: 10개 (모두 USER 타입)
- **Email Logs**: 5개

### 프로필 정보 (기존 데이터)
- **Admin**: 
  - 홍성훈 (admin@naver.com) - ID: `a4e0f12d-7289-4108-b518-3d6e07aeee08`
  - 김대표 (kingofcode0319@gmail.com) - ID: `c747f2f2-3468-4f4e-8417-b582eaabab8f`
- **Member**:
  - 홍성표 (az0319h@naver.com) - ID: `8f3d5000-c9bb-4894-b547-3052a1f7415e`
  - 김유진 (aaz19087@gmail.com) - ID: `b89a2846-34bf-40d9-9ba1-e8882b87d18f`
  - 정이희 (jungih91@gmail.com) - ID: `65b74eab-06b9-4f91-89ec-f73a23882f2e`
  - 홍시은 (hongsunghoon.dev@gmail.com) - ID: `f6c2d46e-b51d-4b9f-b920-2a14b76ab99f`

## 테스트 시나리오

### 시나리오 1: Admin이 모든 프로젝트 조회 가능

**테스트 사용자**: Admin (홍성훈 또는 김대표)

**예상 결과**: 
- Public 프로젝트 4개 조회 가능
- Private 프로젝트 3개 조회 가능
- **총 7개 프로젝트 조회 가능**

**테스트 쿼리**:
```sql
-- Admin으로 로그인한 상태에서 실행
SELECT id, title, is_public, status 
FROM public.projects 
ORDER BY created_at;
```

**검증 포인트**:
- ✅ 모든 프로젝트가 조회되는지 확인
- ✅ RLS 정책 `projects_select_public_or_authorized`가 Admin에게 모든 프로젝트를 허용하는지 확인

---

### 시나리오 2: Member가 Public 프로젝트만 조회 가능

**테스트 사용자**: Member (홍성표 - `8f3d5000-c9bb-4894-b547-3052a1f7415e`)

**예상 결과**:
- Public 프로젝트 4개 조회 가능
- Private 프로젝트 중 Task가 없는 프로젝트는 조회 불가
- **총 4개 이상 프로젝트 조회 가능** (Private 프로젝트 중 Task 참여한 것도 포함)

**테스트 쿼리**:
```sql
-- Member로 로그인한 상태에서 실행
SELECT id, title, is_public, status 
FROM public.projects 
ORDER BY created_at;
```

**검증 포인트**:
- ✅ Public 프로젝트는 모두 조회되는지 확인
- ✅ Private 프로젝트 중 Task 참여한 프로젝트만 조회되는지 확인
- ✅ RLS 정책이 Public 프로젝트는 허용하고, Private 프로젝트는 Task 참여 여부로 제어하는지 확인

**예상 조회 가능한 프로젝트**:
- `11111111-1111-1111-1111-111111111111` (Public) - Task 참여
- `22222222-2222-2222-2222-222222222222` (Public) - Task 참여
- `33333333-3333-3333-3333-333333333333` (Public)
- `44444444-4444-4444-4444-444444444444` (Private) - Task 참여 (Task ID: `88888888-8888-8888-8888-888888888888`)
- `77777777-7777-7777-7777-777777777777` (Public)

---

### 시나리오 3: Member가 Private 프로젝트에 Task 없으면 조회 불가

**테스트 사용자**: Member (김유진 - `b89a2846-34bf-40d9-9ba1-e8882b87d18f`)

**예상 결과**:
- Public 프로젝트 4개 조회 가능
- Private 프로젝트 `55555555-5555-5555-5555-555555555555`는 Task 없음 → 조회 불가
- Private 프로젝트 `66666666-6666-6666-6666-666666666666`는 Task 없음 → 조회 불가
- **총 4개 이상 프로젝트 조회 가능** (Task 참여한 Private 프로젝트 포함)

**테스트 쿼리**:
```sql
-- Member (김유진)로 로그인한 상태에서 실행
SELECT id, title, is_public, status 
FROM public.projects 
ORDER BY created_at;
```

**검증 포인트**:
- ✅ Public 프로젝트는 모두 조회되는지 확인
- ✅ Private 프로젝트 중 Task 참여한 것만 조회되는지 확인
- ✅ RLS 정책 `has_task_in_project` 함수가 올바르게 동작하는지 확인

**예상 조회 가능한 프로젝트**:
- `11111111-1111-1111-1111-111111111111` (Public) - Task 참여
- `22222222-2222-2222-2222-222222222222` (Public) - Task 참여
- `33333333-3333-3333-3333-333333333333` (Public)
- `44444444-4444-4444-4444-444444444444` (Private) - Task 참여 (Task ID: `99999999-9999-9999-9999-999999999999`)
- `77777777-7777-7777-7777-777777777777` (Public) - Task 참여

---

### 시나리오 4: Task 조회 권한 테스트

**테스트 사용자**: Member (홍성표)

**예상 결과**:
- 프로젝트 접근 권한이 있는 프로젝트의 모든 Task 조회 가능
- 프로젝트 접근 권한이 없는 프로젝트의 Task는 조회 불가

**테스트 쿼리**:
```sql
-- Member로 로그인한 상태에서 실행
SELECT t.id, t.title, t.task_status, p.title as project_title, p.is_public
FROM public.tasks t
JOIN public.projects p ON t.project_id = p.id
ORDER BY p.created_at, t.created_at;
```

**검증 포인트**:
- ✅ Public 프로젝트의 모든 Task 조회 가능
- ✅ Private 프로젝트 중 Task 참여한 프로젝트의 Task만 조회 가능
- ✅ RLS 정책 `tasks_select_project_access`가 프로젝트 접근 권한을 상속하는지 확인

---

### 시나리오 5: Task 수정 권한 테스트 (assigner/assignee만 가능)

**테스트 사용자**: 
1. Assignee (홍성표) - Task ID: `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`
2. Admin (홍성훈) - 같은 Task

**예상 결과**:
- Assignee는 Task 수정 가능 ✅
- Admin은 Task 수정 불가 ❌ (RLS 정책 위반)

**테스트 쿼리**:
```sql
-- 1. Assignee (홍성표)로 로그인한 상태에서 실행
UPDATE public.tasks 
SET task_status = 'WAITING_CONFIRM'
WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
-- 예상: 성공

-- 2. Admin (홍성훈)로 로그인한 상태에서 실행
UPDATE public.tasks 
SET task_status = 'APPROVED'
WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
-- 예상: 실패 (RLS 정책 위반)
```

**검증 포인트**:
- ✅ RLS 정책 `tasks_update_assigner_or_assignee_only`가 Admin을 제외하는지 확인
- ✅ Assigner/Assignee만 수정 가능한지 확인

---

### 시나리오 6: Message 조회 권한 테스트

**테스트 사용자**: Member (홍성표)

**예상 결과**:
- Task 접근 권한이 있는 Task의 메시지만 조회 가능

**테스트 쿼리**:
```sql
-- Member로 로그인한 상태에서 실행
SELECT m.id, m.content, m.message_type, t.title as task_title, p.title as project_title
FROM public.messages m
JOIN public.tasks t ON m.task_id = t.id
JOIN public.projects p ON t.project_id = p.id
ORDER BY m.created_at DESC;
```

**검증 포인트**:
- ✅ Task 접근 권한이 있는 Task의 메시지만 조회되는지 확인
- ✅ RLS 정책 `messages_select_task_access`가 프로젝트 접근 권한을 상속하는지 확인

---

### 시나리오 7: 프로젝트 상태별 필터링 테스트

**테스트 사용자**: Admin

**예상 결과**:
- `status = 'inProgress'`: 5개 프로젝트
- `status = 'done'`: 2개 프로젝트

**테스트 쿼리**:
```sql
-- Admin으로 로그인한 상태에서 실행
SELECT COUNT(*) as count, status 
FROM public.projects 
GROUP BY status;
```

**검증 포인트**:
- ✅ 상태별 필터링이 정상 작동하는지 확인
- ✅ 프론트엔드에서 상태 필터 UI 테스트 가능

---

### 시나리오 8: Task 상태별 필터링 테스트

**테스트 사용자**: Admin

**예상 결과**:
- 다양한 Task 상태 분포 확인

**테스트 쿼리**:
```sql
-- Admin으로 로그인한 상태에서 실행
SELECT COUNT(*) as count, task_status 
FROM public.tasks 
GROUP BY task_status 
ORDER BY task_status;
```

**검증 포인트**:
- ✅ 각 상태별 Task가 존재하는지 확인
- ✅ 프론트엔드에서 상태 필터 UI 테스트 가능

---

### 시나리오 9: 프로젝트별 Task 목록 조회 테스트

**테스트 사용자**: Member (홍성표)

**예상 결과**:
- 접근 가능한 프로젝트의 Task만 조회 가능

**테스트 쿼리**:
```sql
-- Member로 로그인한 상태에서 실행
SELECT p.title as project_title, COUNT(t.id) as task_count
FROM public.projects p
LEFT JOIN public.tasks t ON p.id = t.project_id
WHERE p.is_public = true OR EXISTS (
  SELECT 1 FROM public.tasks 
  WHERE project_id = p.id 
  AND (assigner_id = auth.uid() OR assignee_id = auth.uid())
)
GROUP BY p.id, p.title
ORDER BY p.created_at;
```

**검증 포인트**:
- ✅ 프로젝트별 Task 개수가 정확한지 확인
- ✅ RLS 정책이 올바르게 적용되는지 확인

---

### 시나리오 10: Private 프로젝트 접근 권한 부여 테스트

**테스트 사용자**: Member (정이희 - `65b74eab-06b9-4f91-89ec-f73a23882f2e`)

**예상 결과**:
- Private 프로젝트 `55555555-5555-5555-5555-555555555555`에 Task가 있음 → 조회 가능
- Private 프로젝트 `66666666-6666-6666-6666-666666666666`에 Task 없음 → 조회 불가

**테스트 쿼리**:
```sql
-- Member (정이희)로 로그인한 상태에서 실행
SELECT id, title, is_public, status 
FROM public.projects 
WHERE id IN ('55555555-5555-5555-5555-555555555555', '66666666-6666-6666-6666-666666666666');
```

**검증 포인트**:
- ✅ Task 참여로 Private 프로젝트 접근 권한이 부여되는지 확인
- ✅ RLS 정책 `has_task_in_project` 함수가 올바르게 동작하는지 확인

---

## 실제 테스트 실행 방법

### 1. Supabase Dashboard SQL Editor 사용

1. Supabase Dashboard → SQL Editor 접속
2. 각 시나리오의 테스트 쿼리 실행
3. 결과 확인

### 2. 프론트엔드에서 테스트

각 사용자 계정으로 로그인하여:
- 프로젝트 목록 페이지에서 조회되는 프로젝트 확인
- 프로젝트 상세 페이지에서 Task 목록 확인
- Task 수정 권한 확인

### 3. RLS 정책 직접 테스트

```sql
-- 특정 사용자로 시뮬레이션 (Service Role Key 사용)
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claim.sub TO 'user-uuid-here';

-- 쿼리 실행
SELECT * FROM public.projects;
```

## 데이터 구조 요약

### Projects 구조
- **Public 프로젝트**: 
  - 스마트폰 카메라 개선 프로젝트 (3개 Task)
  - 전기차 배터리 효율 향상 (2개 Task)
  - AI 음성인식 정확도 개선 (1개 Task, done)
  - 모바일 앱 UI/UX 개선 (2개 Task)
- **Private 프로젝트**:
  - 기밀 신제품 개발 프로젝트 (2개 Task) - 홍성표, 김유진 접근 가능
  - 차세대 반도체 설계 (2개 Task) - 정이희 접근 가능
  - 보안 시스템 강화 프로젝트 (1개 Task, done) - 홍성표 접근 가능

### Tasks 구조
- 다양한 상태 분포:
  - ASSIGNED: 2개
  - IN_PROGRESS: 5개
  - WAITING_CONFIRM: 2개
  - APPROVED: 3개
  - REJECTED: 1개

### Messages 구조
- 각 Task에 1-2개의 USER 메시지
- SYSTEM 메시지는 Trigger에 의해 자동 생성됨

## 주의사항

1. **RLS 정책 테스트**: 실제 사용자 계정으로 로그인하여 테스트해야 정확한 결과를 얻을 수 있습니다.
2. **Service Role Key**: RLS를 우회하여 테스트하려면 Service Role Key를 사용하세요.
3. **데이터 일관성**: 프로젝트와 Task 간의 관계가 올바르게 유지되는지 확인하세요.

## 다음 단계

목 데이터가 준비되었으므로:
1. 프론트엔드 API 훅 구현
2. React Query 훅 구현
3. UI 컴포넌트 구현 및 테스트

각 시나리오를 통해 RLS 정책이 올바르게 작동하는지 확인할 수 있습니다.

