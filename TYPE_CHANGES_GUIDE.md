# 타입 변경 가이드

## 개요

Phase 1~3 작업으로 인한 데이터베이스 스키마 변경사항을 반영하기 위한 TypeScript 타입 업데이트 가이드입니다.

## 타입 재생성 방법

### 1. Supabase CLI를 사용한 타입 재생성

```bash
# Supabase 프로젝트 연결
supabase link --project-ref <your-project-ref>

# 타입 재생성
supabase gen types typescript --linked > src/database.type.ts
```

### 2. 주요 타입 변경사항

#### task_category ENUM 추가
```typescript
Enums: {
  task_category: "REVIEW" | "CONTRACT" | "SPECIFICATION" | "APPLICATION"
}
```

#### tasks 테이블 타입 변경
```typescript
tasks: {
  Row: {
    // ... 기존 필드
    task_category: Database["public"]["Enums"]["task_category"]  // 추가됨
    description: string | null  // 추가됨
    title: string  // instruction에서 변경됨
  }
}
```

#### projects 테이블 타입 변경
```typescript
projects: {
  Row: {
    // ... 기존 필드
    title: string  // opportunity에서 변경됨
    // patent_name 제거됨
    // is_public 제거됨
    // status 제거됨
  }
}
```

#### profiles 테이블 타입 확인
```typescript
profiles: {
  Row: {
    id: string
    email: string
    full_name: string | null
    role: string | null  // 'admin' | 'member'
    profile_completed: boolean | null
    is_active: boolean | null
    avatar_url: string | null
    created_at: string | null
    updated_at: string | null
  }
}
```

#### project_participants 테이블 타입 추가
```typescript
project_participants: {
  Row: {
    id: string
    project_id: string
    user_id: string
    invited_by: string
    invited_at: string
    created_at: string
  }
}
```

## 프론트엔드 코드 수정 가이드

### 1. tasks 테이블 관련

#### task_category 사용
```typescript
// 기존 코드 (task_category가 없는 경우)
const task = {
  task_status: 'ASSIGNED',
  // ...
};

// 변경 후
const task = {
  task_status: 'ASSIGNED',
  task_category: 'REVIEW',  // 필수 필드
  // ...
};
```

#### title 필드 사용
```typescript
// 기존 코드 (instruction 사용)
const task = {
  instruction: 'Task 제목',
  // ...
};

// 변경 후
const task = {
  title: 'Task 제목',  // instruction → title
  description: 'Task 설명',  // 새로 추가
  // ...
};
```

### 2. projects 테이블 관련

#### title 필드 사용
```typescript
// 기존 코드 (opportunity 사용)
const project = {
  opportunity: '프로젝트 기회',
  // ...
};

// 변경 후
const project = {
  title: '프로젝트 기회',  // opportunity → title
  // ...
};
```

#### 제거된 필드
```typescript
// 기존 코드 (제거된 필드 사용)
const project = {
  patent_name: '특허명',  // 제거됨
  is_public: true,  // 제거됨
  status: 'inProgress',  // 제거됨
  // ...
};

// 변경 후
const project = {
  // 제거된 필드 사용 안 함
  // ...
};
```

### 3. profiles 테이블 관련

#### 프로필 자동 생성
- `auth.users`에 사용자가 생성되면 자동으로 `profiles` 레코드가 생성됩니다.
- 수동으로 `profiles` 레코드를 생성할 필요가 없습니다.

```typescript
// 기존 코드 (수동 생성)
await supabase.from('profiles').insert({
  id: user.id,
  email: user.email,
  // ...
});

// 변경 후 (트리거가 자동 생성)
// 별도 INSERT 불필요, 트리거가 자동으로 생성함
```

### 4. project_participants 테이블 관련

#### 프로젝트 참여자 관리
```typescript
// 참여자 추가
await supabase.from('project_participants').insert({
  project_id: projectId,
  user_id: userId,
  invited_by: currentUserId,
});

// 참여자 조회
const { data } = await supabase
  .from('project_participants')
  .select('*, profiles(*)')
  .eq('project_id', projectId);
```

### 5. Storage 관련

#### avatars 버킷 사용
```typescript
// 프로필 이미지 업로드
const { data, error } = await supabase.storage
  .from('avatars')
  .upload(`${userId}/${filename}`, file);

// 프로필 이미지 다운로드 URL
const { data } = supabase.storage
  .from('avatars')
  .getPublicUrl(`${userId}/${filename}`);
```

#### task-files 버킷 사용
```typescript
// Task 파일 업로드
const { data, error } = await supabase.storage
  .from('task-files')
  .upload(`${taskId}/${userId}/${filename}`, file);

// Task 파일 다운로드 URL
const { data } = supabase.storage
  .from('task-files')
  .getPublicUrl(`${taskId}/${userId}/${filename}`);
```

## 마이그레이션 체크리스트

- [ ] TypeScript 타입 재생성 (`supabase gen types`)
- [ ] `tasks` 테이블 관련 코드에서 `instruction` → `title` 변경
- [ ] `tasks` 테이블 관련 코드에 `task_category` 필드 추가
- [ ] `tasks` 테이블 관련 코드에 `description` 필드 추가
- [ ] `projects` 테이블 관련 코드에서 `opportunity` → `title` 변경
- [ ] `projects` 테이블 관련 코드에서 제거된 필드(`patent_name`, `is_public`, `status`) 제거
- [ ] `profiles` 테이블 수동 생성 코드 제거 (트리거가 자동 생성)
- [ ] `project_participants` 테이블 사용 코드 추가
- [ ] Storage 버킷 경로 구조 확인 (`avatars/{userId}/`, `task-files/{taskId}/{userId}/`)

## 참고사항

1. **타입 재생성**: 스키마 변경 후 반드시 타입을 재생성하세요.
2. **기존 데이터**: 컬럼명 변경은 자동으로 마이그레이션되지만, 기존 데이터가 있는 경우 확인이 필요합니다.
3. **RLS 정책**: 모든 테이블에 RLS가 활성화되어 있으므로, 권한이 없는 사용자는 데이터에 접근할 수 없습니다.
4. **Storage 버킷**: `avatars` 버킷은 Supabase Dashboard에서 수동으로 생성해야 합니다.


