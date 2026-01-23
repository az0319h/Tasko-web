# 대규모 리팩터링 가능 여부 분석 보고서

## 📋 tasks.json 요약

### 프로젝트 개요
- **목표**: 프로젝트 → 태스크 계층 구조 제거, 태스크 단위 관리로 전환
- **추가 기능**: 공지사항 기능 추가
- **테스트 환경**: Restore to new project 방식 사용

### 주요 작업 (10개 Task)

1. **데이터 백업 및 마이그레이션 준비**
   - 테스트 환경 설정
   - 데이터 마이그레이션 SQL 작성 (projects → tasks 데이터 복사)

2. **tasks 테이블 스키마 변경**
   - `created_by`, `client_name`, `send_email_to_client` 컬럼 추가
   - `project_id` 컬럼 제거
   - 외래키 변경

3. **tasks 테이블 RLS 정책 수정**
   - 프로젝트 기반 → 태스크 단위 접근 제어로 변경

4. **데이터베이스 함수 및 트리거 수정**
   - 프로젝트 관련 함수 제거
   - 이메일 트리거 수정

5. **인덱스 및 외래키 정리**
   - 프로젝트 관련 인덱스 제거
   - 새 인덱스 추가

6. **공지사항 테이블 생성 및 RLS 정책**
   - `announcements`, `announcement_dismissals`, `announcement_attachments` 테이블 생성

7. **공지사항 API 및 훅 구현**
   - API 함수 및 React Query 훅 구현

8. **공지사항 UI 컴포넌트 구현**
   - 작성/수정/목록 페이지 및 모달 컴포넌트

9. **프로젝트 관련 코드 제거 및 UI 수정**
   - 프로젝트 관련 코드 제거
   - 태스크 중심 UI로 변경

10. **타입 재생성 및 최종 테스트**
    - 타입 재생성
    - 통합 테스트
    - 프로젝트 테이블 제거

---

## 🔍 Shadow DB 현재 상태 분석

### ✅ 테이블 구조

#### 존재하는 테이블
- ✅ `profiles` (RLS 활성화, 0개 행)
- ✅ `projects` (RLS 활성화, 52개 행)
- ✅ `project_participants` (RLS 활성화, 0개 행)
- ✅ `tasks` (RLS 활성화, 129개 행)
- ✅ `messages` (RLS 활성화, 3개 행)
- ✅ `email_logs` (RLS 활성화, 0개 행)
- ✅ `task_chat_logs` (RLS 활성화, 1개 행)
- ✅ `task_chat_log_items` (RLS 활성화, 2개 행)

#### 존재하지 않는 테이블
- ❌ `announcements` (생성 필요)
- ❌ `announcement_dismissals` (생성 필요)
- ❌ `announcement_attachments` (생성 필요)

### 📊 tasks 테이블 현재 구조

#### 현재 컬럼
```
- id (uuid, PK)
- project_id (uuid, NOT NULL) ⚠️ 제거 필요
- title (text, NOT NULL)
- assigner_id (uuid, nullable)
- assignee_id (uuid, nullable)
- task_status (task_status ENUM, NOT NULL)
- task_category (task_category ENUM, NOT NULL)
- due_date (timestamptz, NOT NULL)
- created_at (timestamptz, NOT NULL)
- updated_at (timestamptz, NOT NULL)
```

#### 추가 필요한 컬럼
- ❌ `created_by` (uuid) - 추가 필요
- ❌ `client_name` (text) - 추가 필요
- ❌ `send_email_to_client` (boolean, DEFAULT false) - 추가 필요

### 🔗 외래키 제약조건

#### 현재 tasks 테이블 외래키
- `tasks_project_id_fkey`: `tasks.project_id` → `projects.id` ⚠️ 제거 필요
- `tasks_assigner_id_fkey`: `tasks.assigner_id` → `profiles.id` ✅ 유지
- `tasks_assignee_id_fkey`: `tasks.assignee_id` → `profiles.id` ✅ 유지

#### 추가 필요한 외래키
- `tasks_created_by_fkey`: `tasks.created_by` → `auth.users.id` - 추가 필요

### 🔐 RLS 정책 현황

#### tasks 테이블 RLS 정책 (프로젝트 기반)
1. `tasks_select_participant_or_admin` - 프로젝트 참여자 또는 관리자만 조회
2. `tasks_insert_participant_or_admin` - 프로젝트 참여자 또는 관리자만 생성
3. `tasks_update_assigner_only` - 지시자만 수정
4. `tasks_update_assignee_status` - 담당자만 상태 수정
5. `tasks_delete_assigner_only` - 지시자만 삭제

**⚠️ 문제점**: 모든 정책이 `is_project_participant()` 함수에 의존하고 있음

#### projects 테이블 RLS 정책
- `projects_select_admin_or_participant`
- `projects_insert_admin_only`
- `projects_update_admin_only`
- `projects_delete_admin_only`

#### project_participants 테이블 RLS 정책
- `project_participants_select_participant_or_admin`
- `project_participants_insert_admin_only`
- `project_participants_delete_admin_only`

### 🔧 함수 현황

#### 프로젝트 관련 함수 (제거 필요)
- ⚠️ `create_project_with_participants(p_opportunity, p_client_name, p_due_date, p_participant_ids)`
- ⚠️ `get_project_summaries()`
- ⚠️ `has_project_access(user_id, project_id)`
- ⚠️ `is_project_participant(query_user_id, query_project_id)` - RLS 정책에서 사용 중

#### 수정 필요한 함수
- ⚠️ `can_access_profile(target_user_id)` - 프로젝트 기반 로직 포함 가능성

#### 유지할 함수
- ✅ `create_task_created_system_message()`
- ✅ `create_task_status_change_system_message()`
- ✅ `send_task_created_email()`
- ✅ `send_task_status_change_email()`
- ✅ `mark_message_as_read()`
- ✅ `mark_task_messages_as_read()`
- ✅ `is_admin(user_id)`
- ✅ `create_chat_log_on_file_upload()`

### 📈 데이터 현황

#### 현재 데이터
- **tasks**: 129개 (모두 project_id 보유, project_id 없는 task 없음)
- **projects**: 52개
- **tasks-project 관계**: 47개의 고유한 프로젝트에 129개 태스크가 연결됨

#### 마이그레이션 필요성
- ✅ **필수**: 모든 tasks에 `created_by`, `client_name` 데이터 복사 필요
- ✅ **검증 필요**: projects 테이블의 `created_by`, `client_name`이 tasks로 정상 복사 가능한지 확인

---

## ✅ 리팩터링 가능 여부 평가

### 🟢 가능한 항목

#### 1. 스키마 변경
- ✅ `tasks` 테이블에 새 컬럼 추가 가능 (`created_by`, `client_name`, `send_email_to_client`)
- ✅ `project_id` 컬럼 제거 가능 (데이터 마이그레이션 후)
- ✅ 외래키 제약조건 변경 가능

#### 2. 데이터 마이그레이션
- ✅ projects → tasks 데이터 복사 가능
- ✅ 모든 tasks가 project_id를 가지고 있어 마이그레이션 가능
- ⚠️ **주의**: projects의 `created_by`, `client_name`이 NULL인 경우 처리 필요

#### 3. RLS 정책 변경
- ✅ 프로젝트 기반 정책 제거 가능
- ✅ 태스크 단위 정책 생성 가능
- ⚠️ **주의**: 순환 참조 방지 필요

#### 4. 함수 및 트리거 수정
- ✅ 프로젝트 관련 함수 제거 가능
- ✅ 이메일 트리거 수정 가능
- ⚠️ **주의**: `is_project_participant()` 함수가 RLS 정책에서 사용 중이므로 정책 변경 후 제거해야 함

#### 5. 공지사항 기능 추가
- ✅ 새 테이블 생성 가능
- ✅ RLS 정책 설정 가능
- ✅ Storage 버킷 생성 가능

#### 6. 프로젝트 테이블 제거
- ✅ 모든 작업 완료 후 제거 가능
- ⚠️ **주의**: CASCADE로 관련 인덱스, 제약조건 자동 제거됨

### 🟡 주의가 필요한 항목

#### 1. 데이터 무결성
- ⚠️ **위험도: 중간**
  - projects 테이블의 `created_by`, `client_name`이 NULL인 경우 처리 필요
  - 마이그레이션 후 검증 쿼리 필수

#### 2. RLS 정책 순환 참조
- ⚠️ **위험도: 중간**
  - `is_project_participant()` 함수가 RLS 정책에서 사용 중
  - 정책 변경 순서 중요: 먼저 새 정책 생성 → 기존 정책 제거 → 함수 제거

#### 3. 외래키 제약조건
- ⚠️ **위험도: 낮음**
  - `tasks_project_id_fkey` 제거 시 데이터 마이그레이션 완료 후 진행
  - 순서: 데이터 마이그레이션 → 새 외래키 추가 → 기존 외래키 제거

#### 4. 트리거 의존성
- ⚠️ **위험도: 낮음**
  - 이메일 트리거가 프로젝트 정보를 사용하는지 확인 필요
  - `send_task_status_change_email()` 함수 확인 필요

### 🔴 위험 항목

#### 1. 프로덕션 데이터 손실
- 🔴 **위험도: 높음**
  - **완화 방안**: 테스트 환경에서 먼저 검증, PITR 백업 필수

#### 2. RLS 정책 오작동
- 🔴 **위험도: 높음**
  - **완화 방안**: 단계별 마이그레이션, 각 단계마다 검증

#### 3. 프론트엔드 코드 호환성
- 🔴 **위험도: 높음**
  - **완화 방안**: DB 변경과 프론트엔드 변경을 동시에 배포, 또는 호환성 유지 기간 설정

---

## 📋 리팩터링 실행 계획

### Phase 1: 데이터 마이그레이션 준비 (Task 1)
1. ✅ 테스트 환경 설정 (Restore to new project)
2. ✅ PITR 백업 확인
3. ✅ 데이터 마이그레이션 SQL 작성
4. ✅ 검증 쿼리 작성

**검증 항목**:
- [ ] 모든 tasks에 project_id가 있는지 확인
- [ ] projects의 created_by, client_name NULL 여부 확인
- [ ] 마이그레이션 SQL 테스트

### Phase 2: 스키마 변경 (Task 2)
1. ✅ `created_by`, `client_name`, `send_email_to_client` 컬럼 추가
2. ✅ 데이터 마이그레이션 실행
3. ✅ 새 외래키 추가 (`tasks_created_by_fkey`)
4. ✅ `project_id` 외래키 제거
5. ✅ `project_id` 컬럼 제거

**검증 항목**:
- [ ] 모든 tasks에 created_by, client_name이 채워졌는지 확인
- [ ] NULL 값이 없는지 확인
- [ ] 외래키 제약조건 정상 작동 확인

### Phase 3: RLS 정책 변경 (Task 3)
1. ✅ 새 RLS 정책 생성 (태스크 단위)
2. ✅ 기존 RLS 정책 제거
3. ✅ `is_project_participant()` 함수 제거

**검증 항목**:
- [ ] 관리자 권한으로 모든 tasks 조회 가능한지 확인
- [ ] 지시자/담당자 권한으로 자신의 tasks만 조회 가능한지 확인
- [ ] 순환 참조 없는지 확인

### Phase 4: 함수 및 트리거 수정 (Task 4)
1. ✅ 프로젝트 관련 함수 제거
2. ✅ 이메일 트리거 수정 (프로젝트 정보 제거)
3. ✅ `can_access_profile()` 함수 수정

**검증 항목**:
- [ ] 이메일 발송 정상 작동 확인
- [ ] 시스템 메시지 생성 정상 작동 확인

### Phase 5: 인덱스 및 외래키 정리 (Task 5)
1. ✅ 프로젝트 관련 인덱스 제거
2. ✅ 새 인덱스 추가 (`created_by`, `client_name`)

**검증 항목**:
- [ ] 쿼리 성능 확인
- [ ] 인덱스 사용 여부 확인

### Phase 6: 공지사항 기능 추가 (Task 6-8)
1. ✅ 공지사항 테이블 생성
2. ✅ RLS 정책 설정
3. ✅ Storage 버킷 생성
4. ✅ API 및 훅 구현
5. ✅ UI 컴포넌트 구현

**검증 항목**:
- [ ] 공지사항 CRUD 정상 작동 확인
- [ ] RLS 정책 정상 작동 확인
- [ ] 파일 업로드/다운로드 정상 작동 확인

### Phase 7: 프로젝트 관련 코드 제거 (Task 9)
1. ✅ API 함수 제거/수정
2. ✅ 훅 제거/수정
3. ✅ UI 컴포넌트 제거/수정
4. ✅ 라우트 제거

**검증 항목**:
- [ ] TypeScript 컴파일 에러 없음 확인
- [ ] 모든 기능 정상 작동 확인

### Phase 8: 최종 정리 및 테스트 (Task 10)
1. ✅ 타입 재생성
2. ✅ 통합 테스트
3. ✅ 프로젝트 테이블 제거
4. ✅ 원본 DB에 마이그레이션 적용

**검증 항목**:
- [ ] 모든 기능 정상 작동 확인
- [ ] 성능 테스트
- [ ] 보안 테스트

---

## ⚠️ 주요 위험 요소 및 완화 방안

### 1. 데이터 손실 위험
**위험**: 마이그레이션 중 데이터 손실 가능성

**완화 방안**:
- ✅ PITR 백업 필수
- ✅ 테스트 환경에서 먼저 검증
- ✅ 각 단계마다 검증 쿼리 실행
- ✅ 롤백 계획 수립

### 2. RLS 정책 오작동
**위험**: 정책 변경 시 접근 권한 문제 발생 가능

**완화 방안**:
- ✅ 단계별 마이그레이션
- ✅ 각 단계마다 권한 테스트
- ✅ 순환 참조 방지
- ✅ 관리자 계정으로 테스트

### 3. 외래키 제약조건 위반
**위험**: 외래키 제거/추가 시 제약조건 위반 가능

**완화 방안**:
- ✅ 데이터 마이그레이션 완료 후 외래키 변경
- ✅ 제약조건 검증 쿼리 실행
- ✅ 순서 중요: 데이터 마이그레이션 → 새 외래키 → 기존 외래키 제거

### 4. 프론트엔드 호환성 문제
**위험**: DB 변경과 프론트엔드 변경 불일치

**완화 방안**:
- ✅ DB 변경과 프론트엔드 변경 동시 배포
- ✅ 또는 호환성 유지 기간 설정 (deprecated 필드 유지)
- ✅ 타입 재생성 후 컴파일 에러 확인

### 5. 성능 저하
**위험**: 인덱스 변경 시 쿼리 성능 저하 가능

**완화 방안**:
- ✅ 새 인덱스 추가 후 성능 테스트
- ✅ EXPLAIN ANALYZE로 쿼리 계획 확인
- ✅ 필요시 추가 인덱스 생성

---

## ✅ 최종 결론

### 🟢 리팩터링 가능 여부: **가능**

#### 이유:
1. ✅ 모든 필요한 테이블이 존재하고 구조가 명확함
2. ✅ 데이터 마이그레이션 경로가 명확함 (projects → tasks)
3. ✅ RLS 정책 변경이 가능함 (순서만 중요)
4. ✅ 함수 및 트리거 수정이 가능함
5. ✅ 공지사항 기능 추가가 가능함

#### 주의사항:
1. ⚠️ **데이터 마이그레이션 순서 중요**: projects → tasks 데이터 복사 필수
2. ⚠️ **RLS 정책 변경 순서 중요**: 새 정책 생성 → 기존 정책 제거 → 함수 제거
3. ⚠️ **외래키 변경 순서 중요**: 데이터 마이그레이션 → 새 외래키 → 기존 외래키 제거
4. ⚠️ **테스트 환경에서 먼저 검증 필수**
5. ⚠️ **PITR 백업 필수**

#### 권장 실행 순서:
1. ✅ 테스트 환경 설정 및 데이터 백업
2. ✅ 데이터 마이그레이션 SQL 작성 및 검증
3. ✅ 스키마 변경 마이그레이션 작성 및 검증
4. ✅ RLS 정책 변경 마이그레이션 작성 및 검증
5. ✅ 함수 및 트리거 수정 마이그레이션 작성 및 검증
6. ✅ 공지사항 기능 추가 마이그레이션 작성 및 검증
7. ✅ 통합 테스트
8. ✅ 원본 DB에 마이그레이션 적용

---

## 📊 체크리스트

### 사전 준비
- [ ] 테스트 환경 설정 (Restore to new project)
- [ ] PITR 백업 확인
- [ ] 마이그레이션 파일 작성 계획 수립

### 데이터 마이그레이션
- [ ] projects → tasks 데이터 복사 SQL 작성
- [ ] NULL 값 처리 로직 작성
- [ ] 검증 쿼리 작성

### 스키마 변경
- [ ] 새 컬럼 추가 마이그레이션 작성
- [ ] 외래키 변경 마이그레이션 작성
- [ ] project_id 제거 마이그레이션 작성

### RLS 정책 변경
- [ ] 새 RLS 정책 작성
- [ ] 기존 RLS 정책 제거 계획 수립
- [ ] 순환 참조 방지 확인

### 함수 및 트리거 수정
- [ ] 프로젝트 관련 함수 제거 계획 수립
- [ ] 이메일 트리거 수정 계획 수립
- [ ] can_access_profile 함수 수정 계획 수립

### 공지사항 기능
- [ ] 테이블 생성 마이그레이션 작성
- [ ] RLS 정책 작성
- [ ] Storage 버킷 생성 계획 수립

### 통합 테스트
- [ ] 모든 마이그레이션 통합 테스트
- [ ] 성능 테스트
- [ ] 보안 테스트

### 배포
- [ ] 원본 DB에 마이그레이션 적용 계획 수립
- [ ] 롤백 계획 수립

---

**작성일**: 2025-01-15
**분석 대상**: Tasko-backend-shadow(read_only) DB
**분석자**: AI Assistant
