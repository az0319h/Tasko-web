import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router";
import { ArrowLeft, Play, CheckCircle, XCircle, Pencil, Trash2, Paperclip, Send, Download, File, X } from "lucide-react";
import {
  useTask,
  useIsAdmin,
  useUpdateTask,
  useUpdateTaskStatus,
  useDeleteTask,
  useCurrentProfile,
  useMessages,
  useCreateMessage,
  useCreateFileMessage,
  useCreateMessageWithFiles,
  useMarkTaskMessagesAsRead,
  useRealtimeMessages,
  useTypingIndicator,
} from "@/hooks";
import { TaskStatusBadge } from "@/components/common/task-status-badge";
import { canEditTask } from "@/lib/project-permissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TaskFormDialog } from "@/components/task/task-form-dialog";
import { TaskDeleteDialog } from "@/components/task/task-delete-dialog";
import type { TaskUpdateFormData } from "@/schemas/task/task-schema";
import type { TaskStatus } from "@/lib/task-status";
import type { MessageWithProfile } from "@/api/message";
import { uploadTaskFile, getTaskFileDownloadUrl } from "@/api/storage";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/**
 * Task 상세 페이지
 */
export default function TaskDetailPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const { data: task, isLoading, error } = useTask(taskId);
  const { data: currentProfile } = useCurrentProfile();
  const { data: isAdmin = false } = useIsAdmin();
  const { data: messages = [], isLoading: messagesLoading } = useMessages(taskId);
  const createMessage = useCreateMessage();
  const createFileMessage = useCreateFileMessage();
  const createMessageWithFiles = useCreateMessageWithFiles();
  const markMessagesAsRead = useMarkTaskMessagesAsRead();
  const updateTask = useUpdateTask();
  const updateTaskStatus = useUpdateTaskStatus();
  const deleteTask = useDeleteTask();

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [messageInput, setMessageInput] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]); // Draft 상태의 파일들
  const [uploadingFiles, setUploadingFiles] = useState<Set<string>>(new Set()); // 업로드 중인 파일 이름들
  const [dragActive, setDragActive] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const currentUserId = currentProfile?.id;

  // Realtime 구독 활성화
  useRealtimeMessages(taskId, !!taskId);

  // Typing indicator
  const { typingUsers, sendTyping, stopTyping } = useTypingIndicator(taskId, !!taskId);

  // 채팅 화면 진입 시 모든 메시지 읽음 처리
  useEffect(() => {
    if (taskId && currentUserId) {
      markMessagesAsRead.mutate(taskId);
    }
  }, [taskId, currentUserId]);

  // 새 메시지 수신 시 스크롤 하단으로 이동
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 입력 중 상태 전송 (debounce)
  useEffect(() => {
    if (!messageInput.trim()) {
      stopTyping();
      return;
    }

    const timer = setTimeout(() => {
      sendTyping();
    }, 500);

    return () => clearTimeout(timer);
  }, [messageInput, sendTyping, stopTyping]);

  // 권한 체크: assigner, assignee, Admin만 접근 가능
  useEffect(() => {
    if (!task || !currentUserId) return;

    const isAssigner = currentUserId === task.assigner_id;
    const isAssignee = currentUserId === task.assignee_id;
    const hasAccess = isAssigner || isAssignee || isAdmin;

    if (!hasAccess) {
      toast.error("이 Task의 채팅에 접근할 권한이 없습니다.");
      navigate(-1);
    }
  }, [task, currentUserId, isAdmin, navigate]);

  // 로딩 상태
  if (isLoading) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-48" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // 에러 상태
  if (error) {
    return (
      <div className="container mx-auto py-6">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-destructive">Task를 불러오는 중 오류가 발생했습니다.</p>
            <p className="text-sm text-muted-foreground mt-2">{error.message}</p>
            <Button onClick={() => navigate(-1)} className="mt-4">
              돌아가기
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 데이터 없음
  if (!task) {
    return (
      <div className="container mx-auto py-6">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-lg font-medium">Task를 찾을 수 없습니다</p>
            <p className="text-sm text-muted-foreground mt-2">요청하신 Task가 존재하지 않거나 접근 권한이 없습니다.</p>
            <Button onClick={() => navigate(-1)} className="mt-4">
              돌아가기
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 현재 사용자가 assigner인지 assignee인지 확인
  const isAssigner = currentUserId === task.assigner_id;
  const isAssignee = currentUserId === task.assignee_id;
  const canEdit = canEditTask(task, currentUserId, isAdmin);

  // 상태 변경 버튼 표시 조건
  const canChangeToInProgress = isAssignee && task.task_status === "ASSIGNED";
  const canChangeToWaitingConfirm = isAssignee && task.task_status === "IN_PROGRESS";
  const canApprove = isAssigner && task.task_status === "WAITING_CONFIRM";
  const canReject = isAssigner && task.task_status === "WAITING_CONFIRM";

  // 상태 변경 핸들러
  const handleStatusChange = async (newStatus: TaskStatus) => {
    await updateTaskStatus.mutateAsync({ taskId: task.id, newStatus });
  };

  // Task 수정 핸들러
  const handleUpdateTask = async (data: TaskUpdateFormData) => {
    await updateTask.mutateAsync({
      id: task.id,
      updates: {
        title: data.title,
        description: data.description || null,
        due_date: data.due_date || null,
      },
    });
    setEditDialogOpen(false);
  };

  // Task 삭제 핸들러
  const handleDeleteTask = async () => {
    await deleteTask.mutateAsync(task.id);
    navigate(`/projects/${task.project_id}`);
  };

  // 메시지 전송 핸들러 (텍스트 + 파일 통합)
  const handleSendMessage = async () => {
    if (!taskId || createMessageWithFiles.isPending) return;
    
    const hasText = messageInput.trim().length > 0;
    const hasFiles = attachedFiles.length > 0;

    // 텍스트도 파일도 없으면 전송하지 않음
    if (!hasText && !hasFiles) return;

    const content = hasText ? messageInput.trim() : null;
    const filesToUpload = [...attachedFiles];

    // 입력 초기화 (전송 전에 미리 초기화하여 중복 전송 방지)
    setMessageInput("");
    setAttachedFiles([]);
    stopTyping();

    try {
      // 파일이 있으면 먼저 업로드
      const uploadedFiles: Array<{ url: string; fileName: string; fileType: string; fileSize: number }> = [];
      
      if (filesToUpload.length > 0) {
        setUploadingFiles(new Set(filesToUpload.map(f => f.name)));
        
        for (const file of filesToUpload) {
          try {
            const { url, fileName, fileType, fileSize } = await uploadTaskFile(file, taskId, currentUserId!);
            uploadedFiles.push({ url, fileName, fileType, fileSize });
          } catch (error: any) {
            toast.error(`${file.name} 업로드 실패: ${error.message}`);
            // 실패한 파일은 제외하고 계속 진행
          }
        }
        
        setUploadingFiles(new Set());
      }

      // 텍스트와 파일을 함께 전송
      if (content || uploadedFiles.length > 0) {
        await createMessageWithFiles.mutateAsync({
          taskId,
          content,
          files: uploadedFiles,
        });
      }
    } catch (error: any) {
      // 에러 발생 시 입력 복원
      setMessageInput(content || "");
      setAttachedFiles(filesToUpload);
      toast.error(error.message || "메시지 전송에 실패했습니다.");
    }
  };

  // 파일 추가 핸들러 (draft 상태로 추가, 즉시 전송하지 않음)
  const handleFileAdd = (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const validFiles: File[] = [];
    const invalidFiles: string[] = [];

    for (const file of fileArray) {
      // 파일 크기 제한 (10MB)
      if (file.size > 10 * 1024 * 1024) {
        invalidFiles.push(`${file.name} (10MB 초과)`);
        continue;
      }
      validFiles.push(file);
    }

    if (invalidFiles.length > 0) {
      toast.error(`다음 파일은 크기 제한을 초과합니다: ${invalidFiles.join(", ")}`);
    }

    if (validFiles.length > 0) {
      setAttachedFiles((prev) => [...prev, ...validFiles]);
    }
  };

  // 첨부 파일 제거 핸들러
  const handleFileRemove = (index: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // 드래그 앤 드롭 핸들러
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileAdd(e.dataTransfer.files);
    }
  };

  // 파일 선택 핸들러
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileAdd(e.target.files);
    }
    // input 초기화
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // 날짜 포맷팅
  const formatDate = (dateString: string | null) => {
    if (!dateString) return "미정";
    return new Date(dateString).toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  // 메시지 시간 포맷팅
  const formatMessageTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return "방금 전";
    if (minutes < 60) return `${minutes}분 전`;
    if (hours < 24) return `${hours}시간 전`;
    if (days < 7) return `${days}일 전`;
    return date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
  };

  // 메시지가 읽혔는지 확인
  const isMessageRead = (message: MessageWithProfile): boolean => {
    if (!currentUserId || message.user_id === currentUserId) return false; // 본인 메시지는 읽음 표시 안 함
    const readBy = message.read_by || [];
    return Array.isArray(readBy) && readBy.includes(currentUserId);
  };

  // SYSTEM 메시지의 이벤트 타입 판단
  const getSystemEventType = (message: MessageWithProfile): "APPROVAL_REQUEST" | "APPROVED" | "REJECTED" | null => {
    if (message.message_type !== "SYSTEM") return null;
    const content = message.content.toLowerCase();
    if (content.includes("승인 요청") || content.includes("waiting_confirm")) {
      return "APPROVAL_REQUEST";
    }
    if (content.includes("승인") || content.includes("approved")) {
      return "APPROVED";
    }
    if (content.includes("반려") || content.includes("rejected")) {
      return "REJECTED";
    }
    return null;
  };

  // 파일 타입 아이콘 반환
  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith("image/")) return "🖼️";
    if (fileType === "application/pdf") return "📄";
    if (fileType.includes("word") || fileType.includes("document")) return "📝";
    if (fileType.includes("excel") || fileType.includes("spreadsheet")) return "📊";
    return "📎";
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* 뒤로가기 버튼 */}
      <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4">
        <ArrowLeft className="mr-2 h-4 w-4" />
        돌아가기
      </Button>

      {/* Task 헤더 영역 */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-2 flex-1">
              <CardTitle className="text-2xl">{task.title}</CardTitle>
              <div className="flex items-center gap-2">
                <TaskStatusBadge status={task.task_status} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* 수정 버튼 */}
              {canEdit && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditDialogOpen(true)}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  수정
                </Button>
              )}
              {/* 삭제 버튼 (Admin만) */}
              {isAdmin && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setDeleteDialogOpen(true)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  삭제
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Task 설명 */}
          {task.description && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-1">설명</h3>
              <p className="text-sm">{task.description}</p>
            </div>
          )}

          {/* Task 정보 그리드 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-1">지시자</h3>
              <p className="text-sm">
                {task.assigner?.full_name || task.assigner?.email || task.assigner_id}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-1">담당자</h3>
              <p className="text-sm">
                {task.assignee?.full_name || task.assignee?.email || task.assignee_id}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-1">마감일</h3>
              <p className="text-sm">{formatDate(task.due_date)}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-1">생성일</h3>
              <p className="text-sm">{formatDate(task.created_at)}</p>
            </div>
          </div>

          {/* 상태 변경 버튼 */}
          <div className="flex items-center gap-2 pt-4 border-t">
            {canChangeToInProgress && (
              <Button
                variant="default"
                size="sm"
                onClick={() => handleStatusChange("IN_PROGRESS")}
                disabled={updateTaskStatus.isPending}
              >
                <Play className="mr-2 h-4 w-4" />
                시작하기
              </Button>
            )}
            {canChangeToWaitingConfirm && (
              <Button
                variant="default"
                size="sm"
                onClick={() => handleStatusChange("WAITING_CONFIRM")}
                disabled={updateTaskStatus.isPending}
              >
                완료 요청
              </Button>
            )}
            {canApprove && (
              <Button
                variant="default"
                size="sm"
                onClick={() => handleStatusChange("APPROVED")}
                disabled={updateTaskStatus.isPending}
                className="bg-green-600 hover:bg-green-700"
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                승인
              </Button>
            )}
            {canReject && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleStatusChange("REJECTED")}
                disabled={updateTaskStatus.isPending}
              >
                <XCircle className="mr-2 h-4 w-4" />
                거부
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 채팅 영역 */}
      <Card className="flex flex-col" style={{ height: "calc(100vh - 400px)", minHeight: "500px" }}>
        <CardHeader className="border-b">
          <CardTitle className="text-lg">채팅</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
          {/* 메시지 리스트 영역 */}
          <div
            className="flex-1 overflow-y-auto p-4 space-y-4"
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            {messagesLoading ? (
              <div className="flex justify-center items-center h-full">
                <Skeleton className="h-8 w-48" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex justify-center items-center h-full">
                <p className="text-sm text-muted-foreground">아직 메시지가 없습니다.</p>
              </div>
            ) : (
              messages.map((message) => {
                const isMine = message.user_id === currentUserId;
                const eventType = getSystemEventType(message);

                // SYSTEM 메시지 처리
                if (message.message_type === "SYSTEM") {
                  // 중요한 이벤트 (승인 요청/승인/반려) 강조 UI
                  if (eventType === "APPROVAL_REQUEST") {
                    return (
                      <div key={message.id} className="flex justify-center">
                        <div className="bg-blue-50 dark:bg-blue-950 border-2 border-blue-200 dark:border-blue-800 rounded-lg px-6 py-4 max-w-md shadow-sm">
                          <div className="flex items-center justify-center gap-2 mb-2">
                            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                            <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                              승인 요청
                            </p>
                          </div>
                          <p className="text-sm text-blue-800 dark:text-blue-200 text-center">
                            {message.content}
                          </p>
                          <p className="text-xs text-blue-600 dark:text-blue-400 text-center mt-2">
                            {formatMessageTime(message.created_at)}
                          </p>
                        </div>
                      </div>
                    );
                  }
                  if (eventType === "APPROVED") {
                    return (
                      <div key={message.id} className="flex justify-center">
                        <div className="bg-green-50 dark:bg-green-950 border-2 border-green-200 dark:border-green-800 rounded-lg px-6 py-4 max-w-md shadow-sm">
                          <div className="flex items-center justify-center gap-2 mb-2">
                            <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                            <p className="text-sm font-semibold text-green-900 dark:text-green-100">
                              업무 승인
                            </p>
                          </div>
                          <p className="text-sm text-green-800 dark:text-green-200 text-center">
                            {message.content}
                          </p>
                          <p className="text-xs text-green-600 dark:text-green-400 text-center mt-2">
                            {formatMessageTime(message.created_at)}
                          </p>
                        </div>
                      </div>
                    );
                  }
                  if (eventType === "REJECTED") {
                    return (
                      <div key={message.id} className="flex justify-center">
                        <div className="bg-red-50 dark:bg-red-950 border-2 border-red-200 dark:border-red-800 rounded-lg px-6 py-4 max-w-md shadow-sm">
                          <div className="flex items-center justify-center gap-2 mb-2">
                            <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                            <p className="text-sm font-semibold text-red-900 dark:text-red-100">
                              업무 반려
                            </p>
                          </div>
                          <p className="text-sm text-red-800 dark:text-red-200 text-center">
                            {message.content}
                          </p>
                          <p className="text-xs text-red-600 dark:text-red-400 text-center mt-2">
                            {formatMessageTime(message.created_at)}
                          </p>
                        </div>
                      </div>
                    );
                  }
                  // 일반 SYSTEM 메시지
                  return (
                    <div key={message.id} className="flex justify-center">
                      <div className="bg-muted/50 border border-muted rounded-lg px-4 py-2 max-w-md">
                        <p className="text-sm text-muted-foreground text-center">{message.content}</p>
                        <p className="text-xs text-muted-foreground/70 text-center mt-1">
                          {formatMessageTime(message.created_at)}
                        </p>
                      </div>
                    </div>
                  );
                }

                // FILE 메시지 처리
                if (message.message_type === "FILE") {
                  return (
                    <div
                      key={message.id}
                      className={cn("flex", isMine ? "justify-end" : "justify-start")}
                    >
                      <div className={cn("flex gap-2 max-w-md", isMine ? "flex-row-reverse" : "flex-row")}>
                        {!isMine && (
                          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-medium">
                              {message.sender?.full_name?.charAt(0).toUpperCase() ||
                                message.sender?.email?.charAt(0).toUpperCase() ||
                                "U"}
                            </span>
                          </div>
                        )}
                        <div className={cn("flex flex-col", isMine ? "items-end" : "items-start")}>
                          {!isMine && (
                            <span className="text-xs text-muted-foreground mb-1 px-1">
                              {message.sender?.full_name || message.sender?.email || "사용자"}
                            </span>
                          )}
                          <div
                            className={cn(
                              "rounded-lg px-4 py-3 border-2",
                              isMine
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-muted text-foreground border-muted"
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-xl">{getFileIcon(message.file_type || "")}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{message.file_name || message.content}</p>
                                <p className="text-xs opacity-70 mt-1">
                                  {message.file_size ? `${(message.file_size / 1024).toFixed(1)} KB` : ""}
                                </p>
                              </div>
                              <a
                                href={getTaskFileDownloadUrl(message.file_url || "")}
                                download={message.file_name}
                                className="ml-2"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Download className="h-4 w-4" />
                              </a>
                            </div>
                          </div>
                          <span className="text-xs text-muted-foreground mt-1 px-1">
                            {formatMessageTime(message.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }

                // USER 메시지: 좌/우 말풍선 구분
                return (
                  <div
                    key={message.id}
                    className={cn("flex", isMine ? "justify-end" : "justify-start")}
                  >
                    <div className={cn("flex gap-2 max-w-md", isMine ? "flex-row-reverse" : "flex-row")}>
                      {!isMine && (
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-medium">
                            {message.sender?.full_name?.charAt(0).toUpperCase() ||
                              message.sender?.email?.charAt(0).toUpperCase() ||
                              "U"}
                          </span>
                        </div>
                      )}
                      <div className={cn("flex flex-col", isMine ? "items-end" : "items-start")}>
                        {!isMine && (
                          <span className="text-xs text-muted-foreground mb-1 px-1">
                            {message.sender?.full_name || message.sender?.email || "사용자"}
                          </span>
                        )}
                        <div
                          className={cn(
                            "rounded-lg px-4 py-2",
                            isMine
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-foreground"
                          )}
                        >
                          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                        </div>
                        <div className="flex items-center gap-1 mt-1 px-1">
                          <span className="text-xs text-muted-foreground">
                            {formatMessageTime(message.created_at)}
                          </span>
                          {/* 읽음 표시 (본인이 보낸 메시지만) */}
                          {isMine && (
                            <span className="text-xs text-muted-foreground">
                              {isMessageRead(message) ? "✓✓" : "✓"}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            {/* 입력 중 표시 */}
            {typingUsers.length > 0 && (
              <div className="flex justify-start">
                <div className="bg-muted/50 border border-muted rounded-lg px-4 py-2 max-w-md">
                  <p className="text-xs text-muted-foreground italic">
                    {typingUsers.length === 1
                      ? `${typingUsers[0]}님이 입력 중...`
                      : `${typingUsers.join(", ")}님이 입력 중...`}
                  </p>
                </div>
              </div>
            )}
            {/* 스크롤 앵커 */}
            <div ref={messagesEndRef} />
          </div>

          {/* 입력 영역 */}
          <div className="border-t p-4 space-y-2">
            {/* 첨부파일 영역 (드래그 앤 드롭) */}
            <div
              className={cn(
                "border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer",
                dragActive
                  ? "border-primary bg-primary/5"
                  : "border-muted hover:border-primary/50",
                createMessageWithFiles.isPending && "opacity-50 pointer-events-none"
              )}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileSelect}
                accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx"
              />
              <Paperclip className="h-5 w-5 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                파일을 드래그하여 놓거나 클릭하여 선택하세요
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                이미지, PDF, 문서 등 다양한 파일 형식 지원 (최대 10MB, 여러 파일 선택 가능)
              </p>
            </div>

            {/* 첨부된 파일 목록 (Draft 상태) */}
            {attachedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 p-2 bg-muted/30 rounded-lg">
                {attachedFiles.map((file, index) => (
                  <div
                    key={`${file.name}-${index}`}
                    className="flex items-center gap-2 px-3 py-2 bg-background border rounded-lg text-sm"
                  >
                    <File className="h-4 w-4 text-muted-foreground" />
                    <span className="max-w-[200px] truncate">{file.name}</span>
                    <span className="text-xs text-muted-foreground">
                      ({(file.size / 1024).toFixed(1)} KB)
                    </span>
                    <button
                      type="button"
                      onClick={() => handleFileRemove(index)}
                      className="ml-1 p-1 hover:bg-muted rounded"
                      aria-label="파일 제거"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* 텍스트 입력 및 전송 */}
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <textarea
                  ref={textareaRef}
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  placeholder="메시지를 입력하세요. (Enter: 전송 / Shift+Enter: 줄바꿈)"
                  className="w-full min-h-[60px] max-h-[120px] p-3 border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                  onKeyDown={(e) => {
                    // Enter 키: 메시지 전송
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                    // Shift+Enter: 줄바꿈 (기본 동작 유지)
                  }}
                  disabled={createMessageWithFiles.isPending}
                />
              </div>
              <Button
                size="icon"
                className="h-[60px] w-[60px]"
                disabled={
                  (!messageInput.trim() && attachedFiles.length === 0) ||
                  createMessageWithFiles.isPending
                }
                onClick={handleSendMessage}
              >
                {createMessageWithFiles.isPending ? (
                  <div className="h-5 w-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 수정 다이얼로그 */}
      <TaskFormDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSubmit={handleUpdateTask}
        projectId={task.project_id}
        task={task}
        isLoading={updateTask.isPending}
      />

      {/* 삭제 확인 다이얼로그 */}
      <TaskDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDeleteTask}
        taskId={task.id}
        isLoading={deleteTask.isPending}
      />
    </div>
  );
}
