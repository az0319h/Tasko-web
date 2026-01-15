import { useEffect, useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { projectCreateSchema, projectUpdateSchema, type ProjectCreateFormData, type ProjectUpdateFormData, type ProjectFormData } from "@/schemas/project/project-schema";
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
import { Search } from "lucide-react";
import { useProfiles, useCurrentProfile } from "@/hooks";
import { useDebounce } from "@/hooks/use-debounce";
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
  const { data: profiles } = useProfiles();
  const { data: currentProfile } = useCurrentProfile();

  // 생성 모드와 수정 모드에 따라 다른 스키마 사용
  const formSchema = isEdit ? projectUpdateSchema : projectCreateSchema;

  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
    setValue,
  } = useForm<ProjectFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: isEdit
      ? {
          title: "",
          client_name: "",
        }
      : {
          title: "",
          client_name: "",
          participant_ids: [],
        },
  });

  const participantIds = !isEdit ? (watch("participant_ids" as keyof ProjectCreateFormData) as string[] | undefined) : undefined;

  // 프로필 목록 필터링 (프로필 완료된 사용자, 활성 상태 사용자만, 현재 로그인한 관리자 제외)
  const availableProfiles = useMemo(() => {
    const filtered = profiles?.filter(
      (profile) =>
        profile.profile_completed &&
        profile.is_active &&
        profile.id !== currentProfile?.id
    ) || [];

    // 검색 필터링
    if (!debouncedSearch.trim()) {
      return filtered;
    }

    const query = debouncedSearch.toLowerCase();
    return filtered.filter((profile) => {
      const name = (profile.full_name || "").toLowerCase();
      const email = (profile.email || "").toLowerCase();
      return name.includes(query) || email.includes(query);
    });
  }, [profiles, currentProfile?.id, debouncedSearch]);

  // 다이얼로그가 열릴 때 폼 초기화
  useEffect(() => {
    if (open) {
      if (project && isEdit) {
        // 수정 모드: 프로젝트 데이터로 폼 초기화
        reset({
          title: project.title,
          client_name: project.client_name,
        });
      } else if (!project && !isEdit) {
        // 생성 모드: 빈 폼으로 초기화
        reset({
          title: "",
          client_name: "",
          participant_ids: [],
        });
        setSearchQuery("");
      }
    }
  }, [open, project, isEdit, reset]);

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
        ...(isEdit ? {} : { participant_ids: [] }),
      });
      setSearchQuery("");
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
              기회 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="title"
              {...register("title")}
              placeholder="기회를 입력하세요"
              aria-invalid={errors.title ? "true" : "false"}
            />
            {errors.title && <p className="text-destructive text-sm">{errors.title.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="client_name">
              고객명 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="client_name"
              {...register("client_name")}
              placeholder="고객명을 입력하세요"
              aria-invalid={errors.client_name ? "true" : "false"}
            />
            {errors.client_name && (
              <p className="text-destructive text-sm">{errors.client_name.message}</p>
            )}
          </div>

          {/* 생성 모드에서만 초대 사용자 선택 필드 표시 */}
          {!isEdit && (
            <div className="space-y-2">
              <Label htmlFor="participant_ids">
                초대 사용자 <span className="text-destructive">*</span>
              </Label>
              <p className="text-muted-foreground text-sm">
                프로젝트에 참여할 사용자를 선택하세요. (최소 1명 이상)
              </p>
              {/* 검색 입력 */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="이름 또는 이메일로 검색..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="border rounded-md p-3 max-h-[200px] overflow-y-auto space-y-2">
                {availableProfiles.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {debouncedSearch ? "검색 결과가 없습니다." : "선택 가능한 사용자가 없습니다."}
                  </p>
                ) : (
                  availableProfiles.map((profile) => {
                    const isSelected = participantIds?.includes(profile.id) || false;
                    return (
                      <label
                        key={profile.id}
                        className="flex items-center space-x-2 cursor-pointer hover:bg-muted/50 p-2 rounded"
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            const currentIds = participantIds || [];
                            if (e.target.checked) {
                              setValue("participant_ids" as keyof ProjectCreateFormData, [...currentIds, profile.id] as any);
                            } else {
                              setValue("participant_ids" as keyof ProjectCreateFormData, currentIds.filter((id) => id !== profile.id) as any);
                            }
                          }}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                        <span className="text-sm">
                          {profile.full_name ? `${profile.full_name} (${profile.email})` : profile.email}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
              {!isEdit && "participant_ids" in errors && errors.participant_ids && (
                <p className="text-destructive text-sm">{errors.participant_ids.message}</p>
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
                (!isEdit && (!participantIds || participantIds.length === 0))
              }
            >
              {isLoading ? "처리 중..." : isEdit ? "수정" : "생성"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
