# 프로젝트 구조 제거 및 태스크 중심 구조 전환 계획서

## 📋 개요
프로젝트 → 태스크 계층 구조를 제거하고 태스크 단위로 관리하도록 전환하는 대규모 리팩토링 계획입니다.
**배경**: 프로젝트당 태스크가 많아야 2개 정도로 프로젝트 구조가 불필요함

---

## 1️⃣ 요구사항 정리

### 1.1 현재 구조
- 프로젝트 → 태스크 계층 구조
- 프로젝트당 태스크가 많아야 2개 정도로 프로젝트 구조가 불필요

### 1.2 변경 목표

#### 1.2.1 테이블 변경
- ❌ `projects` 테이블 제거
- ❌ `project_participants` 테이블 제거
- ✅ `tasks` 테이블에 `created_by`(계정 ID) 필드 추가
- ✅ `tasks` 테이블에 `client_name`(고객명) 필드 추가
- ✅ `tasks` 테이블에 `send_email_to_client`(고객 이메일 발송 여부) 필드 추가
- ❌ `tasks` 테이블에서 `project_id` 제거
- ✅ `announcements` 테이블 추가 (공지사항)
- ✅ `announcement_dismissals` 테이블 추가 (사용자별 "다시 보지 않음" 기록)
- ✅ `announcement_attachments` 테이블 추가 (공지사항 파일 첨부)

#### 1.2.2 데이터 마이그레이션
- 기존 프로젝트의 `created_by`를 관련된 모든 tasks의 `created_by`로 복사
- 기존 프로젝트의 `client_name`을 관련된 모든 tasks의 `client_name`으로 복사

#### 1.2.3 UI 변경
**전체 태스크 탭**
- **관리자**: 모든 태스크 표시 (진행중이거나 완료된 모든 task)
- **멤버**: 자기가 진행한 모든 태스크 표시 (진행중이거나 완료된 task들)
  - 즉, `assigner_id` 또는 `assignee_id`가 자신인 태스크 중 진행중 또는 완료된 것들

**담당 업무 탭**
- 내가 지시자(`assigner_id`)이거나 담당자(`assignee_id`)인 태스크 중
- **승인됨(APPROVED)이 아닌** 모든 태스크들 표시
  - 즉, `task_status != 'APPROVED'`인 태스크들

**공지사항 기능**
- 관리자가 사이드바의 "게시하기" 버튼을 통해 공지사항 작성
- 사이트 접속 시 활성 공지사항이 모달로 팝업 표시
- "다시 보지 않음" 체크 시 해당 사용자에게는 더 이상 표시되지 않음
- 공지사항 작성 시 제목, 내용, 최상단 이미지, 파일 첨부 가능
- 리얼타임으로 모든 사용자 화면에 즉시 표시

---

## 2️⃣ 수정이 필요한 항목 (전체 정리)

### 2.1 데이터베이스 스키마

#### 2.1.1 테이블 변경
**tasks 테이블**
- ❌ `project_id UUID` 컬럼 제거 (외래키 제약조건 포함)
- ✅ `created_by UUID NOT NULL REFERENCES auth.users(id)` 추가
- ✅ `client_name TEXT NOT NULL` 추가
- ✅ `send_email_to_client BOOLEAN NOT NULL DEFAULT false` 추가
- ❌ `project_id` 관련 인덱스 제거:
  - `idx_tasks_project_id`
  - `idx_tasks_project_status` (복합 인덱스)

**제거할 테이블**
- ❌ `projects` 테이블 제거 (관련 인덱스, 트리거 포함)
- ❌ `project_participants` 테이블 제거 (관련 인덱스 포함)

**추가할 테이블**
- ✅ `announcements` 테이블 추가
  - `id UUID PRIMARY KEY`
  - `title TEXT NOT NULL` (제목)
  - `content TEXT NOT NULL` (내용)
  - `image_url TEXT` (최상단 이미지 URL)
  - `created_by UUID NOT NULL REFERENCES auth.users(id)` (작성자)
  - `is_active BOOLEAN NOT NULL DEFAULT true` (활성 여부)
  - `expires_at TIMESTAMPTZ` (게시 종료 날짜, NULL이면 무기한)
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
  - `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- ✅ `announcement_dismissals` 테이블 추가
  - `id UUID PRIMARY KEY`
  - `announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE`
  - `user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`
  - `dismissed_at TIMESTAMPTZ NOT NULL DEFAULT now()`
  - `UNIQUE(announcement_id, user_id)` (한 사용자는 한 공지사항에 대해 한 번만 기록)
- ✅ `announcement_attachments` 테이블 추가
  - `id UUID PRIMARY KEY`
  - `announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE`
  - `file_name TEXT NOT NULL` (파일명)
  - `file_url TEXT NOT NULL` (파일 URL)
  - `file_size BIGINT` (파일 크기)
  - `file_type TEXT` (파일 타입)
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`

#### 2.1.2 인덱스 변경
**제거해야 할 인덱스**
- `idx_projects_created_by`
- `idx_projects_status`
- `idx_projects_is_public`
- `idx_projects_due_date`
- `idx_tasks_project_id`
- `idx_tasks_project_status` (복합 인덱스)
- `idx_project_participants_project_id`
- `idx_project_participants_user_id`
- `idx_project_participants_invited_by`

**추가해야 할 인덱스**
- ✅ `idx_tasks_created_by` - `tasks.created_by` 인덱스
- ✅ `idx_tasks_client_name` - `tasks.client_name` 인덱스 (선택적)
- ✅ `idx_tasks_send_email_to_client` - `tasks.send_email_to_client` 인덱스 (선택적)
- ✅ `idx_announcements_is_active` - `announcements.is_active` 인덱스 (활성 공지사항 조회용)
- ✅ `idx_announcements_created_at` - `announcements.created_at` 인덱스 (최신순 정렬용)
- ✅ `idx_announcements_expires_at` - `announcements.expires_at` 인덱스 (게시 종료 날짜 필터링용)
- ✅ `idx_announcement_dismissals_announcement_user` - `announcement_dismissals(announcement_id, user_id)` 복합 인덱스
- ✅ `idx_announcement_attachments_announcement_id` - `announcement_attachments.announcement_id` 인덱스

#### 2.1.3 외래키 제약조건
**제거해야 할 외래키**
- `tasks_project_id_fkey` - `tasks.project_id → projects.id`
- `project_participants_project_id_fkey`
- `project_participants_user_id_fkey`
- `project_participants_invited_by_fkey`

**추가해야 할 외래키**
- ✅ `tasks_created_by_fkey` - `tasks.created_by → auth.users(id)`
- ✅ `announcements_created_by_fkey` - `announcements.created_by → auth.users(id)`
- ✅ `announcement_dismissals_announcement_id_fkey` - `announcement_dismissals.announcement_id → announcements(id) ON DELETE CASCADE`
- ✅ `announcement_dismissals_user_id_fkey` - `announcement_dismissals.user_id → auth.users(id) ON DELETE CASCADE`
- ✅ `announcement_attachments_announcement_id_fkey` - `announcement_attachments.announcement_id → announcements(id) ON DELETE CASCADE`

### 2.2 RLS 정책

#### 2.2.1 제거해야 할 정책
**projects 테이블**
- `projects_select_public_or_authorized` (또는 `projects_select_admin_or_participant`)
- `projects_insert_authenticated` (또는 `projects_insert_admin_only`)
- `projects_update_admin_only`
- `projects_delete_admin_only`

**project_participants 테이블**
- `project_participants_select_participant_or_admin`
- `project_participants_insert_admin_only`
- `project_participants_delete_admin_only`

#### 2.2.2 수정해야 할 정책
**tasks 테이블 RLS 정책**
- **현재**: `has_project_access()` 함수 사용 → 프로젝트 기반 접근 제어
- **변경**: 프로젝트 의존성 제거, 태스크 단위 접근 제어로 재작성

**새로운 정책 구조**
- **SELECT**: 
  - 관리자: 모든 태스크 조회 가능
  - 멤버: `assigner_id` 또는 `assignee_id`가 자신인 태스크만 조회 가능
- **INSERT**: 인증된 사용자만 생성 가능 (관리자만 생성하도록 제한 가능)
- **UPDATE**: `assigner_id` 또는 `assignee_id`만 수정 가능
  - `send_email_to_client` 필드는 지시자(`assigner_id`) 또는 담당자(`assignee_id`)만 수정 가능
- **DELETE**: 관리자만 삭제 가능

#### 2.2.3 추가해야 할 정책
**announcements 테이블 RLS 정책**
- **SELECT**: 
  - 모든 인증된 사용자: 활성 공지사항(`is_active = true`) 조회 가능
  - 관리자: 모든 공지사항 조회 가능
- **INSERT**: 관리자만 생성 가능
- **UPDATE**: 관리자만 수정 가능
- **DELETE**: 관리자만 삭제 가능

**announcement_dismissals 테이블 RLS 정책**
- **SELECT**: 자신의 기록만 조회 가능 (`user_id = auth.uid()`)
- **INSERT**: 자신의 기록만 생성 가능 (`user_id = auth.uid()`)
- **UPDATE**: 없음 (수정 불가)
- **DELETE**: 없음 (삭제 불가, CASCADE로 자동 삭제)

**announcement_attachments 테이블 RLS 정책**
- **SELECT**: 모든 인증된 사용자 조회 가능
- **INSERT**: 관리자만 생성 가능
- **UPDATE**: 관리자만 수정 가능
- **DELETE**: 관리자만 삭제 가능

### 2.3 데이터베이스 함수

#### 2.3.1 제거해야 할 함수
- `has_project_access(user_id UUID, project_id UUID)` - 프로젝트 접근 확인
- `has_task_in_project(user_id UUID, project_id UUID)` - 프로젝트 내 태스크 확인
- `is_project_participant(user_id UUID, project_id UUID)` - 프로젝트 참여자 확인
- 프로젝트 관련 헬퍼 함수들

#### 2.3.2 수정해야 할 함수
- `is_admin(user_id UUID)` - 유지 (다른 곳에서 사용)
- `can_access_profile()` - 프로젝트 참여자 확인 로직 제거 필요

### 2.4 트리거

#### 2.4.1 이메일 트리거 수정
**send_task_status_change_email() 함수**
- **현재**: `project_title`을 `projects` 테이블에서 조회
- **변경**: `project_title` 조회 로직 제거 또는 태스크 제목 사용

**send_task_created_email() 함수** (있다면)
- 프로젝트 관련 로직 제거

#### 2.4.2 시스템 메시지 트리거
- `create_task_insert_system_message_trigger` - 프로젝트 관련 로직 확인 및 제거

#### 2.4.3 공지사항 리얼타임 트리거
- 공지사항 생성/수정 시 실시간 구독을 통해 모든 클라이언트에 알림
- Supabase Realtime을 사용하여 `announcements` 테이블 변경 감지

### 2.5 프론트엔드 코드

#### 2.5.1 API 파일
**src/api/project.ts**
- 제거 또는 대폭 수정
- 프로젝트 관련 API 함수들 제거

**src/api/task.ts**
- `project_id` 관련 로직 제거
- `created_by`, `client_name` 추가
- `send_email_to_client` 필드 추가 및 업데이트 함수 수정

**src/api/announcement.ts** (신규 생성)
- 공지사항 CRUD API 함수들
- 활성 공지사항 조회 함수
- 사용자별 "다시 보지 않음" 기록 생성 함수
- 파일 업로드 함수 (이미지 및 첨부파일)

#### 2.5.2 페이지 컴포넌트
**src/pages/admin-dashboard-page.tsx**
- 프로젝트 탭 제거, 전체 태스크 탭으로 변경
- **관리자**: 모든 태스크 표시 (진행중이거나 완료된 모든 task)
- 승인된 태스크에 이메일 발송 여부 표시 (선택)

**src/pages/member-dashboard-page.tsx**
- 프로젝트 탭 제거, 전체 태스크 탭으로 변경
- **멤버**: 자기가 진행한 모든 태스크 표시 (진행중이거나 완료된 task들)
  - `assigner_id` 또는 `assignee_id`가 자신인 태스크 중 진행중 또는 완료된 것들

**담당 업무 탭 (공통)**
- 내가 지시자(`assigner_id`)이거나 담당자(`assignee_id`)인 태스크 중
- **승인됨(APPROVED)이 아닌** 모든 태스크들 표시
  - `task_status != 'APPROVED'`인 태스크들

**src/pages/project-detail-page.tsx**
- 제거 또는 대폭 수정

**src/pages/task-detail-page.tsx**
- 프로젝트 관련 로직 제거
- 승인 상태일 때 "고객에게 이메일 발송 완료" 체크박스 추가
- 지시자 또는 담당자만 수정 가능

**src/pages/admin-announcement-create-page.tsx** (신규 생성)
- 관리자용 공지사항 작성 페이지
- 제목, 내용 입력
- 최상단 이미지 업로드
- 파일 첨부 기능
- 활성화 여부 설정
- 게시 종료 날짜 선택 (선택사항, 미설정 시 무기한)

**src/pages/admin-announcement-edit-page.tsx** (신규 생성)
- 관리자용 공지사항 수정 페이지
- 기존 공지사항 데이터 로드
- 작성 페이지와 동일한 폼 구조 (재사용 가능)
- 기존 이미지/파일 표시 및 삭제 기능
- 게시 종료 날짜 수정 가능
- 수정 후 저장 시 공지사항 목록 페이지로 이동

**src/pages/admin-announcement-list-page.tsx** (신규 생성)
- 관리자용 공지사항 목록 페이지
- 관리자가 작성한 모든 공지사항 목록 표시 (활성/비활성 모두)
- 공지사항별 정보 표시:
  - 제목, 내용 미리보기
  - 작성일, 수정일
  - 활성화 여부 상태
  - 이미지/첨부파일 개수
- 각 공지사항별 액션 버튼:
  - 수정 버튼: 공지사항 수정 페이지로 이동
  - 삭제 버튼: 삭제 확인 다이얼로그 후 삭제
  - 활성화/비활성화 토글 버튼
- 최신순 정렬 (기본값)
- 검색 기능 (제목, 내용 검색)

#### 2.5.3 훅
**src/hooks/queries/use-projects.ts**
- 제거 또는 대폭 수정

**src/hooks/mutations/use-project.ts**
- 제거 또는 대폭 수정

**src/hooks/mutations/use-project-participants.ts**
- 제거

**src/hooks/queries/use-tasks.ts**
- 프로젝트 필터링 로직 제거
- 전체 태스크 탭용 쿼리: 관리자는 모든 태스크, 멤버는 자신이 진행한 태스크 (진행중/완료)
- 담당 업무 탭용 쿼리: 지시자/담당자인 태스크 중 승인됨이 아닌 것들

**src/hooks/mutations/use-task.ts**
- `send_email_to_client` 업데이트 지원 추가
- 지시자 또는 담당자만 수정 가능하도록 권한 체크

**src/hooks/queries/use-announcements.ts** (신규 생성)
- 활성 공지사항 조회 훅 (일반 사용자용)
- 사용자가 "다시 보지 않음"을 체크하지 않은 공지사항만 조회
- 게시 종료 날짜가 지나지 않은 공지사항만 조회 (`expires_at IS NULL OR expires_at > NOW()`)
- 리얼타임 구독 설정

**src/hooks/queries/use-admin-announcements.ts** (신규 생성)
- 관리자용 공지사항 목록 조회 훅
- 관리자가 작성한 모든 공지사항 조회 (활성/비활성 모두)
- 검색 기능 지원
- 정렬 기능 (최신순, 오래된순)
- 리얼타임 구독 설정

**src/hooks/queries/use-announcement.ts** (신규 생성)
- 단일 공지사항 상세 조회 훅
- 공지사항 ID로 조회
- 수정 페이지에서 사용

**src/hooks/mutations/use-announcement.ts** (신규 생성)
- 공지사항 생성 훅 (`createAnnouncement`)
- 공지사항 수정 훅 (`updateAnnouncement`)
- 공지사항 삭제 훅 (`deleteAnnouncement`)
- 공지사항 활성화/비활성화 토글 훅 (`toggleAnnouncementActive`)
- 파일 업로드 훅 (`uploadAnnouncementFile`)
- 파일 삭제 훅 (`deleteAnnouncementFile`)
- "다시 보지 않음" 기록 생성 훅 (`dismissAnnouncement`)

#### 2.5.4 컴포넌트
**src/components/project/** 디렉토리
- 대부분 제거 또는 대폭 수정

**src/components/task/kanban-board-with-projects.tsx**
- 프로젝트 관련 로직 제거

**src/components/task/category-task-list-modal.tsx**
- 프로젝트 관련 로직 제거

**src/components/announcement/announcement-modal.tsx** (신규 생성)
- 공지사항 모달 컴포넌트
- 사이트 접속 시 활성 공지사항 표시
- "다시 보지 않음" 체크박스
- 이미지 표시 (최상단)
- 파일 첨부 목록 표시
- 리얼타임 업데이트 지원

**src/components/announcement/announcement-form.tsx** (신규 생성)
- 공지사항 작성/수정 폼 컴포넌트
- 제목, 내용 입력 필드
- 이미지 업로드 컴포넌트
- 파일 첨부 컴포넌트
- 게시 종료 날짜 선택 필드 (날짜/시간 선택기)
- 작성/수정 모드 지원

**src/components/announcement/announcement-list-item.tsx** (신규 생성)
- 공지사항 목록 아이템 컴포넌트
- 공지사항 정보 표시 (제목, 내용 미리보기, 날짜, 상태 등)
- 수정/삭제/활성화 토글 버튼
- 삭제 확인 다이얼로그

**src/components/announcement/announcement-search-filter.tsx** (신규 생성)
- 공지사항 검색 및 필터 컴포넌트
- 제목/내용 검색 입력
- 활성/비활성 필터
- 정렬 옵션 (최신순/오래된순)

**src/components/layout/app-sidebar.tsx**
- "게시하기" 버튼 클릭 시 공지사항 작성 페이지로 이동
- 관리자만 "게시하기" 버튼 표시 (이미 구현됨)

#### 2.5.5 라우팅
**src/root-router.tsx**
- 프로젝트 관련 라우트 제거
- 공지사항 작성 페이지 라우트 추가 (`/admin/announcements/create`)
- 공지사항 목록 페이지 라우트 추가 (`/admin/announcements`)
- 공지사항 수정 페이지 라우트 추가 (`/admin/announcements/:id/edit`)

#### 2.5.6 앱 레이아웃
**src/App.tsx** 또는 **src/components/layout/app-layout.tsx**
- 공지사항 모달 전역 컴포넌트 추가
- 사이트 접속 시 활성 공지사항 자동 표시 로직
- 리얼타임 구독 설정

### 2.6 타입 정의

#### 2.6.1 데이터베이스 타입
**src/database.type.ts** - 재생성 필요
- `projects` 테이블 타입 제거
- `project_participants` 테이블 타입 제거
- `tasks` 테이블 타입에 `created_by`, `client_name`, `send_email_to_client` 추가, `project_id` 제거
- `announcements` 테이블 타입 추가
- `announcement_dismissals` 테이블 타입 추가
- `announcement_attachments` 테이블 타입 추가

#### 2.6.2 스토리지
**Supabase Storage**
- `announcements` 버킷 생성 (공지사항 이미지 및 파일 저장)
- RLS 정책 설정:
  - 읽기: 모든 인증된 사용자
  - 쓰기: 관리자만
  - 삭제: 관리자만

---

## 3️⃣ 마이그레이션 SQL 계획

### 3.1 데이터 마이그레이션

```sql
-- 1. tasks 테이블에 created_by, client_name, send_email_to_client 컬럼 추가
ALTER TABLE public.tasks 
  ADD COLUMN IF NOT EXISTS created_by UUID,
  ADD COLUMN IF NOT EXISTS client_name TEXT,
  ADD COLUMN IF NOT EXISTS send_email_to_client BOOLEAN NOT NULL DEFAULT false;

-- 2. 기존 데이터 마이그레이션: projects의 created_by, client_name을 관련 tasks로 복사
UPDATE public.tasks t
SET 
  created_by = p.created_by,
  client_name = p.client_name
FROM public.projects p
WHERE t.project_id = p.id;
```

### 3.2 RLS 정책 수정

```sql
-- tasks 테이블 RLS 정책 재작성
DROP POLICY IF EXISTS "tasks_select_project_access" ON public.tasks;
DROP POLICY IF EXISTS "tasks_insert_authenticated" ON public.tasks;
DROP POLICY IF EXISTS "tasks_update_assigner_or_assignee_only" ON public.tasks;
DROP POLICY IF EXISTS "tasks_delete_admin_only" ON public.tasks;

-- 새로운 SELECT 정책: 관리자는 모든 태스크, 멤버는 자신이 지시자/담당자인 태스크만
CREATE POLICY "tasks_select_admin_or_assigned"
ON public.tasks
FOR SELECT
USING (
  is_admin(auth.uid())
  OR auth.uid() = assigner_id
  OR auth.uid() = assignee_id
);

-- INSERT 정책: 인증된 사용자만 생성 가능
CREATE POLICY "tasks_insert_authenticated"
ON public.tasks
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- UPDATE 정책: 지시자 또는 담당자만 수정 가능
-- send_email_to_client 필드도 지시자 또는 담당자만 수정 가능
CREATE POLICY "tasks_update_assigner_or_assignee"
ON public.tasks
FOR UPDATE
USING (
  auth.uid() = assigner_id
  OR auth.uid() = assignee_id
)
WITH CHECK (
  auth.uid() = assigner_id
  OR auth.uid() = assignee_id
);

-- DELETE 정책: 관리자만 삭제 가능
CREATE POLICY "tasks_delete_admin_only"
ON public.tasks
FOR DELETE
USING (is_admin(auth.uid()));
```

### 3.3 함수 제거

```sql
-- 프로젝트 관련 함수 제거
DROP FUNCTION IF EXISTS public.has_project_access(UUID, UUID);
DROP FUNCTION IF EXISTS public.has_task_in_project(UUID, UUID);
DROP FUNCTION IF EXISTS public.is_project_participant(UUID, UUID);
```

### 3.4 트리거 수정

```sql
-- 이메일 트리거 함수 수정 (project_title 제거)
CREATE OR REPLACE FUNCTION public.send_task_status_change_email()
RETURNS TRIGGER AS $$
DECLARE
  -- ... (기존 변수들)
  -- project_title TEXT; -- 제거
BEGIN
  -- ... (기존 로직)
  -- project_title 조회 로직 제거
  -- request_body에서 projectTitle 제거
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 3.5 공지사항 테이블 생성

```sql
-- announcements 테이블 생성
CREATE TABLE public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  image_url TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- announcement_dismissals 테이블 생성
CREATE TABLE public.announcement_dismissals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(announcement_id, user_id)
);

-- announcement_attachments 테이블 생성
CREATE TABLE public.announcement_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size BIGINT,
  file_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 인덱스 생성
CREATE INDEX idx_announcements_is_active ON public.announcements(is_active) WHERE is_active = true;
CREATE INDEX idx_announcements_created_at ON public.announcements(created_at DESC);
CREATE INDEX idx_announcements_expires_at ON public.announcements(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_announcement_dismissals_announcement_user ON public.announcement_dismissals(announcement_id, user_id);
CREATE INDEX idx_announcement_attachments_announcement_id ON public.announcement_attachments(announcement_id);

-- RLS 활성화
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_dismissals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_attachments ENABLE ROW LEVEL SECURITY;

-- announcements RLS 정책
CREATE POLICY "announcements_select_active"
ON public.announcements
FOR SELECT
USING (
  (is_active = true AND (expires_at IS NULL OR expires_at > NOW())) 
  OR is_admin(auth.uid())
);

CREATE POLICY "announcements_insert_admin"
ON public.announcements
FOR INSERT
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "announcements_update_admin"
ON public.announcements
FOR UPDATE
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "announcements_delete_admin"
ON public.announcements
FOR DELETE
USING (is_admin(auth.uid()));

-- announcement_dismissals RLS 정책
CREATE POLICY "announcement_dismissals_select_own"
ON public.announcement_dismissals
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "announcement_dismissals_insert_own"
ON public.announcement_dismissals
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- announcement_attachments RLS 정책
CREATE POLICY "announcement_attachments_select_all"
ON public.announcement_attachments
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "announcement_attachments_insert_admin"
ON public.announcement_attachments
FOR INSERT
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "announcement_attachments_update_admin"
ON public.announcement_attachments
FOR UPDATE
USING (is_admin(auth.uid()))
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "announcement_attachments_delete_admin"
ON public.announcement_attachments
FOR DELETE
USING (is_admin(auth.uid()));
```

---

## 4️⃣ 작업 순서 제안

1. **데이터 마이그레이션** (기존 데이터 보존)
   - 프로젝트의 `created_by`, `client_name`을 관련된 모든 tasks로 복사

2. **스키마 변경**
   - 컬럼 추가/제거, 외래키 변경
   - `send_email_to_client` 필드 추가

3. **RLS 정책 수정**
   - 프로젝트 의존성 제거
   - `send_email_to_client` 필드 수정 권한 설정 (지시자 또는 담당자만)

4. **함수 및 트리거 수정**
   - 프로젝트 관련 로직 제거

5. **인덱스 정리**
   - 불필요한 인덱스 제거, 새로운 인덱스 추가

6. **공지사항 기능 구현**
   - 공지사항 테이블 및 RLS 정책 생성
   - 스토리지 버킷 생성 및 정책 설정
   - 공지사항 API 함수 구현
   - 공지사항 작성 페이지 구현
   - 공지사항 목록 페이지 구현 (관리자용, 수정/삭제/활성화 토글 포함)
   - 공지사항 수정 페이지 구현
   - 공지사항 모달 컴포넌트 구현 (일반 사용자용)
   - 리얼타임 구독 설정
   - 사이드바 "게시하기" 버튼 연결

7. **프론트엔드 코드 수정**
   - 프로젝트 관련 코드 제거
   - `send_email_to_client` UI 추가
   - 전체 태스크 탭: 관리자는 모든 태스크, 멤버는 자신이 진행한 태스크 (진행중/완료)
   - 담당 업무 탭: 지시자/담당자인 태스크 중 승인됨이 아닌 것들

8. **타입 재생성 및 테스트**
   - `npm run type-gen` 실행
   - TypeScript 컴파일 에러 확인

---

## 5️⃣ send_email_to_client 필드 사용 시나리오

### 5.1 사용 흐름
1. 태스크가 승인(APPROVED) 상태로 변경됨
2. 지시자 또는 담당자가 고객에게 이메일 발송 (구글 등 외부 이메일)
3. UI에서 "고객에게 이메일 발송 완료" 체크박스 체크
4. `send_email_to_client` 필드가 `true`로 업데이트됨
5. 대시보드에서 승인된 태스크의 이메일 발송 여부 확인 가능

### 5.2 UI 구현
**태스크 상세 페이지**
- 승인(APPROVED) 상태일 때만 표시
- 체크박스: "고객에게 이메일 발송 완료"
- `send_email_to_client` 필드와 연동
- 지시자 또는 담당자만 수정 가능

**대시보드 목록**
- 승인된 태스크에 이메일 발송 여부 아이콘/배지 표시 (선택)
- 예: ✅ (발송 완료), ⚠️ (미발송)

---

## 6️⃣ 주의사항

### 6.1 데이터 백업
- 마이그레이션 전 전체 DB 백업 필수

### 6.2 순환 참조
- RLS 정책과 함수 간 순환 참조 확인 필요

### 6.3 이메일 트리거
- 프로젝트 정보 의존성 제거 확인

### 6.4 실시간 구독
- 프로젝트 관련 실시간 구독 제거 필요

### 6.5 스토리지
- 프로젝트 관련 스토리지 버킷/정책 확인 필요
- 공지사항 이미지 및 파일 저장용 버킷 생성 필요

### 6.6 리얼타임 구독
- 공지사항 테이블 변경 감지를 위한 Realtime 구독 설정 필요
- 클라이언트 측에서 공지사항 생성/수정 시 즉시 반영되도록 구현

---

## 7️⃣ 체크리스트

### 7.1 데이터베이스
- [ ] 데이터 백업 완료
- [ ] 데이터 마이그레이션 완료
- [ ] 스키마 변경 완료
- [ ] 공지사항 테이블 생성 완료
- [ ] RLS 정책 수정 완료
- [ ] 함수 제거/수정 완료
- [ ] 트리거 수정 완료
- [ ] 인덱스 정리 완료
- [ ] 외래키 제약조건 변경 완료
- [ ] 스토리지 버킷 생성 및 정책 설정 완료

### 7.2 프론트엔드
- [ ] API 파일 수정 완료
- [ ] 공지사항 API 파일 생성 완료
- [ ] 페이지 컴포넌트 수정 완료
- [ ] 공지사항 작성 페이지 생성 완료
- [ ] 공지사항 목록 페이지 생성 완료 (관리자)
- [ ] 공지사항 수정 페이지 생성 완료
- [ ] 공지사항 모달 컴포넌트 생성 완료
- [ ] 훅 수정 완료
- [ ] 공지사항 훅 생성 완료
- [ ] 컴포넌트 수정 완료
- [ ] 라우팅 수정 완료
- [ ] 리얼타임 구독 설정 완료
- [ ] 타입 재생성 완료
- [ ] TypeScript 컴파일 에러 없음

### 7.3 테스트
- [ ] 데이터 마이그레이션 검증
- [ ] RLS 정책 동작 확인
- [ ] 공지사항 RLS 정책 동작 확인
- [ ] 이메일 트리거 동작 확인
- [ ] UI 동작 확인
- [ ] 권한 확인 (관리자/멤버)
- [ ] 전체 태스크 탭: 관리자/멤버 각각 확인
- [ ] 담당 업무 탭: 승인됨이 아닌 태스크만 표시 확인
- [ ] 공지사항 작성 기능 확인
- [ ] 게시 종료 날짜 설정 기능 확인
- [ ] 공지사항 목록 페이지 확인 (관리자)
- [ ] 게시 종료 날짜 표시 확인 (목록 페이지)
- [ ] 공지사항 수정 기능 확인
- [ ] 게시 종료 날짜 수정 기능 확인
- [ ] 공지사항 삭제 기능 확인 (확인 다이얼로그 포함)
- [ ] 공지사항 활성화/비활성화 토글 확인
- [ ] 공지사항 검색 기능 확인
- [ ] 공지사항 정렬 기능 확인 (게시 종료 날짜순 포함)
- [ ] 공지사항 모달 표시 확인 (일반 사용자)
- [ ] 게시 종료 날짜가 지난 공지사항 미표시 확인
- [ ] "다시 보지 않음" 기능 확인
- [ ] 파일 첨부 기능 확인
- [ ] 이미지 업로드 및 표시 확인
- [ ] 기존 파일 삭제 기능 확인
- [ ] 리얼타임 업데이트 동작 확인

---

## 8️⃣ 롤백 계획

롤백이 필요한 경우:
1. 데이터베이스 백업에서 복원
2. 마이그레이션 파일 롤백 (필요 시)
3. 프론트엔드 코드 롤백

---

## 9️⃣ 최종 스키마 정의

### 9.1 tasks 테이블 (최종)

```sql
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  assigner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  assignee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  client_name TEXT NOT NULL,
  send_email_to_client BOOLEAN NOT NULL DEFAULT false,
  task_status task_status NOT NULL DEFAULT 'ASSIGNED',
  task_category task_category NOT NULL DEFAULT 'REVIEW',
  due_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tasks_assigner_assignee_different CHECK (assigner_id != assignee_id)
);
```

### 9.2 제거된 테이블
- `projects` 테이블
- `project_participants` 테이블

### 9.3 공지사항 테이블

```sql
-- announcements 테이블
CREATE TABLE announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  image_url TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- announcement_dismissals 테이블
CREATE TABLE announcement_dismissals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(announcement_id, user_id)
);

-- announcement_attachments 테이블
CREATE TABLE announcement_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size BIGINT,
  file_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 🔟 공지사항 기능 상세 설계

### 10.1 공지사항 작성 흐름
1. 관리자가 사이드바의 "게시하기" 버튼 클릭
2. 공지사항 작성 페이지로 이동
3. 제목, 내용 입력
4. 최상단 이미지 업로드 (선택)
5. 파일 첨부 (선택, 여러 개 가능)
6. "활성화" 체크박스로 즉시 공개 여부 설정
7. 게시 종료 날짜 선택 (선택사항, 미설정 시 무기한)
8. 저장 버튼 클릭
9. 모든 사용자 화면에 리얼타임으로 모달 표시

### 10.2 공지사항 표시 로직
1. 사용자가 사이트 접속 시 활성 공지사항(`is_active = true`) 조회
2. 게시 종료 날짜가 지나지 않은 공지사항만 필터링 (`expires_at IS NULL OR expires_at > NOW()`)
3. 사용자가 "다시 보지 않음"을 체크하지 않은 공지사항만 필터링
4. 가장 최신 공지사항을 모달로 표시
5. 사용자가 "다시 보지 않음" 체크 시 `announcement_dismissals` 테이블에 기록
6. 이후 해당 사용자에게는 해당 공지사항이 표시되지 않음
7. 게시 종료 날짜가 지나면 자동으로 더 이상 표시되지 않음

### 10.3 리얼타임 업데이트
- Supabase Realtime을 사용하여 `announcements` 테이블 변경 감지
- 공지사항 생성/수정 시 모든 연결된 클라이언트에 즉시 알림
- 클라이언트는 새로운 공지사항을 자동으로 조회하여 모달 표시

### 10.4 파일 저장 구조
- 스토리지 버킷: `announcements`
- 이미지 경로: `announcements/{announcement_id}/image/{filename}`
- 첨부파일 경로: `announcements/{announcement_id}/attachments/{filename}`

### 10.5 관리자 공지사항 관리 페이지
**목록 페이지 (`/admin/announcements`)**
1. 관리자가 사이드바의 "게시하기" 버튼 또는 직접 URL로 접근
2. 관리자가 작성한 모든 공지사항 목록 표시
3. 각 공지사항 카드에 표시되는 정보:
   - 제목, 내용 미리보기 (일부만 표시)
   - 작성일, 수정일
   - 게시 종료 날짜 (설정된 경우)
   - 활성화 여부 배지 (활성/비활성)
   - 만료 여부 배지 (게시 종료 날짜가 지난 경우)
   - 이미지/첨부파일 개수 아이콘
   - "다시 보지 않음" 체크한 사용자 수 (선택적)
4. 액션 버튼:
   - **수정 버튼**: 공지사항 수정 페이지로 이동 (`/admin/announcements/{id}/edit`)
   - **삭제 버튼**: 삭제 확인 다이얼로그 표시 후 삭제
   - **활성화/비활성화 토글**: 즉시 활성화 상태 변경
5. 기능:
   - 검색: 제목, 내용으로 검색
   - 정렬: 최신순(기본), 오래된순, 게시 종료 날짜순
   - 필터: 활성/비활성 필터링, 만료/미만료 필터링

**수정 페이지 (`/admin/announcements/{id}/edit`)**
1. 공지사항 ID로 기존 데이터 로드
2. 작성 페이지와 동일한 폼 구조 (컴포넌트 재사용)
3. 기존 이미지/파일 표시:
   - 이미지: 썸네일 표시 및 삭제 버튼
   - 첨부파일: 파일명, 크기 표시 및 삭제 버튼
4. 새로운 이미지/파일 추가 가능
5. 게시 종료 날짜 수정 가능 (기존 값 표시 및 변경 가능)
6. 수정 후 저장:
   - 변경사항 저장
   - 공지사항 목록 페이지로 이동
   - 리얼타임으로 모든 사용자에게 업데이트 알림

**삭제 기능**
1. 목록 페이지에서 삭제 버튼 클릭
2. 삭제 확인 다이얼로그 표시:
   - "정말 삭제하시겠습니까?" 메시지
   - 공지사항 제목 표시
   - 확인/취소 버튼
3. 확인 시:
   - 공지사항 삭제 (CASCADE로 관련 데이터 자동 삭제)
   - 스토리지의 이미지/파일도 함께 삭제
   - 목록에서 제거
   - 리얼타임으로 모든 사용자에게 삭제 알림

**활성화/비활성화 토글**
1. 목록 페이지에서 토글 버튼 클릭
2. 즉시 `is_active` 필드 업데이트
3. 비활성화 시:
   - 더 이상 모달로 표시되지 않음
   - 기존 "다시 보지 않음" 기록은 유지
4. 활성화 시:
   - 모든 사용자에게 모달로 표시 (이미 "다시 보지 않음"을 체크한 사용자 제외)
   - 리얼타임으로 즉시 반영

---

**작성일**: 2026-01-21
**작성자**: AI Assistant
**상태**: 검토 대기
