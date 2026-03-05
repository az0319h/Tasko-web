# ConvertAPI DOCX→PDF 변환 설정

컨펌 이메일 첨부 파일이 `.docx`일 경우, **ConvertAPI**를 사용해 PDF로 변환한 뒤 이메일에 첨부합니다.

## 1. ConvertAPI 계정 생성 및 API 시크릿 발급

1. https://www.convertapi.com 접속
2. **Sign up** 또는 **Try it Free**로 회원가입
3. 로그인 후 **Dashboard** 또는 **API** 메뉴에서 **Secret** 또는 **API Token** 확인
4. `CONVERTAPI_SECRET` 값 복사 (형식: `xxxxxxxxxxxxxxxx`)

> 무료 플랜으로 일정량 변환 가능. 사용량은 ConvertAPI 대시보드에서 확인할 수 있습니다.

## 2. Supabase Edge Function 시크릿 설정

### 방법 A: Supabase 대시보드

1. https://supabase.com/dashboard 접속 → 프로젝트 선택
2. **Project Settings** → **Edge Functions** 탭
3. **Secrets** 섹션에서 **Add new secret** 클릭
4. **Name**: `CONVERTAPI_SECRET`  
   **Value**: (1번에서 복사한 API 시크릿)
5. **Save** 클릭

### 방법 B: Supabase CLI

```bash
supabase secrets set CONVERTAPI_SECRET=여기에_API_시크릿_붙여넣기
```

## 3. Edge Function 배포

시크릿 설정 후 Edge Function을 배포하면 적용됩니다.

```bash
supabase functions deploy send-confirm-email
```

## 4. 동작 방식

1. 사용자가 DOCX 파일을 첨부한 상태로 컨펌 이메일 전송
2. Edge Function이 `.docx` 확장자 확인
3. ConvertAPI `POST /convert/docx/to/pdf` API로 DOCX 전송
4. 변환된 PDF를 이메일에 첨부해 발송
5. 파일명: `_초1`, `_초2` 등 접미사 제거 후 `.pdf`로 변경  
   예: `문서_초1.docx` → `문서.pdf`

## 5. CONVERTAPI_SECRET 미설정 시

`CONVERTAPI_SECRET`이 설정되지 않은 상태에서 DOCX를 첨부하면 변환 실패 에러가 발생합니다.  
PDF 첨부는 기존과 같이 동작합니다.
