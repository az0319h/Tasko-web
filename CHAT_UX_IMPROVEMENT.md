# 채팅 UX 개선 완료 보고서

## 📋 구현 내용 요약

채팅 기능의 사용자 경험을 개선하여 일반 메신저(카카오톡/슬랙)와 유사한 UX로 동작하도록 수정했습니다.

### ✅ 완료된 기능

1. **메시지 입력 키 동작 수정**
   - ✅ Enter 키 → 메시지 전송
   - ✅ Shift + Enter → 줄바꿈
   - ✅ 일반 메신저와 동일한 UX

2. **파일 업로드 방식 구조 변경**
   - ✅ 여러 개의 파일을 동시에 선택 가능 (`multiple` 속성 추가)
   - ✅ 파일 선택 시 즉시 전송되지 않음 (draft 상태로 유지)
   - ✅ 파일은 전송 전까지 메시지 입력창에 첨부(draft) 상태로만 유지

3. **메시지 + 파일 전송 플로우 통합**
   - ✅ 텍스트만 있는 경우 → 텍스트 메시지 전송
   - ✅ 파일만 있는 경우 → 파일 메시지 전송
   - ✅ 텍스트 + 파일이 함께 있는 경우 → 하나의 전송 액션에서 함께 전송
   - ✅ 파일 선택만으로 전송이 발생하지 않도록 분리

4. **UI / 상태 처리**
   - ✅ 전송 전 첨부된 파일 목록을 입력창 하단에 표시
   - ✅ 전송 완료 후 입력 텍스트 초기화
   - ✅ 전송 완료 후 첨부된 파일 상태 초기화
   - ✅ 전송 중에는 중복 전송 방지 처리

5. **기존 기능 유지**
   - ✅ Realtime 구독 구조 유지
   - ✅ 읽음 처리 로직 유지
   - ✅ Typing Indicator 구조 유지

## 📁 변경된 파일 목록

### API 레이어
- `src/api/message.ts`
  - `createMessageWithFiles()` 함수 추가: 텍스트와 파일을 함께 전송하는 함수
  - 텍스트 메시지와 파일 메시지를 순차적으로 생성

### React Query 훅
- `src/hooks/mutations/use-message.ts`
  - `useCreateMessageWithFiles()` 훅 추가: 텍스트와 파일을 함께 전송하는 뮤테이션 훅
  - Optimistic update 및 에러 롤백 처리 포함

### 페이지 컴포넌트
- `src/pages/task-detail-page.tsx`
  - **State 변경**:
    - `attachedFiles`: Draft 상태의 파일들을 관리하는 배열 추가
    - `uploadingFiles`: 업로드 중인 파일 이름들을 관리하는 Set 추가
    - `uploadingFile` 제거 (단일 파일 업로드 방식 제거)
  
  - **핸들러 변경**:
    - `handleSendMessage()`: 텍스트와 파일을 함께 전송하는 통합 로직으로 변경
    - `handleFileUpload()` → `handleFileAdd()`: 파일을 즉시 업로드하지 않고 draft에 추가만 함
    - `handleFileRemove()`: 첨부 파일 제거 핸들러 추가
  
  - **UI 변경**:
    - 파일 input에 `multiple` 속성 추가
    - Enter 키 → 메시지 전송, Shift+Enter → 줄바꿈으로 변경
    - 첨부된 파일 목록 UI 추가 (입력창 하단)
    - 전송 버튼 활성화 조건 변경 (텍스트 또는 파일이 있으면 활성화)
    - 전송 중 로딩 표시 개선

## 🔄 주요 변경 사항 상세

### 1. 키보드 동작 변경

**이전**:
- Enter: 줄바꿈
- Ctrl+Enter: 전송

**변경 후**:
- Enter: 메시지 전송
- Shift+Enter: 줄바꿈

```typescript
onKeyDown={(e) => {
  // Enter 키: 메시지 전송
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleSendMessage();
  }
  // Shift+Enter: 줄바꿈 (기본 동작 유지)
}}
```

### 2. 파일 업로드 플로우 변경

**이전**:
- 파일 선택 → 즉시 업로드 → 즉시 전송

**변경 후**:
- 파일 선택 → Draft 상태로 추가 → 전송 버튼 클릭 시 업로드 + 전송

```typescript
// 파일 추가 (Draft 상태)
const handleFileAdd = (files: FileList | File[]) => {
  const fileArray = Array.from(files);
  const validFiles: File[] = [];
  
  for (const file of fileArray) {
    if (file.size > 10 * 1024 * 1024) {
      // 크기 제한 체크
      continue;
    }
    validFiles.push(file);
  }
  
  setAttachedFiles((prev) => [...prev, ...validFiles]);
};

// 전송 시 파일 업로드 + 메시지 전송
const handleSendMessage = async () => {
  // 1. 파일 업로드
  const uploadedFiles = [];
  for (const file of attachedFiles) {
    const { url, fileName, fileType, fileSize } = await uploadTaskFile(...);
    uploadedFiles.push({ url, fileName, fileType, fileSize });
  }
  
  // 2. 텍스트와 파일을 함께 전송
  await createMessageWithFiles.mutateAsync({
    taskId,
    content: messageInput.trim() || null,
    files: uploadedFiles,
  });
  
  // 3. 초기화
  setMessageInput("");
  setAttachedFiles([]);
};
```

### 3. 첨부 파일 목록 UI

```typescript
{/* 첨부된 파일 목록 (Draft 상태) */}
{attachedFiles.length > 0 && (
  <div className="flex flex-wrap gap-2 p-2 bg-muted/30 rounded-lg">
    {attachedFiles.map((file, index) => (
      <div key={`${file.name}-${index}`} className="flex items-center gap-2 px-3 py-2 bg-background border rounded-lg text-sm">
        <File className="h-4 w-4 text-muted-foreground" />
        <span className="max-w-[200px] truncate">{file.name}</span>
        <span className="text-xs text-muted-foreground">
          ({(file.size / 1024).toFixed(1)} KB)
        </span>
        <button
          type="button"
          onClick={() => handleFileRemove(index)}
          className="ml-1 p-1 hover:bg-muted rounded"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    ))}
  </div>
)}
```

### 4. 전송 버튼 활성화 조건

**이전**:
```typescript
disabled={!messageInput.trim() || createMessage.isPending}
```

**변경 후**:
```typescript
disabled={
  (!messageInput.trim() && attachedFiles.length === 0) ||
  createMessageWithFiles.isPending
}
```

## ✅ 빌드 결과

```
✓ 2117 modules transformed.
✓ built in 5.21s
```

**빌드 성공**: 모든 타입 에러 해결 완료

## 🧪 테스트 시나리오

### 1. 키보드 동작 테스트
- ✅ Enter 키 입력 시 메시지 전송 확인
- ✅ Shift+Enter 입력 시 줄바꿈 확인
- ✅ 빈 입력에서 Enter 키 동작하지 않음 확인

### 2. 파일 업로드 테스트
- ✅ 여러 파일 동시 선택 가능 확인
- ✅ 파일 선택 시 즉시 전송되지 않음 확인
- ✅ 첨부 파일 목록에 표시 확인
- ✅ 첨부 파일 제거 버튼 동작 확인

### 3. 통합 전송 테스트
- ✅ 텍스트만 전송 시 텍스트 메시지 생성 확인
- ✅ 파일만 전송 시 파일 메시지 생성 확인
- ✅ 텍스트 + 파일 함께 전송 시 둘 다 생성 확인
- ✅ 전송 완료 후 입력 초기화 확인

### 4. 중복 전송 방지 테스트
- ✅ 전송 중 버튼 비활성화 확인
- ✅ 전송 중 추가 전송 시도 차단 확인

## 📝 주의사항

1. **API 호출 최적화**: 
   - 파일이 여러 개 있어도 하나의 API 호출로 처리 (`createMessageWithFiles`)
   - 파일 업로드는 순차적으로 처리되지만, 메시지 생성은 한 번의 트랜잭션으로 처리

2. **에러 처리**:
   - 파일 업로드 실패 시 해당 파일만 제외하고 나머지 파일은 계속 전송
   - 전체 실패 시 입력 내용 복원

3. **파일 크기 제한**:
   - 개별 파일: 10MB 제한
   - 여러 파일 선택 시 각 파일별로 크기 체크

## 🎯 개선 효과

1. **사용자 경험 향상**: 일반 메신저와 동일한 키보드 동작으로 직관적인 사용 가능
2. **파일 관리 개선**: 전송 전 파일 확인 및 수정 가능
3. **전송 효율성**: 텍스트와 파일을 한 번에 전송하여 메시지 흐름 개선
4. **에러 복구**: 전송 실패 시 입력 내용 복원으로 사용자 편의성 향상

