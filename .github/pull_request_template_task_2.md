# 작업 개요

- API 수정 - updateTask 함수에 is_public 필드 및 관리자 권한 체크 추가
- Task ID: 2

---

## 작업 내용

- [x] Task 타입에 is_public 필드 확인
- [x] updateTask 함수에 관리자 권한 체크 로직 추가
- [x] updateTask 함수에 is_public 필드 업데이트 로직 추가

---

## 수정한 파일

- `src/api/task.ts`
- `src/database.type.ts`

---

## 브랜치 정보

- 브랜치 명: `feature/task-2-update-task-is-public-admin-check`
- 커밋 메시지: `feat(task-2): API 수정 - updateTask 함수에 is_public 필드 및 관리자 권한 체크 추가

updateTask 함수에 관리자 권한 체크 로직 추가 및 is_public 필드 업데이트 지원

- Task 타입에 is_public 필드 확인
- updateTask 함수에 관리자 권한 체크 로직 추가
- updateTask 함수에 is_public 필드 업데이트 로직 추가

관련 파일:
- src/api/task.ts
- src/database.type.ts`

---

## 기타 참고사항

- ⚠️ 중요: 관리자는 RLS 레벨에서 UPDATE 권한을 받지만, 실제 필드별 제어(is_public만 변경 가능)는 API 레벨에서 수행됨
- 관리자가 is_public 외 필드 변경 시도 시 에러 반환. 관리자가 아닌 경우 기존 로직 유지
- 관리자는 담당자/지시자가 아닌 Task도 is_public만 변경 가능
