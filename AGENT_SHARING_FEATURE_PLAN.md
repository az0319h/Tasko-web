# 에이전트 공유 기능 구현 계획

## 📋 개요

관리자 멤버 모두가 자신이 만든 에이전트를 공유할 수 있는 페이지를 구현합니다.

## 🎯 요구사항

1. **접근 권한**: 관리자(admin) 멤버 모두 접근 가능
2. **에이전트 업로드**: 모든 관리자가 에이전트를 업로드할 수 있음
3. **에이전트 수정/삭제**: 자신이 올린 에이전트만 수정/삭제 가능
4. **UI 구성**:
   - 목록 페이지: 카드 형태 (대표 이미지/비디오, 에이전트 이름, 간략한 설명)
   - 상세 페이지: 
     - 에이전트 이름, 간략한 설명
     - 대표 이미지/비디오 (이미지 또는 비디오, 비디오는 직접 재생 가능)
     - 에이전트 확인하기 버튼 (만들어진 사이트로 이동)
     - 구체적인 에이전트 설명 (긴 설명)
     - 에이전트 특징 리스트 (체크마크 아이콘과 함께 표시)
5. **대표 미디어 지원**: 대표 이미지 또는 비디오 업로드 지원
6. **모달**: 업로드/수정은 모달을 통해 진행

---

## 🗄️ 데이터베이스 마이그레이션 계획

### 마이그레이션 파일

다음 마이그레이션 파일들이 생성되었습니다:

1. **`supabase/migrations/agents/20260131000001_create_agents_sharing_system.sql`**
   - agents 테이블 생성 (detailed_description, features, site_media_url, site_media_type 필드 포함)
   - RLS 정책 설정
   - 인덱스 및 트리거 설정
   - Realtime 구독 활성화

2. **`supabase/migrations/agents/20260131000002_create_agents_storage_policies.sql`**
   - agents Storage 버킷 RLS 정책 설정
   - 주의: Storage 버킷은 Supabase Dashboard에서 먼저 생성해야 함

### 1. 테이블 생성

#### 1.1 `agents` 테이블

에이전트 기본 정보를 저장하는 테이블입니다.

```sql
CREATE TABLE IF NOT EXISTS public.agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL COMMENT '에이전트 이름',
  description TEXT NOT NULL COMMENT '에이전트 간략한 설명 (목록 페이지용)',
  detailed_description TEXT COMMENT '에이전트 구체적인 설명 (상세 페이지용, 긴 설명)',
  features JSONB DEFAULT '[]'::jsonb COMMENT '에이전트 특징 리스트 (JSON 배열)',
  site_media_url TEXT COMMENT '사이트 대표 미디어 URL (이미지 또는 비디오, Storage 버킷 경로)',
  site_media_type TEXT CHECK (site_media_type IN ('image', 'video')) COMMENT '대표 미디어 타입: image 또는 video',
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE COMMENT '에이전트 생성자 ID',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_agents_created_by ON public.agents(created_by);
CREATE INDEX IF NOT EXISTS idx_agents_created_at ON public.agents(created_at DESC);

-- updated_at 자동 업데이트 트리거
CREATE TRIGGER update_agents_updated_at
  BEFORE UPDATE ON public.agents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE public.agents IS '에이전트 공유 테이블: 관리자가 만든 에이전트 정보';
```

**참고**: 대표 미디어는 `agents` 테이블의 `site_media_url`과 `site_media_type` 필드로 관리됩니다. 별도의 미디어 테이블은 사용하지 않습니다.

### 2. RLS 정책 설정

#### 2.1 `agents` 테이블 RLS 정책

```sql
-- RLS 활성화
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

-- SELECT: 모든 관리자가 모든 에이전트 조회 가능
CREATE POLICY "agents_select_admin_all"
ON public.agents
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- INSERT: 모든 관리자가 에이전트 생성 가능
CREATE POLICY "agents_insert_admin"
ON public.agents
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
  AND created_by = auth.uid()
);

-- UPDATE: 자신이 생성한 에이전트만 수정 가능
CREATE POLICY "agents_update_own"
ON public.agents
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
  AND created_by = auth.uid()
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
  AND created_by = auth.uid()
);

-- DELETE: 자신이 생성한 에이전트만 삭제 가능
CREATE POLICY "agents_delete_own"
ON public.agents
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
  AND created_by = auth.uid()
);
```

**참고**: 대표 미디어는 `agents` 테이블의 일부이므로 별도의 RLS 정책이 필요하지 않습니다. `agents` 테이블의 RLS 정책으로 함께 관리됩니다.

### 3. Storage 버킷 생성

**중요**: Storage 버킷은 Supabase Dashboard에서 먼저 생성해야 합니다.

**버킷 설정**:
- 버킷 이름: `agents`
- Public: `true` (미디어 공개 접근)
- File size limit: `100MB` (비디오 파일 지원을 위해 증가)
- Allowed MIME types:
  - 이미지: `image/*` (jpg, png, gif, webp 등)
  - 비디오: `video/*` (mp4, webm, mov 등)

**Storage 버킷 RLS 정책**은 `supabase/migrations/agents/20260131000002_create_agents_storage_policies.sql` 마이그레이션 파일에서 설정됩니다.

### 4. Realtime 구독

에이전트 목록이 실시간으로 업데이트되도록 Realtime이 활성화됩니다.
마이그레이션 파일에서 자동으로 설정됩니다.

---

## 🎨 프론트엔드 구현 계획

### 1. 라우팅 추가

#### 1.1 `src/root-router.tsx` 수정

```typescript
// AdminOnlyLayout 내부에 다음 라우트 추가:
<Route path="/admin/agents" element={<AdminAgentsPage />} />
<Route path="/admin/agents/:agentId" element={<AdminAgentDetailPage />} />
```

### 2. API 함수 작성

#### 2.1 `src/api/agent.ts` 생성

다음 함수들을 구현합니다:

```typescript
// 에이전트 목록 조회
export async function getAgents(): Promise<Agent[]>

// 에이전트 상세 조회
export async function getAgentById(agentId: string): Promise<AgentWithMedia>

// 에이전트 생성
export async function createAgent(data: CreateAgentInput): Promise<Agent>

// 에이전트 수정
export async function updateAgent(agentId: string, data: UpdateAgentInput): Promise<Agent>

// 에이전트 삭제
export async function deleteAgent(agentId: string): Promise<void>

// 에이전트 대표 미디어 업로드 (이미지 또는 비디오)
export async function uploadAgentSiteMedia(file: File, agentId: string, mediaType: 'image' | 'video'): Promise<string>

// 에이전트 대표 미디어 삭제
export async function deleteAgentSiteMedia(agentId: string): Promise<void>
```

#### 2.2 `src/api/storage.ts` 수정

에이전트 미디어 업로드 함수 추가:

```typescript
const AGENTS_BUCKET = "agents";

// 대표 미디어 업로드 (이미지 또는 비디오)
export async function uploadAgentSiteMedia(file: File, agentId: string, userId: string, mediaType: 'image' | 'video'): Promise<string>

// 대표 미디어 삭제
export async function deleteAgentSiteMedia(fileUrl: string): Promise<void>
```

### 3. 타입 정의

#### 3.1 `src/types/agent.ts` 생성

```typescript
export interface Agent {
  id: string;
  name: string;
  description: string; // 간략한 설명 (목록 페이지용)
  detailed_description: string | null; // 구체적인 설명 (상세 페이지용)
  features: string[]; // 에이전트 특징 리스트
  site_media_url: string | null; // 대표 미디어 URL (이미지 또는 비디오)
  site_media_type: 'image' | 'video' | null; // 대표 미디어 타입
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CreateAgentInput {
  name: string;
  description: string; // 간략한 설명
  detailed_description?: string; // 구체적인 설명
  features?: string[]; // 특징 리스트
  site_url?: string; // 에이전트 사이트 URL
  site_media_file?: File; // 대표 미디어 파일 (이미지 또는 비디오)
  site_media_type?: 'image' | 'video'; // 대표 미디어 타입
}

export interface UpdateAgentInput {
  name?: string;
  description?: string; // 간략한 설명
  detailed_description?: string; // 구체적인 설명
  features?: string[]; // 특징 리스트
  site_url?: string; // 에이전트 사이트 URL
  site_media_file?: File; // 대표 미디어 파일 (이미지 또는 비디오)
  site_media_type?: 'image' | 'video'; // 대표 미디어 타입
}
```

### 4. 페이지 컴포넌트

#### 4.1 `src/pages/admin-agents-page.tsx` 생성

에이전트 목록 페이지입니다.

**기능**:
- 에이전트 목록을 카드 형태로 표시
- 각 카드에는 사이트 이미지, 에이전트 이름, 간략한 설명 표시
- 카드 클릭 시 상세 페이지로 이동
- "에이전트 추가" 버튼으로 업로드 모달 열기
- 자신이 만든 에이전트에만 수정/삭제 버튼 표시

**UI 구조**:
```
┌─────────────────────────────────────┐
│  에이전트 공유          [+ 에이전트 추가] │
├─────────────────────────────────────┤
│  ┌─────┐  ┌─────┐  ┌─────┐         │
│  │ 이미지│  │ 이미지│  │ 이미지│         │
│  │ 이름  │  │ 이름  │  │ 이름  │         │
│  │ 설명  │  │ 설명  │  │ 설명  │         │
│  └─────┘  └─────┘  └─────┘         │
└─────────────────────────────────────┘
```

#### 4.2 `src/pages/admin-agent-detail-page.tsx` 생성

에이전트 상세 페이지입니다.

**기능**:
- 에이전트 이름, 간략한 설명 표시
- 대표 이미지/비디오 표시 및 수정 (이미지 또는 비디오, 비디오는 직접 재생 가능)
- 구체적인 에이전트 설명 섹션 (긴 설명, 이미지 1번 UI 참고)
- 에이전트 특징 리스트 섹션 (체크마크 아이콘과 함께, 이미지 1번 UI 참고)
- 수정/삭제 버튼 (소유자만 표시)

**UI 구조**:
```
┌─────────────────────────────────────┐
│  에이전트 이름                       │
├─────────────────────────────────────┤
│  ┌─────────────────────────────┐   │
│  │   대표 이미지/비디오          │   │
│  │   (이미지: 표시, 비디오: 재생) │   │
│  └─────────────────────────────┘   │
│  간략한 설명                          │
│                                     │
│  ────────────────────────────────   │
│  이게 뭔가요?                        │
│  구체적인 에이전트 설명 (긴 설명)      │
│  (이미지 1번 UI 스타일 참고)          │
│                                     │
│  ────────────────────────────────   │
│  포함 사항                           │
│  ┌─────────────────────────────┐   │
│  │ 특징                        │   │
│  │ ✓ 특징1                     │   │
│  │ ✓ 특징2                     │   │
│  │ ✓ 특징3                     │   │
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

### 5. 모달 컴포넌트

#### 5.1 `src/components/agent/agent-form-modal.tsx` 생성

에이전트 생성/수정 모달입니다.

**필드**:
- 에이전트 이름 (필수)
- 간략한 설명 (필수, 목록 페이지용)
- 구체적인 설명 (선택, 상세 페이지용, 긴 텍스트)
- 에이전트 특징 (선택, 리스트 형태, 각 특징은 체크마크 아이콘과 함께 표시)
- 에이전트 사이트 URL (선택, 에이전트 확인하기 버튼용)
- 대표 미디어 (선택, 이미지 또는 비디오 파일 업로드)

**기능**:
- 생성 모드: 새 에이전트 생성
- 수정 모드: 기존 에이전트 수정
- 미디어 타입 선택 (이미지/비디오)
- 미디어 미리보기 (이미지: 썸네일, 비디오: 비디오 플레이어 또는 썸네일)
- 특징 리스트 동적 추가/삭제 (각 특징은 텍스트 입력 필드)
- 폼 유효성 검증

### 6. 훅(Hooks)

#### 6.1 `src/hooks/use-agents.ts` 생성

```typescript
// 에이전트 목록 조회 훅
export function useAgents(): UseQueryResult<Agent[], Error>

// 에이전트 상세 조회 훅
export function useAgent(agentId: string): UseQueryResult<Agent, Error>

// 에이전트 생성 뮤테이션 훅
export function useCreateAgent(): UseMutationResult<Agent, Error, CreateAgentInput>

// 에이전트 수정 뮤테이션 훅
export function useUpdateAgent(): UseMutationResult<Agent, Error, { agentId: string; data: UpdateAgentInput }>

// 에이전트 삭제 뮤테이션 훅
export function useDeleteAgent(): UseMutationResult<void, Error, string>
```

### 7. 사이드바 메뉴 추가

#### 7.1 `src/components/layout/app-sidebar.tsx` 수정

관리자 메뉴에 "에이전트 공유" 항목 추가:

```typescript
const taskoManagementSubItems = [
  { id: "users-management", key: "사용자 관리", url: "/admin/users" },
  { id: "announcements-management", key: "공지사항 관리", url: "/admin/announcements" },
  { id: "agents-management", key: "에이전트 공유", url: "/admin/agents" }, // 추가
];
```

### 8. UI 컴포넌트

#### 8.1 `src/components/agent/agent-card.tsx` 생성

에이전트 카드 컴포넌트입니다.

**Props**:
- `agent`: Agent 객체
- `onClick`: 카드 클릭 핸들러
- `onEdit`: 수정 버튼 클릭 핸들러 (소유자만 표시)
- `onDelete`: 삭제 버튼 클릭 핸들러 (소유자만 표시)

**UI**:
- 미디어 영역 (대표 이미지/비디오 또는 기본 이미지)
- 에이전트 이름
- 간략한 설명 (최대 2줄, 말줄임표)
- 호버 효과

#### 8.2 `src/components/agent/agent-site-media.tsx` 생성

에이전트 대표 미디어 컴포넌트입니다.

**기능**:
- 대표 이미지/비디오 표시
- 이미지: 이미지 표시
- 비디오: 비디오 플레이어 표시
- 미디어 수정 버튼 (소유자만)
- 미디어 삭제 버튼 (소유자만)

#### 8.3 `src/components/agent/agent-features-section.tsx` 생성

에이전트 특징 섹션 컴포넌트입니다.

**기능**:
- 특징 리스트 표시 (체크마크 아이콘과 함께)
- 이미지 1번 UI 스타일 참고 (단일 열 레이아웃)
- 특징 추가/수정/삭제 (소유자만)
- 특징 순서 변경 (드래그 앤 드롭, 선택사항)

#### 8.4 `src/components/agent/agent-detailed-description.tsx` 생성

에이전트 구체적인 설명 섹션 컴포넌트입니다.

**기능**:
- 긴 설명 텍스트 표시
- 이미지 1번 UI 스타일 참고 (제목 "이게 뭔가요?" 스타일)
- 마크다운 또는 리치 텍스트 지원 (선택사항)

### 9. 스타일링

#### 9.1 첫 번째 이미지 UI 참고

- 카드 레이아웃: 그리드 또는 플렉스 레이아웃
- 다크 모드 지원
- 카드 호버 효과
- 반응형 디자인 (모바일 대응)

#### 9.2 두 번째 이미지 UI 참고

- 상세 페이지 레이아웃
- 비디오 플레이어 스타일

---

## 📝 구현 순서

### Phase 1: 데이터베이스 설정
1. ✅ 마이그레이션 파일 생성 완료
   - `supabase/migrations/agents/20260131000001_create_agents_sharing_system.sql`
   - `supabase/migrations/agents/20260131000002_create_agents_storage_policies.sql`
2. Storage 버킷 생성 (Supabase Dashboard에서 수동 생성 필요)
   - 버킷 이름: `agents`
   - Public: `true`
3. 마이그레이션 실행
   ```bash
   # Supabase CLI 사용
   supabase db push
   
   # 또는 Supabase Dashboard SQL Editor에서 순서대로 실행
   ```
4. 테이블 및 정책 검증

### Phase 2: API 및 타입 정의
1. 타입 정의 파일 생성
2. API 함수 구현
3. Storage 업로드 함수 구현

### Phase 3: 기본 페이지 구현
1. 에이전트 목록 페이지 구현
2. 에이전트 상세 페이지 구현
3. 라우팅 추가

### Phase 4: 모달 및 폼 구현
1. 에이전트 생성/수정 모달 구현
2. 대표 미디어 업로드 기능 구현 (이미지/비디오)
3. 폼 유효성 검증

### Phase 5: UI 개선 및 최적화
1. 카드 컴포넌트 스타일링
2. 대표 미디어 컴포넌트 구현 (이미지/비디오)
3. 구체적인 설명 섹션 구현 (이미지 1번 UI 참고)
4. 특징 리스트 섹션 구현 (이미지 1번 UI 참고, 체크마크 아이콘, 단일 열)
5. 반응형 디자인 적용
6. 로딩 상태 및 에러 처리

### Phase 6: 테스트 및 검증
1. 권한 테스트 (소유자만 수정/삭제 가능)
2. 대표 미디어 업로드/삭제 테스트 (이미지/비디오)
3. UI/UX 테스트

---

## 🔒 보안 고려사항

1. **RLS 정책**: 모든 테이블에 RLS 활성화 및 적절한 정책 설정
2. **Storage 권한**: 버킷별 RLS 정책으로 업로드/삭제 권한 제어
3. **권한 검증**: 프론트엔드뿐만 아니라 백엔드에서도 권한 검증
4. **파일 업로드**: 파일 크기 및 타입 제한
5. **파일 검증**: 업로드된 미디어 파일의 타입 및 크기 검증

---

## 📌 참고사항

1. **미디어 업로드**:
   - 이미지 파일 크기 제한: 10MB
   - 비디오 파일 크기 제한: 100MB
   - 지원 이미지 형식: jpg, png, gif, webp
   - 지원 비디오 형식: mp4, webm, mov
2. **텍스트 필드**:
   - 에이전트 이름 및 간략한 설명 길이 제한 필요 (UI에서 처리)
   - 구체적인 설명은 긴 텍스트 지원 (마크다운 가능)
   - 특징 리스트는 각 항목별 길이 제한 (UI에서 처리)
3. **UI 참고**:
   - 이미지 1번 UI: 구체적인 설명 및 특징 리스트 스타일 참고
   - 다크 모드 지원
   - 체크마크 아이콘 사용 (특징 리스트)
4. **기타**:
   - 대표 미디어 삭제 시 Storage에서도 파일 삭제 필요
   - 비디오는 비디오 플레이어로 직접 재생 가능하도록 구현
   - 이미지는 이미지로 표시, 비디오는 비디오 플레이어로 표시
   - 마이그레이션 파일은 `supabase/migrations/agents/` 디렉토리에 저장
