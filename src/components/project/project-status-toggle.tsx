import React from 'react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Clock, Loader2 } from 'lucide-react';
import { toggleProjectStatus, type Project } from '@/api/projects';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface ProjectStatusToggleProps {
  project: Project;
  variant?: 'switch' | 'badge' | 'button';
  disabled?: boolean;
  onSuccess?: () => void;
}

const ProjectStatusToggle: React.FC<ProjectStatusToggleProps> = ({
  project,
  variant = 'switch',
  disabled = false,
  onSuccess
}) => {
  const queryClient = useQueryClient();

  // 상태 변경 뮤테이션
  const toggleMutation = useMutation({
    mutationFn: toggleProjectStatus,
    onMutate: async (projectId) => {
      // 낙관적 업데이트를 위해 쿼리 취소
      await queryClient.cancelQueries({ queryKey: ['projects'] });

      // 이전 데이터 백업
      const previousProjects = queryClient.getQueryData(['projects']);

      // 낙관적으로 데이터 업데이트
      queryClient.setQueryData(['projects'], (old: Project[] | undefined) => {
        if (!old) return old;
        return old.map(p => 
          p.id === projectId 
            ? { ...p, status: p.status === 'inProgress' ? 'done' as const : 'inProgress' as const }
            : p
        );
      });

      return { previousProjects };
    },
    onError: (error, projectId, context) => {
      // 오류 발생 시 이전 데이터로 롤백
      if (context?.previousProjects) {
        queryClient.setQueryData(['projects'], context.previousProjects);
      }
      console.error('프로젝트 상태 변경 실패:', error);
      toast.error(`상태 변경에 실패했습니다: ${error.message}`);
    },
    onSuccess: (data) => {
      // 성공 시 관련 쿼리 무효화
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['project-stats'] });
      
      const statusText = data.status === 'done' ? '완료' : '진행중';
      toast.success(`프로젝트 상태가 "${statusText}"로 변경되었습니다.`);
      onSuccess?.();
    },
  });

  const handleToggle = (checked: boolean) => {
    if (!disabled && !toggleMutation.isPending) {
      toggleMutation.mutate(project.id);
    }
  };

  const handleClick = () => {
    if (!disabled && !toggleMutation.isPending) {
      toggleMutation.mutate(project.id);
    }
  };

  const isLoading = toggleMutation.isPending;
  const isCompleted = project.status === 'done';

  if (variant === 'switch') {
    return (
      <div className="flex items-center space-x-2">
        <Switch
          checked={isCompleted}
          onCheckedChange={handleToggle}
          disabled={disabled || isLoading}
          className="data-[state=checked]:bg-green-600"
        />
        <span className="text-sm text-gray-600">
          {isCompleted ? '완료됨' : '진행중'}
        </span>
        {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
      </div>
    );
  }

  if (variant === 'badge') {
    const statusConfig = {
      inProgress: {
        label: '진행중',
        icon: Clock,
        className: 'bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-200 cursor-pointer',
      },
      done: {
        label: '완료',
        icon: CheckCircle,
        className: 'bg-green-100 text-green-800 border-green-200 hover:bg-green-200 cursor-pointer',
      }
    };

    const config = statusConfig[project.status];
    const Icon = config.icon;

    return (
      <Badge
        variant="outline"
        className={`${config.className} ${disabled ? 'cursor-not-allowed opacity-50' : ''} transition-colors`}
        onClick={handleClick}
      >
        {isLoading ? (
          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
        ) : (
          <Icon className="w-3 h-3 mr-1" />
        )}
        {config.label}
      </Badge>
    );
  }

  if (variant === 'button') {
    return (
      <Button
        variant={isCompleted ? "default" : "outline"}
        size="sm"
        onClick={handleClick}
        disabled={disabled || isLoading}
        className={isCompleted ? "bg-green-600 hover:bg-green-700" : ""}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : isCompleted ? (
          <CheckCircle className="w-4 h-4 mr-2" />
        ) : (
          <Clock className="w-4 h-4 mr-2" />
        )}
        {isCompleted ? '완료됨' : '진행중'}
      </Button>
    );
  }

  return null;
};

export default ProjectStatusToggle;




