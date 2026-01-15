import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router";
import {
  ArrowLeft,
  Play,
  CheckCircle,
  XCircle,
  Pencil,
  Trash2,
  Paperclip,
  Send,
  Download,
  File,
  X,
  Plus,
} from "lucide-react";
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
  useChatLogs,
  useRealtimeChatLogs,
} from "@/hooks";
import { TaskStatusBadge } from "@/components/common/task-status-badge";
import { ChatLogGroup } from "@/components/task/chat-log-group";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import DefaultSpinner from "@/components/common/default-spinner";
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
  const { data: chatLogs = [], isLoading: logsLoading } = useChatLogs(taskId);
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
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

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

  // 채팅 로그 리얼타임 구독 활성화
  useRealtimeChatLogs(taskId, !!taskId);

  // 케이스 1: 초기 로드 시 읽음 처리 (taskId 변경 시)
  // taskId가 변경되면 초기 로드로 간주하고, Presence가 활성화되어 있을 때 읽음 처리
  useEffect(() => {
    if (taskId && currentUserId && isPresent) {
      // taskId가 변경되면 초기 로드로 간주
      const now = Date.now();
      // 1초 이내 중복 호출 방지
      if (now - lastMarkAsReadTimeRef.current > 1000) {
        lastMarkAsReadTimeRef.current = now;
        console.log(
          `[TaskDetail] 📖 Case 1: Marking all messages as read for task ${taskId} (initial load)`,
        );
        markMessagesAsRead.mutate(taskId, {
          onSuccess: () => {
            console.log(
              `[TaskDetail] ✅ Case 1: Successfully marked all messages as read for task ${taskId}`,
            );
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
        console.log(
          `[TaskDetail] 📖 Case 2: Marking all messages as read for task ${taskId} (presence reactivated)`,
        );
        markMessagesAsRead.mutate(taskId, {
          onSuccess: () => {
            console.log(
              `[TaskDetail] ✅ Case 2: Successfully marked all messages as read for task ${taskId}`,
            );
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

  // 마지막 로그만 기본 펼침 상태로 설정 (UX 개선: 최신 로그는 자동으로 열어서 확인 가능)
  useEffect(() => {
    if (chatLogs.length > 0) {
      // 가장 마지막 로그(최신 로그)의 ID를 찾아서 펼침 상태로 설정
      const lastLog = chatLogs[chatLogs.length - 1];
      setExpandedGroups((prev) => {
        const newSet = new Set(prev);
        // 기존 펼침 상태는 유지하되, 마지막 로그는 항상 포함
        newSet.add(lastLog.id);
        return newSet;
      });
    }
  }, [chatLogs]);

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
        console.log(
          `[TaskDetail] 📖 Case 3: Marking all messages as read for task ${taskId} (message list updated)`,
        );
        markMessagesAsRead.mutate(taskId, {
          onSuccess: () => {
            console.log(
              `[TaskDetail] ✅ Case 3: Successfully marked all messages as read for task ${taskId}`,
            );
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
      <div className="container w-full">
        <DefaultSpinner />
      </div>
    );
  }

  // 에러 상태
  if (error) {
    return (
      <div className="container w-full">
        <Card className="mx-auto max-w-lg">
          <CardContent className="py-8 text-center sm:py-12">
            <p className="text-destructive text-sm font-medium sm:text-base">
              Task를 불러오는 중 오류가 발생했습니다.
            </p>
            <p className="text-muted-foreground mt-2 text-xs break-words sm:text-sm">
              {error.message}
            </p>
            <Button onClick={() => navigate(-1)} className="mt-4" size="sm">
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
      <div className="container w-full">
        <Card className="mx-auto">
          <CardContent className="py-8 text-center sm:py-12">
            <p className="text-base font-medium sm:text-lg">Task를 찾을 수 없습니다</p>
            <p className="text-muted-foreground mt-2 text-xs sm:text-sm">
              요청하신 Task가 존재하지 않거나 접근 권한이 없습니다.
            </p>
            <Button onClick={() => navigate(-1)} className="mt-4" size="sm">
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
  const canChangeToInProgress =
    isAssignee && (task.task_status === "ASSIGNED" || task.task_status === "REJECTED");
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
        due_date: data.due_date,
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
      const uploadedFiles: Array<{
        url: string;
        fileName: string;
        fileType: string;
        fileSize: number;
      }> = [];

      if (filesToUpload.length > 0) {
        setUploadingFiles(new Set(filesToUpload.map((f) => f.name)));

        for (const file of filesToUpload) {
          try {
            const { url, fileName, fileType, fileSize } = await uploadTaskFile(
              file,
              taskId,
              currentUserId!,
            );
            uploadedFiles.push({ url, fileName, fileType, fileSize });
          } catch (error: any) {
            toast.error(`${file.name} 업로드 실패: ${error.message}`);
            // 실패한 파일은 제외하고 계속 진행
          }
        }

        setUploadingFiles(new Set());
      }

      // 텍스트와 파일을 함께 전송
      // 파일이 포함된 경우 bundleId 생성 (로그 생성용)
      const bundleId = uploadedFiles.length > 0 ? crypto.randomUUID() : undefined;

      if (content || uploadedFiles.length > 0) {
        await createMessageWithFiles.mutateAsync({
          taskId,
          content,
          files: uploadedFiles,
          bundleId,
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

  // 메시지 시간 포맷팅 (절대 시간 형식: yy.MM.dd 오전/오후 hh:mm, KST 기준)
  const formatMessageTime = (dateString: string) => {
    const date = new Date(dateString);
    
    // KST 시간대로 변환 (Asia/Seoul)
    // Intl.DateTimeFormat을 사용하여 정확한 시간대 변환
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    
    const parts = formatter.formatToParts(date);
    const year = parts.find(p => p.type === 'year')?.value.slice(-2) || '00';
    const month = parts.find(p => p.type === 'month')?.value || '01';
    const day = parts.find(p => p.type === 'day')?.value || '01';
    const hours24 = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
    const minutes = parts.find(p => p.type === 'minute')?.value || '00';
    
    // 오전/오후 판단
    const ampm = hours24 < 12 ? '오전' : '오후';
    // 12시간제로 변환 (0시는 12시로, 13시 이상은 -12)
    const hours12 = hours24 === 0 ? 12 : hours24 > 12 ? hours24 - 12 : hours24;
    const hours12Str = String(hours12).padStart(2, '0');
    
    return `${year}.${month}.${day} ${ampm}${hours12Str}:${minutes}`;
  };

  // 메시지 시간 문자열 추출 (그룹핑용: yy.MM.dd 오전/오후hh:mm 형식)
  const getMessageTimeKey = (dateString: string): string => {
    const date = new Date(dateString);
    
    // KST 시간대로 변환
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    
    const parts = formatter.formatToParts(date);
    const year = parts.find(p => p.type === 'year')?.value.slice(-2) || '00';
    const month = parts.find(p => p.type === 'month')?.value || '01';
    const day = parts.find(p => p.type === 'day')?.value || '01';
    const hours24 = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
    const minutes = parts.find(p => p.type === 'minute')?.value || '00';
    
    // 오전/오후 판단
    const ampm = hours24 < 12 ? '오전' : '오후';
    // 12시간제로 변환
    const hours12 = hours24 === 0 ? 12 : hours24 > 12 ? hours24 - 12 : hours24;
    const hours12Str = String(hours12).padStart(2, '0');
    
    return `${year}.${month}.${day} ${ampm}${hours12Str}:${minutes}`;
  };

  // 두 메시지가 같은 그룹에 속하는지 확인 (같은 sender, 같은 시간, 연속)
  const isSameMessageGroup = (
    msg1: MessageWithProfile,
    msg2: MessageWithProfile | null,
  ): boolean => {
    if (!msg2) return false; // 다음 메시지가 없으면 그룹 아님
    
    // 같은 sender인지 확인
    if (msg1.user_id !== msg2.user_id) return false;
    
    // 같은 시간(분 단위)인지 확인
    const timeKey1 = getMessageTimeKey(msg1.created_at);
    const timeKey2 = getMessageTimeKey(msg2.created_at);
    if (timeKey1 !== timeKey2) return false;
    
    return true;
  };

  // 메시지 리스트에서 각 메시지가 그룹의 마지막인지 계산하는 함수
  const calculateMessageGroupInfo = (messageList: MessageWithProfile[]): Map<string, boolean> => {
    const isLastInGroupMap = new Map<string, boolean>();
    
    for (let i = 0; i < messageList.length; i++) {
      const currentMsg = messageList[i];
      const nextMsg = i < messageList.length - 1 ? messageList[i + 1] : null;
      
      // 다음 메시지와 같은 그룹이 아니면 현재 메시지가 그룹의 마지막
      const isLast = !isSameMessageGroup(currentMsg, nextMsg);
      isLastInGroupMap.set(currentMsg.id, isLast);
    }
    
    return isLastInGroupMap;
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

  // 로그에 참조된 메시지 ID 집합 생성 (삭제 버튼 숨김용)
  const loggedMessageIds = new Set<string>();
  chatLogs.forEach((log) => {
    log.items.forEach((item) => {
      loggedMessageIds.add(item.message_id);
    });
  });

  // URL을 링크로 변환하는 함수
  const renderTextWithLinks = (text: string) => {
    if (!text) return null;

    // URL 패턴: http:// 또는 https://로 시작하는 URL (공백 전까지)
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = urlRegex.exec(text)) !== null) {
      // URL 이전의 텍스트 추가
      if (match.index > lastIndex) {
        parts.push(text.substring(lastIndex, match.index));
      }

      // URL을 링크로 변환
      const url = match[0];
      parts.push(
        <a
          key={match.index}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all underline hover:opacity-80"
          style={{ wordBreak: "break-all", overflowWrap: "break-word" }}
          onClick={(e) => e.stopPropagation()}
        >
          {url}
        </a>,
      );

      lastIndex = urlRegex.lastIndex;
    }

    // 남은 텍스트 추가
    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return parts.length > 0 ? parts : text;
  };

  // 메시지 아이템 렌더링 함수
  const renderMessageItem = (message: MessageWithProfile, isLastInGroup: boolean = true) => {
    const isMine = message.user_id === currentUserId;
    const isLoggedMessage = loggedMessageIds.has(message.id); // 로그에 포함된 메시지인지 확인
    const eventType = getSystemEventType(message);

    // SYSTEM 메시지 처리
    if (message.message_type === "SYSTEM") {
      // 중요한 이벤트 (승인 요청/승인/반려) 강조 UI
      if (eventType === "APPROVAL_REQUEST") {
        return (
          <div
            key={message.id}
            className="my-3 flex max-w-full min-w-0 justify-center px-2 sm:my-4"
            style={{ maxWidth: "100%" }}
          >
            <div
              className="max-w-[90%] min-w-0 rounded-lg border-2 border-blue-200 bg-blue-50 px-4 py-3 shadow-sm sm:max-w-md sm:px-6 sm:py-4 dark:border-blue-800 dark:bg-blue-950"
              style={{ maxWidth: "90%" }}
            >
              <div className="mb-1.5 flex items-center justify-center gap-1.5 sm:mb-2 sm:gap-2">
                <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500 sm:h-2 sm:w-2" />
                <p className="text-xs font-semibold text-blue-900 sm:text-sm dark:text-blue-100">
                  승인 요청
                </p>
              </div>
              <p
                className="text-center text-xs break-words text-blue-800 sm:text-sm dark:text-blue-200"
                style={{ wordBreak: "break-word", overflowWrap: "break-word" }}
              >
                {renderTextWithLinks(message.content || "")}
              </p>
              {isLastInGroup && (
                <p className="mt-1.5 text-center text-[10px] text-blue-600 sm:mt-2 sm:text-xs dark:text-blue-400">
                  {formatMessageTime(message.created_at)}
                </p>
              )}
            </div>
          </div>
        );
      }
      if (eventType === "APPROVED") {
        return (
          <div key={message.id} className="my-3 flex justify-center px-2 sm:my-4">
            <div className="max-w-[90%] rounded-lg border-2 border-green-200 bg-green-50 px-4 py-3 shadow-sm sm:max-w-md sm:px-6 sm:py-4 dark:border-green-800 dark:bg-green-950">
              <div className="mb-1.5 flex items-center justify-center gap-1.5 sm:mb-2 sm:gap-2">
                <CheckCircle className="h-4 w-4 text-green-600 sm:h-5 sm:w-5 dark:text-green-400" />
                <p className="text-xs font-semibold text-green-900 sm:text-sm dark:text-green-100">
                  업무 승인
                </p>
              </div>
              <p
                className="text-center text-xs break-words text-green-800 sm:text-sm dark:text-green-200"
                style={{ wordBreak: "break-word", overflowWrap: "break-word" }}
              >
                {renderTextWithLinks(message.content || "")}
              </p>
              {isLastInGroup && (
                <p className="mt-1.5 text-center text-[10px] text-green-600 sm:mt-2 sm:text-xs dark:text-green-400">
                  {formatMessageTime(message.created_at)}
                </p>
              )}
            </div>
          </div>
        );
      }
      if (eventType === "REJECTED") {
        return (
          <div key={message.id} className="my-3 flex min-w-0 justify-center px-2 sm:my-4">
            <div className="max-w-[90%] min-w-0 rounded-lg border-2 border-red-200 bg-red-50 px-4 py-3 shadow-sm sm:max-w-md sm:px-6 sm:py-4 dark:border-red-800 dark:bg-red-950">
              <div className="mb-1.5 flex items-center justify-center gap-1.5 sm:mb-2 sm:gap-2">
                <XCircle className="h-4 w-4 text-red-600 sm:h-5 sm:w-5 dark:text-red-400" />
                <p className="text-xs font-semibold text-red-900 sm:text-sm dark:text-red-100">
                  업무 반려
                </p>
              </div>
              <p
                className="text-center text-xs break-words text-red-800 sm:text-sm dark:text-red-200"
                style={{ wordBreak: "break-word", overflowWrap: "break-word" }}
              >
                {renderTextWithLinks(message.content || "")}
              </p>
              {isLastInGroup && (
                <p className="mt-1.5 text-center text-[10px] text-red-600 sm:mt-2 sm:text-xs dark:text-red-400">
                  {formatMessageTime(message.created_at)}
                </p>
              )}
            </div>
          </div>
        );
      }
      // 일반 SYSTEM 메시지
      return (
        <div
          key={message.id}
          className="my-2 flex max-w-full min-w-0 justify-center px-2"
          style={{ maxWidth: "100%" }}
        >
          <div
            className="bg-muted/50 border-muted max-w-[90%] min-w-0 rounded-lg border px-3 py-1.5 sm:max-w-md sm:px-4 sm:py-2"
            style={{ maxWidth: "90%" }}
          >
            <p
              className="text-muted-foreground text-center text-xs break-words sm:text-sm"
              style={{ wordBreak: "break-word", overflowWrap: "break-word" }}
            >
              {renderTextWithLinks(message.content || "")}
            </p>
            {isLastInGroup && (
              <p className="text-muted-foreground/70 mt-0.5 text-center text-[10px] sm:mt-1 sm:text-xs">
                {formatMessageTime(message.created_at)}
              </p>
            )}
          </div>
        </div>
      );
    }

    // FILE 메시지 처리
    if (message.message_type === "FILE") {
      return (
        <div
          key={message.id}
          className={cn("mb-3 flex min-w-0 sm:mb-4", isMine ? "justify-end" : "justify-start")}
        >
          <div
            className={cn(
              "flex max-w-[85%] min-w-0 gap-1.5 sm:max-w-md sm:gap-2",
              isMine ? "flex-row-reverse" : "flex-row",
            )}
            style={{ maxWidth: "85%" }}
          >
            {!isMine && (
              <div className="bg-muted flex h-7 w-7 shrink-0 items-center justify-center rounded-full sm:h-8 sm:w-8">
                <span className="text-[10px] font-medium sm:text-xs">
                  {message.sender?.full_name?.charAt(0).toUpperCase() ||
                    message.sender?.email?.charAt(0).toUpperCase() ||
                    "U"}
                </span>
              </div>
            )}
            <div className={cn("flex min-w-0 flex-col", isMine ? "items-end" : "items-start")}>
              {!isMine && (
                <span className="text-muted-foreground mb-0.5 max-w-full truncate px-1 text-[10px] sm:mb-1 sm:text-xs">
                  {message.sender?.full_name || message.sender?.email || "사용자"}
                </span>
              )}
              <div
                className={cn(
                  "max-w-full min-w-0 rounded-lg border-2 px-3 py-2 sm:px-4 sm:py-3",
                  isMine
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted text-foreground border-muted",
                )}
              >
                <div className="flex max-w-full min-w-0 items-center gap-2">
                  <span className="shrink-0 text-base sm:text-xl">
                    {getFileIcon(message.file_type || "")}
                  </span>
                  <div className="min-w-0 flex-1 overflow-hidden">
                    <a
                      href={getTaskFileDownloadUrl(message.file_url || "")}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-xs font-medium break-all hover:underline sm:text-sm"
                      onClick={(e) => e.stopPropagation()}
                      title={message.file_name || message.content || undefined}
                      style={{ wordBreak: "break-all", overflowWrap: "break-word" }}
                    >
                      {message.file_name || message.content}
                    </a>
                    <p className="mt-0.5 text-[10px] break-all opacity-70 sm:mt-1 sm:text-xs">
                      {message.file_size ? `${(message.file_size / 1024).toFixed(1)} KB` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <a
                      href={getTaskFileDownloadUrl(message.file_url || "")}
                      download={message.file_name}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 hover:opacity-70"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Download className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    </a>
                    {isMine && !isLoggedMessage && (
                      <button
                        onClick={() => handleDeleteMessageClick(message)}
                        className="hover:bg-primary/20 rounded p-1"
                        aria-label="메시지 삭제"
                      >
                        <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
              {isLastInGroup && (
                <div className="mt-0.5 flex items-center gap-1 px-1 sm:mt-1">
                  <span className="text-muted-foreground text-[10px] sm:text-xs">
                    {formatMessageTime(message.created_at)}
                  </span>
                  {/* 읽음 표시 (본인이 보낸 메시지만) */}
                  {isMine && isMessageRead(message) && (
                    <span className="text-muted-foreground text-[10px] sm:text-xs">읽음</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    // USER 메시지: 좌/우 말풍선 구분
    return (
      <div
        key={message.id}
        className={cn(
          "mb-3 flex max-w-full min-w-0 sm:mb-4",
          isMine ? "justify-end" : "justify-start",
        )}
        style={{ maxWidth: "100%" }}
      >
        <div
          className={cn(
            "flex max-w-[85%] min-w-0 gap-1.5 sm:max-w-md sm:gap-2",
            isMine ? "flex-row-reverse" : "flex-row",
          )}
          style={{ maxWidth: "85%" }}
        >
          {!isMine && (
            <div className="bg-muted flex h-7 w-7 shrink-0 items-center justify-center rounded-full sm:h-8 sm:w-8">
              <span className="text-[10px] font-medium sm:text-xs">
                {message.sender?.full_name?.charAt(0).toUpperCase() ||
                  message.sender?.email?.charAt(0).toUpperCase() ||
                  "U"}
              </span>
            </div>
          )}
          <div className={cn("flex min-w-0 flex-col", isMine ? "items-end" : "items-start")}>
            {!isMine && (
              <span className="text-muted-foreground mb-0.5 max-w-full truncate px-1 text-[10px] sm:mb-1 sm:text-xs">
                {message.sender?.full_name || message.sender?.email || "사용자"}
              </span>
            )}
            <div className="group relative max-w-full min-w-0">
              <div
                className={cn(
                  "max-w-full min-w-0 rounded-lg px-3 py-1.5 sm:px-4 sm:py-2",
                  isMine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
                )}
              >
                <p
                  className="text-xs break-words whitespace-pre-wrap sm:text-sm"
                  style={{ wordBreak: "break-word", overflowWrap: "break-word" }}
                >
                  {renderTextWithLinks(message.content || "")}
                </p>
              </div>
              {isMine && !isLoggedMessage && (
                <button
                  onClick={() => handleDeleteMessageClick(message)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90 absolute -top-1.5 -right-1.5 rounded-full p-0.5 opacity-0 transition-opacity group-hover:opacity-100 sm:-top-2 sm:-right-2 sm:p-1"
                  aria-label="메시지 삭제"
                >
                  <Trash2 className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                </button>
              )}
            </div>
            {isLastInGroup && (
              <div className="mt-0.5 flex items-center gap-1 px-1 sm:mt-1">
                <span className="text-muted-foreground text-[10px] sm:text-xs">
                  {formatMessageTime(message.created_at)}
                </span>
                {/* 읽음 표시 (본인이 보낸 메시지만) */}
                {isMine && isMessageRead(message) && (
                  <span className="text-muted-foreground text-[10px] sm:text-xs">읽음</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // SYSTEM 메시지의 이벤트 타입 판단
  const getSystemEventType = (
    message: MessageWithProfile,
  ): "APPROVAL_REQUEST" | "APPROVED" | "REJECTED" | null => {
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
    <div className="w-full">
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
        className="mb-4 -ml-2"
        size="sm"
      >
        <ArrowLeft className="mr-1.5 h-4 w-4" />
        <span className="hidden sm:inline">돌아가기</span>
        <span className="sm:hidden">뒤로</span>
      </Button>

      {/* PC: 2컬럼 레이아웃, 모바일: 1컬럼 */}
      <div className="flex flex-col gap-4 xl:flex-row xl:gap-6">
        {/* 좌측: Task 정보 영역 */}
        <div className="w-full xl:w-[380px] xl:shrink-0">
          <Card className="xl:sticky xl:top-6">
            <CardHeader className="pb-3 sm:pb-4">
              {/* 모바일: 세로 배치, 태블릿+: 가로 배치, xl: 다시 세로 배치 */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between xl:flex-col xl:justify-start">
                <div className="min-w-0 flex-1 space-y-2">
                  <CardTitle className="text-lg sm:text-xl lg:text-2xl">{task.title}</CardTitle>
                  <div className="flex items-center gap-2">
                    <TaskStatusBadge status={task.task_status} />
                  </div>
                </div>
                {/* 액션 버튼 */}
                <div className="flex shrink-0 items-center gap-2 xl:w-full xl:justify-start">
                  {/* 수정 버튼 (지시자만) */}
                  {canEdit && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditDialogOpen(true)}
                      className="h-8 px-2.5 sm:px-3"
                    >
                      <Pencil className="h-3.5 w-3.5 sm:mr-1.5" />
                      <span className="hidden sm:inline">수정</span>
                    </Button>
                  )}
                  {/* 삭제 버튼 (지시자만) */}
                  {canDelete && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setDeleteDialogOpen(true)}
                      className="h-8 px-2.5 sm:px-3"
                    >
                      <Trash2 className="h-3.5 w-3.5 sm:mr-1.5" />
                      <span className="hidden sm:inline">삭제</span>
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-0">
              {/* Task 설명 */}
              {(task as any).description && (
                <div className="border-b pb-3">
                  <h3 className="text-muted-foreground mb-1.5 text-xs font-medium tracking-wide uppercase">
                    설명
                  </h3>
                  <p className="text-sm leading-relaxed">{(task as any).description}</p>
                </div>
              )}

              {/* Task 정보 그리드 - 모바일에서 2x2 */}
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                {task.project && (
                  <>
                    <div className="space-y-1">
                      <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                        기회명
                      </h3>
                      <p className="truncate text-sm font-medium">{task.project.title}</p>
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                        클라이언트
                      </h3>
                      <p className="truncate text-sm font-medium">{task.project.client_name}</p>
                    </div>
                  </>
                )}
                <div className="space-y-1">
                  <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                    지시자
                  </h3>
                  <p className="truncate text-sm font-medium">
                    {task.assigner?.full_name || task.assigner?.email || task.assigner_id}
                  </p>
                </div>
                <div className="space-y-1">
                  <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                    담당자
                  </h3>
                  <p className="truncate text-sm font-medium">
                    {task.assignee?.full_name || task.assignee?.email || task.assignee_id}
                  </p>
                </div>
                <div className="space-y-1">
                  <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                    마감일
                  </h3>
                  <p className="text-sm font-medium">{formatDate(task.due_date)}</p>
                </div>
                <div className="space-y-1">
                  <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                    생성일
                  </h3>
                  <p className="text-sm font-medium">{formatDate(task.created_at)}</p>
                </div>
              </div>

              {/* 상태 변경 버튼 - 모바일에서 풀 너비 */}
              {(canChangeToInProgress || canChangeToWaitingConfirm || canApprove || canReject) && (
                <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row">
                  {canChangeToInProgress && (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => handleStatusChangeClick("IN_PROGRESS")}
                      disabled={updateTaskStatus.isPending}
                      className="w-full justify-center sm:w-auto"
                    >
                      <Play className="mr-1.5 h-4 w-4" />
                      {task.task_status === "REJECTED" ? "다시 진행" : "시작하기"}
                    </Button>
                  )}
                  {canChangeToWaitingConfirm && (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => handleStatusChangeClick("WAITING_CONFIRM")}
                      disabled={updateTaskStatus.isPending}
                      className="w-full justify-center sm:w-auto"
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
                      className="w-full justify-center bg-green-600 hover:bg-green-700 sm:w-auto"
                    >
                      <CheckCircle className="mr-1.5 h-4 w-4" />
                      승인
                    </Button>
                  )}
                  {canReject && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleStatusChangeClick("REJECTED")}
                      disabled={updateTaskStatus.isPending}
                      className="w-full justify-center sm:w-auto"
                    >
                      <XCircle className="mr-1.5 h-4 w-4" />
                      거부
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 우측: 채팅 영역 */}
        <Card className="flex h-[70vh] max-h-[70vh] w-full flex-col overflow-x-hidden overflow-y-hidden py-4 xl:h-[90vh] xl:max-h-none">
          <CardHeader className="shrink-0 border-b py-1 !pb-1">
            <CardTitle className="py-1 text-base sm:text-lg">채팅</CardTitle>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
            <div
              className="relative flex-1 overflow-x-hidden overflow-y-auto"
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              {messagesLoading || logsLoading ? (
                <div className="flex h-full items-center justify-center">
                  <Spinner />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <p className="text-muted-foreground text-sm">아직 메시지가 없습니다.</p>
                </div>
              ) : (
                <div
                  className="max-w-full min-w-0 space-y-1 px-2 sm:px-4"
                  style={{ maxWidth: "100%" }}
                >
                  {/* 일반 메시지 (로그에 참조되지 않은 메시지, SYSTEM 제외) */}
                  {(() => {
                    const regularMessages = messages.filter(
                      (msg) => !loggedMessageIds.has(msg.id) && msg.message_type !== "SYSTEM",
                    );

                    // SYSTEM 메시지 (상태 변경 알림)
                    const systemMessages = messages.filter((msg) => msg.message_type === "SYSTEM");

                    // 타임라인 구성: 로그와 SYSTEM 메시지를 시간순으로 배치
                    const timeline: Array<{
                      type: "log" | "system" | "regular";
                      data: any;
                      timestamp: number;
                    }> = [];

                    // 로그 추가 (로그 박스)
                    chatLogs.forEach((log) => {
                      timeline.push({
                        type: "log",
                        data: log,
                        timestamp: new Date(log.created_at).getTime(),
                      });
                    });

                    // SYSTEM 메시지 추가 (상태 변경 알림)
                    systemMessages.forEach((msg) => {
                      timeline.push({
                        type: "system",
                        data: msg,
                        timestamp: new Date(msg.created_at).getTime(),
                      });
                    });

                    // 타임라인 정렬 (로그와 SYSTEM 메시지)
                    timeline.sort((a, b) => {
                      if (a.timestamp === b.timestamp) {
                        // 같은 시간이면 로그가 먼저 (로그 박스가 SYSTEM 메시지보다 먼저 표시)
                        return a.type === "log" ? -1 : 1;
                      }
                      return a.timestamp - b.timestamp;
                    });

                    // SYSTEM 메시지와 일반 메시지를 합쳐서 그룹 정보 계산
                    const allMessagesForGrouping: MessageWithProfile[] = [];
                    timeline.forEach((item) => {
                      if (item.type === "system") {
                        allMessagesForGrouping.push(item.data);
                      }
                    });
                    allMessagesForGrouping.push(...regularMessages);
                    
                    // 그룹 정보 계산
                    const groupInfoMap = calculateMessageGroupInfo(allMessagesForGrouping);

                    // 렌더링: 타임라인 + 일반 메시지
                    return (
                      <>
                        {/* 타임라인 (로그 박스 + SYSTEM 메시지) */}
                        {timeline.map((item) => {
                          if (item.type === "log") {
                            const log = item.data;
                            // 로그 내부 메시지들의 그룹 정보 계산
                            const logMessages = log.items.map((logItem: { message: MessageWithProfile }) => logItem.message);
                            const logGroupInfoMap = calculateMessageGroupInfo(logMessages);
                            
                            // 로그 내부 메시지 렌더링 함수 (그룹 정보 포함)
                            const renderLogMessage = (message: MessageWithProfile) => {
                              const isLastInGroup = logGroupInfoMap.get(message.id) ?? true;
                              return renderMessageItem(message, isLastInGroup);
                            };
                            
                            return (
                              <div key={log.id}>
                                <ChatLogGroup
                                  log={log}
                                  isExpanded={expandedGroups.has(log.id)}
                                  onToggle={() => {
                                    const newSet = new Set(expandedGroups);
                                    if (newSet.has(log.id)) newSet.delete(log.id);
                                    else newSet.add(log.id);
                                    setExpandedGroups(newSet);
                                  }}
                                  renderMessage={renderLogMessage}
                                />
                              </div>
                            );
                          } else {
                            // SYSTEM 메시지
                            const isLastInGroup = groupInfoMap.get(item.data.id) ?? true;
                            return <div key={item.data.id}>{renderMessageItem(item.data, isLastInGroup)}</div>;
                          }
                        })}

                        {/* 일반 메시지 (로그에 참조되지 않은 메시지) */}
                        {regularMessages.map((msg) => {
                          const isLastInGroup = groupInfoMap.get(msg.id) ?? true;
                          return <div key={msg.id}>{renderMessageItem(msg, isLastInGroup)}</div>;
                        })}
                      </>
                    );
                  })()}
                </div>
              )}
              {/* 스크롤 앵커 */}
              <div ref={messagesEndRef} />
            </div>

            {/* 입력 영역 */}
            <div className="bg-background shrink-0 space-y-2 border-t py-4">
              {/* 채팅 작성 권한이 없는 경우 안내 메시지 */}
              {!canSendMessage && (
                <div className="bg-muted/50 border-muted rounded-lg border p-3 text-center sm:p-4">
                  <p className="text-muted-foreground text-xs sm:text-sm">
                    지시자 또는 담당자만 메시지를 작성할 수 있습니다.
                  </p>
                  {isAdmin && (
                    <p className="text-muted-foreground/70 mt-1 text-xs">
                      관리자 권한으로 조회만 가능합니다.
                    </p>
                  )}
                </div>
              )}

              {/* 첨부된 파일 목록 (Draft 상태) - 지시자/담당자만 표시 */}
              {canSendMessage && attachedFiles.length > 0 && (
                <div className="bg-muted/30 flex flex-wrap gap-1.5 rounded-lg p-2.5 sm:gap-2 sm:p-3">
                  {attachedFiles.map((file, index) => (
                    <div
                      key={`${file.name}-${index}`}
                      className="bg-background hover:bg-muted/50 flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-sm transition-colors sm:gap-2 sm:px-3 sm:py-2 sm:text-sm"
                    >
                      <File className="text-primary h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
                      <span className="max-w-[120px] truncate font-medium sm:max-w-[200px]">
                        {file.name}
                      </span>
                      <span className="text-muted-foreground hidden text-xs sm:inline">
                        ({(file.size / 1024).toFixed(1)} KB)
                      </span>
                      <button
                        type="button"
                        onClick={() => handleFileRemove(index)}
                        className="hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded p-0.5 transition-colors sm:p-1"
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
                <div
                  className={cn(
                    "bg-muted/50 relative flex flex-col gap-2 rounded-lg border p-2 transition-colors sm:p-3",
                    dragActive && "bg-primary/10 border-primary/50",
                  )}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                >
                  {/* 드래그 앤 드롭 활성 상태 표시 */}
                  {dragActive && (
                    <div className="border-primary bg-primary/10 pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed">
                      <div className="text-primary flex flex-col items-center gap-2">
                        <Plus className="h-8 w-8 animate-bounce" />
                        <p className="text-sm font-medium">파일을 여기에 놓으세요</p>
                      </div>
                    </div>
                  )}

                  {/* 입력 필드 */}
                  <textarea
                    ref={textareaRef}
                    rows={2}
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    placeholder="메시지를 입력해주세요"
                    className="w-full resize-none border-0 bg-transparent px-2 py-1.5 text-sm focus:outline-none sm:px-3 sm:py-2 sm:text-base"
                    style={{
                      lineHeight: "1.5",
                    }}
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

                  {/* 하단 버튼 영역 */}
                  <div className="flex items-center justify-between gap-2">
                    {/* 파일 첨부 버튼 */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="border-border hover:bg-background h-8 w-8 shrink-0 rounded-full border sm:h-9 sm:w-9"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={createMessageWithFiles.isPending}
                      title="파일 첨부"
                    >
                      <Plus className="h-4 w-4 sm:h-5 sm:w-5" />
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={handleFileSelect}
                      accept="image/*,application/pdf,.doc,.docx,.hwp,.hwpx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.zip,.rar,.7z"
                      disabled={!canSendMessage}
                    />

                    {/* 전송 버튼 */}
                    <Button
                      size="icon"
                      className="bg-background hover:bg-background/80 border-border h-8 w-8 shrink-0 rounded-full border sm:h-9 sm:w-9"
                      disabled={
                        (!messageInput.trim() && attachedFiles.length === 0) ||
                        createMessageWithFiles.isPending
                      }
                      onClick={handleSendMessage}
                      title="전송"
                    >
                      {createMessageWithFiles.isPending ? (
                        <div className="border-foreground h-3.5 w-3.5 animate-spin rounded-full border-2 border-t-transparent sm:h-4 sm:w-4" />
                      ) : (
                        <Send className="text-foreground h-3.5 w-3.5 rotate-[-45deg] sm:h-4 sm:w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

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
