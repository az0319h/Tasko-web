# 컨펌 이메일 전송 기능 구현 완료 보고

## 구현 내용 요약

- **표장/상표** 선택 → DB 템플릿 로드 → **Tiptap**으로 수정 → 채팅 **맨 마지막 파일** 첨부 → 관리자 전원에게 발송
- 치환 변수 없음. 템플릿 본문은 Tiptap으로만 수정 가능

---

## 배포 필요 항목 (사용자 수행)

### 1. 마이그레이션 배포

다음 마이그레이션 파일을 Supabase에 적용해 주세요.

```
supabase/migrations/email-auto/
├── 20250304000001_add_confirm_email_sent_at.sql
├── 20250304000002_create_email_template_system.sql
└── 20250304000003_seed_email_templates.sql
```

**방법 예시**
- `supabase db push` 또는
- Supabase 대시보드 SQL Editor에서 각 파일 내용 실행

### 2. Edge Function 배포

```
supabase/functions/send-confirm-email/index.ts
```

**배포 명령 예시**
```bash
supabase functions deploy send-confirm-email
```

**환경 변수** (send-task-email과 동일한 SMTP 설정)
- `SMTP_USER`
- `SMTP_PASS`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### 3. 타입 재생성 (선택)

마이그레이션 적용 후 TypeScript 타입을 다시 생성하면 `(supabase as any)` 제거 가능합니다.

```bash
npm run type-gen
```

---

## 구현된 파일 목록

| 구분 | 경로 |
|------|------|
| 마이그레이션 | `supabase/migrations/email-auto/20250304000001_add_confirm_email_sent_at.sql` |
| 마이그레이션 | `supabase/migrations/email-auto/20250304000002_create_email_template_system.sql` |
| 마이그레이션 | `supabase/migrations/email-auto/20250304000003_seed_email_templates.sql` |
| Edge Function | `supabase/functions/send-confirm-email/index.ts` |
| API | `src/api/confirm-email.ts` |
| 훅 | `src/hooks/queries/use-email-templates.ts` |
| 훅 | `src/hooks/mutations/use-send-confirm-email.ts` |
| 컴포넌트 | `src/components/dialog/confirm-email-dialog.tsx` |
| 수정 | `src/pages/task-detail-page.tsx` (버튼 + 다이얼로그) |
| 수정 | `src/hooks/index.ts` (훅 export) |

---

## 버튼 노출 조건

- `task_category === 'REVIEW'`
- `task_status === 'APPROVED'`
- 담당자(assignee) 본인
- `confirm_email_sent_at`가 null (미발송)

---

## 템플릿 수정

시딩된 기본 템플릿(placeholder)은 `email_templates` 테이블에서 수동으로 수정하거나, docx 내용을 HTML로 변환해 UPDATE하여 반영할 수 있습니다.

```sql
UPDATE email_templates
SET body_template = '<p>원하는 HTML 내용</p>',
    subject_template = '[Tasko] 컨펌 확인 - 표장'
WHERE type_code = 'TRADEMARK';
```
