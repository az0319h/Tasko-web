import { useState, useMemo, useEffect } from "react";
import { Link, useSearchParams } from "react-router";
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
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CustomDropdown, CustomDropdownItem } from "@/components/common/custom-dropdown";
import DefaultSpinner from "@/components/common/default-spinner";
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
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: projects, isLoading } = useProjects();
  const { data: isAdmin } = useIsAdmin();
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();

  // 다이얼로그 상태
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  // URL에서 필터 상태 읽기
  const searchQuery = searchParams.get("search") || "";
  const statusFilter = (searchParams.get("status") || "all") as ProjectStatusFilter;
  const sortOrder = (searchParams.get("sort") || "newest") as SortOrder;

  // 로컬 상태
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const debouncedSearch = useDebounce(localSearch, 300);

  // 페이지네이션 상태
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // URL 업데이트
  const updateSearchParams = (updates: {
    search?: string;
    status?: ProjectStatusFilter;
    sort?: SortOrder;
  }) => {
    const newParams = new URLSearchParams(searchParams);
    
    if (updates.search !== undefined) {
      if (updates.search) {
        newParams.set("search", updates.search);
      } else {
        newParams.delete("search");
      }
    }
    
    if (updates.status !== undefined) {
      if (updates.status === "all") {
        newParams.delete("status");
      } else {
        newParams.set("status", updates.status);
      }
    }
    
    if (updates.sort !== undefined) {
      if (updates.sort === "newest") {
        newParams.delete("sort");
      } else {
        newParams.set("sort", updates.sort);
      }
    }
    
    setSearchParams(newParams, { replace: true });
  };

  // debounced 검색어를 URL에 반영
  useEffect(() => {
    if (debouncedSearch !== searchQuery) {
      updateSearchParams({ search: debouncedSearch });
    }
  }, [debouncedSearch, searchQuery]);

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

  // 필터링 및 정렬된 프로젝트 목록
  const filteredProjects = useMemo(() => {
    if (!projects) return [];

    let filtered = [...projects];

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
  }, [projects, debouncedSearch, statusFilter, sortOrder]);

  // 페이지네이션된 프로젝트 목록
  const paginatedProjects = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredProjects.slice(startIndex, endIndex);
  }, [filteredProjects, currentPage]);

  // 총 페이지 수
  const totalPages = Math.ceil(filteredProjects.length / itemsPerPage);

  // 페이지 변경 시 URL 업데이트
  useEffect(() => {
    const pageParam = searchParams.get("page");
    const page = pageParam ? parseInt(pageParam, 10) : 1;
    if (page !== currentPage && page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    } else if (pageParam && (page < 1 || page > totalPages)) {
      // 잘못된 페이지 번호면 1페이지로 리다이렉트
      const newParams = new URLSearchParams(searchParams);
      newParams.delete("page");
      setSearchParams(newParams, { replace: true });
      setCurrentPage(1);
    }
  }, [searchParams, totalPages, currentPage, setSearchParams]);

  // 필터/검색 변경 시 1페이지로 리셋
  useEffect(() => {
    setCurrentPage(1);
    const newParams = new URLSearchParams(searchParams);
    newParams.delete("page");
    setSearchParams(newParams, { replace: true });
  }, [debouncedSearch, statusFilter, sortOrder, setSearchParams]);

  // 페이지 변경 핸들러
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    const newParams = new URLSearchParams(searchParams);
    if (page === 1) {
      newParams.delete("page");
    } else {
      newParams.set("page", page.toString());
    }
    setSearchParams(newParams, { replace: true });
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
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Select
            value={statusFilter}
            onValueChange={(value) =>
              updateSearchParams({ status: value as ProjectStatusFilter })
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
              updateSearchParams({ sort: value as SortOrder })
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
      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
              />
            </PaginationItem>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
              // 처음 3페이지, 마지막 3페이지, 현재 페이지 주변만 표시
              if (
                page === 1 ||
                page === totalPages ||
                (page >= currentPage - 1 && page <= currentPage + 1)
              ) {
                return (
                  <PaginationItem key={page}>
                    <PaginationLink
                      onClick={() => handlePageChange(page)}
                      isActive={page === currentPage}
                    >
                      {page}
                    </PaginationLink>
                  </PaginationItem>
                );
              } else if (
                page === currentPage - 2 ||
                page === currentPage + 2
              ) {
                return (
                  <PaginationItem key={page}>
                    <span className="flex h-9 w-9 items-center justify-center">
                      ...
                    </span>
                  </PaginationItem>
                );
              }
              return null;
            })}
            <PaginationItem>
              <PaginationNext
                onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
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
