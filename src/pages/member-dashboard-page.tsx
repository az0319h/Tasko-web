import { useState, useMemo, useEffect } from "react";
import { Link, useSearchParams, useLocation } from "react-router";
import { Search, ArrowUpDown, ChevronDown } from "lucide-react";
import { useProjects, useTasksForMember, useCurrentProfile } from "@/hooks";
import { useDebounce } from "@/hooks";
import { TaskStatusChangeDialog } from "@/components/dialog/task-status-change-dialog";
import { useUpdateTaskStatus } from "@/hooks/mutations/use-task";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
import { TablePagination } from "@/components/common/table-pagination";
import { useTasks } from "@/hooks/queries/use-tasks";
import { TaskStatusBadge } from "@/components/common/task-status-badge";
import { cn } from "@/lib/utils";
import type { Project } from "@/api/project";
import type { TaskWithProfiles } from "@/api/task";
import type { TaskStatus } from "@/lib/task-status";
import { toast } from "sonner";

/**
 * 날짜를 YYYY-MM-DD 형식으로 포맷
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * 마감일 포맷팅 (TaskCard 로직 재사용)
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

type SortOrder = "newest" | "oldest";
type DashboardTab = "kanban" | "projects";
type TaskCategory = "REVIEW" | "CONTRACT" | "SPECIFICATION" | "APPLICATION";
type CategoryParam = "review" | "contract" | "spec" | "apply";
type StatusParam = "all" | "assigned" | "in_progress" | "waiting_confirm" | "rejected" | "approved";
type SortDueParam = "asc" | "desc";

/**
 * Member 대시보드 페이지
 */
export default function MemberDashboardPage() {
  const location = useLocation();
  const { data: myProjects = [], isLoading: projectsLoading } = useProjects(); // RLS 자동 필터링으로 참여 프로젝트만 조회
  const { data: currentProfile } = useCurrentProfile();
  // 상태 필터에 "승인됨"이 포함되어 있으므로 모든 상태의 Task 조회
  const { data: myTasks = [], isLoading: tasksLoading } = useTasksForMember(false);
  const updateTaskStatus = useUpdateTaskStatus();
  const [searchParams, setSearchParams] = useSearchParams();

  // 탭 상태 - URL 쿼리 파라미터에서 읽기
  const layoutParam = searchParams.get("layout") as DashboardTab | null;
  const [activeTab, setActiveTab] = useState<DashboardTab>(
    layoutParam === "kanban" || layoutParam === "projects" ? layoutParam : "kanban",
  );

  // URL params 읽기 (담당 업무 탭용)
  const categoryParam = searchParams.get("category") as CategoryParam | null;
  const validCategories: CategoryParam[] = ["review", "contract", "spec", "apply"];
  const category: CategoryParam =
    categoryParam && validCategories.includes(categoryParam) ? categoryParam : "review";

  // 검색어는 로컬 state만 사용 (URL params 제거, 전체 프로젝트 탭과 동일)
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
  const [statusChangeDialogOpen, setStatusChangeDialogOpen] = useState(false);
  const [pendingStatusChange, setPendingStatusChange] = useState<{
    taskId: string;
    currentStatus: TaskStatus;
    newStatus: TaskStatus;
    taskTitle: string;
  } | null>(null);

  // 검색 및 필터 상태 (프로젝트 탭용)
  const [projectsSearchQuery, setProjectsSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");

  // 페이지네이션 상태 (담당 업무 탭용)
  const [tasksCurrentPage, setTasksCurrentPage] = useState(1);
  const [tasksItemsPerPage, setTasksItemsPerPage] = useState(() => {
    const saved = sessionStorage.getItem("tablePageSize");
    return saved ? parseInt(saved, 10) : 10;
  });

  // 페이지네이션 상태 (프로젝트 탭용)
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(() => {
    const saved = sessionStorage.getItem("tablePageSize");
    return saved ? parseInt(saved, 10) : 10;
  });

  // 검색어 debounce
  const debouncedSearch = useDebounce(searchQuery, 300);
  const debouncedProjectsSearch = useDebounce(projectsSearchQuery, 300);

  // 대시보드 페이지에 있을 때 현재 URL을 세션 스토리지에 저장
  useEffect(() => {
    const currentUrl = location.pathname + location.search;
    if (currentUrl === "/" || currentUrl.startsWith("/?")) {
      sessionStorage.setItem("previousDashboardUrl", currentUrl);
    }
  }, [location.pathname, location.search]);

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
      if (updates.category === "review") {
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

  // 검색어 변경 핸들러 (로컬 state만 업데이트, URL params 사용 안 함)
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

  // Task 상태 변경 핸들러
  const handleTaskStatusChange = (taskId: string, newStatus: TaskStatus) => {
    const task = myTasks.find((t) => t.id === taskId);
    if (task) {
      setPendingStatusChange({
        taskId,
        currentStatus: task.task_status,
        newStatus,
        taskTitle: task.title,
      });
      setStatusChangeDialogOpen(true);
    }
  };

  // 상태 변경 확인 핸들러
  const handleConfirmStatusChange = async () => {
    if (!pendingStatusChange) return;

    try {
      await updateTaskStatus.mutateAsync({
        taskId: pendingStatusChange.taskId,
        newStatus: pendingStatusChange.newStatus,
      });
      setStatusChangeDialogOpen(false);
      setPendingStatusChange(null);
    } catch (error) {
      toast.error("상태 변경에 실패했습니다.");
    }
  };

  // 프로젝트 맵 생성 (빠른 조회를 위해)
  const projectMap = useMemo(() => {
    const map = new Map<string, Project>();
    myProjects.forEach((project) => {
      map.set(project.id, project);
    });
    return map;
  }, [myProjects]);

  // 카테고리 매핑 (URL → DB)
  const categoryMap: Record<CategoryParam, TaskCategory> = {
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

  // 1단계: "내가 관련된 Task" 필터링
  const myRelatedTasks = useMemo(() => {
    if (!currentProfile?.id) return [];
    return myTasks.filter(
      (task) => task.assigner_id === currentProfile.id || task.assignee_id === currentProfile.id,
    );
  }, [myTasks, currentProfile?.id]);

  // 카테고리별 Task 개수 계산
  const categoryCounts = useMemo(() => {
    return {
      review: myRelatedTasks.filter((task) => task.task_category === "REVIEW").length,
      contract: myRelatedTasks.filter((task) => task.task_category === "CONTRACT").length,
      spec: myRelatedTasks.filter((task) => task.task_category === "SPECIFICATION").length,
      apply: myRelatedTasks.filter((task) => task.task_category === "APPLICATION").length,
    };
  }, [myRelatedTasks]);

  // 2단계: 카테고리 필터링
  const categoryFilteredTasks = useMemo(() => {
    const dbCategory = categoryMap[category];
    return myRelatedTasks.filter((task) => task.task_category === dbCategory);
  }, [myRelatedTasks, category]);

  // 3단계: 검색 필터링
  const searchedTasks = useMemo(() => {
    if (!debouncedSearch.trim()) return categoryFilteredTasks;

    const query = debouncedSearch.toLowerCase();
    return categoryFilteredTasks.filter((task) => {
      const titleMatch = task.title.toLowerCase().includes(query);
      const assigneeName = (task.assignee?.full_name || task.assignee?.email || "").toLowerCase();
      const assigneeMatch = assigneeName.includes(query);
      const assignerName = (task.assigner?.full_name || task.assigner?.email || "").toLowerCase();
      const assignerMatch = assignerName.includes(query);
      const project = projectMap.get(task.project_id);
      const projectTitleMatch = project?.title.toLowerCase().includes(query) || false;
      const projectClientMatch = project?.client_name.toLowerCase().includes(query) || false;

      return (
        titleMatch || assigneeMatch || assignerMatch || projectTitleMatch || projectClientMatch
      );
    });
  }, [categoryFilteredTasks, debouncedSearch, projectMap]);

  // 4단계: 상태 필터링
  const statusFilteredTasks = useMemo(() => {
    const dbStatus = statusMap[status];
    if (dbStatus === null) {
      // 전체 선택 시 승인됨(APPROVED) 제외
      return searchedTasks.filter((task) => task.task_status !== "APPROVED");
    }
    return searchedTasks.filter((task) => task.task_status === dbStatus);
  }, [searchedTasks, status]);

  // 5단계: 정렬
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

  // 클라이언트 사이드 페이지네이션 (담당 업무 탭용)
  const paginatedTasks = useMemo(() => {
    const startIndex = (tasksCurrentPage - 1) * tasksItemsPerPage;
    const endIndex = startIndex + tasksItemsPerPage;
    return sortedTasks.slice(startIndex, endIndex);
  }, [sortedTasks, tasksCurrentPage, tasksItemsPerPage]);

  // 총 페이지 수 (담당 업무 탭용)
  const tasksTotalPages = Math.ceil(sortedTasks.length / tasksItemsPerPage) || 1;

  // 클라이언트 사이드 필터링 및 정렬 (프로젝트 탭용)
  const filteredProjects = useMemo(() => {
    let filtered = [...myProjects];

    // 검색 필터
    if (debouncedProjectsSearch) {
      const searchLower = debouncedProjectsSearch.toLowerCase();
      filtered = filtered.filter(
        (project) =>
          project.title.toLowerCase().includes(searchLower) ||
          project.client_name.toLowerCase().includes(searchLower),
      );
    }

    // 정렬
    filtered.sort((a, b) => {
      if (sortOrder === "newest") {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      } else if (sortOrder === "oldest") {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      return 0;
    });

    return filtered;
  }, [myProjects, debouncedProjectsSearch, sortOrder]);

  // 클라이언트 사이드 페이지네이션 (프로젝트 탭용)
  const paginatedProjects = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredProjects.slice(startIndex, endIndex);
  }, [filteredProjects, currentPage, itemsPerPage]);

  // 총 페이지 수
  const totalPages = Math.ceil(filteredProjects.length / itemsPerPage) || 1;

  // URL에서 q 파라미터 제거 (컴포넌트 마운트 시)
  useEffect(() => {
    if (searchParams.has("q")) {
      const newParams = new URLSearchParams(searchParams);
      newParams.delete("q");
      setSearchParams(newParams, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // URL 쿼리 파라미터 변경 시 탭 상태 동기화
  useEffect(() => {
    const layoutParam = searchParams.get("layout") as DashboardTab | null;
    if (layoutParam === "kanban" || layoutParam === "projects") {
      setActiveTab(layoutParam);
    }

    // 담당 업무 탭의 URL params 동기화
    if (activeTab === "kanban") {
      const categoryParam = searchParams.get("category") as CategoryParam | null;
      const sortDueParam = searchParams.get("sortDue") as SortDueParam | null;
      const statusParam = searchParams.get("status") as StatusParam | null;

      if (categoryParam && validCategories.includes(categoryParam)) {
        // category는 state가 없으므로 URL만 확인
      }
      // sortDue와 status는 state가 없으므로 URL만 확인
    }
  }, [searchParams, activeTab]);

  // 검색어/필터 변경 시 1페이지로 리셋
  useEffect(() => {
    if (activeTab === "kanban") {
      setTasksCurrentPage(1);
    } else if (activeTab === "projects") {
      setCurrentPage(1);
    }
  }, [debouncedSearch, category, status, sortDue, activeTab, debouncedProjectsSearch, sortOrder]);

  // 잘못된 페이지 번호 체크 및 리셋
  useEffect(() => {
    if (tasksTotalPages > 0 && tasksCurrentPage > tasksTotalPages) {
      setTasksCurrentPage(1);
    }
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(1);
    }
  }, [tasksCurrentPage, tasksTotalPages, currentPage, totalPages]);

  const isLoading = projectsLoading || tasksLoading;

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <DefaultSpinner />
      </div>
    );
  }

  return (
    <div className="sm:p-2">
      {/* 헤더 */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="mb-2 text-2xl font-bold sm:text-3xl">나의 대시보드</h1>
          {/* <p className="text-muted-foreground text-sm sm:text-base">
            {activeTab === "kanban"
              ? `${sortedTasks.length}개의 Task`
              : `${filteredProjects.length}개의 프로젝트`}
          </p> */}
        </div>
      </div>

      {/* 탭 전환 */}
      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          const newTab = value as DashboardTab;
          setActiveTab(newTab);
          // URL 쿼리 파라미터 업데이트
          setSearchParams({ layout: newTab });
        }}
      >
        {/* 담당 업무 / 전체 프로젝트 탭 */}
        <TabsList className="mt-4">
          <TabsTrigger value="kanban">담당 업무</TabsTrigger>
          <TabsTrigger value="projects">전체 프로젝트</TabsTrigger>
        </TabsList>

        {/* 담당 업무 탭 */}
        <TabsContent value="kanban" className="space-y-4">
          {/* 탭, 카테고리 드롭다운 및 검색창 */}
          <div className="flex w-full flex-wrap items-center justify-between gap-4 pt-4  flex-row-reverse">
            {/* 카테고리 드롭다운 */}
            <Select
              value={category}
              onValueChange={(value) => handleCategoryChange(value as CategoryParam)}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="review">검토 ({categoryCounts.review}개)</SelectItem>
                <SelectItem value="contract">계약 ({categoryCounts.contract}개)</SelectItem>
                <SelectItem value="spec">명세서 ({categoryCounts.spec}개)</SelectItem>
                <SelectItem value="apply">출원 ({categoryCounts.apply}개)</SelectItem>
              </SelectContent>
            </Select>

            {/* 검색창 */}
            <div className="relative  flex-1">
              <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <Input
                placeholder="계정 ID, Task 제목, 담당자명 또는 지시자명으로 검색..."
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
                <tr className="border-b">
                  <th className="w-[16.666%] px-2 py-3 text-left text-xs font-medium sm:px-4 sm:text-sm">
                    계정 ID
                  </th>
                  <th className="w-[16.666%] px-2 py-3 text-left text-xs font-medium sm:px-4 sm:text-sm">
                    지시사항
                  </th>
                  <th
                    className="hover:bg-muted/50 w-[16.666%] cursor-pointer px-2 py-3 text-left text-xs font-medium sm:px-4 sm:text-sm"
                    onClick={handleSortDueChange}
                  >
                    <div className="flex items-center gap-2">
                      마감일
                      <ArrowUpDown className="size-3 sm:size-4" />
                    </div>
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
                    const project = projectMap.get(task.project_id);
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
                          <div className="line-clamp-2 text-xs font-medium sm:text-sm">
                            {project ? (
                              <Link
                                to={`/projects/${project.id}`}
                                className="line-clamp-2 hover:underline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const currentUrl =
                                    window.location.pathname + window.location.search;
                                  sessionStorage.setItem("previousDashboardUrl", currentUrl);
                                }}
                              >
                                {project.title}
                              </Link>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </div>
                        </td>
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
              currentPage={tasksCurrentPage}
              totalPages={tasksTotalPages}
              pageSize={tasksItemsPerPage}
              totalItems={sortedTasks.length}
              selectedCount={0}
              onPageChange={setTasksCurrentPage}
              onPageSizeChange={(newPageSize) => {
                setTasksItemsPerPage(newPageSize);
                sessionStorage.setItem("tablePageSize", newPageSize.toString());
                setTasksCurrentPage(1);
              }}
            />
          )}
        </TabsContent>

        {/* 전체 프로젝트 탭 */}
        <TabsContent value="projects" className="space-y-4">
          {/* 검색 및 필터 */}
          <div className="flex  gap-4 items-center mt-4">
            <div className="relative flex-1">
              <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <Input
                placeholder="계정 ID, 고객명으로 검색..."
                value={projectsSearchQuery}
                onChange={(e) => setProjectsSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2">
              <Select value={sortOrder} onValueChange={(value) => setSortOrder(value as SortOrder)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="정렬" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">최신순</SelectItem>
                  <SelectItem value="oldest">오래된순</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 프로젝트 테이블 */}
          <div className="overflow-x-scroll">
            <table className="w-full min-w-[800px] table-fixed">
              <thead>
                <tr className="border-b">
                  <th className="w-[16.666%] px-2 py-3 text-left text-xs font-medium sm:px-4 sm:text-sm">
                    계정 ID
                  </th>
                  <th className="w-[16.666%] px-2 py-3 text-left text-xs font-medium sm:px-4 sm:text-sm">
                    고객명
                  </th>
                  <th className="w-[16.666%] px-2 py-3 text-left text-xs font-medium sm:px-4 sm:text-sm">
                    전체 업무 수
                  </th>
                  <th className="w-[16.666%] px-2 py-3 text-left text-xs font-medium sm:px-4 sm:text-sm">
                    진행 중 업무
                  </th>
                  <th className="w-[16.666%] px-2 py-3 text-left text-xs font-medium sm:px-4 sm:text-sm">
                    완료 업무
                  </th>
                  <th className="w-[16.666%] px-2 py-3 text-left text-xs font-medium sm:px-4 sm:text-sm">
                    생성일
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedProjects.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="text-muted-foreground h-24 text-center text-xs sm:text-sm"
                    >
                      {debouncedProjectsSearch ? "검색 결과가 없습니다." : "프로젝트가 없습니다."}
                    </td>
                  </tr>
                ) : (
                  paginatedProjects.map((project) => (
                    <ProjectTableRow
                      key={project.id}
                      project={project}
                      myTasks={myTasks}
                      currentUserId={currentProfile?.id}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* 페이지네이션 */}
          {filteredProjects.length > 0 && (
            <TablePagination
              currentPage={currentPage}
              totalPages={totalPages}
              pageSize={itemsPerPage}
              totalItems={filteredProjects.length}
              selectedCount={0}
              onPageChange={setCurrentPage}
              onPageSizeChange={(newPageSize) => {
                setItemsPerPage(newPageSize);
                sessionStorage.setItem("tablePageSize", newPageSize.toString());
                setCurrentPage(1);
              }}
            />
          )}
        </TabsContent>
      </Tabs>

      {/* 상태 변경 확인 다이얼로그 */}
      {pendingStatusChange && (
        <TaskStatusChangeDialog
          open={statusChangeDialogOpen}
          onOpenChange={setStatusChangeDialogOpen}
          currentStatus={pendingStatusChange.currentStatus}
          newStatus={pendingStatusChange.newStatus}
          taskTitle={pendingStatusChange.taskTitle}
          onConfirm={handleConfirmStatusChange}
          isLoading={updateTaskStatus.isPending}
        />
      )}
    </div>
  );
}

/**
 * 프로젝트 테이블 행 컴포넌트
 */
function ProjectTableRow({
  project,
  myTasks,
  currentUserId,
}: {
  project: Project;
  myTasks: TaskWithProfiles[];
  currentUserId?: string;
}) {
  // 프로젝트의 모든 Task 조회
  const { data: allProjectTasks = [], isLoading } = useTasks(project.id);

  // 프로젝트 총 Task 개수
  const totalTasks = allProjectTasks.length;

  // 내가 관련된 Task (프로젝트의 모든 Task 중 내가 지시자 또는 담당자인 것만 필터링)
  // allProjectTasks에서 직접 필터링하여 APPROVED 포함 모든 상태의 Task 계산
  const myProjectTasks = currentUserId
    ? allProjectTasks.filter(
        (task) => task.assigner_id === currentUserId || task.assignee_id === currentUserId,
      )
    : [];

  // 기여중인 Task (진행중: ASSIGNED + IN_PROGRESS + WAITING_CONFIRM + REJECTED)
  const contributingTasks = myProjectTasks.filter((task) => task.task_status !== "APPROVED").length;

  // 기여한 Task (승인됨: APPROVED)
  const contributedTasks = myProjectTasks.filter((task) => task.task_status === "APPROVED").length;

  return (
    <tr className="hover:bg-muted/50 cursor-pointer border-b transition-colors">
      <td className="px-2 py-3 sm:px-4 sm:py-4">
        <div className="line-clamp-2 text-xs font-medium sm:text-sm">
          <Link
            to={`/projects/${project.id}`}
            className="line-clamp-2 hover:underline"
            onClick={() => {
              // 프로젝트 상세로 이동하기 전에 현재 대시보드 URL 저장
              const currentUrl = window.location.pathname + window.location.search;
              sessionStorage.setItem("previousDashboardUrl", currentUrl);
            }}
          >
            {project.title}
          </Link>
        </div>
      </td>
      <td className="px-2 py-3 sm:px-4 sm:py-4">
        <div className="line-clamp-2 text-xs sm:text-sm">{project.client_name}</div>
      </td>
      <td className="px-2 py-3 sm:px-4 sm:py-4">
        <div className="text-xs sm:text-sm">{isLoading ? <DefaultSpinner /> : `${totalTasks}개`}</div>
      </td>
      <td className="px-2 py-3 sm:px-4 sm:py-4">
        <div className="text-xs sm:text-sm">{`${contributingTasks}개`}</div>
      </td>
      <td className="px-2 py-3 sm:px-4 sm:py-4">
        <div className="text-xs sm:text-sm">{`${contributedTasks}개`}</div>
      </td>
      <td className="px-2 py-3 sm:px-4 sm:py-4">
        <div className="text-xs sm:text-sm">{formatDate(project.created_at)}</div>
      </td>
    </tr>
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
  };  return (
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
