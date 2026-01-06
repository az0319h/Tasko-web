import { Badge } from "@/components/ui/badge";
import type { Task } from "@/api/task";

interface TaskStatusBadgeProps {
  status: Task["task_status"];
}

/**
 * Task 상태 배지 컴포넌트
 */
export function TaskStatusBadge({ status }: TaskStatusBadgeProps) {
  const statusConfig: Record<
    Task["task_status"],
    { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
  > = {
    ASSIGNED: {
      label: "할당됨",
      variant: "outline",
    },
    IN_PROGRESS: {
      label: "진행 중",
      variant: "default",
    },
    WAITING_CONFIRM: {
      label: "확인 대기",
      variant: "secondary",
    },
    APPROVED: {
      label: "승인됨",
      variant: "default",
    },
    REJECTED: {
      label: "거부됨",
      variant: "destructive",
    },
  };

  const config = statusConfig[status];

  return (
    <Badge variant={config.variant}>
      {config.label}
    </Badge>
  );
}

