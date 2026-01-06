import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router";
import { Search, Plus, Filter, Pencil, Trash2 } from "lucide-react";
import {
  useProjects,
  useIsAdmin,
  useCreateProject,
  useUpdateProject,
  useDeleteProject,
} from "@/hooks";
import { useDebounce } from "@/hooks";
import { ProjectStatusBadge } from "@/components/common/project-status-badge";
import { ProjectFormDialog } from "@/components/project/project-form-dialog";
import { ProjectDeleteDialog } from "@/components/project/project-delete-dialog";
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
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CustomDropdown, CustomDropdownItem } from "@/components/common/custom-dropdown";
import DefaultSpinner from "@/components/common/default-spinner";
import { TablePagination } from "@/components/common/table-pagination";
import type { Project } from "@/api/project";
import type { ProjectFormData } from "@/schemas/project/project-schema";

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

type ProjectStatusFilter = "all" | "inProgress" | "done";
type SortOrder = "newest" | "oldest";

/**
 * 홈 대시보드 - 프로젝트 목록 페이지
 */
export default function IndexPage() {
  // 전체 데이터 fetch (최초 1회만)
  const { data: allProjects = [], isLoading } = useProjects();
  const { data: isAdmin } = useIsAdmin();
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();

  // 다이얼로그 상태
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  // 검색 및 필터 상태 (로컬 상태)
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProjectStatusFilter>("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("newest");
  
  // 페이지네이션 상태
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  
  // 검색어 debounce (서버 재요청 없이 로컬 상태만)
  const debouncedSearch = useDebounce(searchQuery, 300);

  // 프로젝트 생성 핸들러
  const handleCreateProject = async (data: ProjectFormData) => {
    await createProject.mutateAsync({
      title: data.title,
      client_name: data.client_name,
      patent_name: data.patent_name,
      due_date: data.due_date || null,
      is_public: data.is_public,
      // Admin만 상태 지정 가능 (기본값은 inProgress)
      status: (isAdmin && data.status) || "inProgress",
    });
    setCreateDialogOpen(false);
  };

  // 프로젝트 수정 핸들러
  const handleUpdateProject = async (data: ProjectFormData) => {
    if (!selectedProject) return;
    try {
      await updateProject.mutateAsync({
        id: selectedProject.id,
        updates: {
          title: data.title,
          client_name: data.client_name,
          patent_name: data.patent_name,
          due_date: data.due_date || null,
          is_public: data.is_public,
          // Admin만 상태 변경 가능
          ...(isAdmin && data.status ? { status: data.status } : {}),
        },
      });
      // 성공 시 다이얼로그는 ProjectFormDialog에서 닫힘
      setSelectedProject(null);
    } catch (error) {
      // 에러는 mutation의 onError에서 처리됨
      // 다이얼로그는 열어둠 (사용자가 재시도할 수 있도록)
    }
  };

  // 다이얼로그가 닫힐 때 selectedProject 초기화
  const handleEditDialogClose = (open: boolean) => {
    setEditDialogOpen(open);
    if (!open) {
      setSelectedProject(null);
    }
  };

  // 프로젝트 삭제 핸들러
  const handleDeleteProject = async () => {
    if (!selectedProject) return;
    await deleteProject.mutateAsync(selectedProject.id);
    setDeleteDialogOpen(false);
    setSelectedProject(null);
  };

  // 수정 다이얼로그 열기 (드롭다운에서 호출)
  const handleEditClick = (project: Project) => {
    // 드롭다운은 CustomDropdownItem의 onClose에서 자동으로 닫힘
    setSelectedProject(project);
    setEditDialogOpen(true);
  };

  // 삭제 다이얼로그 열기 (드롭다운에서 호출)
  const handleDeleteClick = (project: Project) => {
    // 드롭다운은 CustomDropdownItem의 onClose에서 자동으로 닫힘
    setSelectedProject(project);
    setDeleteDialogOpen(true);
  };

  // 클라이언트 사이드 필터링 및 정렬 (useMemo로 최적화)
  const filteredProjects = useMemo(() => {
    let filtered = [...allProjects];

    // 검색 필터
    if (debouncedSearch) {
      const searchLower = debouncedSearch.toLowerCase();
      filtered = filtered.filter(
        (project) =>
          project.title.toLowerCase().includes(searchLower) ||
          project.client_name.toLowerCase().includes(searchLower) ||
          project.patent_name.toLowerCase().includes(searchLower)
      );
    }

    // 상태 필터
    if (statusFilter !== "all") {
      filtered = filtered.filter((project) => project.status === statusFilter);
    }

    // 정렬
    filtered.sort((a, b) => {
      if (sortOrder === "newest") {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      } else {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
    });

    return filtered;
  }, [allProjects, debouncedSearch, statusFilter, sortOrder]);

  // 클라이언트 사이드 페이지네이션 (slice 방식)
  const paginatedProjects = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredProjects.slice(startIndex, endIndex);
  }, [filteredProjects, currentPage, itemsPerPage]);

  // 총 페이지 수
  const totalPages = Math.ceil(filteredProjects.length / itemsPerPage) || 1;

  // 검색어/필터 변경 시 1페이지로 리셋
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, statusFilter, sortOrder]);

  // 잘못된 페이지 번호 체크 및 리셋
  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      setCurrentPage(1);
    }
  }, [currentPage, totalPages]);

  // 검색어 변경 핸들러
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    // useEffect에서 자동으로 페이지 리셋됨
  };

  // 상태 필터 변경 핸들러
  const handleStatusFilterChange = (value: ProjectStatusFilter) => {
    setStatusFilter(value);
    // useEffect에서 자동으로 페이지 리셋됨
  };

  // 정렬 변경 핸들러
  const handleSortOrderChange = (value: SortOrder) => {
    setSortOrder(value);
    // useEffect에서 자동으로 페이지 리셋됨
  };

  // 페이지 변경 핸들러
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  // 페이지 크기 변경 핸들러
  const handlePageSizeChange = (newPageSize: number) => {
    setItemsPerPage(newPageSize);
    setCurrentPage(1); // 페이지 크기 변경 시 1페이지로
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <DefaultSpinner />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4">
      {/* 헤더 및 액션 */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">프로젝트 목록</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {filteredProjects.length}개의 프로젝트
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            프로젝트 생성
          </Button>
        )}
      </div>

      {/* 검색 및 필터 */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="프로젝트 제목, 클라이언트명, 특허명으로 검색..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Select
            value={statusFilter}
            onValueChange={(value) =>
              handleStatusFilterChange(value as ProjectStatusFilter)
            }
          >
            <SelectTrigger className="w-[140px]">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue placeholder="상태 필터" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              <SelectItem value="inProgress">진행 중</SelectItem>
              <SelectItem value="done">완료</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={sortOrder}
            onValueChange={(value) =>
              handleSortOrderChange(value as SortOrder)
            }
          >
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
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>제목</TableHead>
              <TableHead>클라이언트</TableHead>
              <TableHead>특허명</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>완료예정일</TableHead>
              <TableHead>생성일</TableHead>
              <TableHead>공개 여부</TableHead>
              {isAdmin && <TableHead className="w-[50px]"></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedProjects.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={isAdmin ? 8 : 7}
                  className="h-24 text-center text-muted-foreground"
                >
                  {debouncedSearch || statusFilter !== "all"
                    ? "검색 결과가 없습니다."
                    : "프로젝트가 없습니다."}
                </TableCell>
              </TableRow>
            ) : (
              paginatedProjects.map((project) => (
                <ProjectTableRow
                  key={project.id}
                  project={project}
                  isAdmin={isAdmin}
                  onEdit={handleEditClick}
                  onDelete={handleDeleteClick}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* 프로젝트 생성 다이얼로그 */}
      <ProjectFormDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSubmit={handleCreateProject}
        isLoading={createProject.isPending}
        isAdmin={isAdmin}
      />

      {/* 프로젝트 수정 다이얼로그 */}
      <ProjectFormDialog
        open={editDialogOpen}
        onOpenChange={handleEditDialogClose}
        onSubmit={handleUpdateProject}
        project={selectedProject}
        isLoading={updateProject.isPending}
        isAdmin={isAdmin}
      />

      {/* 페이지네이션 */}
      {filteredProjects.length > 0 && (
        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          pageSize={itemsPerPage}
          totalItems={filteredProjects.length}
          selectedCount={selectedRows.size}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
        />
      )}

      {/* 프로젝트 삭제 다이얼로그 */}
      <ProjectDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        project={selectedProject}
        onConfirm={handleDeleteProject}
        isLoading={deleteProject.isPending}
      />
    </div>
  );
}

/**
 * 프로젝트 테이블 행 컴포넌트
 */
function ProjectTableRow({
  project,
  isAdmin,
  onEdit,
  onDelete,
}: {
  project: Project;
  isAdmin?: boolean;
  onEdit: (project: Project) => void;
  onDelete: (project: Project) => void;
}) {
  return (
    <TableRow className="hover:bg-muted/50">
      <TableCell className="font-medium">
        <Link
          to={`/projects/${project.id}`}
          className="hover:underline"
        >
          {project.title}
        </Link>
      </TableCell>
      <TableCell>{project.client_name}</TableCell>
      <TableCell className="font-mono text-sm">{project.patent_name}</TableCell>
      <TableCell>
        <ProjectStatusBadge status={project.status} />
      </TableCell>
      <TableCell>
        {project.due_date ? formatDate(project.due_date) : "-"}
      </TableCell>
      <TableCell>{formatDate(project.created_at)}</TableCell>
      <TableCell>
        <Badge variant={project.is_public ? "default" : "outline"}>
          {project.is_public ? "Public" : "Private"}
        </Badge>
      </TableCell>
      {isAdmin && (
        <TableCell>
          <CustomDropdown
            trigger={
              <Button variant="ghost" size="icon-sm">
                <span className="sr-only">메뉴 열기</span>
                <span>⋯</span>
              </Button>
            }
            align="end"
          >
            <>
              <CustomDropdownItem
                onClick={() => {
                  onEdit(project);
                }}
              >
                <Pencil className="mr-2 h-4 w-4" />
                수정
              </CustomDropdownItem>
              <CustomDropdownItem
                onClick={() => {
                  onDelete(project);
                }}
                variant="destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                삭제
              </CustomDropdownItem>
            </>
          </CustomDropdown>
        </TableCell>
      )}
    </TableRow>
  );
}
