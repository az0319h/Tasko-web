import { useState } from "react";
import { Link } from "react-router";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { TaskCard } from "@/components/task/task-card";
import { Badge } from "@/components/ui/badge";
import type { Project } from "@/api/project";
import type { TaskWithProfiles } from "@/api/task";
import type { TaskStatus } from "@/lib/task-status";
import { cn } from "@/lib/utils";

interface ProjectCardProps {
  project: Project;
  tasks: TaskWithProfiles[];
  currentUserId?: string;
  isAdmin?: boolean;
  onTaskStatusChange?: (taskId: string, newStatus: TaskStatus) => void;
}

/**
 * 날짜를 YYYY-MM-DD 형식으로 포맷
 */
function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return "-";
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * 프로젝트 카드 컴포넌트
 * 같은 프로젝트의 여러 Task를 아코디언으로 표시
 */
export function ProjectCard({
  project,
  tasks,
  currentUserId,
  isAdmin = false,
  onTaskStatusChange,
}: ProjectCardProps) {
  const [isOpen, setIsOpen] = useState(false);

  // 프로젝트의 Task 개수
  const taskCount = tasks.length;

  // 프로젝트 완료 여부 계산 (모든 Task가 APPROVED 상태인지 확인)
  const isCompleted = taskCount > 0 && tasks.every((task) => task.task_status === "APPROVED");

  // 프로젝트 상태 배지
  const getStatusBadge = () => {
    if (isCompleted) {
      return <Badge variant="default" className="bg-green-600">완료</Badge>;
    }
    if (taskCount === 0) {
      return <Badge variant="secondary">대기중</Badge>;
    }
    return <Badge variant="outline">진행중</Badge>;
  };

  return (
    <Card className="w-full">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-2 flex-1 min-w-0">
                <div className="mt-1">
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <CardTitle className="text-base font-semibold truncate">
                      <Link
                        to={`/projects/${project.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="hover:underline"
                      >
                        {project.title}
                      </Link>
                    </CardTitle>
                    {/* 상태 배지 숨김 처리 (확인용) */}
                    <div className="hidden">
                      {getStatusBadge()}
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <div>고객명: {project.client_name}</div>
                    {project.due_date && (
                      <div>완료 예정일: {formatDate(project.due_date)}</div>
                    )}
                    <div className="text-xs">Task 개수: {taskCount}개</div>
                  </div>
                </div>
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0">
            {taskCount === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                Task가 없습니다
              </div>
            ) : (
              <div className="space-y-2">
                {tasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    currentUserId={currentUserId}
                    isAdmin={isAdmin}
                    onStatusChange={onTaskStatusChange}
                    showActions={false}
                    showFullInfo={false}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

