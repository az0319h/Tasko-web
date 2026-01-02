// Task 상태 변경 이벤트 핸들러
import supabase from '@/lib/supabase';
import { sendTaskNotificationEmail } from './email-queue-service';
import type { TaskStatusEmailData } from './email-templates/task-status-templates';
import type { EmailTemplateType } from './email-templates/template-manager';
import { emailLogger } from './email-logger';

// Task 상태 변경 이벤트 데이터
export interface TaskStatusChangeEvent {
  taskId: string;
  oldStatus: string;
  newStatus: string;
  changedBy: string;
  changedAt: Date;
}

// 사용자 정보 인터페이스
interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  role: string | null;
}

// Task 정보 인터페이스
interface TaskInfo {
  id: string;
  title: string;
  description?: string | null;
  project_id: string | null;
  assigner_id?: string | null;
  assignee_id?: string | null;
  task_status: string;
  projects?: {
    title: string;
  } | null;
}

class TaskEventHandler {
  private isListening = false;

  // 이벤트 리스너 시작
  public startListening(): void {
    if (this.isListening) {
      emailLogger.warn('Task 이벤트 리스너가 이미 실행 중입니다.');
      return;
    }

    this.setupRealtimeSubscription();
    this.isListening = true;
    emailLogger.info('Task 상태 변경 이벤트 리스너가 시작되었습니다.');
  }

  // 이벤트 리스너 중지
  public stopListening(): void {
    if (!this.isListening) {
      return;
    }

    // Supabase 실시간 구독 해제
    supabase.removeAllChannels();
    this.isListening = false;
    emailLogger.info('Task 상태 변경 이벤트 리스너가 중지되었습니다.');
  }

  // Supabase Realtime 구독 설정
  private setupRealtimeSubscription(): void {
    const channel = supabase
      .channel('task-status-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'tasks',
          filter: 'task_status=neq.null'
        },
        (payload) => {
          this.handleTaskStatusChange(payload);
        }
      )
      .subscribe();

    emailLogger.debug('Supabase Realtime 구독이 설정되었습니다.', {
      metadata: { channel: 'task-status-changes' }
    });
  }

  // Task 상태 변경 처리
  private async handleTaskStatusChange(payload: any): Promise<void> {
    try {
      const newRecord = payload.new;
      const oldRecord = payload.old;

      // 상태가 실제로 변경되었는지 확인
      if (oldRecord.task_status === newRecord.task_status) {
        return;
      }

      const event: TaskStatusChangeEvent = {
        taskId: newRecord.id,
        oldStatus: oldRecord.task_status,
        newStatus: newRecord.task_status,
        changedBy: 'System', // 실제로는 현재 사용자 정보를 가져와야 함
        changedAt: new Date()
      };

      emailLogger.info(
        `Task 상태 변경 감지: ${event.oldStatus} → ${event.newStatus}`,
        {
          jobId: event.taskId,
          templateType: 'task_status_change',
          metadata: { oldStatus: event.oldStatus, newStatus: event.newStatus }
        }
      );

      await this.processTaskStatusChange(event);

    } catch (error) {
      emailLogger.error('Task 상태 변경 처리 중 오류 발생', {
        errorDetails: error,
        metadata: { payload }
      });
    }
  }

  // Task 상태 변경 처리 로직
  private async processTaskStatusChange(event: TaskStatusChangeEvent): Promise<void> {
    try {
      // 1. Task 정보 조회
      const taskInfo = await this.getTaskInfo(event.taskId);
      if (!taskInfo) {
        emailLogger.warn(`Task 정보를 찾을 수 없습니다: ${event.taskId}`, {
          jobId: event.taskId
        });
        return;
      }

      // 2. 관련 사용자 정보 조회
      const users = await this.getRelatedUsers(taskInfo);
      if (users.length === 0) {
        emailLogger.warn(`관련 사용자를 찾을 수 없습니다: ${event.taskId}`, {
          jobId: event.taskId
        });
        return;
      }

      // 3. 이메일 발송 조건 확인
      if (!this.shouldSendEmail(event.oldStatus, event.newStatus)) {
        emailLogger.debug(`이메일 발송 조건에 맞지 않음: ${event.oldStatus} → ${event.newStatus}`, {
          jobId: event.taskId
        });
        return;
      }

      // 4. 중복 발송 방지 체크
      if (await this.isDuplicateNotification(event)) {
        emailLogger.warn(`중복 알림 발송 방지: ${event.taskId}`, {
          jobId: event.taskId
        });
        return;
      }

      // 5. 이메일 데이터 생성
      const emailData = await this.createEmailData(event, taskInfo, users);

      // 6. 이메일 발송
      await this.sendStatusChangeEmail(event, emailData, users);

      // 7. 발송 히스토리 기록
      await this.recordNotificationHistory(event);

    } catch (error) {
      emailLogger.error(`Task 상태 변경 처리 실패: ${event.taskId}`, {
        jobId: event.taskId,
        errorDetails: error
      });
    }
  }

  // Task 정보 조회
  private async getTaskInfo(taskId: string): Promise<TaskInfo | null> {
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select(`
          id,
          title,
          description,
          project_id,
          assigner_id,
          assignee_id,
          task_status,
          projects (
            title
          )
        `)
        .eq('id', taskId)
        .single();

      if (error) {
        emailLogger.error(`Task 정보 조회 실패: ${taskId}`, {
          jobId: taskId,
          errorDetails: error
        });
        return null;
      }

      return data;
    } catch (error) {
      emailLogger.error(`Task 정보 조회 중 예외 발생: ${taskId}`, {
        jobId: taskId,
        errorDetails: error
      });
      return null;
    }
  }

  // 관련 사용자 정보 조회
  private async getRelatedUsers(taskInfo: TaskInfo): Promise<UserProfile[]> {
    try {
      const userIds = [taskInfo.assigner_id, taskInfo.assignee_id].filter(Boolean) as string[];
      
      if (userIds.length === 0) {
        return [];
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name, role')
        .in('id', userIds);

      if (error) {
        emailLogger.error('관련 사용자 정보 조회 실패', {
          jobId: taskInfo.id,
          errorDetails: error,
          metadata: { userIds }
        });
        return [];
      }

      return data || [];
    } catch (error) {
      emailLogger.error('관련 사용자 정보 조회 중 예외 발생', {
        jobId: taskInfo.id,
        errorDetails: error
      });
      return [];
    }
  }

  // 이메일 발송 조건 확인
  private shouldSendEmail(oldStatus: string, newStatus: string): boolean {
    // 의미있는 상태 변경인지 확인
    const meaningfulChanges = [
      'ASSIGNED',
      'IN_PROGRESS',
      'WAITING_CONFIRM',
      'APPROVED',
      'REJECTED'
    ];

    return meaningfulChanges.includes(oldStatus) && meaningfulChanges.includes(newStatus);
  }

  // 중복 알림 방지 체크 (간단한 메모리 기반 구현)
  private recentNotifications = new Map<string, Date>();

  private async isDuplicateNotification(event: TaskStatusChangeEvent): Promise<boolean> {
    const key = `${event.taskId}_${event.oldStatus}_${event.newStatus}`;
    const lastSent = this.recentNotifications.get(key);
    const now = new Date();

    // 5분 이내 동일한 알림은 중복으로 처리
    if (lastSent && (now.getTime() - lastSent.getTime()) < 5 * 60 * 1000) {
      return true;
    }

    this.recentNotifications.set(key, now);
    
    // 메모리 정리 (1시간 이상 된 항목 제거)
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    for (const [k, v] of this.recentNotifications.entries()) {
      if (v < oneHourAgo) {
        this.recentNotifications.delete(k);
      }
    }

    return false;
  }

  // 이메일 데이터 생성
  private async createEmailData(
    event: TaskStatusChangeEvent,
    taskInfo: TaskInfo,
    users: UserProfile[]
  ): Promise<TaskStatusEmailData> {
    const assigner = users.find(u => u.id === taskInfo.assigner_id);
    const assignee = users.find(u => u.id === taskInfo.assignee_id);

    return {
      taskId: taskInfo.id,
      taskTitle: taskInfo.title,
      taskDescription: taskInfo.description ?? undefined,
      projectTitle: taskInfo.projects?.title || '프로젝트',
      oldStatus: event.oldStatus,
      newStatus: event.newStatus,
      changedBy: event.changedBy,
      changedAt: event.changedAt,
      taskUrl: `${import.meta.env.VITE_APP_URL || 'http://localhost:5173'}/tasks/${taskInfo.id}`,
      assignerName: assigner?.full_name ?? undefined,
      assigneeName: assignee?.full_name ?? undefined
    };
  }

  // 상태 변경 이메일 발송
  private async sendStatusChangeEmail(
    event: TaskStatusChangeEvent,
    emailData: TaskStatusEmailData,
    users: UserProfile[]
  ): Promise<void> {
    const recipients = users.map(u => u.email).filter(Boolean);
    
    if (recipients.length === 0) {
      emailLogger.warn(`발송할 이메일 주소가 없습니다: ${event.taskId}`, {
        jobId: event.taskId
      });
      return;
    }

    // 템플릿 타입 결정
    const templateType: EmailTemplateType = this.getTemplateType(event.newStatus);

    // 우선순위 결정
    const priority = this.getEmailPriority(event.newStatus);

    try {
      const jobId = sendTaskNotificationEmail(templateType, emailData, recipients, priority);
      
      emailLogger.info(
        `Task 상태 변경 이메일 발송 요청: ${event.oldStatus} → ${event.newStatus}`,
        {
          jobId: jobId,
          templateType,
          metadata: { 
            recipients: recipients.length,
            taskId: event.taskId,
            priority
          }
        }
      );

    } catch (error) {
      emailLogger.error(`이메일 발송 요청 실패: ${event.taskId}`, {
        jobId: event.taskId,
        errorDetails: error,
        metadata: { recipients, templateType }
      });
    }
  }

  // 템플릿 타입 결정
  private getTemplateType(newStatus: string): EmailTemplateType {
    switch (newStatus) {
      case 'ASSIGNED':
        return 'task_assigned';
      case 'APPROVED':
        return 'task_approved';
      case 'REJECTED':
        return 'task_rejected';
      case 'WAITING_CONFIRM':
        return 'task_waiting_confirm';
      default:
        return 'task_status_change';
    }
  }

  // 이메일 우선순위 결정
  private getEmailPriority(newStatus: string): 'low' | 'normal' | 'high' {
    switch (newStatus) {
      case 'APPROVED':
      case 'REJECTED':
        return 'high';
      case 'WAITING_CONFIRM':
      case 'ASSIGNED':
        return 'normal';
      default:
        return 'low';
    }
  }

  // 알림 히스토리 기록
  private async recordNotificationHistory(event: TaskStatusChangeEvent): Promise<void> {
    try {
      // 실제로는 데이터베이스에 알림 히스토리를 기록할 수 있음
      emailLogger.debug(`알림 히스토리 기록: ${event.taskId}`, {
        jobId: event.taskId,
        metadata: {
          oldStatus: event.oldStatus,
          newStatus: event.newStatus,
          changedBy: event.changedBy,
          changedAt: event.changedAt
        }
      });
    } catch (error) {
      emailLogger.warn(`알림 히스토리 기록 실패: ${event.taskId}`, {
        jobId: event.taskId,
        errorDetails: error
      });
    }
  }

  // 수동으로 상태 변경 이벤트 트리거 (테스트용)
  public async triggerManualStatusChange(
    taskId: string,
    oldStatus: string,
    newStatus: string,
    changedBy: string = 'Manual'
  ): Promise<void> {
    const event: TaskStatusChangeEvent = {
      taskId,
      oldStatus,
      newStatus,
      changedBy,
      changedAt: new Date()
    };

    emailLogger.info(`수동 상태 변경 이벤트 트리거: ${taskId}`, {
      jobId: taskId,
      metadata: { oldStatus, newStatus, changedBy }
    });

    await this.processTaskStatusChange(event);
  }
}

// 싱글톤 인스턴스
export const taskEventHandler = new TaskEventHandler();

// 편의 함수들
export const startTaskEventListener = (): void => {
  taskEventHandler.startListening();
};

export const stopTaskEventListener = (): void => {
  taskEventHandler.stopListening();
};

export const triggerTestStatusChange = (
  taskId: string,
  oldStatus: string,
  newStatus: string
): Promise<void> => {
  return taskEventHandler.triggerManualStatusChange(taskId, oldStatus, newStatus, 'Test');
};
