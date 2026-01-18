import { useState, useMemo, useEffect } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router";
import { ArrowLeft, Plus, Pencil, Users, Trash2, Search, ArrowUpDown, ChevronDown } from "lucide-react";
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
  useDebounce,
} from "@/hooks";
import { useCreateMessageWithFiles } from "@/hooks/mutations/use-message";
import { uploadTaskFile } from "@/api/storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import DefaultSpinner from "@/components/common/default-spinner";
import { TaskFormDialog } from "@/components/task/task-form-dialog";
import { TaskDeleteDialog } from "@/components/task/task-delete-dialog";
import { TaskStatusChangeDialog } from "@/components/dialog/task-status-change-dialog";
import { ParticipantManagementDialog } from "@/components/project/participant-management-dialog";
import { ProjectFormDialog } from "@/components/project/project-form-dialog";
import { ProjectDeleteDialog } from "@/components/project/project-delete-dialog";
import { TaskStatusBadge } from "@/components/common/task-status-badge";
import { TablePagination } from "@/components/common/table-pagination";
import { cn } from "@/lib/utils";
import type { TaskCreateFormData, TaskUpdateFormData } from "@/schemas/task/task-schema";
import type { ProjectUpdateFormData } from "@/schemas/project/project-schema";
import type { TaskWithProfiles } from "@/api/task";
import type { Database } from "@/database.type";
import type { TaskStatus } from "@/lib/task-status";
import { toast } from "sonner";

type TaskCategory = "REVIEW" | "CONTRACT" | "SPECIFICATION" | "APPLICATION";
type CategoryParam = "all" | "review" | "contract" | "spec" | "apply";
type StatusParam = "all" | "assigned" | "in_progress" | "waiting_confirm" | "rejected" | "approved";
type SortDueParam = "asc" | "desc";

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
 * 마감일 포맷팅
 */
function formatDueDate(dateString: string | null | undefined): string | null {
  if (!dateString) return null;
  const date = new Date(dateString);
  return date.toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
  });
}

/**
 * 날짜 차이 계산 (일수)
 */
function calculateDaysDifference(dueDateString: string | null | undefined): number | null {
  if (!dueDateString) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dueDate = new Date(dueDateString);
  dueDate.setHours(0, 0, 0, 0);

  const diffTime = dueDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays;
}

/**
 * D-Day 표시 텍스트 생성
 */
function getDDayText(daysDiff: number | null): string {
  if (daysDiff === null) return "";

  if (daysDiff > 0) {
    return `(D-${daysDiff})`;
  } else if (daysDiff === 0) {
    return "(D-Day)";
  } else {
    return `(D+${Math.abs(daysDiff)})`;
  }
}

/**
 * 마감일 색상 클래스 결정
 */
function getDueDateColorClass(daysDiff: number | null, taskStatus: TaskStatus): string {
  if (daysDiff === null) return "text-muted-foreground";

  // 이미 승인된 Task는 기본 색상
  if (taskStatus === "APPROVED") {
    return "text-muted-foreground";
  }

  if (daysDiff === 0) {
    // D-Day: 빨간색
    return "text-destructive font-semibold";
  } else if (daysDiff === 1) {
    // D-1: 주황색
    return "text-orange-600 dark:text-orange-500 font-medium";
  } else if (daysDiff >= 2 && daysDiff <= 7) {
    // D-2 ~ D-7: 파란색
    return "text-blue-600 dark:text-blue-500 font-medium";
  } else if (daysDiff < 0) {
    // D+1 이상 (마감일 지남, 승인 안됨): 빨간색 (D-Day와 동일)
    return "text-destructive font-semibold";
  } else {
    // D-8 이상: 회색
    return "text-muted-foreground";
  }
}

/**
 * 프로젝트 상세 페이지
 */
export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
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

  // URL params 읽기
  const categoryParam = searchParams.get("category") as CategoryParam | null;
  const validCategories: CategoryParam[] = ["all", "review", "contract", "spec", "apply"];
  const category: CategoryParam =
    categoryParam && validCategories.includes(categoryParam) ? categoryParam : "all";

  const [searchQuery, setSearchQuery] = useState("");

  const sortDueParam = searchParams.get("sortDue") as SortDueParam | null;
  const sortDue: SortDueParam =
    sortDueParam === "asc" || sortDueParam === "desc" ? sortDueParam : "asc";

  const statusParam = searchParams.get("status") as StatusParam | null;
  const validStatusParams: StatusParam[] = [
    "all",
    "assigned",
    "in_progress",
    "waiting_confirm",
    "rejected",
    "approved",
  ];
  const status: StatusParam =
    statusParam && validStatusParams.includes(statusParam) ? statusParam : "all";

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

  // 페이지네이션 상태
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(() => {
    const saved = sessionStorage.getItem("tablePageSize");
    return saved ? parseInt(saved, 10) : 10;
  });

  // 검색어 debounce
  const debouncedSearch = useDebounce(searchQuery, 300);

  const isLoading = projectLoading || tasksLoading;

  // URL params 업데이트 헬퍼 함수
  const updateUrlParams = (
    updates: Partial<{
      category: CategoryParam;
      sortDue: SortDueParam;
      status: StatusParam;
    }>,
  ) => {
    const newParams = new URLSearchParams(searchParams);

    if (updates.category !== undefined) {
      if (updates.category === "all") {
        newParams.delete("category");
      } else {
        newParams.set("category", updates.category);
      }
    }

    if (updates.sortDue !== undefined) {
      if (updates.sortDue === "asc") {
        newParams.delete("sortDue");
      } else {
        newParams.set("sortDue", updates.sortDue);
      }
    }

    if (updates.status !== undefined) {
      if (updates.status === "all") {
        newParams.delete("status");
      } else {
        newParams.set("status", updates.status);
      }
    }

    setSearchParams(newParams, { replace: true });
  };

  // 카테고리 변경 핸들러
  const handleCategoryChange = (newCategory: CategoryParam) => {
    updateUrlParams({ category: newCategory });
  };

  // 검색어 변경 핸들러
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
  };

  // 정렬 변경 핸들러
  const handleSortDueChange = () => {
    const newSortDue: SortDueParam = sortDue === "asc" ? "desc" : "asc";
    updateUrlParams({ sortDue: newSortDue });
  };

  // 상태 필터 변경 핸들러
  const handleStatusChange = (newStatus: StatusParam) => {
    updateUrlParams({ status: newStatus });
  };

  // 카테고리 매핑 (URL → DB)
  const categoryMap: Record<Exclude<CategoryParam, "all">, TaskCategory> = {
    review: "REVIEW",
    contract: "CONTRACT",
    spec: "SPECIFICATION",
    apply: "APPLICATION",
  };

  // 상태 매핑 (URL → DB)
  const statusMap: Record<StatusParam, TaskStatus | null> = {
    all: null,
    assigned: "ASSIGNED",
    in_progress: "IN_PROGRESS",
    waiting_confirm: "WAITING_CONFIRM",
    rejected: "REJECTED",
    approved: "APPROVED",
  };

  // 카테고리별 Task 개수 계산
  const categoryCounts = useMemo(() => {
    if (!tasks) {
      return {
        all: 0,
        review: 0,
        contract: 0,
        spec: 0,
        apply: 0,
      };
    }
    return {
      all: tasks.length,
      review: tasks.filter((task) => task.task_category === "REVIEW").length,
      contract: tasks.filter((task) => task.task_category === "CONTRACT").length,
      spec: tasks.filter((task) => task.task_category === "SPECIFICATION").length,
      apply: tasks.filter((task) => task.task_category === "APPLICATION").length,
    };
  }, [tasks]);

  // 1단계: 카테고리 필터링
  const categoryFilteredTasks = useMemo(() => {
    if (!tasks) return [];
    if (category === "all") {
      return tasks; // 전체 선택 시 필터링 안 함
    }
    const dbCategory = categoryMap[category];
    return tasks.filter((task) => task.task_category === dbCategory);
  }, [tasks, category]);

  // 2단계: 검색 필터링
  const searchedTasks = useMemo(() => {
    if (!debouncedSearch.trim()) return categoryFilteredTasks;

    const query = debouncedSearch.toLowerCase();
    return categoryFilteredTasks.filter((task) => {
      const titleMatch = task.title.toLowerCase().includes(query);
      const assigneeName = (task.assignee?.full_name || task.assignee?.email || "").toLowerCase();
      const assigneeMatch = assigneeName.includes(query);
      const assignerName = (task.assigner?.full_name || task.assigner?.email || "").toLowerCase();
      const assignerMatch = assignerName.includes(query);

      return titleMatch || assigneeMatch || assignerMatch;
    });
  }, [categoryFilteredTasks, debouncedSearch]);

  // 3단계: 상태 필터링
  const statusFilteredTasks = useMemo(() => {
    const dbStatus = statusMap[status];
    if (dbStatus === null) {
      // 전체 선택 시 승인됨(APPROVED) 제외
      return searchedTasks.filter((task) => task.task_status !== "APPROVED");
    }
    return searchedTasks.filter((task) => task.task_status === dbStatus);
  }, [searchedTasks, status]);

  // 4단계: 정렬
  const sortedTasks = useMemo(() => {
    const sorted = [...statusFilteredTasks];

    sorted.sort((a, b) => {
      if (sortDue === "asc") {
        // 마감일 빠른 순: 마감일이 없는 Task는 뒤로
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      } else {
        // 마감일 느린 순: 마감일이 없는 Task는 뒤로
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return new Date(b.due_date).getTime() - new Date(a.due_date).getTime();
      }
    });

    return sorted;
  }, [statusFilteredTasks, sortDue]);

  // 클라이언트 사이드 페이지네이션
  const paginatedTasks = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return sortedTasks.slice(startIndex, endIndex);
  }, [sortedTasks, currentPage, itemsPerPage]);

  // 총 페이지 수
  const totalPages = Math.ceil(sortedTasks.length / itemsPerPage) || 1;

  // 검색어/필터 변경 시 1페이지로 리셋
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, category, status, sortDue]);

  // 잘못된 페이지 번호 체크 및 리셋
  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(1);
    }
  }, [currentPage, totalPages]);

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
      <div className=" md:p-2 ">
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
    <div className="md:p-2 ">
      {/* 헤더 */}
      <div className="flex flex-col gap-4 pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-4 flex-1">
            <Button 
              variant="ghost" 
              size="icon"
              className="hidden shrink-0"
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
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold line-clamp-2">{project.title}</h1>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
                <span>{tasks?.length || 0}개의 Task</span>
                <span className="hidden md:inline">•</span>
                <span>고객명: {project.client_name}</span>
                <span className="hidden md:inline">•</span>
                <span>생성일: {formatDate(project.created_at)}</span>
              </div>
            </div>
          </div>
          {/* Task 생성: 프로젝트 참여자 모두 가능 (기획상) - 오른쪽 상단 */}
          <div className="flex items-start gap-2">
            {isAdmin && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditProjectDialogOpen(true)}
                  className="h-9"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setParticipantManagementDialogOpen(true)}
                  className="h-9"
                >
                  <Users className="h-4 w-4" />
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setDeleteProjectDialogOpen(true)}
                  className="h-9"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
            <Button
              className="h-9"
              onClick={() => {
                setPreSelectedCategory(undefined);
                setCreateTaskDialogOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Task 생성
            </Button>
          </div>
        </div>

        {/* 참여자 정보 - 컴팩트한 형태 */}
        {participantsLoading ? (
          <div className="text-sm text-muted-foreground py-1">로딩 중...</div>
        ) : participants && participants.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">참여자:</span>
            {participants
              .filter((participant) => participant.profile !== null)
              .map((participant) => {
                const isCreator = project.created_by === participant.user_id;
                const isCurrentUser = currentProfile?.id === participant.user_id;
                const profile = participant.profile!;
                return (
                  <div
                    key={participant.id}
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50 text-sm"
                  >
                    <span className="font-medium">
                      {profile.full_name || "이름 없음"}
                    </span>
                    {(isCreator || isCurrentUser) && (
                      <span className="text-xs text-muted-foreground">
                        {isCreator ? "(생성자)" : "(나)"}
                      </span>
                    )}
                  </div>
                );
              })}
          </div>
        ) : null}
      </div>

      {/* Task 목록 - 테이블 */}
      <div className="space-y-4">
        {/* 카테고리 드롭다운 및 검색창 */}
        <div className="flex w-full flex-wrap items-center justify-between gap-4 flex-row-reverse">
          {/* 카테고리 드롭다운 */}
          <Select
            value={category}
            onValueChange={(value) => handleCategoryChange(value as CategoryParam)}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 ({categoryCounts.all}개)</SelectItem>
              <SelectItem value="review">검토 ({categoryCounts.review}개)</SelectItem>
              <SelectItem value="contract">계약 ({categoryCounts.contract}개)</SelectItem>
              <SelectItem value="spec">명세서 ({categoryCounts.spec}개)</SelectItem>
              <SelectItem value="apply">출원 ({categoryCounts.apply}개)</SelectItem>
            </SelectContent>
          </Select>

          {/* 검색창 */}
          <div className="relative flex-1">
            <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <Input
              placeholder="지시사항으로 검색..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Task 테이블 */}
        <div className="overflow-x-scroll">
          <table className="w-full min-w-[800px] table-fixed">
            <thead>
              <tr className="border-b bg-muted">
                <th className="w-[16.666%] px-2 py-3 text-left text-xs font-medium sm:px-4 sm:text-sm">
                  지시사항
                </th>
                <th
                  className="hover:bg-muted/80 w-[16.666%] cursor-pointer px-2 py-3 text-left text-xs font-medium sm:px-4 sm:text-sm"
                  onClick={handleSortDueChange}
                >
                  <div className="flex items-center gap-2">
                    마감일
                    <ArrowUpDown className="size-3 sm:size-4" />
                  </div>
                </th>
                <th className="w-[16.666%] px-2 py-3 text-left text-xs font-medium sm:px-4 sm:text-sm">
                  생성일
                </th>
                <th className="w-[16.666%] px-2 py-3 text-left text-xs font-medium sm:px-4 sm:text-sm">
                  <StatusFilterDropdown
                    status={status}
                    onStatusChange={handleStatusChange}
                    tasks={searchedTasks}
                  />
                </th>
                <th className="w-[16.666%] px-2 py-3 text-left text-xs font-medium sm:px-4 sm:text-sm">
                  지시자
                </th>
                <th className="w-[16.666%] px-2 py-3 text-left text-xs font-medium sm:px-4 sm:text-sm">
                  담당자
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedTasks.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="text-muted-foreground h-24 text-center text-xs sm:text-sm"
                  >
                    {debouncedSearch ? "검색 결과가 없습니다." : "Task가 없습니다."}
                  </td>
                </tr>
              ) : (
                paginatedTasks.map((task) => {
                  const dueDate = formatDueDate(task.due_date);
                  const daysDiff = calculateDaysDifference(task.due_date);
                  const dDayText = getDDayText(daysDiff);
                  const dueDateColorClass = getDueDateColorClass(daysDiff, task.task_status);

                  const assigneeDisplay = task.assignee?.full_name
                    ? `${task.assignee.full_name} (${task.assignee.email})`
                    : task.assignee?.email || task.assignee_id;

                  const assignerDisplay = task.assigner?.full_name
                    ? `${task.assigner.full_name} (${task.assigner.email})`
                    : task.assigner?.email || task.assigner_id;

                  return (
                    <tr
                      key={task.id}
                      className="hover:bg-muted/50 cursor-pointer border-b transition-colors"
                      onClick={() => {
                        const currentUrl = window.location.pathname + window.location.search;
                        sessionStorage.setItem("previousDashboardUrl", currentUrl);
                        window.location.href = `/tasks/${task.id}`;
                      }}
                    >
                      <td className="px-2 py-3 sm:px-4 sm:py-4">
                        <div className="line-clamp-2 text-xs sm:text-sm">
                          <Link
                            to={`/tasks/${task.id}`}
                            className="line-clamp-2 hover:underline"
                            onClick={(e) => {
                              e.stopPropagation();
                              const currentUrl =
                                window.location.pathname + window.location.search;
                              sessionStorage.setItem("previousDashboardUrl", currentUrl);
                            }}
                          >
                            {task.title}
                          </Link>
                        </div>
                      </td>
                      <td className="px-2 py-3 sm:px-4 sm:py-4">
                        {dueDate ? (
                          <span
                            className={cn(
                              "text-xs whitespace-nowrap sm:text-sm",
                              dueDateColorClass,
                            )}
                          >
                            {dueDate} {dDayText}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs sm:text-sm">-</span>
                        )}
                      </td>
                      <td className="px-2 py-3 sm:px-4 sm:py-4">
                        <div className="text-xs sm:text-sm">{formatDate(task.created_at)}</div>
                      </td>
                      <td className="px-2 py-3 sm:px-4 sm:py-4">
                        <TaskStatusBadge status={task.task_status} />
                      </td>
                      <td className="px-2 py-3 sm:px-4 sm:py-4">
                        <div className="line-clamp-2 text-xs sm:text-sm">{assignerDisplay}</div>
                      </td>
                      <td className="px-2 py-3 sm:px-4 sm:py-4">
                        <div className="line-clamp-2 text-xs sm:text-sm">{assigneeDisplay}</div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 페이지네이션 */}
        {sortedTasks.length > 0 && (
          <TablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={itemsPerPage}
            totalItems={sortedTasks.length}
            selectedCount={0}
            onPageChange={setCurrentPage}
            onPageSizeChange={(newPageSize) => {
              setItemsPerPage(newPageSize);
              sessionStorage.setItem("tablePageSize", newPageSize.toString());
              setCurrentPage(1);
            }}
          />
        )}
      </div>

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

/**
 * 상태 필터 드롭다운 컴포넌트
 */
function StatusFilterDropdown({
  status,
  onStatusChange,
  tasks,
}: {
  status: StatusParam;
  onStatusChange: (status: StatusParam) => void;
  tasks: TaskWithProfiles[];
}) {
  const statusLabels: Record<StatusParam, string> = {
    all: "전체",
    assigned: "할당됨",
    in_progress: "진행중",
    waiting_confirm: "확인대기",
    rejected: "거부됨",
    approved: "승인됨",
  };

  const statusMap: Record<StatusParam, TaskStatus | null> = {
    all: null,
    assigned: "ASSIGNED",
    in_progress: "IN_PROGRESS",
    waiting_confirm: "WAITING_CONFIRM",
    rejected: "REJECTED",
    approved: "APPROVED",
  };

  // 각 상태별 개수 계산
  const getStatusCount = (statusValue: StatusParam): number => {
    if (statusValue === "all") {
      // 전체는 승인됨 제외
      return tasks.filter((task) => task.task_status !== "APPROVED").length;
    }
    const dbStatus = statusMap[statusValue];
    return tasks.filter((task) => task.task_status === dbStatus).length;
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-8 px-2">
          <span className="font-medium">{statusLabels[status]}</span>
          <ChevronDown className="ml-2 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {(Object.keys(statusLabels) as StatusParam[]).map((statusValue) => {
          const count = getStatusCount(statusValue);
          return (
            <DropdownMenuItem
              key={statusValue}
              onClick={() => onStatusChange(statusValue)}
              className={status === statusValue ? "bg-accent" : ""}
            >
              {statusLabels[statusValue]} ({count}개)
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}


