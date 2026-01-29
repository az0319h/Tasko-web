import { useState, useMemo, useEffect, useRef } from "react";
import { Link, useSearchParams, useLocation, useNavigate } from "react-router";
import { Search, Plus, ArrowUpDown, ChevronDown, Mail, CheckCircle2, XCircle, Bell } from "lucide-react";
import { useTasksForMember, useCurrentProfile, useRealtimeDashboardMessages } from "@/hooks";
import { useDebounce } from "@/hooks";
import { TaskStatusChangeDialog } from "@/components/dialog/task-status-change-dialog";
import { useUpdateTaskStatus, useCreateTask, useUpdateTask } from "@/hooks/mutations/use-task";
import { TaskFormDialog } from "@/components/task/task-form-dialog";
import { useCreateMessageWithFiles } from "@/hooks/mutations/use-message";
import { uploadTaskFile } from "@/api/storage";
import type { TaskCreateFormData, TaskCreateSpecificationFormData } from "@/schemas/task/task-schema";
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
import { TaskStatusBadge } from "@/components/common/task-status-badge";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { TaskWithProfiles } from "@/api/task";
import { checkDueDateExceeded } from "@/api/task";
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
 * 날짜를 한국어 형식으로 포맷 (예: "1월 29일")
 */
function formatDateKorean(date: Date | string): string {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  return dateObj.toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
  });
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

type DashboardTab = "all-tasks" | "my-tasks";
type StatusParam = "all" | "assigned" | "in_progress" | "waiting_confirm" | "rejected" | "approved";
type SortDueParam = "asc" | "desc";
type SortEmailSentParam = "asc" | "desc";
type EmailSentParam = "all" | "sent" | "not_sent";
type CategoryParam = "all" | "REVIEW" | "REVISION" | "CONTRACT" | "SPECIFICATION" | "APPLICATION";

/**
 * Member 대시보드 페이지
 */
export default function MemberDashboardPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: currentProfile } = useCurrentProfile();
  // 승인된 태스크 탭: 자신이 진행한 태스크 중 승인된 것만
  const { data: allMyTasksRaw = [], isLoading: allTasksLoading } = useTasksForMember(false);
  const allMyTasks = useMemo(() => allMyTasksRaw.filter((task) => task.task_status === "APPROVED"), [allMyTasksRaw]);
  // 담당 업무 탭: 지시자/담당자인 태스크 중 승인됨이 아닌 것만
  const { data: myTasks = [], isLoading: myTasksLoading } = useTasksForMember(true);
  const updateTaskStatus = useUpdateTaskStatus();
  const updateTask = useUpdateTask();
  const createTask = useCreateTask();
  const createMessageWithFiles = useCreateMessageWithFiles();
  const [searchParams, setSearchParams] = useSearchParams();

  // 탭 상태 - URL 쿼리 파라미터에서 읽기
  const tabParam = searchParams.get("tab") as DashboardTab | null;
  const [activeTab, setActiveTab] = useState<DashboardTab>(
    tabParam === "all-tasks" || tabParam === "my-tasks" ? tabParam : "my-tasks",
  );

  // URL params 읽기 (전체 태스크 탭 및 담당 업무 탭용)
  const currentTabFromUrl = searchParams.get("tab") as DashboardTab | null;

  // 검색어는 URL params에서 읽기
  const keywordParam = searchParams.get("keyword");
  const [searchQuery, setSearchQuery] = useState(keywordParam || "");

  const sortDueParam = searchParams.get("sortDue") as SortDueParam | null;
  const sortDue: SortDueParam =
    sortDueParam === "asc" || sortDueParam === "desc" ? sortDueParam : "asc";

  const sortEmailSentParam = searchParams.get("sortEmailSent") as SortEmailSentParam | null;
  const sortEmailSent: SortEmailSentParam =
    sortEmailSentParam === "asc" || sortEmailSentParam === "desc" ? sortEmailSentParam : "asc";

  const emailSentParam = searchParams.get("emailSent") as EmailSentParam | null;
  const validEmailSentParams: EmailSentParam[] = ["all", "sent", "not_sent"];
  const emailSent: EmailSentParam =
    emailSentParam && validEmailSentParams.includes(emailSentParam) ? emailSentParam : "all";

  const categoryParam = searchParams.get("category") as CategoryParam | null;
  const validCategoryParams: CategoryParam[] = ["all", "REVIEW", "REVISION", "CONTRACT", "SPECIFICATION", "APPLICATION"];
  const category: CategoryParam =
    categoryParam && validCategoryParams.includes(categoryParam) ? categoryParam : "all";

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
  const [statusChangeDialogOpen, setStatusChangeDialogOpen] = useState(false);
  const [pendingStatusChange, setPendingStatusChange] = useState<{
    taskId: string;
    currentStatus: TaskStatus;
    newStatus: TaskStatus;
    taskTitle: string;
  } | null>(null);

  // 빠른 생성 관련 상태
  const [preSelectedCategory, setPreSelectedCategory] = useState<
    "REVIEW" | "REVISION" | "CONTRACT" | "SPECIFICATION" | "APPLICATION" | undefined
  >(undefined);
  const [autoFillMode, setAutoFillMode] = useState<
    "REVIEW" | "REVISION" | "CONTRACT" | "SPECIFICATION" | "APPLICATION" | undefined
  >(undefined);
  const [preFilledTitle, setPreFilledTitle] = useState<string | undefined>(undefined);
  const [isSpecificationMode, setIsSpecificationMode] = useState(false);
  // Task 생성 중 상태 (중복 클릭 방지)
  const [isCreatingTask, setIsCreatingTask] = useState(false);

  // 페이지네이션 상태 (전체 태스크 탭용)
  const allTasksPageParam = searchParams.get("allTasksPage");
  const allTasksCurrentPage = allTasksPageParam ? Math.max(1, parseInt(allTasksPageParam, 10)) : 1;
  const [allTasksItemsPerPage, setAllTasksItemsPerPage] = useState(() => {
    const saved = sessionStorage.getItem("tablePageSize");
    return saved ? parseInt(saved, 10) : 10;
  });

  // 페이지네이션 상태 (담당 업무 탭용) - URL에서 직접 읽기 (다른 파라미터들과 동일한 방식)
  const myTasksPageParam = searchParams.get("myTasksPage");
  const myTasksCurrentPage = myTasksPageParam ? Math.max(1, parseInt(myTasksPageParam, 10)) : 1;
  const [myTasksItemsPerPage, setMyTasksItemsPerPage] = useState(() => {
    const saved = sessionStorage.getItem("tablePageSize");
    return saved ? parseInt(saved, 10) : 10;
  });

  // 검색어 debounce
  const debouncedSearch = useDebounce(searchQuery, 300);

  // 마운트 여부 및 이전 필터 값 추적 (페이지 리셋 조건 판단용)
  const isFirstRenderRef = useRef(true);
  const prevAllTasksFiltersRef = useRef<{ search: string; category: CategoryParam; sortDue: SortDueParam; sortEmailSent: SortEmailSentParam; emailSent: EmailSentParam }>({ search: "", category: "all", sortDue: "asc", sortEmailSent: "asc", emailSent: "all" });
  const prevMyTasksFiltersRef = useRef<{ search: string; category: CategoryParam; status: StatusParam; sortDue: SortDueParam }>({ search: "", category: "all", status: "all", sortDue: "asc" });

  // 대시보드 페이지에 있을 때 현재 URL을 세션 스토리지에 저장
  useEffect(() => {
    const currentUrl = location.pathname + location.search;
    if (currentUrl === "/" || currentUrl.startsWith("/?")) {
      sessionStorage.setItem("previousDashboardUrl", currentUrl);
    }
  }, [location.pathname, location.search]);

  // URL params 업데이트 헬퍼 함수 (승인된 태스크 탭용)
  const updateAllTasksUrlParams = (
    updates?: Partial<{
      sortDue: SortDueParam;
      sortEmailSent: SortEmailSentParam;
      category: CategoryParam;
      emailSent: EmailSentParam;
      keyword?: string;
      allTasksPage?: number;
    }>,
  ) => {
    const newParams = new URLSearchParams();

    // tab 파라미터 설정 (항상 설정)
    newParams.set("tab", "all-tasks");

    // 업데이트가 제공되면 해당 값 사용, 없으면 현재 URL에서 읽은 값 사용
    const sortDueToSet = updates?.sortDue !== undefined ? updates.sortDue : sortDue;
    const sortEmailSentToSet = updates?.sortEmailSent !== undefined ? updates.sortEmailSent : sortEmailSent;
    const categoryToSet = updates?.category !== undefined ? updates.category : category;
    const emailSentToSet = updates?.emailSent !== undefined ? updates.emailSent : emailSent;
    const keywordToSet = updates?.keyword !== undefined ? updates.keyword : searchQuery;
    const allTasksPageToSet = updates?.allTasksPage !== undefined ? updates.allTasksPage : allTasksCurrentPage;

    // sortDue 설정
    if (sortDueToSet !== "asc") {
      newParams.set("sortDue", sortDueToSet);
    }

    // sortEmailSent 설정
    if (sortEmailSentToSet !== "asc") {
      newParams.set("sortEmailSent", sortEmailSentToSet);
    }

    // category 설정
    if (categoryToSet !== "all") {
      newParams.set("category", categoryToSet);
    }

    // emailSent 설정
    if (emailSentToSet !== "all") {
      newParams.set("emailSent", emailSentToSet);
    }

    // keyword 설정
    if (keywordToSet && keywordToSet.trim()) {
      newParams.set("keyword", keywordToSet);
    }

    // allTasksPage 설정
    if (allTasksPageToSet !== undefined && allTasksPageToSet !== 1) {
      newParams.set("allTasksPage", allTasksPageToSet.toString());
    }

    setSearchParams(newParams, { replace: true });
  };

  // URL params 업데이트 헬퍼 함수 (담당 업무 탭용)
  const updateMyTasksUrlParams = (
    updates?: Partial<{
      sortDue: SortDueParam;
      category: CategoryParam;
      status: StatusParam;
      keyword?: string;
      myTasksPage?: number;
    }>,
  ) => {
    const newParams = new URLSearchParams();

    // tab 파라미터 설정 (항상 설정)
    newParams.set("tab", "my-tasks");

    // 업데이트가 제공되면 해당 값 사용, 없으면 현재 URL에서 읽은 값 사용
    const sortDueToSet = updates?.sortDue !== undefined ? updates.sortDue : sortDue;
    const categoryToSet = updates?.category !== undefined ? updates.category : category;
    const statusToSet = updates?.status !== undefined ? updates.status : status;
    const keywordToSet = updates?.keyword !== undefined ? updates.keyword : searchQuery;
    const myTasksPageToSet = updates?.myTasksPage !== undefined ? updates.myTasksPage : myTasksCurrentPage;

    // sortDue 설정
    if (sortDueToSet !== "asc") {
      newParams.set("sortDue", sortDueToSet);
    }

    // category 설정
    if (categoryToSet !== "all") {
      newParams.set("category", categoryToSet);
    }

    // status 설정
    if (statusToSet !== "all") {
      newParams.set("status", statusToSet);
    }

    // keyword 설정
    if (keywordToSet && keywordToSet.trim()) {
      newParams.set("keyword", keywordToSet);
    }

    // myTasksPage 설정
    if (myTasksPageToSet !== undefined && myTasksPageToSet !== 1) {
      newParams.set("myTasksPage", myTasksPageToSet.toString());
    }

    setSearchParams(newParams, { replace: true });
  };

  // 검색어 변경 핸들러 (로컬 state 및 URL params 업데이트)
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    // 현재 활성 탭에 따라 URL params 업데이트
    if (activeTab === "all-tasks") {
      updateAllTasksUrlParams({ keyword: value });
    } else {
      updateMyTasksUrlParams({ keyword: value });
    }
  };

  // 정렬 변경 핸들러 (전체 태스크 탭용)
  const handleAllTasksSortDueChange = () => {
    const newSortDue: SortDueParam = sortDue === "asc" ? "desc" : "asc";
    updateAllTasksUrlParams({ sortDue: newSortDue });
  };

  // 이메일 발송 필터 변경 핸들러 (승인된 태스크 탭용)
  const handleAllTasksEmailSentChange = (newEmailSent: EmailSentParam) => {
    updateAllTasksUrlParams({ emailSent: newEmailSent });
  };

  // 정렬 변경 핸들러 (담당 업무 탭용)
  const handleMyTasksSortDueChange = () => {
    const newSortDue: SortDueParam = sortDue === "asc" ? "desc" : "asc";
    updateMyTasksUrlParams({ sortDue: newSortDue });
  };

  // 카테고리 필터 변경 핸들러 (승인된 태스크 탭용)
  const handleAllTasksCategoryChange = (newCategory: CategoryParam) => {
    updateAllTasksUrlParams({ category: newCategory });
  };

  // 카테고리 필터 변경 핸들러 (담당 업무 탭용)
  const handleMyTasksCategoryChange = (newCategory: CategoryParam) => {
    updateMyTasksUrlParams({ category: newCategory });
  };

  // 상태 필터 변경 핸들러 (담당 업무 탭용)
  const handleMyTasksStatusChange = (newStatus: StatusParam) => {
    updateMyTasksUrlParams({ status: newStatus });
  };

  // Task 상태 변경 핸들러
  const handleTaskStatusChange = (taskId: string, newStatus: TaskStatus) => {
    const task = activeTab === "all-tasks" 
      ? allMyTasks.find((t) => t.id === taskId)
      : myTasks.find((t) => t.id === taskId);
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
  // 고객에게 이메일 발송 완료 상태 토글 핸들러
  const handleEmailSentToggle = async (task: TaskWithProfiles, e: React.MouseEvent) => {
    e.stopPropagation(); // 행 클릭 이벤트 차단
    
    // 담당자 권한 확인
    if (task.assignee_id !== currentProfile?.id) {
      toast.error("고객에게 이메일 발송 완료 상태는 담당자만 변경할 수 있습니다.");
      return;
    }
    
    try {
      await updateTask.mutateAsync({
        id: task.id,
        updates: {
          send_email_to_client: !task.send_email_to_client,
        },
      });
    } catch (error) {
      // 에러는 훅에서 이미 처리됨
    }
  };

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

  // 빠른 생성 핸들러
  const handleQuickCreate = (
    category: "REVIEW" | "REVISION" | "CONTRACT" | "SPECIFICATION" | "APPLICATION",
    title?: string,
  ) => {
    setPreSelectedCategory(category);
    setAutoFillMode(category);

    if (category === "SPECIFICATION") {
      // 명세서 모드: 2개 Task 자동 생성
      setPreFilledTitle(undefined);
      setIsSpecificationMode(true);
    } else {
      // 일반 모드: 제목 자동 입력
      setPreFilledTitle(title);
      setIsSpecificationMode(false);
    }

    setCreateTaskDialogOpen(true);
  };

  // 명세서 모드 핸들러 (2개 Task 자동 생성)
  const handleCreateSpecificationTasks = async (
    assigneeId: string,
    clientName: string,
    files?: File[],
    notes?: string,
  ) => {
    if (!currentProfile?.id) return;

    try {
      const today = new Date();
      const year = today.getFullYear();
      const month = today.getMonth();
      const date = today.getDate();

      // Task 1: 청구안 및 도면 (오늘 + 3일)
      const dueDate1 = new Date(year, month, date + 3);
      const dueDate1Str = `${dueDate1.getFullYear()}-${String(dueDate1.getMonth() + 1).padStart(2, "0")}-${String(dueDate1.getDate()).padStart(2, "0")}`;

      // Task 2: 초안 작성 (오늘 + 10일)
      const dueDate2 = new Date(year, month, date + 10);
      const dueDate2Str = `${dueDate2.getFullYear()}-${String(dueDate2.getMonth() + 1).padStart(2, "0")}-${String(dueDate2.getDate()).padStart(2, "0")}`;

      // Task 1 생성
      const task1 = await createTask.mutateAsync({
        title: "청구안 및 도면",
        assignee_id: assigneeId,
        due_date: dueDate1Str,
        task_category: "SPECIFICATION",
        client_name: clientName,
      });

      // Task 2 생성
      const task2 = await createTask.mutateAsync({
        title: "초안 작성",
        assignee_id: assigneeId,
        due_date: dueDate2Str,
        task_category: "SPECIFICATION",
        client_name: clientName,
      });

      // 각 Task에 특이사항/파일 메시지 생성
      const createMessagesForTask = async (taskId: string, assignerId: string) => {
        const hasNotes = notes && notes.trim().length > 0;
        const hasFiles = files && files.length > 0;

        if (hasNotes || hasFiles) {
          const uploadedFiles: Array<{
            url: string;
            fileName: string;
            fileType: string;
            fileSize: number;
          }> = [];

          if (hasFiles) {
            for (const file of files) {
              try {
                const fileInfo = await uploadTaskFile(file, taskId, assignerId);
                uploadedFiles.push(fileInfo);
              } catch (error: any) {
                toast.error(`${file.name} 업로드 실패: ${error.message}`);
              }
            }
          }

          if (hasNotes || uploadedFiles.length > 0) {
            const bundleId = uploadedFiles.length > 0 ? crypto.randomUUID() : undefined;
            await createMessageWithFiles.mutateAsync({
              taskId,
              content: hasNotes ? notes.trim() : null,
              files: uploadedFiles,
              bundleId,
            });
          }
        }
      };

      await createMessagesForTask(task1.id, currentProfile.id);
      await createMessagesForTask(task2.id, currentProfile.id);

      // 마감일 초과 여부 확인 및 알림 표시 (각 Task별로 확인)
      try {
        const result1 = await checkDueDateExceeded(task1.id, dueDate1Str);
        if (result1.exceeded && result1.scheduleDate) {
          const dueDateFormatted = formatDateKorean(result1.dueDate);
          const scheduleDateFormatted = formatDateKorean(result1.scheduleDate);
          toast.warning(
            `담당자의 일정이 가득 차 있어, "청구안 및 도면" Task가 마감일(${dueDateFormatted})보다 늦은 ${scheduleDateFormatted} 일정으로 배정되었습니다.`,
            {
              position: "bottom-right",
              duration: 8000,
            }
          );
        }
      } catch (error: any) {
        console.error("마감일 체크 실패 (Task 1):", error);
      }

      try {
        const result2 = await checkDueDateExceeded(task2.id, dueDate2Str);
        if (result2.exceeded && result2.scheduleDate) {
          const dueDateFormatted = formatDateKorean(result2.dueDate);
          const scheduleDateFormatted = formatDateKorean(result2.scheduleDate);
          toast.warning(
            `담당자의 일정이 가득 차 있어, "초안 작성" Task가 마감일(${dueDateFormatted})보다 늦은 ${scheduleDateFormatted} 일정으로 배정되었습니다.`,
            {
              position: "bottom-right",
              duration: 8000,
            }
          );
        }
      } catch (error: any) {
        console.error("마감일 체크 실패 (Task 2):", error);
      }

      setCreateTaskDialogOpen(false);
      setIsSpecificationMode(false);
      setPreSelectedCategory(undefined);
      setAutoFillMode(undefined);
      setPreFilledTitle(undefined);

      // 명세서 Task 생성 완료: 새 탭 2개 열기
      // 브라우저 팝업 차단을 피하기 위해 사용자 상호작용 컨텍스트 내에서 동기적으로 연속으로 열기
      // 비동기 함수(setTimeout, requestAnimationFrame 등)를 사용하면 사용자 상호작용 컨텍스트가 끊겨서 차단될 수 있음
      const tab1 = window.open(`/tasks/${task1.id}`, "_blank");
      const tab2 = window.open(`/tasks/${task2.id}`, "_blank");
      
      // 탭이 차단되었는지 확인
      if (!tab1 || tab1.closed || typeof tab1.closed === "undefined") {
        toast.info("첫 번째 Task 상세 페이지를 새 탭에서 열 수 없습니다. 직접 이동해주세요.");
      }
      if (!tab2 || tab2.closed || typeof tab2.closed === "undefined") {
        toast.info("두 번째 Task 상세 페이지를 새 탭에서 열 수 없습니다. 직접 이동해주세요.");
      }

      toast.success("명세서 Task 2개가 생성되었습니다.");
    } catch (error: any) {
      toast.error(`명세서 Task 생성 중 오류가 발생했습니다: ${error.message}`);
    }
  };

  // 태스크 생성 핸들러
  const handleCreateTask = async (
    data: TaskCreateFormData | TaskCreateSpecificationFormData | any,
    files?: File[],
    notes?: string,
  ) => {
    // 이미 생성 중이면 중복 실행 방지
    if (isCreatingTask) {
      return;
    }

    // 명세서 모드인 경우 별도 처리
    if (isSpecificationMode) {
      const specificationData = data as any;
      if (!specificationData.client_name || specificationData.client_name.trim() === "") {
        toast.error("고객명을 입력해주세요.");
        return;
      }
      setIsCreatingTask(true);
      try {
        await handleCreateSpecificationTasks(
          specificationData.assignee_id,
          specificationData.client_name,
          files,
          notes,
        );
      } finally {
        setIsCreatingTask(false);
      }
      return;
    }

    setIsCreatingTask(true);
    try {
      // 1. 태스크 생성
      const createData = data as TaskCreateFormData;
      const newTask = await createTask.mutateAsync({
        title: createData.title,
        assignee_id: createData.assignee_id,
        task_category: createData.task_category,
        client_name: createData.client_name || null,
        due_date: createData.due_date,
      });

      // 2. 파일이 있으면 업로드 후 메시지로 전송
      const uploadedFiles: Array<{
        url: string;
        fileName: string;
        fileType: string;
        fileSize: number;
      }> = [];

      if (files && files.length > 0 && currentProfile?.id) {
        for (const file of files) {
          try {
            const { url, fileName, fileType, fileSize } = await uploadTaskFile(
              file,
              newTask.id,
              currentProfile.id,
            );
            uploadedFiles.push({ url, fileName, fileType, fileSize });
          } catch (error: any) {
            toast.error(`${file.name} 업로드 실패: ${error.message}`);
          }
        }
      }

      // 3. 특이사항이나 파일이 있으면 메시지로 전송
      if ((notes && notes.trim()) || uploadedFiles.length > 0) {
        const bundleId = uploadedFiles.length > 0 ? crypto.randomUUID() : undefined;
        await createMessageWithFiles.mutateAsync({
          taskId: newTask.id,
          content: notes && notes.trim() ? notes.trim() : null,
          files: uploadedFiles,
          bundleId,
        });
      }

      // 4. 마감일 초과 여부 확인 및 알림 표시 (Edge Function 사용)
      try {
        const result = await checkDueDateExceeded(newTask.id, createData.due_date);
        
        if (result.exceeded && result.scheduleDate) {
          const dueDateFormatted = formatDateKorean(result.dueDate);
          const scheduleDateFormatted = formatDateKorean(result.scheduleDate);
          
          toast.warning(
            `담당자의 일정이 가득 차 있어, 해당 Task가 마감일(${dueDateFormatted})보다 늦은 ${scheduleDateFormatted} 일정으로 배정되었습니다.`,
            {
              position: "bottom-right",
              duration: 8000, // 8초간 표시
            }
          );
        }
      } catch (error: any) {
        // 에러는 무시 (Task 생성 성공에 영향 없음)
        console.error("마감일 체크 실패:", error);
      }

      // 5. 다이얼로그 닫기 및 상태 초기화
      setCreateTaskDialogOpen(false);
      setPreSelectedCategory(undefined);
      setAutoFillMode(undefined);
      setPreFilledTitle(undefined);
      setIsSpecificationMode(false);

      // 6. 생성한 Task 상세 페이지로 이동 (동일 탭)
      navigate(`/tasks/${newTask.id}`);
    } catch (error: any) {
      toast.error(error.message || "태스크 생성에 실패했습니다.");
    } finally {
      setIsCreatingTask(false);
    }
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

  // 승인된 태스크 탭: 검색 필터링
  const searchedAllTasks = useMemo(() => {
    if (!debouncedSearch.trim()) return allMyTasks;

    const query = debouncedSearch.toLowerCase();
    return allMyTasks.filter((task) => {
      const titleMatch = task.title.toLowerCase().includes(query);
      const assigneeName = (task.assignee?.full_name || task.assignee?.email || "").toLowerCase();
      const assigneeMatch = assigneeName.includes(query);
      const assignerName = (task.assigner?.full_name || task.assigner?.email || "").toLowerCase();
      const assignerMatch = assignerName.includes(query);
      const clientNameMatch = (task.client_name || "").toLowerCase().includes(query);
      const uniqueIdMatch = task.id.slice(0, 8).toLowerCase().includes(query);

      return titleMatch || assigneeMatch || assignerMatch || clientNameMatch || uniqueIdMatch;
    });
  }, [allMyTasks, debouncedSearch]);

  // 승인된 태스크 탭: 카테고리 필터링
  const categoryFilteredAllTasks = useMemo(() => {
    if (category === "all") {
      return searchedAllTasks;
    }
    return searchedAllTasks.filter((task) => task.task_category === category);
  }, [searchedAllTasks, category]);

  // 승인된 태스크 탭: 이메일 발송 필터링
  const emailSentFilteredAllTasks = useMemo(() => {
    if (emailSent === "all") {
      return categoryFilteredAllTasks;
    } else if (emailSent === "sent") {
      return categoryFilteredAllTasks.filter((task) => task.send_email_to_client === true);
    } else {
      // not_sent
      return categoryFilteredAllTasks.filter((task) => task.send_email_to_client === false);
    }
  }, [categoryFilteredAllTasks, emailSent]);

  // 승인된 태스크 탭: 정렬
  const sortedAllTasks = useMemo(() => {
    const sorted = [...emailSentFilteredAllTasks];

    sorted.sort((a, b) => {
      // 마감일로 정렬
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
  }, [emailSentFilteredAllTasks, sortDue]);

  // 승인된 태스크 탭: 페이지네이션
  const paginatedAllTasks = useMemo(() => {
    const startIndex = (allTasksCurrentPage - 1) * allTasksItemsPerPage;
    const endIndex = startIndex + allTasksItemsPerPage;
    return sortedAllTasks.slice(startIndex, endIndex);
  }, [sortedAllTasks, allTasksCurrentPage, allTasksItemsPerPage]);

  // 승인된 태스크 탭: 총 페이지 수
  const allTasksTotalPages = Math.ceil(sortedAllTasks.length / allTasksItemsPerPage) || 1;

  // 담당 업무 탭: 검색 필터링
  const searchedMyTasks = useMemo(() => {
    if (!debouncedSearch.trim()) return myTasks;

    const query = debouncedSearch.toLowerCase();
    return myTasks.filter((task) => {
      const titleMatch = task.title.toLowerCase().includes(query);
      const assigneeName = (task.assignee?.full_name || task.assignee?.email || "").toLowerCase();
      const assigneeMatch = assigneeName.includes(query);
      const assignerName = (task.assigner?.full_name || task.assigner?.email || "").toLowerCase();
      const assignerMatch = assignerName.includes(query);
      const clientNameMatch = (task.client_name || "").toLowerCase().includes(query);
      const uniqueIdMatch = task.id.slice(0, 8).toLowerCase().includes(query);

      return titleMatch || assigneeMatch || assignerMatch || clientNameMatch || uniqueIdMatch;
    });
  }, [myTasks, debouncedSearch]);

  // 담당 업무 탭: 카테고리 필터링
  const categoryFilteredMyTasks = useMemo(() => {
    if (category === "all") {
      return searchedMyTasks;
    }
    return searchedMyTasks.filter((task) => task.task_category === category);
  }, [searchedMyTasks, category]);

  // 담당 업무 탭: 상태 필터링
  const statusFilteredMyTasks = useMemo(() => {
    const dbStatus = statusMap[status];
    if (dbStatus === null) {
      return categoryFilteredMyTasks; // 전체 선택 시 모든 상태 표시 (이미 승인됨 제외된 상태)
    }
    return categoryFilteredMyTasks.filter((task) => task.task_status === dbStatus);
  }, [categoryFilteredMyTasks, status, statusMap]);

  // 담당 업무 탭: 정렬
  const sortedMyTasks = useMemo(() => {
    const sorted = [...statusFilteredMyTasks];

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
  }, [statusFilteredMyTasks, sortDue]);

  // 담당 업무 탭: 페이지네이션
  const paginatedMyTasks = useMemo(() => {
    const startIndex = (myTasksCurrentPage - 1) * myTasksItemsPerPage;
    const endIndex = startIndex + myTasksItemsPerPage;
    return sortedMyTasks.slice(startIndex, endIndex);
  }, [sortedMyTasks, myTasksCurrentPage, myTasksItemsPerPage]);

  // 현재 표시 중인 Task ID 목록 추출 (실시간 구독용)
  // sortedMyTasks/sortedAllTasks를 사용하여 필터링/정렬이 완료된 Task ID를 추출
  // 페이지네이션된 Task만 구독하여 성능 최적화
  const currentTaskIds = useMemo(() => {
    const taskIds = new Set<string>();
    
    // 현재 활성 탭에 따라 표시 중인 Task ID 수집
    // activeTab을 사용하여 탭 구분 (category는 카테고리 필터이므로 사용하지 않음)
    // paginatedMyTasks/paginatedAllTasks 대신 sortedMyTasks/sortedAllTasks에서 페이지네이션 범위만 추출
    if (activeTab === "my-tasks") {
      const startIndex = (myTasksCurrentPage - 1) * myTasksItemsPerPage;
      const endIndex = startIndex + myTasksItemsPerPage;
      sortedMyTasks.slice(startIndex, endIndex).forEach((task) => {
        if (task.id) taskIds.add(task.id);
      });
    } else if (activeTab === "all-tasks") {
      const startIndex = (allTasksCurrentPage - 1) * allTasksItemsPerPage;
      const endIndex = startIndex + allTasksItemsPerPage;
      sortedAllTasks.slice(startIndex, endIndex).forEach((task) => {
        if (task.id) taskIds.add(task.id);
      });
    }
    
    const result = Array.from(taskIds);
    console.log(`[Member Dashboard] 📋 Current task IDs for subscription:`, {
      activeTab,
      category,
      count: result.length,
      taskIds: result,
      sortedMyTasksCount: sortedMyTasks.length,
      sortedAllTasksCount: sortedAllTasks.length,
      paginatedMyTasksCount: paginatedMyTasks.length,
      paginatedAllTasksCount: paginatedAllTasks.length,
      myTasksCurrentPage,
      allTasksCurrentPage,
    });
    
    return result;
  }, [activeTab, category, sortedMyTasks, sortedAllTasks, myTasksCurrentPage, allTasksCurrentPage, myTasksItemsPerPage, allTasksItemsPerPage]);

  // 실시간 구독 활성화
  console.log(`[Member Dashboard] 🎯 Calling useRealtimeDashboardMessages with:`, {
    taskIds: currentTaskIds,
    enabled: true,
  });
  useRealtimeDashboardMessages(currentTaskIds, true);

  // 담당 업무 탭: 총 페이지 수
  const myTasksTotalPages = Math.ceil(sortedMyTasks.length / myTasksItemsPerPage) || 1;

  // URL에서 q 파라미터 제거 (컴포넌트 마운트 시)
  useEffect(() => {
    if (searchParams.has("q")) {
      const newParams = new URLSearchParams(searchParams);
      newParams.delete("q");
      setSearchParams(newParams, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // URL 쿼리 파라미터 변경 시 탭 상태 및 검색어 동기화
  useEffect(() => {
    const tabParam = searchParams.get("tab") as DashboardTab | null;
    const newTab = tabParam === "all-tasks" || tabParam === "my-tasks" ? tabParam : "my-tasks";
    const keywordFromUrl = searchParams.get("keyword") || "";
    
    if (newTab !== activeTab) {
      setActiveTab(newTab);
    }
    
    // URL에서 keyword가 변경되었을 때 searchQuery 동기화 (브라우저 뒤로가기/앞으로가기 등)
    if (keywordFromUrl !== searchQuery) {
      setSearchQuery(keywordFromUrl);
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  // 검색어/필터 변경 시 1페이지로 리셋 (전체 태스크 탭)
  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      prevAllTasksFiltersRef.current = { search: debouncedSearch, category, sortDue, sortEmailSent, emailSent };
      prevMyTasksFiltersRef.current = { search: debouncedSearch, category, status, sortDue };
      return;
    }

    const prev = prevAllTasksFiltersRef.current;
    const allTasksFiltersChanged =
      prev.search !== debouncedSearch ||
      prev.category !== category ||
      prev.sortDue !== sortDue ||
      prev.sortEmailSent !== sortEmailSent ||
      prev.emailSent !== emailSent;

    if (allTasksFiltersChanged && activeTab === "all-tasks" && allTasksCurrentPage !== 1) {
      updateAllTasksUrlParams({ allTasksPage: 1 });
    }

    prevAllTasksFiltersRef.current = { search: debouncedSearch, category, sortDue, sortEmailSent, emailSent };
  }, [debouncedSearch, category, sortDue, sortEmailSent, emailSent, activeTab, allTasksCurrentPage]);

  // 검색어/필터 변경 시 1페이지로 리셋 (담당 업무 탭)
  useEffect(() => {
    const prev = prevMyTasksFiltersRef.current;
    const myTasksFiltersChanged =
      prev.search !== debouncedSearch ||
      prev.category !== category ||
      prev.status !== status ||
      prev.sortDue !== sortDue;

    if (myTasksFiltersChanged && activeTab === "my-tasks" && myTasksCurrentPage !== 1) {
      updateMyTasksUrlParams({ myTasksPage: 1 });
    }

    prevMyTasksFiltersRef.current = { search: debouncedSearch, category, status, sortDue };
  }, [debouncedSearch, category, status, sortDue, activeTab, myTasksCurrentPage]);

  // 잘못된 페이지 번호 체크 및 리셋
  useEffect(() => {
    if (activeTab === "all-tasks" && allTasksTotalPages > 0 && allTasksCurrentPage > allTasksTotalPages) {
      updateAllTasksUrlParams({ allTasksPage: 1 });
    }
    if (activeTab === "my-tasks" && myTasksTotalPages > 0 && myTasksCurrentPage > myTasksTotalPages) {
      updateMyTasksUrlParams({ myTasksPage: 1 });
    }
  }, [allTasksCurrentPage, allTasksTotalPages, myTasksCurrentPage, myTasksTotalPages, activeTab]);

  const isLoading = allTasksLoading || myTasksLoading;

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
        <div className="flex items-center gap-2">
          {/* 모바일: 빠른 생성 드롭다운 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 md:hidden">
                <Plus className="mr-2 h-4 w-4" />
                빠른 생성
                <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={() => handleQuickCreate("REVIEW", "검토")}>
                검토
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleQuickCreate("CONTRACT", "계약")}>
                계약
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleQuickCreate("SPECIFICATION")}>
                명세서
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleQuickCreate("REVISION", "수정")}>
                수정
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleQuickCreate("APPLICATION", "출원")}>
                출원
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {/* PC: 빠른 생성 버튼들 */}
          <div className="hidden md:flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => handleQuickCreate("REVIEW", "검토")}
            >
              <Plus className="mr-2 h-4 w-4" />
              검토
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => handleQuickCreate("CONTRACT", "계약")}
            >
              <Plus className="mr-2 h-4 w-4" />
              계약
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => handleQuickCreate("SPECIFICATION")}
            >
              <Plus className="mr-2 h-4 w-4" />
              명세서
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => handleQuickCreate("REVISION", "수정")}
            >
              <Plus className="mr-2 h-4 w-4" />
              수정
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={() => handleQuickCreate("APPLICATION", "출원")}
            >
              <Plus className="mr-2 h-4 w-4" />
              출원
            </Button>
          </div>
          {/* Task 생성 버튼 (공통) */}
          <Button
            onClick={() => {
              setPreSelectedCategory(undefined);
              setAutoFillMode(undefined);
              setPreFilledTitle(undefined);
              setIsSpecificationMode(false);
              setCreateTaskDialogOpen(true);
            }}
            className="h-9"
          >
            <Plus className="mr-2 h-4 w-4" />
            Task 생성
          </Button>
        </div>
      </div>

      {/* 탭 전환 */}
      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          const newTab = value as DashboardTab;
          // 탭 전환 시 모든 필터 초기화
          const newParams = new URLSearchParams();
          newParams.set("tab", newTab);
          setSearchParams(newParams, { replace: true });
          setActiveTab(newTab);
          setSearchQuery(""); // 검색어도 초기화
        }}
      >
        {/* 담당 업무 / 승인된 태스크 탭 */}
        <TabsList className="mt-4">
          <TabsTrigger value="my-tasks">담당 업무</TabsTrigger>
          <TabsTrigger value="all-tasks">승인된 태스크</TabsTrigger>
        </TabsList>

        {/* 담당 업무 탭 */}
        <TabsContent value="my-tasks" className="space-y-4">
          {/* 필터 영역 */}
          <div className="space-y-3">
            {/* 모바일: Select 드롭다운 */}
            <div className="flex gap-2 sm:hidden">
              <Select value={category} onValueChange={(value) => handleMyTasksCategoryChange(value as CategoryParam)}>
                <SelectTrigger className="flex-1">
                  <SelectValue>
                    {category === "all" 
                      ? "전체 카테고리" 
                      : (["REVIEW", "REVISION", "CONTRACT", "SPECIFICATION", "APPLICATION"] as CategoryParam[]).find(c => c === category) === "REVIEW" ? "검토"
                      : (["REVIEW", "REVISION", "CONTRACT", "SPECIFICATION", "APPLICATION"] as CategoryParam[]).find(c => c === category) === "REVISION" ? "수정"
                      : (["REVIEW", "REVISION", "CONTRACT", "SPECIFICATION", "APPLICATION"] as CategoryParam[]).find(c => c === category) === "CONTRACT" ? "계약"
                      : (["REVIEW", "REVISION", "CONTRACT", "SPECIFICATION", "APPLICATION"] as CategoryParam[]).find(c => c === category) === "SPECIFICATION" ? "명세서"
                      : (["REVIEW", "REVISION", "CONTRACT", "SPECIFICATION", "APPLICATION"] as CategoryParam[]).find(c => c === category) === "APPLICATION" ? "출원"
                      : "전체"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(["all", "REVIEW", "REVISION", "CONTRACT", "SPECIFICATION", "APPLICATION"] as CategoryParam[]).map((categoryValue) => {
                    const categoryLabels: Record<CategoryParam, string> = {
                      all: "전체",
                      REVIEW: "검토",
                      REVISION: "수정",
                      CONTRACT: "계약",
                      SPECIFICATION: "명세서",
                      APPLICATION: "출원",
                    };
                    const dbStatus = statusMap[status];
                    const filteredByStatus = dbStatus === null 
                      ? searchedMyTasks.filter((task) => task.task_status !== "APPROVED")
                      : searchedMyTasks.filter((task) => task.task_status === dbStatus);
                    const count = categoryValue === "all"
                      ? filteredByStatus.length
                      : filteredByStatus.filter((task) => task.task_category === categoryValue).length;
                    return (
                      <SelectItem key={categoryValue} value={categoryValue}>
                        {categoryLabels[categoryValue]} ({count}개)
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <Select value={status} onValueChange={(value) => handleMyTasksStatusChange(value as StatusParam)}>
                <SelectTrigger className="flex-1">
                  <SelectValue>
                    {status === "all" 
                      ? "전체 상태" 
                      : status === "assigned" ? "할당됨"
                      : status === "in_progress" ? "진행중"
                      : status === "waiting_confirm" ? "확인대기"
                      : status === "rejected" ? "거부됨"
                      : "전체"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(["all", "assigned", "in_progress", "waiting_confirm", "rejected"] as StatusParam[]).map((statusValue) => {
                    const statusLabels: Record<StatusParam, string> = {
                      all: "전체",
                      assigned: "할당됨",
                      in_progress: "진행중",
                      waiting_confirm: "확인대기",
                      rejected: "거부됨",
                      approved: "승인됨",
                    };
                    const filteredByCategory = category === "all"
                      ? searchedMyTasks
                      : searchedMyTasks.filter((task) => task.task_category === category);
                    const dbStatus = statusMap[statusValue];
                    const count = dbStatus === null 
                      ? filteredByCategory.filter((task) => task.task_status !== "APPROVED").length
                      : filteredByCategory.filter((task) => task.task_status === dbStatus).length;
                    return (
                      <SelectItem key={statusValue} value={statusValue}>
                        {statusLabels[statusValue]} ({count}개)
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            {/* 태블릿/PC: 버튼 그룹 */}
            <div className="hidden sm:block space-y-2">
              {/* 카테고리 필터 버튼 */}
              <div className="flex flex-wrap gap-2">
                {(["all", "REVIEW", "REVISION", "CONTRACT", "SPECIFICATION", "APPLICATION"] as CategoryParam[]).map((categoryValue) => {
                  const categoryLabels: Record<CategoryParam, string> = {
                    all: "전체",
                    REVIEW: "검토",
                    REVISION: "수정",
                    CONTRACT: "계약",
                    SPECIFICATION: "명세서",
                    APPLICATION: "출원",
                  };
                  const dbStatus = statusMap[status];
                  const filteredByStatus = dbStatus === null 
                    ? searchedMyTasks.filter((task) => task.task_status !== "APPROVED")
                    : searchedMyTasks.filter((task) => task.task_status === dbStatus);
                  const count = categoryValue === "all"
                    ? filteredByStatus.length
                    : filteredByStatus.filter((task) => task.task_category === categoryValue).length;
                  
                  return (
                    <Button
                      key={categoryValue}
                      variant={category === categoryValue ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleMyTasksCategoryChange(categoryValue)}
                      className="p-1 sm:p-1.5"

                    >
                      {categoryLabels[categoryValue]} ({count}개)
                    </Button>
                  );
                })}
              </div>
              {/* 상태 필터 버튼 */}
              <div className="flex flex-wrap gap-2">
                {(["all", "assigned", "in_progress", "waiting_confirm", "rejected"] as StatusParam[]).map((statusValue) => {
                  const statusLabels: Record<StatusParam, string> = {
                    all: "전체",
                    assigned: "할당됨",
                    in_progress: "진행중",
                    waiting_confirm: "확인대기",
                    rejected: "거부됨",
                    approved: "승인됨",
                  };
                  const filteredByCategory = category === "all"
                    ? searchedMyTasks
                    : searchedMyTasks.filter((task) => task.task_category === category);
                  const dbStatus = statusMap[statusValue];
                  const count = dbStatus === null 
                    ? filteredByCategory.filter((task) => task.task_status !== "APPROVED").length
                    : filteredByCategory.filter((task) => task.task_status === dbStatus).length;
                  
                  return (
                    <Button
                      key={statusValue}
                      variant={status === statusValue ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleMyTasksStatusChange(statusValue)}
                      className="p-1 sm:p-1.5"

                    >
                      {statusLabels[statusValue]} ({count}개)
                    </Button>
                  );
                })}
              </div>
            </div>
          </div>
          {/* 검색창 */}
          <div className="w-full">
            <div className="relative">
              <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <Input
                placeholder="고유 ID, 고객명, 지시사항, 지시자/담당자명으로 검색하세요..."
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
                  <th className="w-[14.285%] px-2 py-3 text-left text-xs font-medium sm:px-4 sm:text-sm">
                    고유 ID
                  </th>
                  <th className="w-[14.285%] px-2 py-3 text-left text-xs font-medium sm:px-4 sm:text-sm">
                    고객명
                  </th>
                  <th className="w-[14.285%] px-2 py-3 text-left text-xs font-medium sm:px-4 sm:text-sm">
                    지시사항
                  </th>
                  <th
                    className="hover:bg-muted/50 w-[14.285%] cursor-pointer px-2 py-3 text-left text-xs font-medium sm:px-4 sm:text-sm"
                    onClick={handleMyTasksSortDueChange}
                  >
                    <div className="flex items-center gap-2">
                      마감일
                      <ArrowUpDown className="size-3 sm:size-4" />
                    </div>
                  </th>
                  <th className="w-[14.285%] px-2 py-3 text-left text-xs font-medium sm:px-4 sm:text-sm">
                    <StatusFilterDropdown
                      status={status}
                      onStatusChange={handleMyTasksStatusChange}
                      tasks={searchedMyTasks}
                      hideApproved={true}
                    />
                  </th>
                  <th className="w-[14.285%] px-2 py-3 text-left text-xs font-medium sm:px-4 sm:text-sm">
                    새 메시지
                  </th>
                  <th className="w-[14.285%] px-2 py-3 text-left text-xs font-medium sm:px-4 sm:text-sm">
                    지시자/담당자
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedMyTasks.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="text-muted-foreground h-24 text-center text-xs sm:text-sm"
                    >
                      {debouncedSearch ? "검색 결과가 없습니다." : "Task가 없습니다."}
                    </td>
                  </tr>
                ) : (
                  paginatedMyTasks.map((task) => {
                    const dueDate = formatDueDate(task.due_date);
                    const daysDiff = calculateDaysDifference(task.due_date);
                    const dDayText = getDDayText(daysDiff);
                    const dueDateColorClass = getDueDateColorClass(daysDiff, task.task_status);

                    const assignerName = task.assigner?.full_name || task.assigner?.email?.split('@')[0] || '-';
                    const assigneeName = task.assignee?.full_name || task.assignee?.email?.split('@')[0] || '-';
                    const assignerAssigneeDisplay = `${assignerName} / ${assigneeName}`;

                    return (
                      <tr
                        key={task.id}
                        className="hover:bg-muted/50 border-b transition-colors cursor-pointer"
                        onClick={() => {
                          const currentUrl =
                            window.location.pathname + window.location.search;
                          sessionStorage.setItem("previousDashboardUrl", currentUrl);
                          navigate(`/tasks/${task.id}`);
                        }}
                      >
                        <td className="px-2 py-3 sm:px-4 sm:py-4">
                          <div className="line-clamp-2 text-xs sm:text-sm">
                            {task.id ? (
                              <span className="font-mono text-xs">{task.id.slice(0, 8).toUpperCase()}</span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-3 sm:px-4 sm:py-4">
                          <div className="line-clamp-2 text-xs sm:text-sm">
                            {task.client_name || (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-3 sm:px-4 sm:py-4">
                          <div className="line-clamp-2 text-xs sm:text-sm">
                            <Link
                              to={`/tasks/${task.id}`}
                              className="line-clamp-2 hover:underline cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation(); // 행 클릭 이벤트와 중복 방지
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
                        <td className="px-2 py-3 text-center sm:px-4 sm:py-4">
                          {task.unread_message_count && task.unread_message_count > 0 ? (
                            <div className="relative inline-flex">
                              <Bell className="h-6 w-6 fill-primary text-primary" />
                              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-xs font-semibold text-white dark:text-black">
                                {task.unread_message_count}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs sm:text-sm">-</span>
                          )}
                        </td>
                        <td className="px-2 py-3 sm:px-4 sm:py-4">
                          <div className="line-clamp-2 text-xs sm:text-sm">{assignerAssigneeDisplay}</div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* 페이지네이션 */}
          {sortedMyTasks.length > 0 && (
            <TablePagination
              currentPage={myTasksCurrentPage}
              totalPages={myTasksTotalPages}
              pageSize={myTasksItemsPerPage}
              totalItems={sortedMyTasks.length}
              selectedCount={0}
              onPageChange={(page) => {
                updateMyTasksUrlParams({ myTasksPage: page });
              }}
              onPageSizeChange={(newPageSize) => {
                setMyTasksItemsPerPage(newPageSize);
                sessionStorage.setItem("tablePageSize", newPageSize.toString());
                updateMyTasksUrlParams({ myTasksPage: 1 });
              }}
            />
          )}
        </TabsContent>

        {/* 승인된 태스크 탭 */}
        <TabsContent value="all-tasks" className="space-y-4">
          {/* 필터 영역 */}
          <div className="space-y-3">
            {/* 모바일: Select 드롭다운 */}
            <div className="flex gap-2 sm:hidden">
              <Select value={category} onValueChange={(value) => handleAllTasksCategoryChange(value as CategoryParam)}>
                <SelectTrigger className="flex-1">
                  <SelectValue>
                    {category === "all" 
                      ? "전체 카테고리" 
                      : (["REVIEW", "REVISION", "CONTRACT", "SPECIFICATION", "APPLICATION"] as CategoryParam[]).find(c => c === category) === "REVIEW" ? "검토"
                      : (["REVIEW", "REVISION", "CONTRACT", "SPECIFICATION", "APPLICATION"] as CategoryParam[]).find(c => c === category) === "REVISION" ? "수정"
                      : (["REVIEW", "REVISION", "CONTRACT", "SPECIFICATION", "APPLICATION"] as CategoryParam[]).find(c => c === category) === "CONTRACT" ? "계약"
                      : (["REVIEW", "REVISION", "CONTRACT", "SPECIFICATION", "APPLICATION"] as CategoryParam[]).find(c => c === category) === "SPECIFICATION" ? "명세서"
                      : (["REVIEW", "REVISION", "CONTRACT", "SPECIFICATION", "APPLICATION"] as CategoryParam[]).find(c => c === category) === "APPLICATION" ? "출원"
                      : "전체"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(["all", "REVIEW", "REVISION", "CONTRACT", "SPECIFICATION", "APPLICATION"] as CategoryParam[]).map((categoryValue) => {
                    const categoryLabels: Record<CategoryParam, string> = {
                      all: "전체",
                      REVIEW: "검토",
                      REVISION: "수정",
                      CONTRACT: "계약",
                      SPECIFICATION: "명세서",
                      APPLICATION: "출원",
                    };
                    const filteredByEmailSent = emailSent === "all"
                      ? searchedAllTasks
                      : emailSent === "sent"
                      ? searchedAllTasks.filter((task) => task.send_email_to_client === true)
                      : searchedAllTasks.filter((task) => task.send_email_to_client === false);
                    const count = categoryValue === "all"
                      ? filteredByEmailSent.length
                      : filteredByEmailSent.filter((task) => task.task_category === categoryValue).length;
                    return (
                      <SelectItem key={categoryValue} value={categoryValue}>
                        {categoryLabels[categoryValue]} ({count}개)
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <Select value={emailSent} onValueChange={(value) => handleAllTasksEmailSentChange(value as EmailSentParam)}>
                <SelectTrigger className="flex-1">
                  <SelectValue>
                    {emailSent === "all" 
                      ? "전체 이메일" 
                      : emailSent === "sent" ? "전송완료"
                      : emailSent === "not_sent" ? "미전송"
                      : "전체"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(["all", "sent", "not_sent"] as EmailSentParam[]).map((emailSentValue) => {
                    const emailSentLabels: Record<EmailSentParam, string> = {
                      all: "전체",
                      sent: "전송완료",
                      not_sent: "미전송",
                    };
                    const filteredByCategory = category === "all"
                      ? searchedAllTasks
                      : searchedAllTasks.filter((task) => task.task_category === category);
                    const count = emailSentValue === "all"
                      ? filteredByCategory.length
                      : emailSentValue === "sent"
                      ? filteredByCategory.filter((task) => task.send_email_to_client === true).length
                      : filteredByCategory.filter((task) => task.send_email_to_client === false).length;
                    return (
                      <SelectItem key={emailSentValue} value={emailSentValue}>
                        {emailSentLabels[emailSentValue]} ({count}개)
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            {/* 태블릿/PC: 버튼 그룹 */}
            <div className="hidden sm:block space-y-2">
              {/* 카테고리 필터 버튼 */}
              <div className="flex flex-wrap gap-2">
                {(["all", "REVIEW", "REVISION", "CONTRACT", "SPECIFICATION", "APPLICATION"] as CategoryParam[]).map((categoryValue) => {
                  const categoryLabels: Record<CategoryParam, string> = {
                    all: "전체",
                    REVIEW: "검토",
                    REVISION: "수정",
                    CONTRACT: "계약",
                    SPECIFICATION: "명세서",
                    APPLICATION: "출원",
                  };
                  const filteredByEmailSent = emailSent === "all"
                    ? searchedAllTasks
                    : emailSent === "sent"
                    ? searchedAllTasks.filter((task) => task.send_email_to_client === true)
                    : searchedAllTasks.filter((task) => task.send_email_to_client === false);
                  const count = categoryValue === "all"
                    ? filteredByEmailSent.length
                    : filteredByEmailSent.filter((task) => task.task_category === categoryValue).length;
                  
                  return (
                    <Button
                      key={categoryValue}
                      variant={category === categoryValue ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleAllTasksCategoryChange(categoryValue)}
                      className="p-1 sm:p-1.5"

                    >
                      {categoryLabels[categoryValue]} ({count}개)
                    </Button>
                  );
                })}
              </div>
              {/* 이메일 발송 필터 버튼 */}
              <div className="flex flex-wrap gap-2">
                {(["all", "sent", "not_sent"] as EmailSentParam[]).map((emailSentValue) => {
                  const emailSentLabels: Record<EmailSentParam, string> = {
                    all: "전체",
                    sent: "전송완료",
                    not_sent: "미전송",
                  };
                  const filteredByCategory = category === "all"
                    ? searchedAllTasks
                    : searchedAllTasks.filter((task) => task.task_category === category);
                  const count = emailSentValue === "all"
                    ? filteredByCategory.length
                    : emailSentValue === "sent"
                    ? filteredByCategory.filter((task) => task.send_email_to_client === true).length
                    : filteredByCategory.filter((task) => task.send_email_to_client === false).length;
                  
                  return (
                    <Button
                      key={emailSentValue}
                      variant={emailSent === emailSentValue ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleAllTasksEmailSentChange(emailSentValue)}
                      className="p-1 sm:p-1.5"

                    >
                      {emailSentLabels[emailSentValue]} ({count}개)
                    </Button>
                  );
                })}
              </div>
            </div>
          </div>
          {/* 검색창 */}
          <div className="w-full">
            <div className="relative">
              <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <Input
                placeholder="고유 ID, 고객명, 지시사항, 지시자/담당자명으로 검색하세요..."
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
                  <th className="w-[14.285%] px-2 py-3 text-left text-xs font-medium sm:px-4 sm:text-sm">
                    고유 ID
                  </th>
                  <th className="w-[14.285%] px-2 py-3 text-left text-xs font-medium sm:px-4 sm:text-sm">
                    고객명
                  </th>
                  <th className="w-[14.285%] px-2 py-3 text-left text-xs font-medium sm:px-4 sm:text-sm">
                    지시사항
                  </th>
                  <th
                    className="hover:bg-muted/50 w-[14.285%] cursor-pointer px-2 py-3 text-left text-xs font-medium sm:px-4 sm:text-sm"
                    onClick={handleAllTasksSortDueChange}
                  >
                    <div className="flex items-center gap-2">
                      마감일
                      <ArrowUpDown className="size-3 sm:size-4" />
                    </div>
                  </th>
                  <th className="w-[14.285%] px-2 py-3 text-left text-xs font-medium sm:px-4 sm:text-sm">
                    <EmailSentFilterDropdown
                      emailSent={emailSent}
                      onEmailSentChange={handleAllTasksEmailSentChange}
                      tasks={searchedAllTasks}
                    />
                  </th>
                  <th className="w-[14.285%] px-2 py-3 text-left text-xs font-medium sm:px-4 sm:text-sm">
                    새 메시지
                  </th>
                  <th className="w-[14.285%] px-2 py-3 text-left text-xs font-medium sm:px-4 sm:text-sm">
                    지시자/담당자
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedAllTasks.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="text-muted-foreground h-24 text-center text-xs sm:text-sm"
                    >
                      {debouncedSearch ? "검색 결과가 없습니다." : "Task가 없습니다."}
                    </td>
                  </tr>
                ) : (
                  paginatedAllTasks.map((task) => {
                    const dueDate = formatDueDate(task.due_date);
                    const daysDiff = calculateDaysDifference(task.due_date);
                    const dDayText = getDDayText(daysDiff);
                    const dueDateColorClass = getDueDateColorClass(daysDiff, task.task_status);

                    const assignerName = task.assigner?.full_name || task.assigner?.email?.split('@')[0] || '-';
                    const assigneeName = task.assignee?.full_name || task.assignee?.email?.split('@')[0] || '-';
                    const assignerAssigneeDisplay = `${assignerName} / ${assigneeName}`;

                    return (
                      <tr
                        key={task.id}
                        className="hover:bg-muted/50 border-b transition-colors cursor-pointer"
                        onClick={() => {
                          const currentUrl =
                            window.location.pathname + window.location.search;
                          sessionStorage.setItem("previousDashboardUrl", currentUrl);
                          navigate(`/tasks/${task.id}`);
                        }}
                      >
                        <td className="px-2 py-3 sm:px-4 sm:py-4">
                          <div className="line-clamp-2 text-xs sm:text-sm">
                            {task.id ? (
                              <span className="font-mono text-xs">{task.id.slice(0, 8).toUpperCase()}</span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-3 sm:px-4 sm:py-4">
                          <div className="line-clamp-2 text-xs sm:text-sm">
                            {task.client_name || (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-3 sm:px-4 sm:py-4">
                          <div className="line-clamp-2 text-xs sm:text-sm">
                            <Link
                              to={`/tasks/${task.id}`}
                              className="line-clamp-2 hover:underline cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation(); // 행 클릭 이벤트와 중복 방지
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
                          <button
                            onClick={(e) => handleEmailSentToggle(task, e)}
                            disabled={task.assignee_id !== currentProfile?.id || updateTask.isPending}
                            className={cn(
                              "flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors",
                              "hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50",
                              task.assignee_id === currentProfile?.id && "cursor-pointer"
                            )}
                          >
                            {task.send_email_to_client ? (
                              <>
                                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-500" />
                                <span className="text-xs sm:text-sm whitespace-nowrap">전송 완료</span>
                              </>
                            ) : (
                              <>
                                <XCircle className="h-4 w-4 text-muted-foreground" />
                                <span className="text-xs sm:text-sm">미전송</span>
                              </>
                            )}
                          </button>
                        </td>
                        <td className="px-2 py-3 text-center sm:px-4 sm:py-4">
                          {task.unread_message_count && task.unread_message_count > 0 ? (
                            <div className="relative inline-flex">
                              <Bell className="h-6 w-6 fill-primary text-primary" />
                              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-xs font-semibold text-white dark:text-black">
                                {task.unread_message_count}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs sm:text-sm">-</span>
                          )}
                        </td>
                        <td className="px-2 py-3 sm:px-4 sm:py-4">
                          <div className="line-clamp-2 text-xs sm:text-sm">{assignerAssigneeDisplay}</div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* 페이지네이션 */}
          {sortedAllTasks.length > 0 && (
            <TablePagination
              currentPage={allTasksCurrentPage}
              totalPages={allTasksTotalPages}
              pageSize={allTasksItemsPerPage}
              totalItems={sortedAllTasks.length}
              selectedCount={0}
              onPageChange={(page) => {
                updateAllTasksUrlParams({ allTasksPage: page });
              }}
              onPageSizeChange={(newPageSize) => {
                setAllTasksItemsPerPage(newPageSize);
                sessionStorage.setItem("tablePageSize", newPageSize.toString());
                updateAllTasksUrlParams({ allTasksPage: 1 });
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

      {/* 태스크 생성 다이얼로그 */}
      <TaskFormDialog
        open={createTaskDialogOpen}
        onOpenChange={(open) => {
          setCreateTaskDialogOpen(open);
          if (!open) {
            setPreSelectedCategory(undefined);
            setAutoFillMode(undefined);
            setPreFilledTitle(undefined);
            setIsSpecificationMode(false);
          }
        }}
        onSubmit={handleCreateTask}
        isLoading={isCreatingTask || createTask.isPending || createMessageWithFiles.isPending}
        preSelectedCategory={preSelectedCategory}
        autoFillMode={autoFillMode}
        preFilledTitle={preFilledTitle}
        isSpecificationMode={isSpecificationMode}
      />
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
  hideApproved = false,
}: {
  status: StatusParam;
  onStatusChange: (status: StatusParam) => void;
  tasks: TaskWithProfiles[];
  hideApproved?: boolean;
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

  // 표시할 상태 목록 필터링
  const visibleStatuses = (Object.keys(statusLabels) as StatusParam[]).filter(
    (statusValue) => !hideApproved || statusValue !== "approved"
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-8 px-2">
          <span className="font-medium">{statusLabels[status]}</span>
          <ChevronDown className="ml-2 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {visibleStatuses.map((statusValue) => {
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

/**
 * 이메일 발송 필터 드롭다운 컴포넌트
 */
function EmailSentFilterDropdown({
  emailSent,
  onEmailSentChange,
  tasks,
}: {
  emailSent: EmailSentParam;
  onEmailSentChange: (emailSent: EmailSentParam) => void;
  tasks: TaskWithProfiles[];
}) {
  const emailSentLabels: Record<EmailSentParam, string> = {
    all: "전체",
    sent: "전송완료",
    not_sent: "미전송",
  };

  // 각 상태별 개수 계산
  const getEmailSentCount = (emailSentValue: EmailSentParam): number => {
    if (emailSentValue === "all") {
      return tasks.length;
    } else if (emailSentValue === "sent") {
      return tasks.filter((task) => task.send_email_to_client === true).length;
    } else {
      // not_sent
      return tasks.filter((task) => task.send_email_to_client === false).length;
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-8 px-2">
          <span className="font-medium">{emailSentLabels[emailSent]}</span>
          <ChevronDown className="ml-2 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {(Object.keys(emailSentLabels) as EmailSentParam[]).map((emailSentValue) => {
          const count = getEmailSentCount(emailSentValue);
          return (
            <DropdownMenuItem
              key={emailSentValue}
              onClick={() => onEmailSentChange(emailSentValue)}
              className={emailSent === emailSentValue ? "bg-accent" : ""}
            >
              {emailSentLabels[emailSentValue]} ({count}개)
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
