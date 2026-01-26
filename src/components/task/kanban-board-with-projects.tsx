import { useState, useMemo } from "react";
import { Search, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CategoryTaskListModal } from "./category-task-list-modal";
import { TaskCard } from "./task-card";
import type { TaskWithProfiles } from "@/api/task";
import type { TaskStatus } from "@/lib/task-status";

type TaskCategory = "REVIEW" | "REVISION" | "CONTRACT" | "SPECIFICATION" | "APPLICATION";
type RoleFilter = "ALL" | "MY_ASSIGNER" | "MY_ASSIGNEE" | "MY_TASKS";
type SortOrder = "dueDateAsc" | "dueDateDesc" | "createdAt";

interface KanbanBoardWithProjectsProps {
  tasks: TaskWithProfiles[];
  currentUserId?: string;
  isAdmin?: boolean;
  onTaskStatusChange?: (taskId: string, newStatus: TaskStatus) => void;
  statusFilter?: TaskStatus | "ALL";
  onStatusFilterChange?: (status: TaskStatus | "ALL") => void;
}

const CATEGORIES: { value: TaskCategory; label: string }[] = [
  { value: "REVIEW", label: "검토" },
  { value: "REVISION", label: "수정" },
  { value: "CONTRACT", label: "계약" },
  { value: "SPECIFICATION", label: "명세서" },
  { value: "APPLICATION", label: "출원" },
];

const STATUS_OPTIONS: { value: TaskStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "전체" },
  { value: "ASSIGNED", label: "할당됨" },
  { value: "IN_PROGRESS", label: "진행 중" },
  { value: "WAITING_CONFIRM", label: "확인 대기" },
  { value: "REJECTED", label: "거부됨" },
];

const ROLE_FILTER_OPTIONS: { value: RoleFilter; label: string }[] = [
  { value: "ALL", label: "전체" },
  { value: "MY_ASSIGNER", label: "내가 지시자" },
  { value: "MY_ASSIGNEE", label: "내가 담당자" },
  { value: "MY_TASKS", label: "내가 관련된 Task" },
];

const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: "dueDateAsc", label: "마감일 빠른 순" },
  { value: "dueDateDesc", label: "마감일 느린 순" },
  { value: "createdAt", label: "생성일 순" },
];

/**
 * 카테고리별로 그룹화된 칸반 보드 컴포넌트
 * 프로젝트 구조 제거 후 태스크 중심 구조로 변경
 * 카테고리별로 Task를 그룹화하여 표시
 */
export function KanbanBoardWithProjects({
  tasks,
  currentUserId,
  isAdmin = false,
  onTaskStatusChange,
  statusFilter: externalStatusFilter,
  onStatusFilterChange,
}: KanbanBoardWithProjectsProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [internalStatusFilter, setInternalStatusFilter] = useState<TaskStatus | "ALL">("ALL");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("ALL");
  const [sortOrder, setSortOrder] = useState<SortOrder>("dueDateAsc");
  const [openModalCategory, setOpenModalCategory] = useState<TaskCategory | null>(null);

  // 외부에서 전달된 필터가 있으면 사용, 없으면 내부 state 사용
  const statusFilter = externalStatusFilter !== undefined ? externalStatusFilter : internalStatusFilter;

  // 상태 필터 변경 핸들러
  const handleStatusFilterChange = (value: TaskStatus | "ALL") => {
    if (onStatusFilterChange) {
      onStatusFilterChange(value);
    } else {
      setInternalStatusFilter(value);
    }
  };

  // 1단계: 역할 필터 적용 (지시자/담당자)
  const roleFilteredTasks = useMemo(() => {
    if (!currentUserId || roleFilter === "ALL") return tasks;

    return tasks.filter((task) => {
      switch (roleFilter) {
        case "MY_ASSIGNER":
          return task.assigner_id === currentUserId;
        case "MY_ASSIGNEE":
          return task.assignee_id === currentUserId;
        case "MY_TASKS":
          return task.assigner_id === currentUserId || task.assignee_id === currentUserId;
        default:
          return true;
      }
    });
  }, [tasks, roleFilter, currentUserId]);

  // 2단계: 상태 필터 적용
  const statusFilteredTasks = useMemo(() => {
    if (statusFilter === "ALL") return roleFilteredTasks;
    return roleFilteredTasks.filter((task) => task.task_status === statusFilter);
  }, [roleFilteredTasks, statusFilter]);

  // 3단계: 검색 필터링
  const searchedTasks = useMemo(() => {
    if (!searchQuery.trim()) return statusFilteredTasks;

    const query = searchQuery.toLowerCase();
    return statusFilteredTasks.filter((task) => {
      const titleMatch = task.title.toLowerCase().includes(query);
      const assigneeName = (task.assignee?.full_name || task.assignee?.email || "").toLowerCase();
      const assigneeMatch = assigneeName.includes(query);
      const assignerName = (task.assigner?.full_name || task.assigner?.email || "").toLowerCase();
      const assignerMatch = assignerName.includes(query);
      const clientNameMatch = (task.client_name || "").toLowerCase().includes(query);
      
      return titleMatch || assigneeMatch || assignerMatch || clientNameMatch;
    });
  }, [statusFilteredTasks, searchQuery]);

  // 4단계: 정렬 적용
  const filteredTasks = useMemo(() => {
    const sorted = [...searchedTasks];

    sorted.sort((a, b) => {
      if (sortOrder === "dueDateAsc") {
        // 마감일 빠른 순: 마감일이 없는 Task는 뒤로
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      } else if (sortOrder === "dueDateDesc") {
        // 마감일 느린 순: 마감일이 없는 Task는 뒤로
        if (!a.due_date && !b.due_date) return 0;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return new Date(b.due_date).getTime() - new Date(a.due_date).getTime();
      } else {
        // 생성일 순
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });

    return sorted;
  }, [searchedTasks, sortOrder]);

  // 카테고리별 Task 그룹화
  const tasksByCategory = useMemo(() => {
    const grouped: Record<TaskCategory, TaskWithProfiles[]> = {
      REVIEW: [],
      REVISION: [],
      CONTRACT: [],
      SPECIFICATION: [],
      APPLICATION: [],
    };

    filteredTasks.forEach((task) => {
      const category = task.task_category as TaskCategory;
      if (category && category in grouped) {
        grouped[category].push(task);
      }
    });

    return grouped;
  }, [filteredTasks]);

  // 카테고리별 Task 개수 계산
  const categoryData = useMemo(() => {
    const data: Record<TaskCategory, { taskCount: number }> = {
      REVIEW: { taskCount: 0 },
      REVISION: { taskCount: 0 },
      CONTRACT: { taskCount: 0 },
      SPECIFICATION: { taskCount: 0 },
      APPLICATION: { taskCount: 0 },
    };

    CATEGORIES.forEach((category) => {
      data[category.value] = {
        taskCount: tasksByCategory[category.value].length,
      };
    });

    return data;
  }, [tasksByCategory]);

  // 역할 필터별 Task 개수 계산
  const roleFilterCounts = useMemo(() => {
    if (!currentUserId) return {};

    return {
      MY_ASSIGNER: tasks.filter((t) => t.assigner_id === currentUserId).length,
      MY_ASSIGNEE: tasks.filter((t) => t.assignee_id === currentUserId).length,
      MY_TASKS: tasks.filter(
        (t) => t.assigner_id === currentUserId || t.assignee_id === currentUserId,
      ).length,
    };
  }, [tasks, currentUserId]);


  return (
    <div className="space-y-4">
      {/* 역할 필터 */}
      {currentUserId && (
        <Tabs value={roleFilter} onValueChange={(value) => setRoleFilter(value as RoleFilter)}>
          <TabsList className="grid w-full grid-cols-4">
            {ROLE_FILTER_OPTIONS.map((option) => {
              const count =
                option.value === "ALL"
                  ? tasks.length
                  : roleFilterCounts[option.value as keyof typeof roleFilterCounts] || 0;
              return (
                <TabsTrigger key={option.value} value={option.value} className="text-xs">
                  {option.label}
                  {count > 0 && <span className="ml-1 text-xs opacity-70">({count})</span>}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
      )}

      {/* 상태 필터 */}
      <Tabs
        value={statusFilter}
        onValueChange={(value) => handleStatusFilterChange(value as TaskStatus | "ALL")}
      >
        <TabsList className="grid w-full grid-cols-5">
          {STATUS_OPTIONS.map((option) => (
            <TabsTrigger key={option.value} value={option.value} className="text-xs">
              {option.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* 검색 바 및 정렬 */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="계정 ID, Task 제목, 담당자명 또는 지시자명으로 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={sortOrder} onValueChange={(value) => setSortOrder(value as SortOrder)}>
          <SelectTrigger className="w-full md:w-[180px]">
            <SelectValue placeholder="정렬" />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 칸반 보드 - 카테고리별 컬럼 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 overflow-x-auto pb-4">
        {CATEGORIES.map((category) => {
          const { taskCount } = categoryData[category.value];
          const categoryTasks = tasksByCategory[category.value];

          return (
            <div
              key={category.value}
              className="flex flex-col min-w-[280px] bg-muted/30 rounded-lg p-4"
            >
              {/* 컬럼 헤더 */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-sm">{category.label}</h3>
                  <span className="text-xs text-muted-foreground bg-background px-2 py-0.5 rounded-full">
                    {taskCount}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setOpenModalCategory(category.value)}
                  title={`${category.label} 카테고리의 모든 Task 보기`}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {/* Task 카드 목록 */}
              <div className="space-y-3 flex-1 overflow-y-auto max-h-[calc(100vh-300px)]">
                {categoryTasks.length === 0 ? (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    Task가 없습니다
                  </div>
                ) : (
                  categoryTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      currentUserId={currentUserId}
                      isAdmin={isAdmin}
                      onStatusChange={onTaskStatusChange}
                      showActions={true}
                      showFullInfo={false}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 카테고리별 Task 목록 모달 */}
      {CATEGORIES.map((category) => (
        <CategoryTaskListModal
          key={category.value}
          open={openModalCategory === category.value}
          onOpenChange={(open) => {
            if (!open) {
              setOpenModalCategory(null);
            } else {
              setOpenModalCategory(category.value);
            }
          }}
          category={category.value}
          tasks={tasksByCategory[category.value]}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          onTaskStatusChange={onTaskStatusChange}
        />
      ))}
    </div>
  );
}

