import { useState, useMemo, useEffect } from "react";
import { Link, useSearchParams, useNavigate, useLocation } from "react-router";
import { Search, Plus } from "lucide-react";
import { useProjects, useIsAdmin, useCreateProject, useTasksForMember, useCurrentProfile } from "@/hooks";
import { useDebounce } from "@/hooks";
import { ProjectFormDialog } from "@/components/project/project-form-dialog";
import { KanbanBoardWithProjects } from "@/components/task/kanban-board-with-projects";
import { TaskStatusChangeDialog } from "@/components/dialog/task-status-change-dialog";
import { useUpdateTaskStatus } from "@/hooks/mutations/use-task";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import DefaultSpinner from "@/components/common/default-spinner";
import { TablePagination } from "@/components/common/table-pagination";
import { useTasks } from "@/hooks/queries/use-tasks";
import { calculateTaskStats } from "@/lib/task-stats";
import type { Project } from "@/api/project";
import type { ProjectFormData } from "@/schemas/project/project-schema";
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

type SortOrder = "newest" | "oldest" | "dueDateNewest" | "dueDateOldest";
type DashboardTab = "kanban" | "projects";

/**
 * Admin 대시보드 페이지
 */
export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: allProjects = [], isLoading: projectsLoading } = useProjects();
  const { data: isAdmin } = useIsAdmin();
  const { data: currentProfile } = useCurrentProfile();
  const { data: myTasks = [], isLoading: tasksLoading } = useTasksForMember(true); // 칸반 보드용: 담당자/지시자 Task만 조회 (APPROVED 제외)
  const createProject = useCreateProject();
  const updateTaskStatus = useUpdateTaskStatus();
  const [searchParams, setSearchParams] = useSearchParams();

  // 탭 상태 - URL 쿼리 파라미터에서 읽기
  const layoutParam = searchParams.get("layout") as DashboardTab | null;
  const [activeTab, setActiveTab] = useState<DashboardTab>(layoutParam === "kanban" || layoutParam === "projects" ? layoutParam : "kanban");

  // 칸반 보드 상태 필터 - URL 쿼리 파라미터에서 읽기
  const statusParam = searchParams.get("status") as TaskStatus | "ALL" | null;
  const validStatuses: (TaskStatus | "ALL")[] = ["ALL", "ASSIGNED", "IN_PROGRESS", "WAITING_CONFIRM", "REJECTED"];
  const initialStatusFilter = statusParam && validStatuses.includes(statusParam) ? statusParam : "ALL";
  const [kanbanStatusFilter, setKanbanStatusFilter] = useState<TaskStatus | "ALL">(initialStatusFilter);

  // 다이얼로그 상태
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [statusChangeDialogOpen, setStatusChangeDialogOpen] = useState(false);
  const [pendingStatusChange, setPendingStatusChange] = useState<{
    taskId: string;
    currentStatus: TaskStatus;
    newStatus: TaskStatus;
    taskTitle: string;
  } | null>(null);

  // 검색 및 필터 상태 (프로젝트 탭용)
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");

  // 페이지네이션 상태 (프로젝트 탭용)
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // 검색어 debounce
  const debouncedSearch = useDebounce(searchQuery, 300);

  // 대시보드 페이지에 있을 때 현재 URL을 세션 스토리지에 저장
  useEffect(() => {
    const currentUrl = location.pathname + location.search;
    if (currentUrl === "/" || currentUrl.startsWith("/?")) {
      sessionStorage.setItem("previousDashboardUrl", currentUrl);
    }
  }, [location.pathname, location.search]);

  // 프로젝트 생성 핸들러
  const handleCreateProject = async (data: ProjectFormData) => {
    if ("participant_ids" in data) {
      const newProject = await createProject.mutateAsync({
        project: {
          title: data.title,
          client_name: data.client_name,
          due_date: data.due_date || null,
        },
        participantIds: data.participant_ids,
      });
      setCreateDialogOpen(false);
      // 현재 URL을 세션 스토리지에 저장 후 프로젝트 상세 페이지로 이동
      const currentUrl = location.pathname + location.search;
      sessionStorage.setItem("previousDashboardUrl", currentUrl);
      navigate(`/projects/${newProject.id}`);
    }
  };

  // 칸반 보드 상태 필터 변경 핸들러
  const handleKanbanStatusFilterChange = (status: TaskStatus | "ALL") => {
    setKanbanStatusFilter(status);
    // URL 업데이트
    const newParams = new URLSearchParams(searchParams);
    if (status === "ALL") {
      // "ALL"이면 status 파라미터 제거
      newParams.delete("status");
    } else {
      newParams.set("status", status);
    }
    setSearchParams(newParams, { replace: true });
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


  // 클라이언트 사이드 필터링 및 정렬 (프로젝트 탭용)
  const filteredProjects = useMemo(() => {
    let filtered = [...allProjects];

    // 검색 필터
    if (debouncedSearch) {
      const searchLower = debouncedSearch.toLowerCase();
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
      } else if (sortOrder === "dueDateNewest") {
        // 완료예정일이 없는 항목은 뒤로
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return new Date(b.due_date).getTime() - new Date(a.due_date).getTime();
      } else if (sortOrder === "dueDateOldest") {
        // 완료예정일이 없는 항목은 뒤로
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      }
      return 0;
    });

    return filtered;
  }, [allProjects, debouncedSearch, sortOrder]);

  // 클라이언트 사이드 페이지네이션 (프로젝트 탭용)
  const paginatedProjects = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredProjects.slice(startIndex, endIndex);
  }, [filteredProjects, currentPage, itemsPerPage]);

  // 총 페이지 수
  const totalPages = Math.ceil(filteredProjects.length / itemsPerPage) || 1;

  // URL 쿼리 파라미터 변경 시 탭 상태 동기화
  useEffect(() => {
    const layoutParam = searchParams.get("layout") as DashboardTab | null;
    if (layoutParam === "kanban" || layoutParam === "projects") {
      setActiveTab(layoutParam);
    }

    // 상태 필터 동기화
    const statusParam = searchParams.get("status") as TaskStatus | "ALL" | null;
    if (statusParam && validStatuses.includes(statusParam)) {
      setKanbanStatusFilter(statusParam);
    } else if (!statusParam && activeTab === "kanban") {
      // URL에 status 파라미터가 없으면 기본값으로 설정
      setKanbanStatusFilter("ALL");
    }
  }, [searchParams, activeTab]);

  // 검색어/필터 변경 시 1페이지로 리셋
  useEffect(() => {
    if (activeTab === "projects") {
      setCurrentPage(1);
    }
  }, [debouncedSearch, sortOrder, activeTab]);

  // 잘못된 페이지 번호 체크 및 리셋
  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(1);
    }
  }, [currentPage, totalPages]);

  const isLoading = projectsLoading || tasksLoading;

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <DefaultSpinner />
      </div>
    );
  }

  return (
    <div className="container mx-auto space-y-4 p-4 md:p-6">
      {/* 헤더 */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">관리자 대시보드</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {activeTab === "kanban" 
              ? `${myTasks.length}개의 Task` 
              : `${filteredProjects.length}개의 프로젝트`}
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            프로젝트 생성
          </Button>
        )}
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
        <TabsList>
          <TabsTrigger value="kanban">칸반 보드</TabsTrigger>
          <TabsTrigger value="projects">전체 프로젝트</TabsTrigger>
        </TabsList>

        {/* 칸반 보드 탭 */}
        <TabsContent value="kanban" className="space-y-4">
          <KanbanBoardWithProjects
            tasks={myTasks}
            projects={allProjects}
            currentUserId={currentProfile?.id}
            isAdmin={isAdmin}
            onTaskStatusChange={handleTaskStatusChange}
            statusFilter={kanbanStatusFilter}
            onStatusFilterChange={handleKanbanStatusFilterChange}
          />
        </TabsContent>

        {/* 전체 프로젝트 탭 */}
        <TabsContent value="projects" className="space-y-4">
          {/* 검색 및 필터 */}
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <Input
                placeholder="프로젝트 제목, 고객명으로 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2">
              <Select
                value={sortOrder}
                onValueChange={(value) => setSortOrder(value as SortOrder)}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="정렬" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">최신순</SelectItem>
                  <SelectItem value="oldest">오래된순</SelectItem>
                  <SelectItem value="dueDateNewest">완료예정일 최신순</SelectItem>
                  <SelectItem value="dueDateOldest">완료예정일 오래된순</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 프로젝트 테이블 */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>제목</TableHead>
                  <TableHead>클라이언트</TableHead>
                  <TableHead>총 Task</TableHead>
                  <TableHead>기여중인 Task</TableHead>
                  <TableHead>기여한 Task</TableHead>
                  <TableHead>완료예정일</TableHead>
                  <TableHead>생성일</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedProjects.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-muted-foreground h-24 text-center">
                      {debouncedSearch ? "검색 결과가 없습니다." : "프로젝트가 없습니다."}
                    </TableCell>
                  </TableRow>
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
              </TableBody>
            </Table>
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
                setCurrentPage(1);
              }}
            />
          )}
        </TabsContent>
      </Tabs>

      {/* 프로젝트 생성 다이얼로그 */}
      <ProjectFormDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSubmit={handleCreateProject}
        isLoading={createProject.isPending}
        isAdmin={isAdmin}
      />

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
  currentUserId 
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
        (task) => task.assigner_id === currentUserId || task.assignee_id === currentUserId
      )
    : [];
  
  // 기여중인 Task (진행중: ASSIGNED + IN_PROGRESS + WAITING_CONFIRM + REJECTED)
  const contributingTasks = myProjectTasks.filter(
    (task) => task.task_status !== "APPROVED"
  ).length;

  // 기여한 Task (승인됨: APPROVED)
  const contributedTasks = myProjectTasks.filter(
    (task) => task.task_status === "APPROVED"
  ).length;

  return (
    <TableRow className="hover:bg-muted/50">
      <TableCell className="font-medium">
        <Link 
          to={`/projects/${project.id}`} 
          className="hover:underline"
          onClick={() => {
            // 프로젝트 상세로 이동하기 전에 현재 대시보드 URL 저장
            const currentUrl = window.location.pathname + window.location.search;
            sessionStorage.setItem("previousDashboardUrl", currentUrl);
          }}
        >
          {project.title}
        </Link>
      </TableCell>
      <TableCell>{project.client_name}</TableCell>
      <TableCell>
        {isLoading ? (
          <DefaultSpinner />
        ) : (
          totalTasks
        )}
      </TableCell>
      <TableCell>{contributingTasks}</TableCell>
      <TableCell>{contributedTasks}</TableCell>
      <TableCell>{project.due_date ? formatDate(project.due_date) : "-"}</TableCell>
      <TableCell>{formatDate(project.created_at)}</TableCell>
    </TableRow>
  );
}

