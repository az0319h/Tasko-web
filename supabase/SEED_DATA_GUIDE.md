# 목 데이터 생성 가이드

## 개요

`seed_mock_data.sql` 파일은 프론트엔드 개발 및 테스트를 위한 현실적인 목 데이터를 생성합니다.

## 데이터 생성 방법

### 방법 1: Supabase Dashboard SQL Editor 사용

1. Supabase Dashboard → SQL Editor 접속
2. `supabase/seed_mock_data.sql` 파일 내용을 복사하여 실행
3. 실행 순서대로 각 섹션을 순차적으로 실행

### 방법 2: Supabase CLI 사용

```bash
# 프로젝트 루트에서 실행
psql -h [your-db-host] -U postgres -d postgres -f supabase/seed_mock_data.sql
```

### 방법 3: 직접 SQL 실행

각 INSERT 문을 순서대로 실행:
1. Projects 삽입
2. Tasks 삽입
3. Messages 삽입
4. Email Logs 삽입

## 생성되는 데이터 상세

### Projects (7개)

| ID | 제목 | 클라이언트 | 상태 | Public | Task 수 |
|----|------|-----------|------|--------|---------|
| 11111111-... | 스마트폰 카메라 개선 프로젝트 | 삼성전자 | inProgress | ✅ | 3 |
| 22222222-... | 전기차 배터리 효율 향상 | 현대자동차 | inProgress | ✅ | 2 |
| 33333333-... | AI 음성인식 정확도 개선 | 네이버 | done | ✅ | 1 |
| 44444444-... | 기밀 신제품 개발 프로젝트 | LG전자 | inProgress | ❌ | 2 |
| 55555555-... | 차세대 반도체 설계 | SK하이닉스 | inProgress | ❌ | 2 |
| 66666666-... | 보안 시스템 강화 프로젝트 | 카카오 | done | ❌ | 1 |
| 77777777-... | 모바일 앱 UI/UX 개선 | 쿠팡 | inProgress | ✅ | 2 |

### Tasks (13개)

각 프로젝트에 다양한 상태의 Task가 할당되어 있습니다:
- **ASSIGNED**: 2개
- **IN_PROGRESS**: 5개
- **WAITING_CONFIRM**: 2개
- **APPROVED**: 3개
- **REJECTED**: 1개

### Messages (10개)

각 Task에 1-2개의 USER 타입 메시지가 있습니다. SYSTEM 메시지는 Task 상태 변경 시 자동 생성됩니다.

### Email Logs (5개)

Task 상태 변경 이메일 발송 로그입니다.

## 데이터 삭제

목 데이터를 삭제하려면:

```sql
-- 주의: 모든 데이터가 삭제됩니다
DELETE FROM public.email_logs;
DELETE FROM public.messages;
DELETE FROM public.tasks;
DELETE FROM public.projects;
```

## 데이터 재생성

데이터를 재생성하려면:
1. 기존 데이터 삭제 (위 쿼리 실행)
2. `seed_mock_data.sql` 파일 다시 실행

## 테스트 시나리오

자세한 테스트 시나리오는 `MOCK_DATA_TEST_SCENARIOS.md`를 참조하세요.

