# Task 공유 기능 PRD (Product Requirements Document)

## 1. 개요

### 1.1 목적
Task를 외부 사용자와 공유할 수 있는 기능을 제공하여 협업 범위를 확장합니다. Task 공개 설정을 통해 모든 사용자가 읽기 전용으로 접근할 수 있도록 합니다.

### 1.2 배경
현재 Task는 지시자/담당자/관리자만 접근 가능합니다. 공개된 Task는 모든 사용자가 읽기 전용으로 접근할 수 있어야 하며, 공개되지 않은 Task는 기존 정책을 유지합니다.

### 1.3 범위
- Task 공개 설정 (관리자 전용)
- 공유 링크 생성 및 복사
- 퍼가기(Embed) 기능
- 이메일 공유 기능
- 공개된 Task의 읽기 전용 접근

---

## 2. 요구사항

### 2.1 기능 요구사항

#### FR-1: Task 공개 설정
- **우선순위**: 높음
- **설명**: 관리자만 Task를 공개/비공개로 설정할 수 있습니다.
- **상세**:
  - `is_public` 컬럼을 통해 공개 여부 관리
  - 공개된 Task (`is_public = true`): 모든 사용자가 읽기 전용 접근 가능
  - 비공개 Task (`is_public = false`): 기존 정책 유지 (지시자/담당자/관리자만 접근)
- **권한**: 관리자만 `is_public` 필드 변경 가능

#### FR-2: 공유 링크 생성
- **우선순위**: 높음
- **설명**: Task 상세 페이지 URL을 공유 링크로 사용합니다.
- **상세**:
  - 링크 형식: `{baseUrl}/task/{taskId}`
  - 공개된 Task: 모든 사용자가 링크로 접근 가능
  - 비공개 Task: 지시자/담당자/관리자만 링크로 접근 가능

#### FR-3: 공유 다이얼로그 UI
- **우선순위**: 높음
- **설명**: Task 상세 페이지 헤더에 공유 버튼을 추가하고, 클릭 시 공유 다이얼로그를 표시합니다.
- **상세**:
  - 위치: "목록에 추가" 버튼 옆
  - 공유 옵션: 퍼가기(Embed), 이메일
  - 링크 복사 버튼
  - 관리자용: Task 공개 체크박스

#### FR-4: 퍼가기(Embed) 기능
- **우선순위**: 중간
- **설명**: Task를 iframe으로 임베드할 수 있는 코드를 제공합니다.
- **상세**:
  - Embed 코드 생성 (선택사항)
  - 또는 Embed 코드 복사 기능

#### FR-5: 이메일 공유 기능
- **우선순위**: 중간
- **설명**: 공유 링크를 이메일로 전송할 수 있습니다.
- **상세**:
  - `mailto:` 링크로 이메일 클라이언트 열기
  - 또는 이메일 발송 API 호출 (선택사항)

### 2.2 비기능 요구사항

#### NFR-1: 보안
- 공개된 Task도 RLS 정책으로 보호됨
- UPDATE/DELETE는 여전히 지시자/관리자만 가능
- 공개된 Task는 SELECT만 허용

#### NFR-2: 성능
- 공개된 Task 조회를 위한 인덱스 추가
- RLS 정책 최적화

#### NFR-3: 사용성
- 공유 링크 복사 시 즉시 피드백 제공
- 공개 설정 변경 시 명확한 상태 표시

---

## 3. 데이터베이스 설계

### 3.1 스키마 변경

#### 3.1.1 tasks 테이블 컬럼 추가
```sql
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.tasks.is_public IS 'Task 공개 여부. true일 경우 모든 사용자가 읽기 전용으로 접근 가능';
```

#### 3.1.2 인덱스 추가
```sql
-- 공개된 Task 조회 최적화
CREATE INDEX IF NOT EXISTS idx_tasks_is_public 
ON public.tasks(is_public) 
WHERE is_public = true;
```

### 3.2 RLS 정책 수정

#### 3.2.1 SELECT 정책 수정
**현재 정책**: `tasks_select_admin_or_assigned`
- 자기 할당 Task: 본인만 접근 가능
- 일반 Task: 관리자 또는 지시자/담당자만 접근 가능

**수정 후 정책**:
```sql
DROP POLICY IF EXISTS tasks_select_admin_or_assigned ON public.tasks;

CREATE POLICY tasks_select_admin_or_assigned ON public.tasks
FOR SELECT
USING (
  -- 공개된 Task: 모든 인증된 사용자 접근 가능
  is_public = true
  OR
  -- 자기 할당 Task: 본인만 접근 가능 (관리자도 제외, 공개 여부와 무관)
  (is_self_task = true AND auth.uid() = assigner_id)
  OR
  -- 일반 비공개 Task: 기존 정책 유지 (관리자 또는 지시자/담당자)
  (is_self_task = false AND is_public = false AND (
    is_admin(auth.uid()) OR 
    auth.uid() = assigner_id OR 
    auth.uid() = assignee_id
  ))
);
```

**정책 설명**:
1. `is_public = true`: 공개된 Task는 모든 인증된 사용자가 읽기 가능 (자기 할당 Task 제외)
2. 자기 할당 Task: 공개 여부와 무관하게 본인만 접근 가능 (관리자도 제외)
3. 일반 비공개 Task: 기존 정책 유지 (관리자 또는 지시자/담당자만 접근)

**주의사항**:
- 자기 할당 Task는 `is_public` 설정과 무관하게 항상 본인만 접근 가능
- 공개된 일반 Task는 모든 사용자가 읽기 전용으로 접근 가능

#### 3.2.2 UPDATE 정책 수정
**현재 정책**: `tasks_update_assigner_or_assignee`
- 지시자 또는 담당자만 수정 가능
- 관리자는 UPDATE 불가 (DELETE만 가능)

**수정 필요**: 관리자가 `is_public` 필드를 변경할 수 있도록 UPDATE 정책에 관리자 추가 필요

**수정 후 정책**:
```sql
DROP POLICY IF EXISTS tasks_update_assigner_or_assignee ON public.tasks;

CREATE POLICY tasks_update_assigner_or_assignee ON public.tasks
FOR UPDATE
USING (
  -- 자기 할당 Task: 본인만 수정 가능
  (is_self_task = true AND auth.uid() = assigner_id)
  OR
  -- 일반 Task: 지시자 또는 담당자만 수정 가능
  (is_self_task = false AND (auth.uid() = assigner_id OR auth.uid() = assignee_id))
  OR
  -- 관리자: 모든 Task 수정 가능 (필드별 제어는 애플리케이션 레벨에서 처리)
  is_admin(auth.uid())
)
WITH CHECK (
  -- 동일한 조건 적용
  (is_self_task = true AND auth.uid() = assigner_id)
  OR
  (is_self_task = false AND (auth.uid() = assigner_id OR auth.uid() = assignee_id))
  OR
  is_admin(auth.uid())
);
```

**주의사항**: 
- RLS 정책의 USING 절에서는 OLD/NEW를 직접 참조할 수 없습니다.
- RLS 정책만으로는 필드별 제어가 어려움 (PostgreSQL 17.6+ 컬럼 정책 필요)
- 관리자가 `is_public`만 변경할 수 있도록 제한하려면 **애플리케이션 레벨에서 검증 필수**
- API 레벨에서 관리자가 `is_public` 외 필드 변경 시도를 차단해야 함

### 3.3 권한 체크 함수

#### 3.3.1 is_admin 함수
**현재 상태**: 이미 존재
```sql
CREATE OR REPLACE FUNCTION public.is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = user_id AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 4. API 설계

### 4.1 Task 업데이트 API 수정

#### 4.1.1 updateTask 함수 수정
**파일**: `src/api/task.ts`

**현재 로직**:
- 지시자만 Task 수정 가능
- 담당자는 `send_email_to_client` 필드만 수정 가능

**수정 후 로직**:
- 관리자: `is_public` 필드만 수정 가능 (담당자/지시자가 아닌 Task도 `is_public`만 변경 가능)
- 지시자: 기존 필드 수정 가능 (title, description, due_date, client_name)
- 담당자: `send_email_to_client` 필드만 수정 가능

**구현 순서**:
1. 관리자 권한 확인 (가장 먼저 수행)
2. 관리자인 경우: `is_public`만 허용, 다른 필드 모두 차단
3. 관리자가 아닌 경우: 기존 로직 실행 (지시자/담당자만 수정 가능)

**코드 예시**:
```typescript
export async function updateTask(id: string, updates: TaskUpdate): Promise<Task> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) {
    throw new Error("인증이 필요합니다.");
  }

  const userId = session.session.user.id;

  // 현재 Task 조회 (존재 여부 및 권한 확인)
  const { data: task, error: fetchError } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !task) {
    throw new Error(`Task를 찾을 수 없습니다: ${fetchError?.message || "알 수 없는 오류"}`);
  }

  // 관리자 권한 확인 (가장 먼저 체크)
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  const isAdmin = profile?.role === "admin";
  const allowedUpdates: Partial<TaskUpdate> = {};

  // 관리자 체크: 관리자는 is_public 필드만 변경 가능
  if (isAdmin) {
    // 관리자가 is_public 필드를 변경하려는 경우만 허용
    if (updates.is_public === undefined) {
      throw new Error("관리자는 is_public 필드만 수정할 수 있습니다.");
    }

    // 다른 필드 변경 시도 차단
    const otherFields = Object.keys(updates).filter(
      key => key !== "is_public"
    );
    if (otherFields.length > 0) {
      throw new Error("관리자는 is_public 필드만 수정할 수 있습니다.");
    }

    // is_public만 허용
    allowedUpdates.is_public = updates.is_public;
  } else {
    // 관리자가 아닌 경우: 기존 로직 실행 (지시자/담당자만 수정 가능)
    
    // send_email_to_client 필드는 담당자(assignee)만 변경 가능
    if (updates.send_email_to_client !== undefined) {
      if (task.assignee_id !== userId) {
        throw new Error("고객에게 이메일 발송 완료 상태는 담당자만 변경할 수 있습니다.");
      }
      (allowedUpdates as any).send_email_to_client = updates.send_email_to_client;
    } else {
      // send_email_to_client 외의 필드는 지시자(assigner)만 수정 가능
      if (task.assigner_id !== userId) {
        throw new Error("Task 수정은 지시자만 가능합니다.");
      }
    }

    // 수정 불가 필드 차단
    if (updates.assigner_id !== undefined || updates.assignee_id !== undefined) {
      throw new Error("지시자(assigner)와 담당자(assignee)는 수정할 수 없습니다.");
    }

    if (updates.task_status !== undefined) {
      throw new Error("Task 상태는 수정할 수 없습니다. 상태 변경은 별도의 워크플로우를 사용하세요.");
    }

    // title 수정 허용 (지시자만)
    if (updates.title !== undefined && updates.title !== null) {
      if (task.assigner_id !== userId) {
        throw new Error("Task 제목 수정은 지시자만 가능합니다.");
      }
      allowedUpdates.title = updates.title;
    }

    // description 수정 허용 (null도 허용, 지시자만)
    if ("description" in updates && updates.description !== undefined) {
      if (task.assigner_id !== userId) {
        throw new Error("Task 설명 수정은 지시자만 가능합니다.");
      }
      (allowedUpdates as any).description = updates.description;
    }

    // client_name 수정 허용 (지시자만)
    if (updates.client_name !== undefined && updates.client_name !== null) {
      if (task.assigner_id !== userId) {
        throw new Error("고객명 수정은 지시자만 가능합니다.");
      }
      allowedUpdates.client_name = updates.client_name;
    }

    // due_date 수정 허용 (null도 허용, 지시자만)
    if (updates.due_date !== undefined) {
      if (task.assigner_id !== userId) {
        throw new Error("마감일 수정은 지시자만 가능합니다.");
      }
      allowedUpdates.due_date = updates.due_date;
    }
  }

  // 업데이트할 필드가 없으면 에러
  if (Object.keys(allowedUpdates).length === 0) {
    throw new Error("수정할 내용이 없습니다.");
  }

  // 상태 업데이트
  const { data: updatedTask, error: updateError } = await supabase
    .from("tasks")
    .update(allowedUpdates)
    .eq("id", id)
    .select()
    .single();

  if (updateError) {
    throw new Error(`Task 수정 실패: ${updateError.message}`);
  }

  if (!updatedTask) {
    throw new Error("Task 수정 후 데이터를 받지 못했습니다.");
  }

  return updatedTask;
}
```

**중요 사항**: 
- 관리자는 담당자/지시자가 아닌 Task도 `is_public`만 변경 가능
- 다른 필드(title, description 등)는 여전히 지시자만 수정 가능
- RLS 정책에서 관리자 UPDATE 권한을 허용하지만, 실제 필드별 제어는 API 레벨에서 수행
- 관리자가 `is_public` 외 필드를 변경하려고 하면 API에서 즉시 에러 반환

### 4.2 공유 링크 생성

#### 4.2.1 공유 링크 생성 함수
**파일**: `src/api/task.ts` (선택사항)

```typescript
export function getTaskShareLink(taskId: string): string {
  const baseUrl = window.location.origin;
  return `${baseUrl}/task/${taskId}`;
}
```

---

## 5. UI/UX 설계

### 5.1 공유 버튼 추가

#### 5.1.1 위치
**파일**: `src/pages/task-detail-page.tsx`

**위치**: 헤더 영역, "목록에 추가" 버튼 옆

**코드 예시**:
```tsx
{/* 목록에 추가 버튼 */}
<Button
  variant="ghost"
  size="icon"
  onClick={() => setAddToListDialogOpen(true)}
  className="h-9 w-9 shrink-0"
  title="목록에 추가"
>
  <ListPlus className="h-5 w-5" />
</Button>

{/* 공유 버튼 추가 */}
<Button
  variant="ghost"
  size="icon"
  onClick={() => setShareDialogOpen(true)}
  className="h-9 w-9 shrink-0"
  title="공유"
>
  <Share2 className="h-5 w-5" />
</Button>
```

### 5.2 공유 다이얼로그 컴포넌트

#### 5.2.1 컴포넌트 생성
**파일**: `src/components/task/task-share-dialog.tsx`

#### 5.2.2 UI 구성
1. **공유 옵션 섹션**
   - 퍼가기(Embed) 버튼
   - 이메일 버튼

2. **링크 복사 섹션**
   - 공유 링크 URL 표시 (읽기 전용 input)
   - 복사 버튼

3. **Task 공개 설정 (관리자만)**
   - 체크박스: "Task 공개"
   - 체크 시 `is_public = true`
   - 체크 해제 시 `is_public = false`

#### 5.2.3 상태 관리
```tsx
const [shareDialogOpen, setShareDialogOpen] = useState(false);
const [isPublic, setIsPublic] = useState(task.is_public || false);
const shareLink = `${window.location.origin}/task/${task.id}`;
```

#### 5.2.4 기능 구현
- **링크 복사**: `navigator.clipboard.writeText(shareLink)`
- **퍼가기**: Embed 코드 생성 (선택사항)
- **이메일**: `mailto:` 링크 또는 이메일 발송 API
- **공개 설정**: `updateTask` API 호출

---

## 6. 권한 매트릭스

### 6.1 Task 접근 권한

| 사용자 유형 | 공개 Task | 비공개 Task |
|------------|----------|------------|
| 관리자 | 읽기/수정(is_public만)/삭제 | 읽기/수정(is_public만)/삭제 |
| 지시자 | 읽기/수정 | 읽기/수정 |
| 담당자 | 읽기/수정(send_email_to_client만) | 읽기/수정(send_email_to_client만) |
| 기타 사용자 | 읽기 전용 | 접근 불가 |

**참고**: 관리자는 모든 Task의 `is_public` 필드만 수정 가능하며, 다른 필드(title, description 등)는 지시자만 수정 가능합니다.

### 6.2 공개 설정 변경 권한

| 사용자 유형 | 공개 설정 변경 |
|------------|--------------|
| 관리자 | 가능 |
| 지시자 | 불가 |
| 담당자 | 불가 |
| 기타 사용자 | 불가 |

### 6.3 공유 기능 사용 권한

| 사용자 유형 | 공유 링크 생성 | 공유 다이얼로그 접근 |
|------------|--------------|-------------------|
| 관리자 | 가능 | 가능 |
| 지시자 | 가능 (비공개 Task도) | 가능 |
| 담당자 | 가능 (비공개 Task도) | 가능 |
| 기타 사용자 | 가능 (공개 Task만) | 가능 (공개 Task만) |

**주의**: 비공개 Task의 공유 링크를 받은 사용자는 접근할 수 없습니다. 공개된 Task만 모든 사용자가 접근 가능합니다.

---

## 7. 구현 단계

### Phase 1: 데이터베이스 마이그레이션 (1-2시간)
1. `migrations/is-public/20260209000001_add_task_is_public.sql` 생성
2. `is_public` 컬럼 추가
3. 인덱스 추가
4. RLS 정책 수정

### Phase 2: API 수정 (30분-1시간)
1. `updateTask` 함수에 `is_public` 필드 추가
2. 관리자 권한 체크 로직 추가
3. 타입 재생성: `npm run type-gen`

### Phase 3: 프론트엔드 UI (2-3시간)
1. 공유 다이얼로그 컴포넌트 생성
2. Task 상세 페이지에 공유 버튼 추가
3. 공유 링크 생성 및 복사 기능
4. 퍼가기/이메일 버튼 구현
5. 관리자용 공개 설정 체크박스 추가

### Phase 4: 테스트 (30분-1시간)
1. 공개 ON: 모든 사용자 접근 테스트
2. 공개 OFF: 기존 정책 유지 테스트
3. 관리자만 공개 설정 변경 가능 테스트
4. 공유 링크 복사 테스트

---

## 8. 파일 구조

### 8.1 새로 생성할 파일
- `supabase/migrations/is-public/20260209000001_add_task_is_public.sql`
- `src/components/task/task-share-dialog.tsx`

### 8.2 수정할 파일
- `src/pages/task-detail-page.tsx`
- `src/api/task.ts`
- `src/hooks/mutations/use-task.ts` (필요시)
- `src/database.type.ts` (타입 재생성 후)

---

## 9. 예외 처리

### 9.1 에러 케이스
1. **관리자가 아닌 사용자가 공개 설정 변경 시도**
   - 에러 메시지: "Task 공개 설정은 관리자만 변경할 수 있습니다."

2. **비공개 Task 공유 링크 접근 시도**
   - RLS 정책에 의해 자동 차단
   - 에러 메시지: "이 Task에 접근할 권한이 없습니다."

3. **링크 복사 실패**
   - 에러 메시지: "링크 복사에 실패했습니다."

---

## 10. 보안 고려사항

### 10.1 RLS 정책
- 공개된 Task도 RLS 정책으로 보호됨
- UPDATE는 지시자/담당자/관리자만 가능 (RLS 레벨)
- 실제 필드별 제어는 API 레벨에서 수행 (관리자는 `is_public`만, 지시자는 title/description 등만)
- DELETE는 여전히 지시자/관리자만 가능
- 공개된 Task는 SELECT만 허용 (읽기 전용)

### 10.2 애플리케이션 레벨 검증
- 관리자가 `is_public`만 변경할 수 있도록 API에서 검증
- 프론트엔드에서도 관리자만 공개 설정 UI 표시

### 10.3 공유 링크 보안
- Task ID만으로 접근 (추가 토큰 불필요)
- RLS 정책이 접근 제어
- 공개되지 않은 Task는 지시자/담당자/관리자만 접근 가능

---

## 11. 향후 개선 사항

### 11.1 선택적 기능
- Embed 코드 생성 및 표시
- 이메일 발송 API 연동
- 공유 링크 만료 시간 설정
- 공유 링크 접근 통계

### 11.2 고급 기능
- 특정 사용자에게만 공유 (비공개 Task)
- 공유 링크 비밀번호 설정
- 공유 링크 접근 로그

---

## 12. 참고 사항

### 12.1 현재 RLS 정책
- 최신 정책: `tasks_select_admin_or_assigned` (my-tasks 마이그레이션)
- 자기 할당 Task: 본인만 접근 가능
- 일반 Task: 관리자 또는 지시자/담당자만 접근 가능

### 12.2 프로젝트 기반 정책
- `tasks_select_participant_or_admin` 정책도 존재 (프로젝트 참여자 전원 접근)
- 프로젝트 구조가 제거되었으므로 이 정책은 사용되지 않을 수 있음
- 마이그레이션 시 기존 정책 확인 필요

### 12.3 UPDATE 정책
- 현재: 지시자 또는 담당자만 수정 가능
- 관리자는 UPDATE 불가 (DELETE만 가능)
- 공개 설정 변경을 위해 관리자 UPDATE 권한 추가 필요
- RLS 정책에서는 필드별 제어 불가하므로 애플리케이션 레벨 검증 필수

---

## 13. 승인 및 검토

### 13.1 검토 항목
- [ ] 데이터베이스 스키마 변경 사항 검토
- [ ] RLS 정책 수정 사항 검토
- [ ] API 수정 사항 검토
- [ ] UI/UX 설계 검토
- [ ] 보안 고려사항 검토

### 13.2 승인
- 작성일: 2026-02-09
- 작성자: AI Assistant
- 검토자: (대기 중)
- 승인자: (대기 중)
