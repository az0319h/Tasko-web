import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TaskCard } from "./task-card";
import type { TaskWithProfiles } from "@/api/task";
import type { TaskStatus } from "@/lib/task-status";

type TaskCategory = "REVIEW" | "CONTRACT" | "SPECIFICATION" | "APPLICATION";

interface CategoryTaskListModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: TaskCategory;
  tasks: TaskWithProfiles[];
  currentUserId?: string;
  isAdmin?: boolean;
  onTaskStatusChange?: (taskId: string, newStatus: TaskStatus) => void;
}

const CATEGORY_LABELS: Record<TaskCategory, string> = {
  REVIEW: "검토",
  CONTRACT: "계약",
  SPECIFICATION: "명세서",
  APPLICATION: "출원",
};

/**
 * 카테고리별 Task 목록 모달 컴포넌트
 * 해당 카테고리의 모든 Task를 프로젝트 구분 없이 마감일 빠른 순으로 표시
 */
export function CategoryTaskListModal({
  open,
  onOpenChange,
  category,
  tasks,
  currentUserId,
  isAdmin = false,
  onTaskStatusChange,
}: CategoryTaskListModalProps) {
  // 마감일 빠른 순으로 정렬 (null은 맨 뒤)
  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    });
  }, [tasks]);

  const categoryLabel = CATEGORY_LABELS[category];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] !max-w-5xl">
        <DialogHeader>
          <DialogTitle>{categoryLabel} Task 목록</DialogTitle>
          <DialogDescription>
            {sortedTasks.length}개의 Task가 마감일 빠른 순으로 정렬되어 있습니다.
          </DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[calc(100vh-300px)] grid-cols-1 gap-4 space-y-3 overflow-y-auto pr-2 md:grid-cols-2 xl:grid-cols-3">
          {sortedTasks.length === 0 ? (
            <div className="text-muted-foreground py-12 text-center">
              {categoryLabel} 카테고리의 Task가 없습니다.
            </div>
          ) : (
            sortedTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                currentUserId={currentUserId}
                isAdmin={isAdmin}
                onStatusChange={onTaskStatusChange}
                showActions={false}
                showFullInfo={false}
              />
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
