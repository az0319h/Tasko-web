import { useState, useMemo } from "react";
import { useParams, Link, useSearchParams } from "react-router";
import { ArrowLeft, Plus, MoreVertical, Play, CheckCircle, XCircle, Pencil } from "lucide-react";
import {
  useProject,
  useTasks,
  useIsAdmin,
  useCreateTask,
  useUpdateTask,
  useUpdateTaskStatus,
  useDeleteTask,
  useCurrentProfile,
} from "@/hooks";
import { ProjectStatusBadge } from "@/components/common/project-status-badge";
import { TaskStatusBadge } from "@/components/common/task-status-badge";
import { canEditTask } from "@/lib/project-permissions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CustomDropdown, CustomDropdownItem } from "@/components/common/custom-dropdown";
import DefaultSpinner from "@/components/common/default-spinner";
import { TaskFormDialog } from "@/components/task/task-form-dialog";
import { TaskDeleteDialog } from "@/components/task/task-delete-dialog";
import type { TaskCreateFormData, TaskUpdateFormData } from "@/schemas/task/task-schema";
import type { TaskWithProfiles } from "@/api/task";
import type { Database } from "@/database.type";

type TaskStatus = Database["public"]["Enums"]["task_status"];

const TASK_STATUS_OPTIONS: { value: TaskStatus | "ALL"; label: string }[] = [
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
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: project, isLoading: projectLoading } = useProject(id);
  const { data: tasks, isLoading: tasksLoading } = useTasks(id);
  const { data: isAdmin } = useIsAdmin();
  const { data: currentProfile } = useCurrentProfile();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const updateTaskStatus = useUpdateTaskStatus();
  const deleteTask = useDeleteTask();

  // 다이얼로그 상태
  const [createTaskDialogOpen, setCreateTaskDialogOpen] = useState(false);
  const [editTaskDialogOpen, setEditTaskDialogOpen] = useState(false);
  const [deleteTaskDialogOpen, setDeleteTaskDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<string | null>(null);

  // Task 상태 필터 (URL 쿼리 파라미터에서 읽기)
  const statusFilter = (searchParams.get("status") as TaskStatus | null) || "ALL";

  // 필터링된 Task 목록
  const filteredTasks = useMemo(() => {
    if (!tasks) return [];
    if (statusFilter === "ALL") return tasks;
    return tasks.filter((task) => task.task_status === statusFilter);
  }, [tasks, statusFilter]);

  // 상태 필터 변경 핸들러
  const handleStatusFilterChange = (value: string) => {
    const newSearchParams = new URLSearchParams(searchParams);
    if (value === "ALL") {
      newSearchParams.delete("status");
    } else {
      newSearchParams.set("status", value);
    }
    setSearchParams(newSearchParams, { replace: true });
  };

  const isLoading = projectLoading || tasksLoading;

  // Task 생성 핸들러
  // assigner_id와 assignee_id는 모두 선택값
  const handleCreateTask = async (data: TaskCreateFormData | TaskUpdateFormData) => {
    if (!id) return;
    // 생성 모드에서는 TaskCreateFormData만 전달됨
    const createData = data as TaskCreateFormData;
    await createTask.mutateAsync({
      project_id: id,
      title: createData.title,
      description: createData.description || null,
      assigner_id: createData.assigner_id,
      assignee_id: createData.assignee_id,
      due_date: createData.due_date || null,
    });
    setCreateTaskDialogOpen(false);
  };

  // Task 수정 핸들러
  // assigner_id와 assignee_id는 수정 불가이므로 제외
  const handleUpdateTask = async (data: TaskCreateFormData | TaskUpdateFormData) => {
    if (!selectedTask) return;
    // 수정 모드에서는 TaskUpdateFormData만 전달됨
    const updateData = data as TaskUpdateFormData;
    await updateTask.mutateAsync({
      id: selectedTask,
      updates: {
        title: updateData.title,
        description: updateData.description || null,
        due_date: updateData.due_date || null,
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
        {/* Task 생성: Admin만 가능 */}
        {isAdmin && (
          <Button onClick={() => setCreateTaskDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Task 생성
          </Button>
        )}
      </div>

      {/* 프로젝트 정보 카드 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>프로젝트 정보</CardTitle>
            <ProjectStatusBadge status={project.status} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">클라이언트명</p>
              <p className="text-base">{project.client_name}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">특허명</p>
              <p className="text-base font-mono">{project.patent_name}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">완료예정일</p>
              <p className="text-base">
                {project.due_date ? formatDate(project.due_date) : "-"}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">공개 여부</p>
              <p className="text-base">{project.is_public ? "공개" : "비공개"}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">생성일</p>
              <p className="text-base">{formatDate(project.created_at)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Task 목록 */}
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
          {/* Task 상태 필터 */}
          <Tabs value={statusFilter} onValueChange={handleStatusFilterChange}>
            <TabsList className="grid w-full grid-cols-6">
              {TASK_STATUS_OPTIONS.map((option) => (
                <TabsTrigger key={option.value} value={option.value} className="text-xs">
                  {option.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>제목</TableHead>
                  <TableHead>지시자</TableHead>
                  <TableHead>담당자</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>마감일</TableHead>
                  <TableHead>생성일</TableHead>
                  <TableHead className="w-[120px]">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!filteredTasks || filteredTasks.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="h-24 text-center text-muted-foreground"
                    >
                      {statusFilter === "ALL"
                        ? "Task가 없습니다."
                        : `${TASK_STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label} 상태의 Task가 없습니다.`}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTasks.map((task) => (
                    <TaskTableRow
                      key={task.id}
                      task={task}
                      isAdmin={isAdmin}
                      currentUserId={currentProfile?.id}
                      onDelete={(taskId) => {
                        setSelectedTask(taskId);
                        setDeleteTaskDialogOpen(true);
                      }}
                      onStatusChange={(taskId, newStatus) => {
                        updateTaskStatus.mutate({ taskId, newStatus });
                      }}
                      onEdit={(taskId) => {
                        setSelectedTask(taskId);
                        setEditTaskDialogOpen(true);
                      }}
                    />
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Task 생성 다이얼로그 */}
      {id && (
        <TaskFormDialog
          open={createTaskDialogOpen}
          onOpenChange={setCreateTaskDialogOpen}
          onSubmit={handleCreateTask}
          projectId={id}
          isLoading={createTask.isPending}
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
    </div>
  );
}

/**
 * Task 테이블 행 컴포넌트
 */
function TaskTableRow({
  task,
  isAdmin,
  currentUserId,
  onDelete,
  onStatusChange,
  onEdit,
}: {
  task: TaskWithProfiles;
  isAdmin?: boolean;
  currentUserId?: string;
  onDelete: (taskId: string) => void;
  onStatusChange: (taskId: string, newStatus: TaskStatus) => void;
  onEdit: (taskId: string) => void;
}) {
  // Task 조회 시 JOIN된 프로필 정보 사용
  const assignerName = task.assigner?.full_name || task.assigner?.email || task.assigner_id;
  const assigneeName = task.assignee?.full_name || task.assignee?.email || task.assignee_id;

  // 현재 사용자가 assigner인지 assignee인지 확인 (상태 변경 버튼용)
  const isAssigner = currentUserId === task.assigner_id;
  const isAssignee = currentUserId === task.assignee_id;

  // Task 수정 권한 확인 (Admin만 가능)
  const canEdit = canEditTask(task, currentUserId, isAdmin || false);

  // 상태 변경 버튼 표시 조건
  // - assignee: ASSIGNED → IN_PROGRESS 가능
  // - assignee: IN_PROGRESS → WAITING_CONFIRM 가능
  // - assigner: WAITING_CONFIRM → APPROVED/REJECTED 가능
  const canChangeToInProgress = isAssignee && task.task_status === "ASSIGNED";
  const canChangeToWaitingConfirm = isAssignee && task.task_status === "IN_PROGRESS";
  const canApprove = isAssigner && task.task_status === "WAITING_CONFIRM";
  const canReject = isAssigner && task.task_status === "WAITING_CONFIRM";

  return (
    <TableRow className="hover:bg-muted/50">
      <TableCell className="font-medium">
        <Link to={`/tasks/${task.id}`} className="hover:underline">
          {task.title}
        </Link>
      </TableCell>
      <TableCell>
        <span className="text-sm" title="업무를 지시한 사람">
          {assignerName}
        </span>
      </TableCell>
      <TableCell>
        <span className="text-sm" title="업무를 수행하는 사람">
          {assigneeName}
        </span>
      </TableCell>
      <TableCell>
        <TaskStatusBadge status={task.task_status as any} />
      </TableCell>
      <TableCell>{task.due_date ? formatDate(task.due_date) : "-"}</TableCell>
      <TableCell>{formatDate(task.created_at)}</TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          {/* 상태 변경 버튼 (조건부 렌더링) */}
          {canChangeToInProgress && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onStatusChange(task.id, "IN_PROGRESS")}
              className="h-7 text-xs"
            >
              <Play className="mr-1 h-3 w-3" />
              시작
            </Button>
          )}
          {canChangeToWaitingConfirm && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onStatusChange(task.id, "WAITING_CONFIRM")}
              className="h-7 text-xs"
            >
              완료 요청
            </Button>
          )}
          {canApprove && (
            <Button
              variant="default"
              size="sm"
              onClick={() => onStatusChange(task.id, "APPROVED")}
              className="h-7 text-xs"
            >
              <CheckCircle className="mr-1 h-3 w-3" />
              승인
            </Button>
          )}
          {canReject && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => onStatusChange(task.id, "REJECTED")}
              className="h-7 text-xs"
            >
              <XCircle className="mr-1 h-3 w-3" />
              거부
            </Button>
          )}

          {/* Task 수정 버튼 (assigner/assignee만 표시) */}
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEdit(task.id)}
              className="h-7 text-xs"
            >
              <Pencil className="mr-1 h-3 w-3" />
              수정
            </Button>
          )}

          {/* Admin 삭제 메뉴 */}
          {isAdmin && (
            <CustomDropdown
              trigger={
                <Button variant="ghost" size="icon-sm">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              }
              align="end"
            >
              <>
                <CustomDropdownItem
                  onClick={() => onDelete(task.id)}
                  variant="destructive"
                >
                  삭제
                </CustomDropdownItem>
              </>
            </CustomDropdown>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

