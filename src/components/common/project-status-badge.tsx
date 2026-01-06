import { Badge } from "@/components/ui/badge";
import type { Project } from "@/api/project";

interface ProjectStatusBadgeProps {
  status: Project["status"];
}

/**
 * 프로젝트 상태 배지 컴포넌트
 */
export function ProjectStatusBadge({ status }: ProjectStatusBadgeProps) {
  const statusConfig = {
    inProgress: {
      label: "진행 중",
      variant: "default" as const,
    },
    done: {
      label: "완료",
      variant: "secondary" as const,
    },
  };

  const config = statusConfig[status];

  return (
    <Badge variant={config.variant} className="capitalize">
      {config.label}
    </Badge>
  );
}

