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
  const handleCreateTask = async (data: TaskCreateFormData | TaskUpdateFormData) => {
    if (!id) return;
    // 생성 모드에서는 TaskCreateFormData만 전달됨
    const createData = data as TaskCreateFormData;
    // description은 제거 (UI에서 제거되었고, API에서도 제거하여 스키마 캐시 문제 방지)
    const { description, ...taskData } = createData;
    await createTask.mutateAsync({
      project_id: id,
      title: taskData.title,
      assignee_id: taskData.assignee_id,
      due_date: taskData.due_date || null,
      task_category: taskData.task_category,
    });
    setCreateTaskDialogOpen(false);
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
        due_date: taskUpdates.due_date || null,
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
    
    // 프로젝트 완료예정일 수정 시 검증: Task 중에 변경하려는 날짜보다 늦은 마감일이 있으면 수정 불가
    // 기존 due_date와 비교하여 변경된 경우에만 검증
    const currentDueDate = project.due_date ? new Date(project.due_date).toISOString().split("T")[0] : null;
    const newDueDate = data.due_date || null;
    
    // due_date가 변경된 경우에만 검증
    if (currentDueDate !== newDueDate && newDueDate) {
      const newDueDateObj = new Date(newDueDate);
      newDueDateObj.setHours(0, 0, 0, 0);
      
      // 현재 프로젝트의 Task 중에 변경하려는 날짜보다 늦은 마감일이 있는지 확인
      const tasksWithLaterDueDate = tasks?.filter((task) => {
        if (!task.due_date) return false;
        const taskDueDate = new Date(task.due_date);
        taskDueDate.setHours(0, 0, 0, 0);
        return taskDueDate > newDueDateObj;
      }) || [];
      
      if (tasksWithLaterDueDate.length > 0) {
        const taskTitles = tasksWithLaterDueDate.map((t) => t.title).join(", ");
        toast.error(
          `Task 중 마감일이 수정하시려는 날짜보다 늦은 Task가 있습니다: ${taskTitles}`
        );
        return;
      }
    }
    
    await updateProject.mutateAsync({
      id,
      updates: {
        title: data.title,
        client_name: data.client_name,
        due_date: data.due_date || null,
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
        <Button variant="ghost" size="icon" asChild>
          <Link to="/">
            <ArrowLeft className="h-4 w-4" />
          </Link>
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
              <p className="text-sm font-medium text-muted-foreground">완료예정일</p>
              <p className="text-base">
                {project.due_date ? formatDate(project.due_date) : "-"}
              </p>
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


