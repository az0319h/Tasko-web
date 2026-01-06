import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { projectSchema, type ProjectFormData } from "@/schemas/project/project-schema";
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
import { Switch } from "@/components/ui/switch";
import type { Project } from "@/api/project";

interface ProjectFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: ProjectFormData) => Promise<void>;
  project?: Project | null;
  isLoading?: boolean;
  isAdmin?: boolean;
}

/**
 * 프로젝트 생성/수정 폼 다이얼로그
 */
export function ProjectFormDialog({
  open,
  onOpenChange,
  onSubmit,
  project,
  isLoading = false,
  isAdmin = false,
}: ProjectFormDialogProps) {
  const isEdit = !!project;

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
    setValue,
  } = useForm<ProjectFormData>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      title: "",
      client_name: "",
      patent_name: "",
      due_date: null,
      is_public: true,
      status: "inProgress" as const,
    },
  });

  const isPublic = watch("is_public");
  const status = watch("status");

  // 프로젝트가 변경되면 폼 초기화
  useEffect(() => {
    if (project) {
      reset({
        title: project.title,
        client_name: project.client_name,
        patent_name: project.patent_name,
        due_date: project.due_date ? new Date(project.due_date).toISOString().split("T")[0] : null,
        is_public: project.is_public,
        status: project.status,
      });
    } else {
      reset({
        title: "",
        client_name: "",
        patent_name: "",
        due_date: null,
        is_public: true,
        status: "inProgress" as const,
      });
    }
  }, [project, reset]);

  const onFormSubmit = async (data: ProjectFormData) => {
    try {
      await onSubmit(data);
      // 성공 시 다이얼로그 닫기 - requestAnimationFrame을 사용하여 다음 프레임에서 실행
      // 이렇게 하면 React 상태 업데이트와 DOM 업데이트가 완료된 후 다이얼로그가 닫힘
      requestAnimationFrame(() => {
        onOpenChange(false);
        if (!isEdit) {
          reset();
        }
      });
    } catch (error) {
      // 에러 발생 시에도 다이얼로그는 열어둠 (에러 메시지 표시를 위해)
      // 에러는 부모 컴포넌트의 mutation onError에서 처리됨
      console.error("프로젝트 저장 실패:", error);
    }
  };

  // 다이얼로그가 닫힐 때 폼 리셋
  const handleOpenChange = (newOpen: boolean) => {
    onOpenChange(newOpen);
    if (!newOpen) {
      // 다이얼로그가 닫힐 때 폼 리셋
      reset({
        title: "",
        client_name: "",
        patent_name: "",
        due_date: null,
        is_public: true,
        status: "inProgress" as const,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? "프로젝트 수정" : "프로젝트 생성"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "프로젝트 정보를 수정합니다." : "새로운 프로젝트를 생성합니다."}
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
              placeholder="프로젝트 제목을 입력하세요"
              aria-invalid={errors.title ? "true" : "false"}
            />
            {errors.title && <p className="text-destructive text-sm">{errors.title.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="client_name">
              클라이언트명 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="client_name"
              {...register("client_name")}
              placeholder="클라이언트명을 입력하세요"
              aria-invalid={errors.client_name ? "true" : "false"}
            />
            {errors.client_name && (
              <p className="text-destructive text-sm">{errors.client_name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="patent_name">
              특허명 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="patent_name"
              {...register("patent_name")}
              placeholder="특허명을 입력하세요"
              aria-invalid={errors.patent_name ? "true" : "false"}
            />
            {errors.patent_name && (
              <p className="text-destructive text-sm">{errors.patent_name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="due_date">완료예정일</Label>
            <Input
              id="due_date"
              type="date"
              {...register("due_date")}
              aria-invalid={errors.due_date ? "true" : "false"}
            />
            {errors.due_date && (
              <p className="text-destructive text-sm">{errors.due_date.message}</p>
            )}
          </div>

          <div className="flex items-center justify-between space-x-2">
            <div className="space-y-0.5">
              <Label htmlFor="is_public">공개 프로젝트</Label>
              <p className="text-muted-foreground text-sm">
                공개 프로젝트는 모든 사용자가 조회할 수 있습니다.
              </p>
            </div>
            <Switch
              id="is_public"
              checked={isPublic}
              onCheckedChange={(checked) => setValue("is_public", checked)}
              className="m-0"
            />
          </div>

          {/* Admin만 프로젝트 상태 변경 가능 */}
          {isAdmin && (
            <div className="flex items-center justify-between space-x-2">
              <div className="space-y-0.5">
                <Label htmlFor="status">
                  프로젝트 상태 <span className="text-destructive">*</span>
                </Label>
                <p className="text-muted-foreground text-sm">
                  {status === "done" ? "완료된 프로젝트입니다." : "진행 중인 프로젝트입니다."}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Switch
                  id="status"
                  checked={status === "done"}
                  onCheckedChange={(checked) => setValue("status", checked ? "done" : "inProgress")}
                  aria-invalid={errors.status ? "true" : "false"}
                />
              </div>
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
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "처리 중..." : isEdit ? "수정" : "생성"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
