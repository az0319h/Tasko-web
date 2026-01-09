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
  useChatPresence,
  useDeleteMessage,
} from "@/hooks";
import { TaskStatusBadge } from "@/components/common/task-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TaskFormDialog } from "@/components/task/task-form-dialog";
import { TaskDeleteDialog } from "@/components/task/task-delete-dialog";
import { TaskStatusChangeDialog } from "@/components/dialog/task-status-change-dialog";
import { MessageDeleteDialog } from "@/components/dialog/message-delete-dialog";
import type { TaskUpdateFormData } from "@/schemas/task/task-schema";
import type { TaskStatus } from "@/lib/task-status";
import type { MessageWithProfile } from "@/api/message";
import { isMessageReadByCounterpart } from "@/api/message";
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
  const deleteMessage = useDeleteMessage();

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [statusChangeDialogOpen, setStatusChangeDialogOpen] = useState(false);
  const [pendingNewStatus, setPendingNewStatus] = useState<TaskStatus | null>(null);
  const [messageDeleteDialogOpen, setMessageDeleteDialogOpen] = useState(false);
  const [pendingDeleteMessage, setPendingDeleteMessage] = useState<MessageWithProfile | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]); // Draft 상태의 파일들
  const [uploadingFiles, setUploadingFiles] = useState<Set<string>>(new Set()); // 업로드 중인 파일 이름들
  const [dragActive, setDragActive] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevIsPresentRef = useRef<boolean>(false); // 이전 Presence 상태 추적
  const lastMarkAsReadTimeRef = useRef<number>(0); // 마지막 읽음 처리 시간 (중복 호출 방지용)

  const currentUserId = currentProfile?.id;

  // Presence 추적 (채팅 화면에 사용자가 존재함을 실시간으로 추적)
  const { isPresent } = useChatPresence(taskId, !!taskId);

  // Realtime 구독 활성화 (Presence 상태 전달)
  useRealtimeMessages(taskId, !!taskId, isPresent);

  // 케이스 1: 초기 로드 시 읽음 처리 (taskId 변경 시)
  // taskId가 변경되면 초기 로드로 간주하고, Presence가 활성화되어 있을 때 읽음 처리
  useEffect(() => {
    if (taskId && currentUserId && isPresent) {
      // taskId가 변경되면 초기 로드로 간주
      const now = Date.now();
      // 1초 이내 중복 호출 방지
      if (now - lastMarkAsReadTimeRef.current > 1000) {
        lastMarkAsReadTimeRef.current = now;
        console.log(`[TaskDetail] 📖 Case 1: Marking all messages as read for task ${taskId} (initial load)`);
        markMessagesAsRead.mutate(taskId, {
          onSuccess: () => {
            console.log(`[TaskDetail] ✅ Case 1: Successfully marked all messages as read for task ${taskId}`);
          },
          onError: (error) => {
            console.error(`[TaskDetail] ❌ Case 1: Failed to mark messages as read:`, error);
            lastMarkAsReadTimeRef.current = 0; // 에러 발생 시 시간 리셋하여 재시도 가능하도록
          },
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, currentUserId]); // taskId 변경 시에만 실행 (isPresent는 체크만 하고 의존성에는 포함하지 않음)

  // 케이스 2: 채팅 화면 재진입 시 읽음 처리 (Presence false → true 전환)
  useEffect(() => {
    if (taskId && currentUserId && isPresent && !prevIsPresentRef.current) {
      // Presence가 false → true로 전환된 경우 (재진입)
      const now = Date.now();
      // 1초 이내 중복 호출 방지
      if (now - lastMarkAsReadTimeRef.current > 1000) {
        lastMarkAsReadTimeRef.current = now;
        console.log(`[TaskDetail] 📖 Case 2: Marking all messages as read for task ${taskId} (presence reactivated)`);
        markMessagesAsRead.mutate(taskId, {
          onSuccess: () => {
            console.log(`[TaskDetail] ✅ Case 2: Successfully marked all messages as read for task ${taskId}`);
          },
          onError: (error) => {
            console.error(`[TaskDetail] ❌ Case 2: Failed to mark messages as read:`, error);
            lastMarkAsReadTimeRef.current = 0; // 에러 발생 시 시간 리셋하여 재시도 가능하도록
          },
        });
      }
    }
    // 이전 Presence 상태 업데이트
    prevIsPresentRef.current = isPresent;
  }, [taskId, currentUserId, isPresent, markMessagesAsRead]);

  // taskId 변경 시 ref 리셋
  useEffect(() => {
    prevIsPresentRef.current = false;
    lastMarkAsReadTimeRef.current = 0;
  }, [taskId]);

  // 새 메시지 수신 시 스크롤 하단으로 이동
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 케이스 3: 메시지 목록이 변경되고 채팅 화면에 있을 때 읽음 처리
  // 상대방이 메시지를 보냈거나, 메시지가 업데이트되었을 때 읽음 처리
  // ⚠️ 주의: 너무 자주 실행되지 않도록 디바운싱 적용
  useEffect(() => {
    if (!taskId || !currentUserId || !isPresent || messages.length === 0 || !task) {
      return;
    }

    // 지시자/담당자 확인
    const isCurrentUserAssigner = currentUserId === task.assigner_id;
    const isCurrentUserAssignee = currentUserId === task.assignee_id;

    // 지시자/담당자가 아니면 읽음 처리 안 함
    if (!isCurrentUserAssigner && !isCurrentUserAssignee) {
      return;
    }

    // 상대방 ID 확인
    const counterpartId = isCurrentUserAssigner ? task.assignee_id : task.assigner_id;

    // 상대방이 보낸 읽지 않은 메시지가 있는지 확인
    const hasUnreadMessages = messages.some((message) => {
      // 상대방이 보낸 메시지만 확인
      if (message.user_id !== counterpartId) {
        return false;
      }

      // 읽음 상태 확인
      const readBy = message.read_by || [];
      if (!Array.isArray(readBy)) {
        return true; // read_by가 배열이 아니면 읽지 않은 것으로 간주
      }

      // 현재 사용자가 읽었는지 확인
      return !readBy.some((id: string) => String(id) === String(currentUserId));
    });

    // 읽지 않은 메시지가 있고, 최근에 읽음 처리를 하지 않았다면 실행
    if (hasUnreadMessages) {
      const now = Date.now();
      // 3초 이내 중복 호출 방지 (디바운싱)
      if (now - lastMarkAsReadTimeRef.current > 3000) {
        lastMarkAsReadTimeRef.current = now;
        console.log(`[TaskDetail] 📖 Case 3: Marking all messages as read for task ${taskId} (message list updated)`);
        markMessagesAsRead.mutate(taskId, {
          onSuccess: () => {
            console.log(`[TaskDetail] ✅ Case 3: Successfully marked all messages as read for task ${taskId}`);
          },
          onError: (error) => {
            console.error(`[TaskDetail] ❌ Case 3: Failed to mark messages as read:`, error);
            lastMarkAsReadTimeRef.current = 0; // 에러 발생 시 시간 리셋하여 재시도 가능하도록
          },
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, taskId, currentUserId, isPresent, task]); // messages와 task가 변경될 때마다 실행

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
  // 수정 권한: 지시자만 수정 가능
  const canEdit = isAssigner;
  // 삭제 권한: 지시자만 삭제 가능
  const canDelete = isAssigner;
  // 채팅 작성 권한: 지시자 또는 담당자만 작성 가능
  const canSendMessage = isAssigner || isAssignee;

  // 상태 변경 버튼 표시 조건
  const canChangeToInProgress = isAssignee && (task.task_status === "ASSIGNED" || task.task_status === "REJECTED");
  const canChangeToWaitingConfirm = isAssignee && task.task_status === "IN_PROGRESS";
  const canApprove = isAssigner && task.task_status === "WAITING_CONFIRM";
  const canReject = isAssigner && task.task_status === "WAITING_CONFIRM";

  // 상태 변경 버튼 클릭 핸들러 (Dialog 표시)
  const handleStatusChangeClick = (newStatus: TaskStatus) => {
    setPendingNewStatus(newStatus);
    setStatusChangeDialogOpen(true);
  };

  // Dialog 확인 후 상태 변경 실행
  const handleStatusChangeConfirm = async () => {
    if (!pendingNewStatus) return;
    await updateTaskStatus.mutateAsync({ taskId: task.id, newStatus: pendingNewStatus });
  };

  // Task 수정 핸들러
  const handleUpdateTask = async (data: TaskUpdateFormData) => {
    await updateTask.mutateAsync({
      id: task.id,
      updates: {
        title: data.title,
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

  // 메시지 삭제 핸들러
  const handleDeleteMessageClick = (message: MessageWithProfile) => {
    setPendingDeleteMessage(message);
    setMessageDeleteDialogOpen(true);
  };

  const handleDeleteMessageConfirm = async () => {
    if (!pendingDeleteMessage) return;
    await deleteMessage.mutateAsync(pendingDeleteMessage.id);
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
        
        // 전송 성공 후 입력창에 포커스 복원
        setTimeout(() => {
          textareaRef.current?.focus();
        }, 0);
      }
    } catch (error: any) {
      // 에러 발생 시 입력 복원
      setMessageInput(content || "");
      setAttachedFiles(filesToUpload);
      toast.error(error.message || "메시지 전송에 실패했습니다.");
      // 에러 발생 시에도 포커스 유지 (사용자가 바로 수정할 수 있도록)
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 0);
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

  // 메시지가 상대방(assigner 또는 assignee)에 의해 읽혔는지 확인
  const isMessageRead = (message: MessageWithProfile): boolean => {
    if (!currentUserId || !task || !task.assigner_id || !task.assignee_id) {
      return false;
    }
    try {
      return isMessageReadByCounterpart(message, currentUserId, {
        assigner_id: task.assigner_id,
        assignee_id: task.assignee_id,
      });
    } catch (error) {
      console.error("읽음 상태 확인 중 에러:", error);
      return false;
    }
  };

  // SYSTEM 메시지의 이벤트 타입 판단
  const getSystemEventType = (message: MessageWithProfile): "APPROVAL_REQUEST" | "APPROVED" | "REJECTED" | null => {
    if (message.message_type !== "SYSTEM") return null;
    const content = (message.content || "").toLowerCase();
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
      <Button 
        variant="ghost" 
        onClick={() => {
          if (task?.project_id) {
            navigate(`/projects/${task.project_id}`);
          } else {
            navigate(-1);
          }
        }} 
        className="mb-4"
      >
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
              {/* 수정 버튼 (지시자만) */}
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
              {/* 삭제 버튼 (지시자만) */}
              {canDelete && (
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
          {((task as any).description) && (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-1">설명</h3>
              <p className="text-sm">{(task as any).description}</p>
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
                onClick={() => handleStatusChangeClick("IN_PROGRESS")}
                disabled={updateTaskStatus.isPending}
              >
                <Play className="mr-2 h-4 w-4" />
                {task.task_status === "REJECTED" ? "다시 업무를 진행하겠습니다" : "시작하기"}
              </Button>
            )}
            {canChangeToWaitingConfirm && (
              <Button
                variant="default"
                size="sm"
                onClick={() => handleStatusChangeClick("WAITING_CONFIRM")}
                disabled={updateTaskStatus.isPending}
              >
                완료 요청
              </Button>
            )}
            {canApprove && (
              <Button
                variant="default"
                size="sm"
                onClick={() => handleStatusChangeClick("APPROVED")}
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
                onClick={() => handleStatusChangeClick("REJECTED")}
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
            className="flex-1 overflow-y-auto p-4 space-y-4 relative"
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
                              <div className="flex items-center gap-1">
                                <a
                                  href={getTaskFileDownloadUrl(message.file_url || "")}
                                  download={message.file_name}
                                  className="ml-2"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Download className="h-4 w-4" />
                                </a>
                                {isMine && (
                                  <button
                                    onClick={() => handleDeleteMessageClick(message)}
                                    className="p-1 hover:bg-primary/20 rounded"
                                    aria-label="메시지 삭제"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 mt-1 px-1">
                            <span className="text-xs text-muted-foreground">
                              {formatMessageTime(message.created_at)}
                            </span>
                            {/* 읽음 표시 (본인이 보낸 메시지만) */}
                            {isMine && isMessageRead(message) && (
                              <span className="text-xs text-muted-foreground">
                                읽음
                              </span>
                            )}
                          </div>
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
                        <div className="relative group">
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
                          {isMine && (
                            <button
                              onClick={() => handleDeleteMessageClick(message)}
                              className="absolute -top-2 -right-2 p-1 bg-destructive text-destructive-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/90"
                              aria-label="메시지 삭제"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-1 mt-1 px-1">
                          <span className="text-xs text-muted-foreground">
                            {formatMessageTime(message.created_at)}
                          </span>
                          {/* 읽음 표시 (본인이 보낸 메시지만) */}
                          {isMine && isMessageRead(message) && (
                            <span className="text-xs text-muted-foreground">
                              읽음
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            {/* 스크롤 앵커 */}
            <div ref={messagesEndRef} />
          </div>

          {/* 입력 영역 */}
          <div className="border-t p-4 space-y-2">
            {/* 채팅 작성 권한이 없는 경우 안내 메시지 */}
            {!canSendMessage && (
              <div className="bg-muted/50 border border-muted rounded-lg p-4 text-center">
                <p className="text-sm text-muted-foreground">
                  지시자 또는 담당자만 메시지를 작성할 수 있습니다.
                </p>
                {isAdmin && (
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    관리자 권한으로 이 Task를 조회할 수 있지만, 채팅 작성은 지시자 또는 담당자만 가능합니다.
                  </p>
                )}
              </div>
            )}

            {/* 첨부파일 영역 (드래그 앤 드롭) - 지시자/담당자만 표시 */}
            {canSendMessage && (
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
                  accept="image/*,application/pdf,.doc,.docx,.hwp,.hwpx,.ppt,.pptx,.xls,.xlsx,.csv,.zip,.rar,.7z"
                  disabled={!canSendMessage}
                />
                <Paperclip className="h-5 w-5 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  파일을 드래그하여 놓거나 클릭하여 선택하세요
                </p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  이미지, PDF, 문서 등 다양한 파일 형식 지원 (최대 10MB, 여러 파일 선택 가능)
                </p>
              </div>
            )}

            {/* 첨부된 파일 목록 (Draft 상태) - 지시자/담당자만 표시 */}
            {canSendMessage && attachedFiles.length > 0 && (
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

            {/* 텍스트 입력 및 전송 - 지시자/담당자만 표시 */}
            {canSendMessage && (
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
            )}
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

      {/* 상태 변경 확인 다이얼로그 */}
      {pendingNewStatus && (
        <TaskStatusChangeDialog
          open={statusChangeDialogOpen}
          onOpenChange={setStatusChangeDialogOpen}
          currentStatus={task.task_status}
          newStatus={pendingNewStatus}
          taskTitle={task.title}
          onConfirm={handleStatusChangeConfirm}
          isLoading={updateTaskStatus.isPending}
        />
      )}

      {/* 메시지 삭제 확인 다이얼로그 */}
      <MessageDeleteDialog
        open={messageDeleteDialogOpen}
        onOpenChange={setMessageDeleteDialogOpen}
        message={pendingDeleteMessage}
        onConfirm={handleDeleteMessageConfirm}
        isLoading={deleteMessage.isPending}
      />
    </div>
  );
}
