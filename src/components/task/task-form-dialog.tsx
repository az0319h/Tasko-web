import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { taskSchema, type TaskFormData } from "@/schemas/task/task-schema";
import { useCurrentProfile } from "@/hooks";
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
  onSubmit: (data: TaskFormData) => Promise<void>;
  projectId: string;
  isLoading?: boolean;
}

/**
 * Task 생성 폼 다이얼로그
 */
export function TaskFormDialog({
  open,
  onOpenChange,
  onSubmit,
  projectId,
  isLoading = false,
}: TaskFormDialogProps) {
  const { data: currentProfile } = useCurrentProfile();
  const { data: profiles } = useProfiles();

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm<TaskFormData>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      title: "",
      description: null,
      assigner_id: "",
      assignee_id: "",
      due_date: null,
    },
  });

  const assignerId = watch("assigner_id");
  const assigneeId = watch("assignee_id");

  // 프로필 목록 필터링 (프로필 완료된 사용자만)
  const availableProfiles = profiles?.filter(
    (profile) => profile.profile_completed && profile.full_name
  ) || [];

  const onFormSubmit = async (data: TaskFormData) => {
    await onSubmit(data);
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Task 생성</DialogTitle>
          <DialogDescription>
            새로운 Task를 생성합니다. 담당자와 할당받은 사람을 선택해주세요.
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
            {errors.assigner_id && (
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
            {errors.assignee_id && (
              <p className="text-sm text-destructive">{errors.assignee_id.message}</p>
            )}
            {assignerId === assigneeId && assigneeId && (
              <p className="text-sm text-destructive">
                담당자와 할당받은 사람은 같을 수 없습니다.
              </p>
            )}
          </div>

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
            <Button type="submit" disabled={isLoading || assignerId === assigneeId || !assignerId || !assigneeId}>
              {isLoading ? "생성 중..." : "생성"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

