import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { taskCreateSchema, taskUpdateSchema, type TaskCreateFormData, type TaskUpdateFormData } from "@/schemas/task/task-schema";
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

interface TaskFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: TaskCreateFormData | TaskUpdateFormData) => Promise<void>;
  projectId: string;
  isLoading?: boolean;
  task?: TaskWithProfiles | null; // 수정 모드일 때 Task 데이터
  preSelectedCategory?: "REVIEW" | "CONTRACT" | "SPECIFICATION" | "APPLICATION"; // 미리 선택된 카테고리
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
}: TaskFormDialogProps) {
  const { data: currentProfile } = useCurrentProfile();
  const { data: project } = useProject(projectId);
  const { data: participants } = useProjectParticipants(projectId);
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
          due_date: null,
        }
      : {
          title: "",
          assignee_id: "",
          task_category: preSelectedCategory || undefined,
          due_date: null,
        },
  });

  // 생성 모드에서만 assignee_id, task_category watch
  const assigneeId = !isEditMode ? (watch("assignee_id" as keyof TaskCreateFormData) as string | undefined) : undefined;
  const taskCategory = !isEditMode ? (watch("task_category" as keyof TaskCreateFormData) as string | undefined) : undefined;
  const dueDate = watch("due_date" as keyof TaskCreateFormData) as string | undefined;

  // 수정 모드일 때 폼 초기값 설정
  useEffect(() => {
    if (task && open && isEditMode) {
      // 수정 모드: title, due_date만 설정 (description 제거됨)
      setValue("title", task.title);
      setValue("due_date", task.due_date ? task.due_date.split("T")[0] : null);
    } else if (!task && open && !isEditMode) {
      // 생성 모드일 때 폼 초기화
      reset({
        title: "",
        assignee_id: "",
        task_category: preSelectedCategory || undefined,
        due_date: null,
      });
      // preSelectedCategory가 있으면 자동으로 설정
      if (preSelectedCategory) {
        setValue("task_category", preSelectedCategory);
      }
    }
  }, [task, open, isEditMode, setValue, reset, preSelectedCategory]);

  // 프로젝트 참여자 목록 필터링 (현재 사용자 제외, 프로필 완료된 사용자만)
  const availableParticipants = participants?.filter(
    (participant) =>
      participant.profile && // profile이 null이 아닌 경우만
      participant.profile.profile_completed &&
      participant.profile.is_active &&
      participant.user_id !== currentProfile?.id
  ) || [];

  // 마감일 검증: 오늘 이전 날짜 선택 불가, 프로젝트 완료 예정일 이전만 선택 가능
  const today = new Date().toISOString().split("T")[0];
  const projectDueDate = project?.due_date ? new Date(project.due_date).toISOString().split("T")[0] : null;
  const minDate = today;
  const maxDate = projectDueDate || undefined;

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
              지시사항 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="title"
              {...register("title")}
              placeholder="지시사항을 입력하세요"
              aria-invalid={errors.title ? "true" : "false"}
            />
            {errors.title && (
              <p className="text-sm text-destructive">{errors.title.message}</p>
            )}
          </div>

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

          <div className="space-y-2">
            <Label htmlFor="due_date">마감일</Label>
            <Input
              id="due_date"
              type="date"
              min={minDate}
              max={maxDate}
              {...register("due_date")}
              aria-invalid={errors.due_date ? "true" : "false"}
            />
            {errors.due_date && (
              <p className="text-sm text-destructive">{errors.due_date.message}</p>
            )}
            {dueDate && dueDate < minDate && (
              <p className="text-sm text-destructive">오늘 이전 날짜는 선택할 수 없습니다.</p>
            )}
            {dueDate && projectDueDate && dueDate > projectDueDate && (
              <p className="text-sm text-destructive">
                프로젝트 완료 예정일({projectDueDate}) 이전 날짜만 선택할 수 있습니다.
              </p>
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
                (!isEditMode && (!assigneeId || !taskCategory))
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

