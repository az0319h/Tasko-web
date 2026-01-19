import { useEffect, useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { taskCreateSchema, taskCreateSpecificationSchema, taskUpdateSchema, type TaskCreateFormData, type TaskCreateSpecificationFormData, type TaskUpdateFormData } from "@/schemas/task/task-schema";
import { useCurrentProfile, useProjectParticipants } from "@/hooks";
import type { TaskWithProfiles } from "@/api/task";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProject } from "@/hooks";
import { File, X, Upload } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface TaskFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: TaskCreateFormData | TaskUpdateFormData, files?: File[], notes?: string) => Promise<void>;
  projectId: string;
  isLoading?: boolean;
  task?: TaskWithProfiles | null; // 수정 모드일 때 Task 데이터
  preSelectedCategory?: "REVIEW" | "CONTRACT" | "SPECIFICATION" | "APPLICATION"; // 미리 선택된 카테고리
  preFilledTitle?: string; // 자동 입력할 지시사항
  autoFillMode?: "REVIEW" | "CONTRACT" | "SPECIFICATION" | "APPLICATION"; // 자동 채우기 모드
  isSpecificationMode?: boolean; // 명세서 모드 (2개 task 생성)
}

/**
 * Task 생성/수정 폼 다이얼로그
 */
export function TaskFormDialog({
  open,
  onOpenChange,
  onSubmit,
  projectId,
  isLoading = false,
  task = null,
  preSelectedCategory,
  preFilledTitle,
  autoFillMode,
  isSpecificationMode = false,
}: TaskFormDialogProps) {
  const { data: currentProfile } = useCurrentProfile();
  const { data: project } = useProject(projectId);
  const { data: participants } = useProjectParticipants(projectId);
  const isEditMode = !!task;
  
  // 파일 상태 관리 (생성 모드에서만 사용)
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // 특이사항 상태 관리 (생성 모드에서만 사용)
  const [notes, setNotes] = useState<string>("");

  // 수정 모드와 생성 모드에 따라 다른 스키마 사용
  // 명세서 모드일 때는 별도 스키마 사용
  const formSchema = isEditMode 
    ? taskUpdateSchema 
    : isSpecificationMode 
      ? taskCreateSpecificationSchema 
      : taskCreateSchema;
  
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm<TaskCreateFormData | TaskCreateSpecificationFormData | TaskUpdateFormData>({
    resolver: zodResolver(formSchema) as any,
    defaultValues: isEditMode
      ? {
          title: "",
          due_date: "",
        }
      : {
          title: "",
          assignee_id: "",
          task_category: preSelectedCategory || undefined,
          due_date: "",
        },
  });

  // 생성 모드에서만 assignee_id, task_category watch
  const assigneeId = !isEditMode ? (watch("assignee_id" as keyof TaskCreateFormData) as string | undefined) : undefined;
  const taskCategory = !isEditMode ? (watch("task_category" as keyof TaskCreateFormData) as string | undefined) : undefined;
  const dueDate = watch("due_date" as keyof TaskCreateFormData) as string | undefined;
  
  // 카테고리별 기본 마감일 계산 함수
  // 로컬 날짜 기준으로 계산하여 타임존 문제 방지
  const getDefaultDueDate = (category: string | undefined): string | null => {
    if (!category) return null;
    
    // 로컬 날짜 기준으로 오늘 날짜 가져오기 (타임존 무시)
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const date = today.getDate();
    
    // 로컬 날짜 기준으로 새 Date 객체 생성 (타임존 문제 방지)
    let defaultDate = new Date(year, month, date);
    
    switch (category) {
      case "REVIEW":
      case "CONTRACT":
        // 오늘 기준 +1일
        defaultDate.setDate(date + 1);
        break;
      case "SPECIFICATION":
        // 오늘 기준 +10일
        defaultDate.setDate(date + 10);
        break;
      case "APPLICATION":
        // 오늘 당일
        defaultDate = new Date(year, month, date);
        break;
      default:
        return null;
    }
    
    // 로컬 날짜를 YYYY-MM-DD 형식으로 변환 (toISOString() 사용 시 UTC 변환으로 인한 날짜 오차 방지)
    const yyyy = defaultDate.getFullYear();
    const mm = String(defaultDate.getMonth() + 1).padStart(2, "0");
    const dd = String(defaultDate.getDate()).padStart(2, "0");
    
    return `${yyyy}-${mm}-${dd}`;
  };
  
  // 카테고리 변경 시 기본 마감일 자동 설정 (생성 모드에서만, 사용자가 수정하지 않은 경우)
  const [userModifiedDueDate, setUserModifiedDueDate] = useState(false);
  
  useEffect(() => {
    if (!isEditMode && open && taskCategory && !userModifiedDueDate) {
      const defaultDueDate = getDefaultDueDate(taskCategory);
      if (defaultDueDate) {
        setValue("due_date", defaultDueDate);
      }
    }
  }, [taskCategory, isEditMode, open, setValue, userModifiedDueDate]);
  
  // 사용자가 마감일을 직접 수정했는지 추적
  useEffect(() => {
    if (!isEditMode && open) {
      const subscription = watch((value, { name }) => {
        if (name === "due_date" && value.due_date) {
          setUserModifiedDueDate(true);
        }
      });
      return () => subscription.unsubscribe();
    }
  }, [isEditMode, open, watch]);
  
  // 다이얼로그가 열릴 때 사용자 수정 플래그 리셋
  useEffect(() => {
    if (open && !isEditMode) {
      setUserModifiedDueDate(false);
    }
  }, [open, isEditMode]);

  // 수정 모드일 때 폼 초기값 설정
  useEffect(() => {
    if (task && open && isEditMode) {
      // 수정 모드: title, due_date만 설정 (description 제거됨)
      setValue("title", task.title);
      setValue("due_date", task.due_date ? task.due_date.split("T")[0] : "");
    } else if (!task && open && !isEditMode) {
      // 생성 모드일 때 폼 초기화
      const initialCategory = preSelectedCategory || undefined;
      const defaultDueDate = getDefaultDueDate(initialCategory);
      
      reset({
        title: preFilledTitle || "",
        assignee_id: "",
        task_category: initialCategory,
        due_date: defaultDueDate || "",
      });
      // preSelectedCategory가 있으면 자동으로 설정
      if (preSelectedCategory) {
        setValue("task_category", preSelectedCategory);
        if (defaultDueDate) {
          setValue("due_date", defaultDueDate);
        }
      }
      // preFilledTitle이 있으면 자동으로 설정
      if (preFilledTitle) {
        setValue("title", preFilledTitle);
      }
      // 파일 목록 초기화
      setAttachedFiles([]);
      // 특이사항 초기화
      setNotes("");
      // 사용자 수정 플래그 리셋
      setUserModifiedDueDate(false);
    }
  }, [task, open, isEditMode, setValue, reset, preSelectedCategory, preFilledTitle]);

  // 프로젝트 참여자 목록 필터링 (현재 사용자 제외, 프로필 완료된 사용자만)
  const availableParticipants = participants?.filter(
    (participant) =>
      participant.profile && // profile이 null이 아닌 경우만
      participant.profile.profile_completed &&
      participant.profile.is_active &&
      participant.user_id !== currentProfile?.id
  ) || [];

  // 마감일 검증: 오늘 이전 날짜 선택 불가
  // 로컬 날짜 기준으로 계산하여 타임존 문제 방지
  const todayDate = new Date();
  const todayYear = todayDate.getFullYear();
  const todayMonth = todayDate.getMonth();
  const todayDay = todayDate.getDate();
  const today = `${todayYear}-${String(todayMonth + 1).padStart(2, "0")}-${String(todayDay).padStart(2, "0")}`;
  const minDate = today;

  // 파일 추가 핸들러
  const handleFileAdd = (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const validFiles: File[] = [];
    const invalidFiles: string[] = [];

    for (const file of fileArray) {
      // 파일 크기 제한 (10MB)
      if (file.size > 10 * 1024 * 1024) {
        invalidFiles.push(`${file.name} (10MB 초과)`);
        continue;
      }
      validFiles.push(file);
    }

    if (invalidFiles.length > 0) {
      toast.error(`다음 파일은 크기 제한을 초과합니다: ${invalidFiles.join(", ")}`);
    }

    if (validFiles.length > 0) {
      setAttachedFiles((prev) => [...prev, ...validFiles]);
    }
  };

  // 첨부 파일 제거 핸들러
  const handleFileRemove = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // 드래그 앤 드롭 핸들러
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileAdd(e.dataTransfer.files);
    }
  };

  // 파일 선택 핸들러
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileAdd(e.target.files);
    }
    // input 초기화
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const onFormSubmit = async (data: TaskCreateFormData | TaskCreateSpecificationFormData | TaskUpdateFormData) => {
    // 생성 모드일 때만 파일과 특이사항 전달
    await onSubmit(data as TaskCreateFormData | TaskUpdateFormData, !isEditMode ? attachedFiles : undefined, !isEditMode ? notes : undefined);
    if (!isEditMode) {
      reset();
      setAttachedFiles([]);
      setNotes("");
    }
  };

  // Dialog 닫을 때 body 스타일 정리
  useEffect(() => {
    if (!open) {
      // Dialog가 닫힐 때 body 스타일 정리
      document.body.style.pointerEvents = "";
      document.body.style.overflow = "";
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
          <DialogTitle>{isEditMode ? "Task 수정" : "Task 생성"}</DialogTitle>
          <DialogDescription>
            {isEditMode
              ? "Task 정보를 수정합니다. 지시자와 담당자는 변경할 수 없습니다."
              : "새로운 Task를 생성합니다. 필요한 정보를 입력해주세요."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">
          {/* 명세서 모드에서는 지시사항 필드 숨김 */}
          {!isSpecificationMode && (
            <div className="space-y-2">
              <Label htmlFor="title">
                지시사항 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="title"
                {...register("title")}
                placeholder="지시사항을 입력하세요"
                disabled={!!autoFillMode && !!preFilledTitle}
                aria-invalid={errors.title ? "true" : "false"}
              />
              {autoFillMode && preFilledTitle && (
                <p className="text-xs text-muted-foreground">
                  자동 생성됨 (상세 페이지에서 수정 가능)
                </p>
              )}
              {errors.title && (
                <p className="text-sm text-destructive">{errors.title.message}</p>
              )}
            </div>
          )}

          {/* 생성 모드에서만 표시되는 필드 */}
          {!isEditMode && (
            <>
              <div className="space-y-2">
                <Label htmlFor="task_category">
                  카테고리 <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={taskCategory}
                  onValueChange={(value) => setValue("task_category", value as any)}
                  disabled={!!autoFillMode}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="카테고리를 선택하세요" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="REVIEW">검토</SelectItem>
                    <SelectItem value="CONTRACT">계약</SelectItem>
                    <SelectItem value="SPECIFICATION">명세서</SelectItem>
                    <SelectItem value="APPLICATION">출원</SelectItem>
                  </SelectContent>
                </Select>
                {!isEditMode && "task_category" in errors && errors.task_category && (
                  <p className="text-sm text-destructive">{errors.task_category.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="assignee_id">
                  담당자 (할당받은 사람) <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={assigneeId}
                  onValueChange={(value) => setValue("assignee_id", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="담당자를 선택하세요" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableParticipants.length === 0 ? (
                      <SelectItem value="no-participants" disabled>
                        선택 가능한 참여자가 없습니다
                      </SelectItem>
                    ) : (
                      availableParticipants.map((participant) => {
                        // 이미 필터링에서 profile이 null이 아닌 경우만 포함했으므로 안전함
                        const profile = participant.profile!;
                        const displayName = profile.full_name 
                          ? `${profile.full_name} (${profile.email})`
                          : profile.email;
                        return (
                          <SelectItem key={participant.user_id} value={participant.user_id}>
                            {displayName}
                          </SelectItem>
                        );
                      })
                    )}
                  </SelectContent>
                </Select>
                {!isEditMode && "assignee_id" in errors && errors.assignee_id && (
                  <p className="text-sm text-destructive">{errors.assignee_id.message}</p>
                )}
              </div>
            </>
          )}

          {/* 수정 모드일 때 읽기 전용 정보 표시 */}
          {isEditMode && task && (
            <>
              <div className="space-y-2">
                <Label>카테고리</Label>
                <div className="px-3 py-2 border rounded-md bg-muted text-sm">
                  {task.task_category === "REVIEW" && "검토"}
                  {task.task_category === "CONTRACT" && "계약"}
                  {task.task_category === "SPECIFICATION" && "명세서"}
                  {task.task_category === "APPLICATION" && "출원"}
                </div>
              </div>
              <div className="space-y-2">
                <Label>지시자 (할당하는 사람)</Label>
                <div className="px-3 py-2 border rounded-md bg-muted text-sm">
                  {task.assigner?.full_name || task.assigner?.email || task.assigner_id}
                </div>
              </div>
              <div className="space-y-2">
                <Label>담당자 (할당받은 사람)</Label>
                <div className="px-3 py-2 border rounded-md bg-muted text-sm">
                  {task.assignee?.full_name 
                    ? `${task.assignee.full_name} (${task.assignee.email})`
                    : task.assignee?.email || task.assignee_id}
                </div>
              </div>
            </>
          )}

          {/* 명세서 모드에서는 마감일 필드 숨김 */}
          {!isSpecificationMode && (
            <div className="space-y-2">
              <Label htmlFor="due_date">
                마감일 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="due_date"
                type="date"
                min={minDate}
                {...register("due_date")}
                aria-invalid={errors.due_date ? "true" : "false"}
              />
              {errors.due_date && (
                <p className="text-sm text-destructive">{errors.due_date.message}</p>
              )}
              {dueDate && dueDate < minDate && (
                <p className="text-sm text-destructive">오늘 이전 날짜는 선택할 수 없습니다.</p>
              )}
            </div>
          )}
          
          {/* 특이사항 필드 (생성 모드에서만 표시) */}
          {!isEditMode && (
            <div className="space-y-2">
              <Label htmlFor="notes">특이사항 (선택사항)</Label>
              <textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="특이사항을 입력하세요"
                rows={2}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-16-regular ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                maxLength={1000}
              />
              <p className="text-xs text-muted-foreground">
                {notes.length}/1000자
              </p>
            </div>
          )}

          {/* 파일 업로드 영역 (생성 모드에서만 표시) */}
          {!isEditMode && (
            <div className="space-y-2">
              <Label>파일 첨부 (선택사항)</Label>
              <div
                className={cn(
                  "border-2 border-dashed rounded-lg p-4 transition-colors",
                  dragActive
                    ? "border-primary bg-primary/5"
                    : "border-muted-foreground/25 hover:border-muted-foreground/50"
                )}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <div className="flex flex-col items-center justify-center gap-2">
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <div className="text-sm text-center text-muted-foreground">
                    <span className="font-medium text-foreground">클릭하여 파일 선택</span> 또는 드래그 앤 드롭
                  </div>
                  <div className="text-xs text-muted-foreground">
                    최대 10MB, 여러 파일 선택 가능
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={handleFileSelect}
                    accept="*/*"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="px-2 py-1"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    파일 선택
                  </Button>
                </div>
              </div>

              {/* 첨부된 파일 목록 */}
              {attachedFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 p-2 bg-muted/30 rounded-lg">
                  {attachedFiles.map((file, index) => (
                    <div
                      key={`${file.name}-${index}`}
                      className="flex items-center gap-2 px-3 py-2 bg-background border rounded-lg text-sm"
                    >
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
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              취소
            </Button>
            <Button
              type="submit"
              disabled={
                isLoading ||
                (!isEditMode && (!assigneeId || !taskCategory || (!isSpecificationMode && !dueDate)))
              }
            >
              {isLoading ? (isEditMode ? "수정 중..." : "생성 중...") : isEditMode ? "수정" : "생성"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

