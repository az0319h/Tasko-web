# 채팅 UI UX 개선 계획서

## 📋 개요

Task 상세 페이지의 채팅 UI에서 사용자 경험을 개선하기 위한 계획서입니다.

---

## ✅ 완료된 개선 사항

### 1. 스마트 자동 스크롤 (2025-01-29 완료)
- **문제점**: 사용자가 위쪽 메시지를 읽는 중에도 상대방 메시지 수신 시 자동 스크롤됨
- **해결**: 본인이 보낸 메시지일 때만 자동으로 하단으로 스크롤
- **변경 파일**: `src/pages/task-detail-page.tsx`
- **구현 내용**:
  - 이전 메시지 개수를 ref로 추적
  - 새 메시지 추가 시 마지막 메시지가 본인 메시지인지 확인
  - 본인 메시지일 때만 `scrollIntoView` 실행

---

## 🔄 다음 개선 계획 (우선순위 순)

### 1. 메시지 전송 후 포커스 복귀 (높은 우선순위)
**예상 소요 시간**: 30분

**문제점**:
- 메시지 전송 후 입력창에 포커스가 자동으로 돌아가지 않음
- 연속으로 메시지를 보내기 불편함

**해결 방안**:
```typescript
// handleSendMessage 함수 내에서 전송 성공 후
textareaRef.current?.focus();
```

**변경 파일**:
- `src/pages/task-detail-page.tsx`

**테스트 시나리오**:
1. 메시지 입력 후 전송
2. 전송 완료 후 입력창에 포커스가 자동으로 돌아오는지 확인
3. 연속으로 메시지를 보낼 수 있는지 확인

---

### 2. 텍스트 입력창 자동 높이 조정 (중간 우선순위)
**예상 소요 시간**: 1시간

**문제점**:
- `rows={2}`로 고정되어 있어 긴 메시지 작성 시 불편함
- 줄바꿈 시 높이가 자동으로 늘어나지 않음

**해결 방안**:
- `useEffect`로 textarea 높이를 내용에 맞게 자동 조정
- 최소 높이 2줄, 최대 높이 제한 (예: 10줄)
- 스크롤이 필요한 경우에만 스크롤 표시

**구현 예시**:
```typescript
// textarea 높이 자동 조정
useEffect(() => {
  if (textareaRef.current) {
    textareaRef.current.style.height = 'auto';
    const scrollHeight = textareaRef.current.scrollHeight;
    const minHeight = 40; // 2줄 높이
    const maxHeight = 200; // 최대 10줄 정도
    textareaRef.current.style.height = `${Math.min(Math.max(scrollHeight, minHeight), maxHeight)}px`;
  }
}, [messageInput]);
```

**변경 파일**:
- `src/pages/task-detail-page.tsx`

**테스트 시나리오**:
1. 짧은 메시지 입력 시 높이가 최소 높이로 유지되는지 확인
2. 긴 메시지 입력 시 높이가 자동으로 늘어나는지 확인
3. 최대 높이 도달 시 스크롤이 나타나는지 확인
4. 메시지 삭제 시 높이가 줄어드는지 확인

---

### 3. 파일 업로드 진행 상태 UI 개선 (중간 우선순위)
**예상 소요 시간**: 1-2시간

**문제점**:
- 여러 파일 업로드 시 개별 진행 상태가 명확하지 않음
- `uploadingFiles` Set은 있으나 UI 표시가 약함

**해결 방안**:
- 첨부된 파일 목록에 업로드 진행률 표시
- 업로드 중인 파일은 스피너 또는 프로그레스 바 표시
- 업로드 완료된 파일은 체크 아이콘 표시
- 업로드 실패한 파일은 에러 아이콘과 재시도 버튼 표시

**구현 예시**:
```typescript
// 파일 업로드 상태 타입 추가
type FileUploadStatus = {
  name: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress?: number;
};

// 첨부 파일 목록 UI에 상태 표시
{attachedFiles.map((file, index) => {
  const uploadStatus = fileUploadStatuses[index];
  return (
    <div key={`${file.name}-${index}`} className="flex items-center gap-2">
      {uploadStatus?.status === 'uploading' && <Spinner />}
      {uploadStatus?.status === 'success' && <CheckCircle />}
      {uploadStatus?.status === 'error' && <XCircle />}
      <span>{file.name}</span>
      {uploadStatus?.progress && (
        <div className="w-20 h-1 bg-muted rounded-full">
          <div 
            className="h-full bg-primary rounded-full transition-all"
            style={{ width: `${uploadStatus.progress}%` }}
          />
        </div>
      )}
    </div>
  );
})}
```

**변경 파일**:
- `src/pages/task-detail-page.tsx`

**테스트 시나리오**:
1. 여러 파일 첨부 시 각 파일의 업로드 상태가 표시되는지 확인
2. 업로드 진행률이 실시간으로 업데이트되는지 확인
3. 업로드 실패 시 에러 표시와 재시도 기능 확인

---

### 4. 스크롤 위치 감지 및 스마트 스크롤 (낮은 우선순위)
**예상 소요 시간**: 2-3시간

**문제점**:
- 사용자가 하단에 있는지 확인하는 로직이 없음
- 사용자가 위쪽을 보고 있을 때 상대방 메시지 수신 시 스크롤이 방해될 수 있음

**해결 방안**:
- 스크롤 컨테이너의 스크롤 위치를 감지
- 사용자가 하단 근처(예: 100px 이내)에 있을 때만 자동 스크롤
- "새 메시지" 배지 표시 (하단에 있지 않을 때)
- 배지 클릭 시 하단으로 스크롤

**구현 예시**:
```typescript
const [isNearBottom, setIsNearBottom] = useState(true);
const chatContainerRef = useRef<HTMLDivElement>(null);

// 스크롤 위치 감지
const handleScroll = useCallback(() => {
  if (!chatContainerRef.current) return;
  const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
  const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
  setIsNearBottom(distanceFromBottom < 100);
}, []);

// 새 메시지 수신 시 하단에 있으면 스크롤, 아니면 배지 표시
useEffect(() => {
  if (messages.length > prevMessagesLengthRef.current) {
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.user_id !== currentUserId) {
      if (isNearBottom) {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      } else {
        // 새 메시지 배지 표시
        setShowNewMessageBadge(true);
      }
    }
  }
}, [messages, currentUserId, isNearBottom]);
```

**변경 파일**:
- `src/pages/task-detail-page.tsx`

**테스트 시나리오**:
1. 하단에 있을 때 상대방 메시지 수신 시 자동 스크롤 확인
2. 위쪽에 있을 때 상대방 메시지 수신 시 배지 표시 확인
3. 배지 클릭 시 하단으로 스크롤되는지 확인

---

### 5. 긴 메시지 접기/펼치기 (낮은 우선순위)
**예상 소요 시간**: 1-2시간

**문제점**:
- 매우 긴 메시지가 말풍선을 과도하게 늘림
- 가독성이 떨어질 수 있음

**해결 방안**:
- 메시지 길이가 일정 길이(예: 500자)를 초과하면 접기/펼치기 기능 제공
- 기본적으로 일부만 표시하고 "더보기" 버튼으로 전체 표시
- "접기" 버튼으로 다시 축소 가능

**변경 파일**:
- `src/pages/task-detail-page.tsx`

**테스트 시나리오**:
1. 긴 메시지가 기본적으로 일부만 표시되는지 확인
2. "더보기" 클릭 시 전체 메시지가 표시되는지 확인
3. "접기" 클릭 시 다시 축소되는지 확인

---

## 📊 우선순위 요약

| 우선순위 | 개선 사항 | 예상 시간 | 난이도 |
|---------|----------|----------|--------|
| ✅ 완료 | 스마트 자동 스크롤 | - | 쉬움 |
| 🔴 높음 | 메시지 전송 후 포커스 복귀 | 30분 | 쉬움 |
| 🟡 중간 | 텍스트 입력창 자동 높이 조정 | 1시간 | 보통 |
| 🟡 중간 | 파일 업로드 진행 상태 UI 개선 | 1-2시간 | 보통 |
| 🟢 낮음 | 스크롤 위치 감지 및 스마트 스크롤 | 2-3시간 | 어려움 |
| 🟢 낮음 | 긴 메시지 접기/펼치기 | 1-2시간 | 보통 |

---

## 🎯 다음 작업

**즉시 진행 가능**: 메시지 전송 후 포커스 복귀 (30분 소요, 쉬운 작업)

**다음 스프린트**: 텍스트 입력창 자동 높이 조정 (사용자 피드백 수집 후 진행)

---

## 📝 참고 사항

- 모든 개선 사항은 기존 기능을 유지하면서 추가됨
- 모바일 반응형 디자인 고려 필요
- 접근성(a11y) 개선도 함께 고려
- 성능 최적화 (불필요한 리렌더링 방지)
