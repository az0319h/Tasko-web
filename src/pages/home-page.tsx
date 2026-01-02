import React, { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getProjects,
  getProjectStats,
  type Project,
  type ProjectsQueryOptions,
} from "@/api/projects";
import { useIsAdmin } from "@/hooks/queries/use-is-admin";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import ProjectSearch from "@/components/project/project-search";
import ProjectFilters, {
  ProjectFiltersummary,
  type ProjectFilters as ProjectFiltersType,
} from "@/components/project/project-filters";
import ProjectFormDialog from "@/components/project/project-form-dialog";
import ProjectDeleteDialog from "@/components/project/project-delete-dialog";
import ProjectStatusToggle from "@/components/project/project-status-toggle";
import {
  Plus,
  Calendar,
  Building2,
  FileText,
  CheckCircle,
  Clock,
  AlertTriangle,
  Edit,
  Trash2,
  MoreHorizontal,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// 프로젝트 상태 배지 컴포넌트
const ProjectStatusBadge: React.FC<{ status: Project["status"] }> = ({ status }) => {
  const statusConfig = {
    inProgress: {
      label: "진행중",
      variant: "default" as const,
      icon: Clock,
      className: "bg-blue-100 text-blue-800 border-blue-200",
    },
    done: {
      label: "완료",
      variant: "secondary" as const,
      icon: CheckCircle,
      className: "bg-green-100 text-green-800 border-green-200",
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className={config.className}>
      <Icon className="mr-1 h-3 w-3" />
      {config.label}
    </Badge>
  );
};

// 마감일 표시 컴포넌트
const DueDateDisplay: React.FC<{ dueDate?: string; status: Project["status"] }> = ({
  dueDate,
  status,
}) => {
  if (!dueDate) {
    return <span className="text-gray-400">-</span>;
  }

  const date = new Date(dueDate);
  const now = new Date();
  const isOverdue = status === "inProgress" && date < now;
  const isUpcoming =
    status === "inProgress" &&
    date > now &&
    date <= new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  return (
    <div className="flex items-center gap-1">
      <Calendar className="h-4 w-4 text-gray-400" />
      <span
        className={`text-sm ${
          isOverdue ? "font-medium text-red-600" : isUpcoming ? "text-orange-600" : "text-gray-600"
        }`}
      >
        {date.toLocaleDateString("ko-KR")}
      </span>
      {isOverdue && <AlertTriangle className="h-4 w-4 text-red-500" />}
    </div>
  );
};

// 통계 카드 컴포넌트
const StatsCard: React.FC<{
  title: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}> = ({ title, value, icon: Icon, color }) => (
  <Card className="p-4">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-gray-600">{title}</p>
        <p className="text-2xl font-bold">{value}</p>
      </div>
      <div className={`rounded-lg p-2 ${color}`}>
        <Icon className="h-6 w-6 text-white" />
      </div>
    </div>
  </Card>
);

// 메인 홈 페이지 컴포넌트
const HomePage: React.FC = () => {
  // 상태 관리
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<ProjectFiltersType>({
    status: "all",
    sortBy: "created_at",
    sortOrder: "desc",
  });

  // 권한 조회
  const { data: isAdmin, isLoading: isAdminLoading } = useIsAdmin();

  // 검색 옵션 메모이제이션
  const queryOptions: ProjectsQueryOptions = useMemo(
    () => ({
      search: searchQuery || undefined,
      status: filters.status,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
    }),
    [searchQuery, filters],
  );

  // 프로젝트 목록 조회
  const {
    data: projects = [],
    isLoading: projectsLoading,
    error: projectsError,
    refetch: refetchProjects,
  } = useQuery({
    queryKey: ["projects", queryOptions],
    queryFn: () => getProjects(queryOptions),
    staleTime: 5 * 60 * 1000, // 5분
  });

  // 프로젝트 통계 조회
  const {
    data: stats = { total: 0, inProgress: 0, done: 0, overdue: 0 },
    isLoading: statsLoading,
  } = useQuery({
    queryKey: ["project-stats"],
    queryFn: getProjectStats,
    staleTime: 10 * 60 * 1000, // 10분
  });

  // 검색어 변경 핸들러
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
  };

  // 필터 변경 핸들러
  const handleFiltersChange = (newFilters: ProjectFiltersType) => {
    setFilters(newFilters);
  };

  // 로딩 상태
  if (isAdminLoading || projectsLoading || statsLoading) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="mb-2 h-8 w-48" />
            <Skeleton className="h-4 w-96" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>

        {/* 통계 카드 스켈레톤 */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="p-4">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-8 w-12" />
                </div>
                <Skeleton className="h-10 w-10 rounded-lg" />
              </div>
            </Card>
          ))}
        </div>

        {/* 검색 및 필터 스켈레톤 */}
        <div className="flex gap-4">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-32" />
        </div>

        {/* 테이블 스켈레톤 */}
        <Card>
          <div className="space-y-4 p-6">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center space-x-4">
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  // 에러 상태
  if (projectsError) {
    return (
      <div className="p-6">
        <Card className="p-8 text-center">
          <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-red-500" />
          <h2 className="mb-2 text-lg font-semibold text-gray-900">
            프로젝트를 불러올 수 없습니다
          </h2>
          <p className="mb-4 text-gray-600">잠시 후 다시 시도해주세요.</p>
          <Button onClick={() => refetchProjects()}>다시 시도</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">프로젝트 대시보드</h1>
          <p className="mt-1">
            {isAdmin
              ? "모든 프로젝트를 관리하고 모니터링하세요."
              : "참여 중인 프로젝트를 확인하세요."}
          </p>
        </div>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard title="전체 프로젝트" value={stats.total} icon={FileText} color="bg-blue-500" />
        <StatsCard title="진행 중" value={stats.inProgress} icon={Clock} color="bg-orange-500" />
        <StatsCard title="완료됨" value={stats.done} icon={CheckCircle} color="bg-green-500" />
        <StatsCard title="지연됨" value={stats.overdue} icon={AlertTriangle} color="bg-red-500" />
      </div>

      {/* 검색 및 필터 */}
      <div className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row">
          <div className="flex-1">
            <ProjectSearch
              value={searchQuery}
              onChange={handleSearchChange}
              isLoading={projectsLoading}
              placeholder="프로젝트 제목, 클라이언트명, 특허명으로 검색..."
            />
          </div>
          <div className="flex-shrink-0">
            <ProjectFilters
              filters={filters}
              onFiltersChange={handleFiltersChange}
              resultCount={projects.length}
            />
          </div>
        </div>

        {/* 필터 요약 */}
        <ProjectFiltersummary
          filters={filters}
          searchQuery={searchQuery}
          resultCount={projects.length}
        />
      </div>

      {/* 프로젝트 테이블 */}
      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => {
                    if (filters.sortBy === "title") {
                      setFilters({
                        ...filters,
                        sortOrder: filters.sortOrder === "asc" ? "desc" : "asc",
                      });
                    } else {
                      setFilters({
                        ...filters,
                        sortBy: "title",
                        sortOrder: "asc",
                      });
                    }
                  }}
                >
                  <div className="flex items-center gap-1">
                    <FileText className="h-4 w-4" />
                    프로젝트 제목
                    {filters.sortBy === "title" && (
                      <span className="text-xs">{filters.sortOrder === "asc" ? "↑" : "↓"}</span>
                    )}
                  </div>
                </TableHead>
                <TableHead>
                  <div className="flex items-center gap-1">
                    <Building2 className="h-4 w-4" />
                    클라이언트
                  </div>
                </TableHead>
                <TableHead>특허명</TableHead>
                <TableHead>상태</TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => {
                    if (filters.sortBy === "due_date") {
                      setFilters({
                        ...filters,
                        sortOrder: filters.sortOrder === "asc" ? "desc" : "asc",
                      });
                    } else {
                      setFilters({
                        ...filters,
                        sortBy: "due_date",
                        sortOrder: "asc",
                      });
                    }
                  }}
                >
                  완료예정일
                  {filters.sortBy === "due_date" && (
                    <span className="ml-1 text-xs">{filters.sortOrder === "asc" ? "↑" : "↓"}</span>
                  )}
                </TableHead>
                {isAdmin && <TableHead className="w-[70px]">액션</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 6 : 5} className="py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <FileText className="h-12 w-12 text-gray-300" />
                      <p className="text-gray-500">
                        {searchQuery ? "검색 결과가 없습니다." : "프로젝트가 없습니다."}
                      </p>
                      {searchQuery && (
                        <Button variant="outline" size="sm" onClick={() => setSearchQuery("")}>
                          검색 초기화
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                projects.map((project) => (
                  <TableRow
                    key={project.id}
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => {
                      // 프로젝트 상세 페이지로 이동
                      console.log("Navigate to project:", project.id);
                    }}
                  >
                    <TableCell>
                      <div>
                        <p className="font-medium text-gray-900">{project.title}</p>
                        <p className="text-sm text-gray-500">
                          생성일: {project.created_at ? new Date(project.created_at).toLocaleDateString("ko-KR") : '-'}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{project.client_name}</p>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm text-gray-600">{project.patent_name || "-"}</p>
                    </TableCell>
                    <TableCell>
                      {isAdmin ? (
                        <ProjectStatusToggle
                          project={project}
                          variant="badge"
                          onSuccess={() => refetchProjects()}
                        />
                      ) : (
                        <ProjectStatusBadge status={project.status} />
                      )}
                    </TableCell>
                    <TableCell>
                      <DueDateDisplay dueDate={project.due_date ?? undefined} status={project.status} />
                    </TableCell>
                    {isAdmin && (
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              className="h-8 w-8 p-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <ProjectFormDialog
                              mode="edit"
                              project={project}
                              onSuccess={() => refetchProjects()}
                              trigger={
                                <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                                  <Edit className="mr-2 h-4 w-4" />
                                  수정
                                </DropdownMenuItem>
                              }
                            />
                            <ProjectDeleteDialog
                              project={project}
                              onSuccess={() => refetchProjects()}
                              trigger={
                                <DropdownMenuItem
                                  className="text-red-600"
                                  onSelect={(e) => e.preventDefault()}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  삭제
                                </DropdownMenuItem>
                              }
                            />
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* 결과 개수 표시 */}
      {projects.length > 0 && (
        <div className="text-center text-sm text-gray-500">
          총 {projects.length}개의 프로젝트
          {searchQuery && ` (검색: "${searchQuery}")`}
        </div>
      )}
    </div>
  );
};

export default HomePage;
