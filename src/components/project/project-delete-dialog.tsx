import React, { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Trash2 } from 'lucide-react';
import { deleteProject, type Project } from '@/api/projects';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface ProjectDeleteDialogProps {
  project: Project;
  trigger?: React.ReactNode;
  onSuccess?: () => void;
}

const ProjectDeleteDialog: React.FC<ProjectDeleteDialogProps> = ({
  project,
  trigger,
  onSuccess
}) => {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  // 프로젝트 삭제 뮤테이션
  const deleteMutation = useMutation({
    mutationFn: deleteProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['project-stats'] });
      toast.success(`프로젝트 "${project.title}"이(가) 성공적으로 삭제되었습니다.`);
      setOpen(false);
      onSuccess?.();
    },
    onError: (error) => {
      console.error('프로젝트 삭제 실패:', error);
      toast.error(`프로젝트 삭제에 실패했습니다: ${error.message}`);
    },
  });

  // 삭제 확인 핸들러
  const handleDelete = () => {
    deleteMutation.mutate(project.id);
  };

  // 로딩 상태
  const isLoading = deleteMutation.isPending;

  const defaultTrigger = (
    <Button variant="destructive" size="sm">
      <Trash2 className="w-4 h-4 mr-2" />
      삭제
    </Button>
  );

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        {trigger || defaultTrigger}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>프로젝트 삭제 확인</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <p>
              정말로 <strong>"{project.title}"</strong> 프로젝트를 삭제하시겠습니까?
            </p>
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 mt-3">
              <div className="text-sm text-yellow-800">
                <strong>⚠️ 주의사항:</strong>
                <ul className="list-disc list-inside mt-1 space-y-1">
                  <li>이 작업은 되돌릴 수 없습니다.</li>
                  <li>프로젝트와 관련된 모든 Task와 메시지가 함께 삭제됩니다.</li>
                  <li>삭제된 데이터는 복구할 수 없습니다.</li>
                </ul>
              </div>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-md p-3 mt-3">
              <div className="text-sm text-gray-700">
                <strong>프로젝트 정보:</strong>
                <ul className="mt-1 space-y-1">
                  <li><strong>클라이언트:</strong> {project.client_name}</li>
                  {project.patent_name && (
                    <li><strong>특허명:</strong> {project.patent_name}</li>
                  )}
                  <li><strong>상태:</strong> {project.status === 'inProgress' ? '진행중' : '완료'}</li>
                  {project.due_date && (
                    <li>
                      <strong>완료예정일:</strong>{' '}
                      {new Date(project.due_date).toLocaleDateString('ko-KR')}
                    </li>
                  )}
                </ul>
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>
            취소
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isLoading}
            className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            삭제
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default ProjectDeleteDialog;




