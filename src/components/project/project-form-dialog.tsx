import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Textarea } from '@/components/ui/textarea';
import { Calendar as CalendarIcon, Loader2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createProject, updateProject, type Project } from '@/api/projects';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

// 폼 스키마 정의
const projectFormSchema = z.object({
  title: z
    .string()
    .min(1, '프로젝트 제목을 입력해주세요.')
    .max(100, '프로젝트 제목은 100자 이하로 입력해주세요.'),
  client_name: z
    .string()
    .min(1, '클라이언트명을 입력해주세요.')
    .max(50, '클라이언트명은 50자 이하로 입력해주세요.'),
  patent_name: z
    .string()
    .max(100, '특허명은 100자 이하로 입력해주세요.')
    .optional()
    .or(z.literal('')),
  due_date: z.date().optional(),
});

type ProjectFormValues = z.infer<typeof projectFormSchema>;

interface ProjectFormDialogProps {
  mode: 'create' | 'edit';
  project?: Project;
  trigger?: React.ReactNode;
  onSuccess?: () => void;
}

const ProjectFormDialog: React.FC<ProjectFormDialogProps> = ({
  mode,
  project,
  trigger,
  onSuccess
}) => {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  // 폼 초기화
  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: {
      title: project?.title || '',
      client_name: project?.client_name || '',
      patent_name: project?.patent_name || '',
      due_date: project?.due_date ? new Date(project.due_date) : undefined,
    },
  });

  // 프로젝트 생성 뮤테이션
  const createMutation = useMutation({
    mutationFn: createProject,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['project-stats'] });
      toast.success('프로젝트가 성공적으로 생성되었습니다.');
      setOpen(false);
      form.reset();
      onSuccess?.();
    },
    onError: (error: any) => {
      console.error('프로젝트 생성 실패:', error);
      const errorMessage = error?.message || '알 수 없는 오류가 발생했습니다.';
      toast.error(`프로젝트 생성에 실패했습니다: ${errorMessage}`);
    },
  });

  // 프로젝트 수정 뮤테이션
  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Project> }) =>
      updateProject(id, updates),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['project-stats'] });
      toast.success('프로젝트가 성공적으로 수정되었습니다.');
      setOpen(false);
      onSuccess?.();
    },
    onError: (error: any) => {
      console.error('프로젝트 수정 실패:', error);
      const errorMessage = error?.message || '알 수 없는 오류가 발생했습니다.';
      toast.error(`프로젝트 수정에 실패했습니다: ${errorMessage}`);
    },
  });

  // 폼 제출 핸들러
  const onSubmit = async (values: ProjectFormValues) => {
    try {
      const projectData = {
        title: values.title.trim(),
        client_name: values.client_name.trim(),
        patent_name: values.patent_name?.trim() || null,
        due_date: values.due_date ? values.due_date.toISOString() : null,
        status: 'inProgress' as const,
      };

      if (mode === 'create') {
        createMutation.mutate(projectData);
      } else if (mode === 'edit' && project) {
        updateMutation.mutate({
          id: project.id,
          updates: projectData,
        });
      }
    } catch (error) {
      console.error('폼 제출 오류:', error);
    }
  };

  // 로딩 상태
  const isLoading = createMutation.isPending || updateMutation.isPending;

  // 모달 닫기 핸들러
  const handleClose = () => {
    if (!isLoading) {
      setOpen(false);
      form.reset();
    }
  };

  const defaultTrigger = (
    <Button>
      <Plus className="w-4 h-4 mr-2" />
      프로젝트 추가
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || defaultTrigger}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]" onPointerDownOutside={(e) => {
        if (isLoading) e.preventDefault();
      }}>
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? '새 프로젝트 생성' : '프로젝트 수정'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create' 
              ? '새로운 프로젝트의 정보를 입력해주세요.' 
              : '프로젝트 정보를 수정해주세요.'
            }
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 프로젝트 제목 */}
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>프로젝트 제목 *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="프로젝트 제목을 입력하세요"
                        {...field}
                        disabled={isLoading}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* 클라이언트명 */}
              <FormField
                control={form.control}
                name="client_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>클라이언트명 *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="클라이언트명을 입력하세요"
                        {...field}
                        disabled={isLoading}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* 완료예정일 */}
              <FormField
                control={form.control}
                name="due_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>완료예정일</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              'w-full pl-3 text-left font-normal',
                              !field.value && 'text-muted-foreground'
                            )}
                            disabled={isLoading}
                          >
                            {field.value ? (
                              format(field.value, 'PPP', { locale: ko })
                            ) : (
                              <span>날짜를 선택하세요</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) =>
                            date < new Date() || date < new Date('1900-01-01')
                          }
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormDescription>
                      프로젝트 완료 예정일을 선택하세요.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* 특허명 */}
            <FormField
              control={form.control}
              name="patent_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>특허명</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="특허명을 입력하세요 (선택사항)"
                      {...field}
                      disabled={isLoading}
                    />
                  </FormControl>
                  <FormDescription>
                    프로젝트와 관련된 특허명이 있다면 입력하세요.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isLoading}
              >
                취소
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {mode === 'create' ? '생성' : '수정'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default ProjectFormDialog;
