import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useTasks } from "@/hooks/queries/use-tasks";
import { calculateTaskStats, type TaskStats } from "@/lib/task-stats";
import type { TaskWithProfiles } from "@/api/task";
import { cn } from "@/lib/utils";
import DefaultSpinner from "@/components/common/default-spinner";

interface ProjectTaskStatsAccordionProps {
  projectId: string;
  myTasks: TaskWithProfiles[];
  currentUserId?: string;
}

/**
 * 프로젝트 Task 통계 아코디언 컴포넌트
 * - 프로젝트 총 Task 통계 (지연 로딩)
 * - 내 Task 통계 (즉시 계산)
 */
export function ProjectTaskStatsAccordion({
  projectId,
  myTasks,
  currentUserId,
}: ProjectTaskStatsAccordionProps) {
  const [isOpen, setIsOpen] = useState(false);

  // 프로젝트의 모든 Task 조회 (아코디언이 열릴 때만)
  const { data: allProjectTasks = [], isLoading } = useTasks(isOpen ? projectId : undefined);

  // 프로젝트 총 Task 통계
  const projectStats: TaskStats = calculateTaskStats(allProjectTasks);

  // 내 Task 통계 (현재 프로젝트의 내 Task만 필터링)
  const myProjectTasks = myTasks.filter((task) => task.project_id === projectId);
  const myStats: TaskStats = calculateTaskStats(myProjectTasks);

  // 아코디언이 닫혀있을 때는 내 Task 개수만 표시
  const displayCount = isOpen ? projectStats.total : myStats.total;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="hover:text-primary flex items-center gap-2 transition-colors">
        <span className="font-medium">{displayCount}</span>
        <ChevronDown
          className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180 transform")}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="border-muted mt-2 space-y-3 border-l-2 pl-4">
        {isLoading ? (
          <div className="text-muted-foreground flex items-center gap-2 text-sm">
            <DefaultSpinner />
            <span>로딩 중...</span>
          </div>
        ) : (
          <>
            {/* 프로젝트 총 Task 통계 */}
            <div className="space-y-1">
              <div className="text-sm font-medium">프로젝트 총 Task: {projectStats.total}</div>
              <div className="text-muted-foreground space-y-0.5 pl-2 text-xs">
                <div>├─ 진행중: {projectStats.inProgress}</div>
                <div>└─ 승인됨: {projectStats.approved}</div>
              </div>
            </div>

            {/* 내 Task 통계 */}
            {currentUserId && myStats.total > 0 && (
              <div className="border-muted/50 space-y-1 border-t pt-2">
                <div className="text-sm font-medium">내 Task: {myStats.total}</div>
                <div className="text-muted-foreground space-y-0.5 pl-2 text-xs">
                  <div>├─ 진행중: {myStats.inProgress}</div>
                  <div>└─ 승인됨: {myStats.approved}</div>
                </div>
              </div>
            )}
          </>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
