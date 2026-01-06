import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { taskCreateSchema, taskUpdateSchema, type TaskCreateFormData, type TaskUpdateFormData } from "@/schemas/task/task-schema";
import { useCurrentProfile } from "@/hooks";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useProfiles } from "@/hooks/queries/use-profiles";

interface TaskFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: TaskCreateFormData | TaskUpdateFormData) => Promise<void>;
  projectId: string;
  isLoading?: boolean;
  task?: TaskWithProfiles | null; // 수정 모드일 때 Task 데이터
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
}: TaskFormDialogProps) {
  const { data: currentProfile } = useCurrentProfile();
  const { data: profiles } = useProfiles();
  const isEditMode = !!task;

  // 수정 모드와 생성 모드에 따라 다른 스키마 사용
  const formSchema = isEditMode ? taskUpdateSchema : taskCreateSchema;
  
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm<TaskCreateFormData | TaskUpdateFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: isEditMode
      ? {
          title: "",
          description: null,
          due_date: null,
        }
      : {
          title: "",
          description: null,
          assigner_id: "",
          assignee_id: "",
          due_date: null,
        },
  });

  // 수정 모드일 때 폼 초기값 설정
  useEffect(() => {
    if (task && open && isEditMode) {
      // 수정 모드: title, description, due_date만 설정
      setValue("title", task.title);
      setValue("description", task.description || null);
      setValue("due_date", task.due_date ? task.due_date.split("T")[0] : null);
    } else if (!task && open && !isEditMode) {
      // 생성 모드일 때 폼 초기화
      reset({
        title: "",
        description: null,
        assigner_id: "",
        assignee_id: "",
        due_date: null,
      });
    }
  }, [task, open, isEditMode, setValue, reset]);

  // 생성 모드에서만 assigner_id, assignee_id watch
  const assignerId = !isEditMode ? (watch("assigner_id" as keyof TaskCreateFormData) as string | undefined) : undefined;
  const assigneeId = !isEditMode ? (watch("assignee_id" as keyof TaskCreateFormData) as string | undefined) : undefined;

  // 프로필 목록 필터링 (프로필 완료된 사용자만)
  const availableProfiles = profiles?.filter(
    (profile) => profile.profile_completed && profile.full_name
  ) || [];

  const onFormSubmit = async (data: TaskCreateFormData | TaskUpdateFormData) => {
    await onSubmit(data);
    if (!isEditMode) {
      reset();
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
              : "새로운 Task를 생성합니다. 담당자와 할당받은 사람을 선택해주세요."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">
              제목 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="title"
              {...register("title")}
              placeholder="Task 제목을 입력하세요"
              aria-invalid={errors.title ? "true" : "false"}
            />
            {errors.title && (
              <p className="text-sm text-destructive">{errors.title.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">설명</Label>
            <Textarea
              id="description"
              {...register("description")}
              placeholder="Task 설명을 입력하세요 (선택사항)"
              rows={4}
              aria-invalid={errors.description ? "true" : "false"}
            />
            {errors.description && (
              <p className="text-sm text-destructive">{errors.description.message}</p>
            )}
          </div>

          {/* 수정 모드에서는 assigner/assignee 필드 표시하지 않음 */}
          {!isEditMode && (
            <>
              <div className="space-y-2">
                <Label htmlFor="assigner_id">
                  담당자 (할당하는 사람) <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={assignerId}
                  onValueChange={(value) => setValue("assigner_id", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="담당자를 선택하세요" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableProfiles.map((profile) => (
                      <SelectItem key={profile.id} value={profile.id}>
                        {profile.full_name || profile.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!isEditMode && "assigner_id" in errors && errors.assigner_id && (
                  <p className="text-sm text-destructive">{errors.assigner_id.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="assignee_id">
                  할당받은 사람 <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={assigneeId}
                  onValueChange={(value) => setValue("assignee_id", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="할당받은 사람을 선택하세요" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableProfiles
                      .filter((profile) => profile.id !== assignerId)
                      .map((profile) => (
                        <SelectItem key={profile.id} value={profile.id}>
                          {profile.full_name || profile.email}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {!isEditMode && "assignee_id" in errors && errors.assignee_id && (
                  <p className="text-sm text-destructive">{errors.assignee_id.message}</p>
                )}
                {assignerId === assigneeId && assigneeId && (
                  <p className="text-sm text-destructive">
                    담당자와 할당받은 사람은 같을 수 없습니다.
                  </p>
                )}
              </div>
            </>
          )}

          {/* 수정 모드일 때 assigner/assignee 정보 표시 (읽기 전용) */}
          {isEditMode && task && (
            <>
              <div className="space-y-2">
                <Label>지시자 (할당하는 사람)</Label>
                <div className="px-3 py-2 border rounded-md bg-muted text-sm">
                  {task.assigner?.full_name || task.assigner?.email || task.assigner_id}
                </div>
              </div>
              <div className="space-y-2">
                <Label>담당자 (할당받은 사람)</Label>
                <div className="px-3 py-2 border rounded-md bg-muted text-sm">
                  {task.assignee?.full_name || task.assignee?.email || task.assignee_id}
                </div>
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="due_date">마감일</Label>
            <Input
              id="due_date"
              type="date"
              {...register("due_date")}
              aria-invalid={errors.due_date ? "true" : "false"}
            />
            {errors.due_date && (
              <p className="text-sm text-destructive">{errors.due_date.message}</p>
            )}
          </div>

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
                (!isEditMode && (assignerId === assigneeId || !assignerId || !assigneeId))
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

