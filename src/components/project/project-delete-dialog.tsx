import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { canDeleteProject } from "@/api/project";
import type { Project } from "@/api/project";

interface ProjectDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project | null;
  onConfirm: () => Promise<void>;
  isLoading?: boolean;
}

/**
 * 프로젝트 삭제 확인 다이얼로그
 * 삭제 조건 검증:
 * 1. 프로젝트 내에 참여자가 생성자를 제외하고 없어야 함
 * 2. 모든 Task가 APPROVED 상태이거나 Task가 없어야 함
 */
export function ProjectDeleteDialog({
  open,
  onOpenChange,
  project,
  onConfirm,
  isLoading = false,
}: ProjectDeleteDialogProps) {
  const [canDelete, setCanDelete] = useState<boolean>(true);
  const [deleteReason, setDeleteReason] = useState<string | undefined>();
  const [checking, setChecking] = useState(false);

  // 프로젝트가 변경되면 삭제 조건 확인
  useEffect(() => {
    if (project && open) {
      setChecking(true);
      canDeleteProject(project.id)
        .then((result) => {
          setCanDelete(result.canDelete);
          setDeleteReason(result.reason);
        })
        .catch((error) => {
          console.error("삭제 조건 확인 실패:", error);
          setCanDelete(false);
          setDeleteReason("삭제 조건을 확인할 수 없습니다.");
        })
        .finally(() => {
          setChecking(false);
        });
    } else {
      setCanDelete(true);
      setDeleteReason(undefined);
    }
  }, [project, open]);

  const handleConfirm = async () => {
    if (!canDelete) {
      return;
    }
    await onConfirm();
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>프로젝트 삭제</AlertDialogTitle>
          <AlertDialogDescription>
            {checking ? (
              "삭제 조건을 확인하는 중..."
            ) : canDelete ? (
              <>
                정말로 <strong>{project?.title}</strong> 프로젝트를 삭제하시겠습니까?
                <br />
                이 작업은 되돌릴 수 없으며, 관련된 모든 Task와 메시지도 함께 삭제됩니다.
              </>
            ) : (
              <>
                <strong>{project?.title}</strong> 프로젝트를 삭제할 수 없습니다.
                <br />
                {deleteReason && (
                  <span className="text-destructive mt-2 block">{deleteReason}</span>
                )}
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading || checking}>취소</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isLoading || checking || !canDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
          >
            {isLoading ? "삭제 중..." : "삭제"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

