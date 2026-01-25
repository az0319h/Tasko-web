# Task 생성 기능 구현 가이드

## 개요

이 문서는 프로젝트 상세 페이지에서 구현된 Task 생성 기능을 다른 페이지에서도 동일하게 구현하기 위한 가이드입니다. 특히 **빠른 생성 기능**을 포함한 전체 구현 방법을 설명합니다.

## 목차

1. [기능 개요](#기능-개요)
2. [빠른 생성 기능](#빠른-생성-기능)
3. [필수 컴포넌트 및 의존성](#필수-컴포넌트-및-의존성)
4. [상태 관리](#상태-관리)
5. [구현 단계](#구현-단계)
6. [명세서 모드 특별 처리](#명세서-모드-특별-처리)
7. [주의사항](#주의사항)

---

## 기능 개요

### 1. 일반 Task 생성
- 프로젝트 참여자 또는 Admin이 Task를 생성할 수 있습니다.
- 지시사항, 카테고리, 담당자, 마감일을 입력합니다.
- 선택적으로 특이사항과 파일을 첨부할 수 있습니다.

### 2. 빠른 생성 기능
- 드롭다운 메뉴에서 카테고리를 선택하면 해당 카테고리와 기본값이 자동으로 설정됩니다.
- 지원하는 카테고리:
  - **검토** (REVIEW)
  - **계약** (CONTRACT)
  - **명세서** (SPECIFICATION) - 특별 처리 (2개 Task 생성)
  - **출원** (APPLICATION)

---

## 빠른 생성 기능

### UI 구조

빠른 생성 드롭다운은 다음과 같은 구조로 구현되어 있습니다:

```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="outline" size="sm" className="h-9">
      <Plus className="mr-2 h-4 w-4" />
      빠른 생성
      <ChevronDown className="ml-2 h-4 w-4" />
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end">
    <DropdownMenuItem onClick={() => handleQuickCreate("REVIEW", "검토")}>
      검토
    </DropdownMenuItem>
    <DropdownMenuItem onClick={() => handleQuickCreate("CONTRACT", "계약")}>
      계약
    </DropdownMenuItem>
    <DropdownMenuItem onClick={() => handleQuickCreate("SPECIFICATION")}>
      명세서
    </DropdownMenuItem>
    <DropdownMenuItem onClick={() => handleQuickCreate("APPLICATION", "출원")}>
      출원
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

### 빠른 생성 핸들러 구현

```tsx
// 상태 변수 선언
const [preSelectedCategory, setPreSelectedCategory] = useState<string | undefined>(undefined);
const [autoFillMode, setAutoFillMode] = useState<"REVIEW" | "CONTRACT" | "SPECIFICATION" | "APPLICATION" | undefined>(undefined);
const [preFilledTitle, setPreFilledTitle] = useState<string | undefined>(undefined);
const [isSpecificationMode, setIsSpecificationMode] = useState(false);
const [createTaskDialogOpen, setCreateTaskDialogOpen] = useState(false);

// 빠른 생성 핸들러
const handleQuickCreate = (
  category: "REVIEW" | "CONTRACT" | "SPECIFICATION" | "APPLICATION",
  title?: string
) => {
  setPreSelectedCategory(category);
  setAutoFillMode(category);
  
  if (category === "SPECIFICATION") {
    // 명세서 모드: 2개 Task 자동 생성
    setPreFilledTitle(undefined);
    setIsSpecificationMode(true);
  } else {
    // 일반 모드: 제목 자동 입력
    setPreFilledTitle(title);
    setIsSpecificationMode(false);
  }
  
  setCreateTaskDialogOpen(true);
};
```

---

## 필수 컴포넌트 및 의존성

### 1. 컴포넌트

```tsx
import { TaskFormDialog } from "@/components/task/task-form-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Plus, ChevronDown } from "lucide-react";
```

### 2. Hooks

```tsx
import {
  useCreateTask,
  useCurrentProfile,
  useProjectParticipants,
} from "@/hooks";
import { useCreateMessageWithFiles } from "@/hooks/mutations/use-message";
```

### 3. API 함수

```tsx
import { uploadTaskFile } from "@/api/storage";
```

### 4. 타입

```tsx
import type { TaskCreateFormData, TaskUpdateFormData } from "@/schemas/task/task-schema";
```

---

## 상태 관리

### 필수 상태 변수

```tsx
// 다이얼로그 열림/닫힘 상태
const [createTaskDialogOpen, setCreateTaskDialogOpen] = useState(false);

// 빠른 생성 관련 상태
const [preSelectedCategory, setPreSelectedCategory] = useState<
  "REVIEW" | "CONTRACT" | "SPECIFICATION" | "APPLICATION" | undefined
>(undefined);
const [autoFillMode, setAutoFillMode] = useState<
  "REVIEW" | "CONTRACT" | "SPECIFICATION" | "APPLICATION" | undefined
>(undefined);
const [preFilledTitle, setPreFilledTitle] = useState<string | undefined>(undefined);
const [isSpecificationMode, setIsSpecificationMode] = useState(false);
```

### 상태 초기화

다이얼로그가 닫힐 때 상태를 초기화해야 합니다:

```tsx
const handleDialogClose = (open: boolean) => {
  setCreateTaskDialogOpen(open);
  if (!open) {
    setPreSelectedCategory(undefined);
    setAutoFillMode(undefined);
    setPreFilledTitle(undefined);
    setIsSpecificationMode(false);
  }
};
```

---

## 구현 단계

### Step 1: 빠른 생성 드롭다운 추가

```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="outline" size="sm" className="h-9">
      <Plus className="mr-2 h-4 w-4" />
      빠른 생성
      <ChevronDown className="ml-2 h-4 w-4" />
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end">
    <DropdownMenuItem
      onClick={() => {
        setPreSelectedCategory("REVIEW");
        setAutoFillMode("REVIEW");
        setPreFilledTitle("검토");
        setIsSpecificationMode(false);
        setCreateTaskDialogOpen(true);
      }}
    >
      검토
    </DropdownMenuItem>
    <DropdownMenuItem
      onClick={() => {
        setPreSelectedCategory("CONTRACT");
        setAutoFillMode("CONTRACT");
        setPreFilledTitle("계약");
        setIsSpecificationMode(false);
        setCreateTaskDialogOpen(true);
      }}
    >
      계약
    </DropdownMenuItem>
    <DropdownMenuItem
      onClick={() => {
        setPreSelectedCategory("SPECIFICATION");
        setAutoFillMode("SPECIFICATION");
        setPreFilledTitle(undefined);
        setIsSpecificationMode(true);
        setCreateTaskDialogOpen(true);
      }}
    >
      명세서
    </DropdownMenuItem>
    <DropdownMenuItem
      onClick={() => {
        setPreSelectedCategory("APPLICATION");
        setAutoFillMode("APPLICATION");
        setPreFilledTitle("출원");
        setIsSpecificationMode(false);
        setCreateTaskDialogOpen(true);
      }}
    >
      출원
    </DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

### Step 2: 일반 Task 생성 버튼 추가 (선택사항)

```tsx
<Button
  className="h-9"
  onClick={() => {
    setPreSelectedCategory(undefined);
    setAutoFillMode(undefined);
    setPreFilledTitle(undefined);
    setIsSpecificationMode(false);
    setCreateTaskDialogOpen(true);
  }}
>
  <Plus className="mr-2 h-4 w-4" />
  Task 생성
</Button>
```

### Step 3: Task 생성 핸들러 구현

```tsx
const createTask = useCreateTask();
const createMessageWithFiles = useCreateMessageWithFiles();
const { data: currentProfile } = useCurrentProfile();

const handleCreateTask = async (
  data: TaskCreateFormData | TaskUpdateFormData,
  files?: File[],
  notes?: string
) => {
  if (!projectId || !currentProfile?.id) return;
  
  // 명세서 모드인 경우 별도 처리
  if (isSpecificationMode) {
    const specificationData = data as any;
    await handleCreateSpecificationTasks(
      specificationData.assignee_id,
      files,
      notes
    );
    return;
  }
  
  // 일반 Task 생성
  const createData = data as TaskCreateFormData;
  const { description, ...taskData } = createData;
  
  // 1. Task 생성
  const newTask = await createTask.mutateAsync({
    project_id: projectId,
    title: taskData.title,
    assignee_id: taskData.assignee_id,
    due_date: taskData.due_date,
    task_category: taskData.task_category,
  });
  
  setCreateTaskDialogOpen(false);
  
  // 2. 특이사항 및 파일 메시지 생성
  const hasNotes = notes && notes.trim().length > 0;
  const hasFiles = files && files.length > 0;
  
  if (hasNotes || hasFiles) {
    try {
      const uploadedFiles: Array<{
        url: string;
        fileName: string;
        fileType: string;
        fileSize: number;
      }> = [];
      
      // 파일 업로드
      if (hasFiles && newTask.id) {
        for (const file of files) {
          try {
            if (!newTask.assigner_id) {
              throw new Error("Task 생성자 정보를 찾을 수 없습니다.");
            }
            const fileInfo = await uploadTaskFile(
              file,
              newTask.id,
              newTask.assigner_id
            );
            uploadedFiles.push(fileInfo);
          } catch (error: any) {
            toast.error(`${file.name} 업로드 실패: ${error.message}`);
          }
        }
      }
      
      // 메시지 생성 (특이사항 + 파일)
      if (newTask.id && (hasNotes || uploadedFiles.length > 0)) {
        await createMessageWithFiles.mutateAsync({
          taskId: newTask.id,
          content: hasNotes ? notes.trim() : null,
          files: uploadedFiles,
        });
      }
    } catch (error: any) {
      toast.error(`메시지 생성 중 오류가 발생했습니다: ${error.message}`);
    }
  }
  
  // 3. Task 상세 페이지로 이동 (선택사항)
  // navigate(`/tasks/${newTask.id}`);
};
```

### Step 4: TaskFormDialog 컴포넌트 추가

```tsx
{projectId && (
  <TaskFormDialog
    open={createTaskDialogOpen}
    onOpenChange={(open) => {
      setCreateTaskDialogOpen(open);
      if (!open) {
        setPreSelectedCategory(undefined);
        setAutoFillMode(undefined);
        setPreFilledTitle(undefined);
        setIsSpecificationMode(false);
      }
    }}
    onSubmit={handleCreateTask}
    projectId={projectId}
    isLoading={createTask.isPending}
    preSelectedCategory={preSelectedCategory as "REVIEW" | "CONTRACT" | "SPECIFICATION" | "APPLICATION" | undefined}
    autoFillMode={autoFillMode}
    preFilledTitle={preFilledTitle}
    isSpecificationMode={isSpecificationMode}
  />
)}
```

---

## 명세서 모드 특별 처리

명세서 모드는 **2개의 Task를 자동으로 생성**합니다:

1. **청구안 및 도면** (오늘 + 3일 마감)
2. **초안 작성** (오늘 + 10일 마감)

### 명세서 모드 핸들러 구현

```tsx
const handleCreateSpecificationTasks = async (
  assigneeId: string,
  files?: File[],
  notes?: string
) => {
  if (!projectId || !currentProfile?.id) return;
  
  try {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const date = today.getDate();
    
    // Task 1: 청구안 및 도면 (오늘 + 3일)
    const dueDate1 = new Date(year, month, date + 3);
    const dueDate1Str = `${dueDate1.getFullYear()}-${String(dueDate1.getMonth() + 1).padStart(2, "0")}-${String(dueDate1.getDate()).padStart(2, "0")}`;
    
    // Task 2: 초안 작성 (오늘 + 10일)
    const dueDate2 = new Date(year, month, date + 10);
    const dueDate2Str = `${dueDate2.getFullYear()}-${String(dueDate2.getMonth() + 1).padStart(2, "0")}-${String(dueDate2.getDate()).padStart(2, "0")}`;
    
    // Task 1 생성
    const task1 = await createTask.mutateAsync({
      project_id: projectId,
      title: "청구안 및 도면",
      assignee_id: assigneeId,
      due_date: dueDate1Str,
      task_category: "SPECIFICATION",
    });
    
    // Task 2 생성
    const task2 = await createTask.mutateAsync({
      project_id: projectId,
      title: "초안 작성",
      assignee_id: assigneeId,
      due_date: dueDate2Str,
      task_category: "SPECIFICATION",
    });
    
    // 각 Task에 특이사항/파일 메시지 생성
    const createMessagesForTask = async (taskId: string, assignerId: string) => {
      const hasNotes = notes && notes.trim().length > 0;
      const hasFiles = files && files.length > 0;
      
      if (hasNotes || hasFiles) {
        const uploadedFiles: Array<{
          url: string;
          fileName: string;
          fileType: string;
          fileSize: number;
        }> = [];
        
        if (hasFiles) {
          for (const file of files) {
            try {
              const fileInfo = await uploadTaskFile(file, taskId, assignerId);
              uploadedFiles.push(fileInfo);
            } catch (error: any) {
              toast.error(`${file.name} 업로드 실패: ${error.message}`);
            }
          }
        }
        
        if (hasNotes || uploadedFiles.length > 0) {
          await createMessageWithFiles.mutateAsync({
            taskId,
            content: hasNotes ? notes.trim() : null,
            files: uploadedFiles,
          });
        }
      }
    };
    
    await createMessagesForTask(task1.id, currentProfile.id);
    await createMessagesForTask(task2.id, currentProfile.id);
    
    setCreateTaskDialogOpen(false);
    
    // 명세서 모드에서는 상세 페이지로 이동하지 않음
    toast.success("명세서 Task 2개가 생성되었습니다.");
  } catch (error: any) {
    toast.error(`명세서 Task 생성 중 오류가 발생했습니다: ${error.message}`);
  }
};
```

---

## 주의사항

### 1. 프로젝트 ID 필수
- `projectId`는 반드시 제공되어야 합니다.
- `TaskFormDialog`의 `projectId` prop이 필수입니다.

### 2. 권한 확인
- Task 생성은 프로젝트 참여자 또는 Admin만 가능합니다.
- `useCreateTask` hook이 내부적으로 권한을 확인합니다.

### 3. 담당자 선택 제한
- 담당자는 프로젝트 참여자 중에서만 선택 가능합니다.
- 현재 로그인한 사용자는 담당자로 선택할 수 없습니다.
- 프로필이 완료되고 활성화된 사용자만 선택 가능합니다.

### 4. 카테고리별 기본 마감일
- **검토/계약**: 오늘 + 1일
- **명세서**: 오늘 + 10일 (명세서 모드에서는 자동 설정)
- **출원**: 오늘 당일

### 5. 명세서 모드
- 명세서 모드에서는 `TaskFormDialog`에서 지시사항과 마감일 필드가 숨겨집니다.
- 2개의 Task가 자동으로 생성되며, 각각 다른 제목과 마감일을 가집니다.
- 명세서 모드에서는 Task 상세 페이지로 이동하지 않습니다.

### 6. 파일 업로드
- 파일 크기 제한: 10MB
- 여러 파일 선택 가능
- 드래그 앤 드롭 지원

### 7. 특이사항
- 최대 1000자까지 입력 가능
- 선택사항이지만, 입력 시 Task 생성 후 메시지로 자동 생성됩니다.

### 8. 상태 초기화
- 다이얼로그가 닫힐 때 모든 빠른 생성 관련 상태를 초기화해야 합니다.
- 그렇지 않으면 다음 다이얼로그 열 때 이전 상태가 유지될 수 있습니다.

### 9. 에러 처리
- 파일 업로드 실패 시 개별 파일에 대한 에러 메시지를 표시합니다.
- Task 생성 실패 시 전체 프로세스가 중단됩니다.
- 메시지 생성 실패는 Task 생성 후 별도로 처리됩니다.

---

## 참고 파일

### 구현 예시
- `src/pages/project-detail-page.tsx` (853-908줄: 빠른 생성 드롭다운)
- `src/pages/project-detail-page.tsx` (487-658줄: Task 생성 핸들러)

### 컴포넌트
- `src/components/task/task-form-dialog.tsx` (Task 생성/수정 폼)

### 스키마
- `src/schemas/task/task-schema.ts` (Task 생성/수정 스키마)

### API
- `src/api/task.ts` (Task CRUD API)
- `src/api/storage.ts` (파일 업로드 API)

### Hooks
- `src/hooks/mutations/use-task.ts` (Task 뮤테이션 훅)
- `src/hooks/mutations/use-message.ts` (메시지 뮤테이션 훅)

---

## 완성 예시 코드

전체 구현 예시는 `src/pages/project-detail-page.tsx` 파일을 참고하세요. 특히 다음 부분을 중점적으로 확인하세요:

1. **빠른 생성 드롭다운**: 853-908줄
2. **일반 Task 생성 버튼**: 799-811줄
3. **Task 생성 핸들러**: 487-572줄
4. **명세서 모드 핸들러**: 574-658줄
5. **TaskFormDialog 사용**: 1083-1102줄

---

## 추가 기능 (선택사항)

### 1. 생성 후 페이지 이동
일반 Task 생성 후 상세 페이지로 이동하려면:

```tsx
navigate(`/tasks/${newTask.id}`);
```

### 2. 생성 후 목록 새로고침
Task 목록을 자동으로 새로고침하려면:

```tsx
// useTasks hook이 자동으로 invalidate되므로 별도 처리 불필요
// React Query가 자동으로 캐시를 갱신합니다.
```

### 3. 생성 성공 알림
`useCreateTask` hook이 내부적으로 성공 토스트를 표시하므로 별도 처리 불필요합니다.

---

## 문제 해결

### Q: 빠른 생성 시 카테고리가 자동으로 선택되지 않아요.
A: `preSelectedCategory` prop이 `TaskFormDialog`에 제대로 전달되는지 확인하세요. 또한 `autoFillMode`가 설정되어 있으면 카테고리 선택이 비활성화됩니다.

### Q: 명세서 모드에서 2개 Task가 생성되지 않아요.
A: `isSpecificationMode`가 `true`로 설정되어 있는지, 그리고 `handleCreateTask`에서 명세서 모드 분기가 제대로 작동하는지 확인하세요.

### Q: 파일 업로드가 실패해요.
A: 파일 크기가 10MB를 초과하지 않는지 확인하세요. 또한 `uploadTaskFile` 함수가 올바른 taskId와 assignerId를 받고 있는지 확인하세요.

### Q: 특이사항이 메시지로 생성되지 않아요.
A: `createMessageWithFiles` hook이 제대로 호출되고 있는지, 그리고 `notes`가 빈 문자열이 아닌지 확인하세요.

---

## 마무리

이 가이드를 따라 구현하면 프로젝트 상세 페이지와 동일한 Task 생성 기능을 다른 페이지에서도 사용할 수 있습니다. 특히 **빠른 생성 기능**을 통해 사용자 경험을 크게 향상시킬 수 있습니다.

추가 질문이나 문제가 발생하면 `src/pages/project-detail-page.tsx` 파일을 참고하거나 개발팀에 문의하세요.
