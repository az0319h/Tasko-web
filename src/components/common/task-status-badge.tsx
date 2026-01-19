import type { Task } from "@/api/task";
import {
  FileText,
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TaskStatusBadgeProps {
  status: Task["task_status"];
}

/**
 * Task 상태 배지 컴포넌트 (아이콘 + 텍스트)
 */
export function TaskStatusBadge({ status }: TaskStatusBadgeProps) {
  const statusConfig: Record<
    Task["task_status"],
    {
      label: string;
      icon: React.ComponentType<{ className?: string }>;
      color: string;
    }
  > = {
    ASSIGNED: {
      label: "할당됨",
      icon: FileText,
      color: "text-blue-500",
    },
    IN_PROGRESS: {
      label: "진행 중",
      icon: Loader2,
      color: "text-orange-500",
    },
    WAITING_CONFIRM: {
      label: "확인 대기",
      icon: Clock,
      color: "text-yellow-500",
    },
    APPROVED: {
      label: "승인됨",
      icon: CheckCircle2,
      color: "text-green-500",
    },
    REJECTED: {
      label: "거부됨",
      icon: XCircle,
      color: "text-red-500",
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div className="flex items-center gap-1.5 text-xs sm:text-sm">
      <Icon className={cn("size-3 sm:size-4", config.color)} />
      <span>{config.label}</span>
    </div>
  );
}
