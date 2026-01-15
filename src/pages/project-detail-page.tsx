import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router";
import { ArrowLeft, Plus, Pencil, Users, Trash2 } from "lucide-react";
import {
  useProject,
  useTasks,
  useIsAdmin,
  useCreateTask,
  useUpdateTask,
  useUpdateTaskStatus,
  useDeleteTask,
  useCurrentProfile,
  useUpdateProject,
  useDeleteProject,
  useProjectParticipants,
} from "@/hooks";
import { useCreateMessageWithFiles } from "@/hooks/mutations/use-message";
import { uploadTaskFile } from "@/api/storage";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import DefaultSpinner from "@/components/common/default-spinner";
import { TaskFormDialog } from "@/components/task/task-form-dialog";
import { TaskDeleteDialog } from "@/components/task/task-delete-dialog";
import { TaskStatusChangeDialog } from "@/components/dialog/task-status-change-dialog";
import { ParticipantManagementDialog } from "@/components/project/participant-management-dialog";
import { ProjectFormDialog } from "@/components/project/project-form-dialog";
import { ProjectDeleteDialog } from "@/components/project/project-delete-dialog";
import { KanbanBoard } from "@/components/task/kanban-board";
import type { TaskCreateFormData, TaskUpdateFormData } from "@/schemas/task/task-schema";
import type { ProjectUpdateFormData } from "@/schemas/project/project-schema";
import type { TaskWithProfiles } from "@/api/task";
import type { Database } from "@/database.type";
import { toast } from "sonner";

type TaskStatus = Database["public"]["Enums"]["task_status"];

/**
 * 프로젝트 상세 페이지용 상태 필터 옵션 (승인됨 포함)
 */
const PROJECT_STATUS_FILTER_OPTIONS: { value: TaskStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "전체" },
  { value: "ASSIGNED", label: "할당됨" },
  { value: "IN_PROGRESS", label: "진행 중" },
  { value: "WAITING_CONFIRM", label: "확인 대기" },
  { value: "APPROVED", label: "승인됨" },
  { value: "REJECTED", label: "거부됨" },
];

/**
 * 날짜 포맷 유틸리티
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * 프로젝트 상세 페이지
 */
export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: project, isLoading: projectLoading } = useProject(id);
  const { data: tasks, isLoading: tasksLoading } = useTasks(id);
  const { data: isAdmin } = useIsAdmin();
  const { data: currentProfile } = useCurrentProfile();
  const { data: participants, isLoading: participantsLoading } = useProjectParticipants(id);
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const updateTaskStatus = useUpdateTaskStatus();
  const deleteTask = useDeleteTask();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();
  const createMessageWithFiles = useCreateMessageWithFiles();

  // 다이얼로그 상태
  const [createTaskDialogOpen, setCreateTaskDialogOpen] = useState(false);
  const [editTaskDialogOpen, setEditTaskDialogOpen] = useState(false);
  const [deleteTaskDialogOpen, setDeleteTaskDialogOpen] = useState(false);
  const [statusChangeDialogOpen, setStatusChangeDialogOpen] = useState(false);
  const [participantManagementDialogOpen, setParticipantManagementDialogOpen] = useState(false);
  const [editProjectDialogOpen, setEditProjectDialogOpen] = useState(false);
  const [deleteProjectDialogOpen, setDeleteProjectDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [pendingStatusChange, setPendingStatusChange] = useState<{
    taskId: string;
    currentStatus: TaskStatus;
    newStatus: TaskStatus;
    taskTitle: string;
  } | null>(null);
  const [preSelectedCategory, setPreSelectedCategory] = useState<string | undefined>(undefined);


  const isLoading = projectLoading || tasksLoading;

  // Task 생성 핸들러
  // assigner_id는 자동으로 현재 로그인한 사용자로 설정됨
  const handleCreateTask = async (
    data: TaskCreateFormData | TaskUpdateFormData,
    files?: File[]
  ) => {
    if (!id || !currentProfile?.id) return;
    
    // 생성 모드에서는 TaskCreateFormData만 전달됨
    const createData = data as TaskCreateFormData;
    // description은 제거 (UI에서 제거되었고, API에서도 제거하여 스키마 캐시 문제 방지)
    const { description, ...taskData } = createData;
    
    // 1. Task 생성
    const newTask = await createTask.mutateAsync({
      project_id: id,
      title: taskData.title,
      assignee_id: taskData.assignee_id,
      due_date: taskData.due_date,
      task_category: taskData.task_category,
    });
    
    setCreateTaskDialogOpen(false);
    
    // 2. 파일이 있으면 업로드 및 메시지 생성
    if (files && files.length > 0 && newTask.id) {
      try {
        const uploadedFiles: Array<{
          url: string;
          fileName: string;
          fileType: string;
          fileSize: number;
        }> = [];
        
        // 파일들을 순차적으로 업로드
        for (const file of files) {
          try {
            // Task 생성자(assigner)의 ID로 파일 업로드
            // assigner_id는 Task 생성 시 자동으로 설정되므로 null이 아님
            if (!newTask.assigner_id) {
              throw new Error("Task 생성자 정보를 찾을 수 없습니다.");
            }
            const fileInfo = await uploadTaskFile(
              file,
              newTask.id,
              newTask.assigner_id
            );
            uploadedFiles.push(fileInfo);
          } catch (error: any) {
            toast.error(`${file.name} 업로드 실패: ${error.message}`);
          }
        }
        
        // 업로드 성공한 파일들을 파일 메시지로 생성
        if (uploadedFiles.length > 0) {
          await createMessageWithFiles.mutateAsync({
            taskId: newTask.id,
            content: null, // 메시지 텍스트 없음
            files: uploadedFiles,
          });
        }
      } catch (error: any) {
        toast.error(`파일 업로드 중 오류가 발생했습니다: ${error.message}`);
      }
    }
    
    // 3. Task 상세 페이지로 이동
    navigate(`/tasks/${newTask.id}`);
  };

  // Task 수정 핸들러
  // assigner_id와 assignee_id는 수정 불가이므로 제외
  const handleUpdateTask = async (data: TaskCreateFormData | TaskUpdateFormData) => {
    if (!selectedTask) return;
    // 수정 모드에서는 TaskUpdateFormData만 전달됨
    const updateData = data as TaskUpdateFormData;
    // description은 제거 (UI에서 제거되었고, API에서도 제거하여 스키마 캐시 문제 방지)
    const { description, ...taskUpdates } = updateData;
    await updateTask.mutateAsync({
      id: selectedTask,
      updates: {
        title: taskUpdates.title,
        due_date: taskUpdates.due_date,
        // assigner_id, assignee_id는 수정 불가
      },
    });
    setEditTaskDialogOpen(false);
    setSelectedTask(null);
  };

  // Task 삭제 핸들러
  const handleDeleteTask = async () => {
    if (!selectedTask) return;
    await deleteTask.mutateAsync(selectedTask);
    setDeleteTaskDialogOpen(false);
    setSelectedTask(null);
  };

  // 프로젝트 수정 핸들러
  const handleUpdateProject = async (data: ProjectUpdateFormData) => {
    if (!id || !project) return;
    
    await updateProject.mutateAsync({
      id,
      updates: {
        title: data.title,
        client_name: data.client_name,
      },
    });
    setEditProjectDialogOpen(false);
  };

  // 프로젝트 삭제 핸들러
  const handleDeleteProject = async () => {
    if (!id) return;
    await deleteProject.mutateAsync(id);
    setDeleteProjectDialogOpen(false);
    navigate("/");
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <DefaultSpinner />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="container mx-auto p-4 md:p-6">
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold mb-2">프로젝트를 찾을 수 없습니다</h2>
          <p className="text-muted-foreground mb-4">
            프로젝트가 삭제되었거나 접근 권한이 없습니다.
          </p>
          <Button asChild>
            <Link to="/">홈으로 돌아가기</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-4">
        <Button 
          variant="ghost" 
          size="icon"
          onClick={() => {
            // 세션 스토리지에서 이전 대시보드 URL 확인
            const previousUrl = sessionStorage.getItem("previousDashboardUrl");
            
            if (previousUrl) {
              // 세션 스토리지에 저장된 URL로 이동
              navigate(previousUrl);
            } else {
              // 세션 스토리지에 값이 없으면 기본 대시보드로 이동 (칸반 보드)
              navigate("/?layout=kanban");
            }
          }}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{project.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {tasks?.length || 0}개의 Task
          </p>
        </div>
        {/* Task 생성: 프로젝트 참여자 모두 가능 (기획상) - 오른쪽 상단 */}
        <Button onClick={() => {
          setPreSelectedCategory(undefined);
          setCreateTaskDialogOpen(true);
        }}>
          <Plus className="mr-2 h-4 w-4" />
          Task 생성
        </Button>
      </div>

      {/* 프로젝트 정보 카드 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>프로젝트 정보</CardTitle>
            <div className="flex items-center gap-2">
              {isAdmin && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditProjectDialogOpen(true)}
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    수정
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setDeleteProjectDialogOpen(true)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    삭제
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setParticipantManagementDialogOpen(true)}
                  >
                    <Users className="mr-2 h-4 w-4" />
                    참여자 관리
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">클라이언트명</p>
              <p className="text-base">{project.client_name}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">생성일</p>
              <p className="text-base">{formatDate(project.created_at)}</p>
            </div>
          </div>
          
          {/* 참여자 정보 */}
          <div className="pt-4 border-t">
            <p className="text-sm font-medium text-muted-foreground mb-3">참여자</p>
            {participantsLoading ? (
              <p className="text-sm text-muted-foreground">로딩 중...</p>
            ) : participants && participants.length > 0 ? (
              <div className="space-y-2">
                {participants
                  .filter((participant) => participant.profile !== null)
                  .map((participant) => {
                    const isCreator = project.created_by === participant.user_id;
                    const isCurrentUser = currentProfile?.id === participant.user_id;
                    const profile = participant.profile!;
                    return (
                      <div
                        key={participant.id}
                        className="flex items-center justify-between p-2 rounded-md bg-muted/50"
                      >
                        <div className="flex-1">
                          <p className="text-sm font-medium">
                            {profile.full_name || "이름 없음"}
                            {isCreator && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                (생성자)
                              </span>
                            )}
                            {isCurrentUser && !isCreator && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                (나)
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {profile.email}
                          </p>
                        </div>
                      </div>
                    );
                  })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">참여자가 없습니다.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Task 목록 - 칸반 보드만 사용 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Task 목록</CardTitle>
              <CardDescription>
                프로젝트에 속한 모든 Task를 확인할 수 있습니다.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <KanbanBoard
            tasks={tasks || []}
            currentUserId={currentProfile?.id}
            isAdmin={isAdmin}
            projectId={id || ""}
            statusFilterOptions={PROJECT_STATUS_FILTER_OPTIONS}
            onTaskCreate={(category) => {
              setPreSelectedCategory(category);
              setCreateTaskDialogOpen(true);
            }}
            onTaskStatusChange={(taskId, newStatus) => {
              const task = tasks?.find((t) => t.id === taskId);
              if (task) {
                setPendingStatusChange({
                  taskId,
                  currentStatus: task.task_status,
                  newStatus,
                  taskTitle: task.title,
                });
                setStatusChangeDialogOpen(true);
              }
            }}
          />
        </CardContent>
      </Card>

      {/* Task 생성 다이얼로그 */}
      {id && (
        <TaskFormDialog
          open={createTaskDialogOpen}
          onOpenChange={(open) => {
            setCreateTaskDialogOpen(open);
            if (!open) {
              setPreSelectedCategory(undefined);
            }
          }}
          onSubmit={handleCreateTask}
          projectId={id}
          isLoading={createTask.isPending}
          preSelectedCategory={preSelectedCategory as "REVIEW" | "CONTRACT" | "SPECIFICATION" | "APPLICATION" | undefined}
        />
      )}

      {/* Task 수정 다이얼로그 */}
      {id && selectedTask && (
        <TaskFormDialog
          open={editTaskDialogOpen}
          onOpenChange={(open) => {
            setEditTaskDialogOpen(open);
            if (!open) {
              setSelectedTask(null);
            }
          }}
          onSubmit={handleUpdateTask}
          projectId={id}
          isLoading={updateTask.isPending}
          task={tasks?.find((t) => t.id === selectedTask) || null}
        />
      )}

      {/* Task 삭제 다이얼로그 */}
      <TaskDeleteDialog
        open={deleteTaskDialogOpen}
        onOpenChange={setDeleteTaskDialogOpen}
        taskId={selectedTask}
        onConfirm={handleDeleteTask}
        isLoading={deleteTask.isPending}
      />

      {/* 상태 변경 확인 다이얼로그 */}
      {pendingStatusChange && (
        <TaskStatusChangeDialog
          open={statusChangeDialogOpen}
          onOpenChange={setStatusChangeDialogOpen}
          currentStatus={pendingStatusChange.currentStatus}
          newStatus={pendingStatusChange.newStatus}
          taskTitle={pendingStatusChange.taskTitle}
          onConfirm={async () => {
            await updateTaskStatus.mutateAsync({
              taskId: pendingStatusChange.taskId,
              newStatus: pendingStatusChange.newStatus,
            });
            setStatusChangeDialogOpen(false);
            setPendingStatusChange(null);
          }}
          isLoading={updateTaskStatus.isPending}
        />
      )}

      {/* 프로젝트 수정 다이얼로그 */}
      {project && (
        <ProjectFormDialog
          open={editProjectDialogOpen}
          onOpenChange={setEditProjectDialogOpen}
          onSubmit={handleUpdateProject}
          project={project}
          isLoading={updateProject.isPending}
          isAdmin={isAdmin}
        />
      )}

      {/* 프로젝트 삭제 다이얼로그 */}
      {project && (
        <ProjectDeleteDialog
          open={deleteProjectDialogOpen}
          onOpenChange={setDeleteProjectDialogOpen}
          project={project}
          onConfirm={handleDeleteProject}
          isLoading={deleteProject.isPending}
        />
      )}

      {/* 참여자 관리 다이얼로그 */}
      {project && (
        <ParticipantManagementDialog
          open={participantManagementDialogOpen}
          onOpenChange={setParticipantManagementDialogOpen}
          project={project}
        />
      )}
    </div>
  );
}


