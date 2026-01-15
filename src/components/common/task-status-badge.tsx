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
    {
      label: string;
      variant: "default" | "secondary" | "destructive" | "outline";
      className?: string;
    }
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
      className:
        "bg-yellow-500 text-white border-transparent flex justify-center items-center whitespace-nowrap hover:bg-yellow-600 dark:bg-yellow-600 dark:hover:bg-yellow-700",
    },
    APPROVED: {
      label: "승인됨",
      variant: "default",
      className:
        "bg-green-600 text-white border-transparent hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-800",
    },
    REJECTED: {
      label: "거부됨",
      variant: "destructive",
    },
  };

  const config = statusConfig[status];

  return (
    <Badge variant={config.variant} className={config.className}>
      {config.label}
    </Badge>
  );
}
