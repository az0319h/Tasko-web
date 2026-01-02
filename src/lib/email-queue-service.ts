// 이메일 큐 및 발송 서비스
import nodemailer from 'nodemailer';
import { generateEmailTemplate, type EmailTemplateType } from './email-templates/template-manager';
import type { TaskStatusEmailData } from './email-templates/task-status-templates';

// 이메일 작업 인터페이스
export interface EmailJob {
  id: string;
  templateType: EmailTemplateType;
  templateData: TaskStatusEmailData;
  recipients: string[];
  priority: 'low' | 'normal' | 'high';
  maxRetries: number;
  currentRetries: number;
  createdAt: Date;
  scheduledAt?: Date;
  lastAttemptAt?: Date;
  status: 'pending' | 'processing' | 'sent' | 'failed' | 'cancelled';
  errorMessage?: string;
}

// 이메일 발송 결과
export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  recipient: string;
}

// 이메일 발송 통계
export interface EmailStats {
  totalJobs: number;
  pendingJobs: number;
  processingJobs: number;
  sentJobs: number;
  failedJobs: number;
  cancelledJobs: number;
}

// 이메일 큐 클래스
class EmailQueueService {
  private queue: EmailJob[] = [];
  private processing = false;
  private transporter: nodemailer.Transporter | null = null;
  private processingInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.initializeTransporter();
    this.startProcessing();
  }

  // NodeMailer 트랜스포터 초기화
  private initializeTransporter(): void {
    const config = {
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      service: 'gmail',
      auth: {
        user: 'bass.to.tasko@gmail.com',
        pass: 'wavb nhjc hdig jvrd',
      },
      tls: {
        rejectUnauthorized: false
      }
    };

    this.transporter = nodemailer.createTransport(config);
  }

  // 큐 처리 시작
  private startProcessing(): void {
    // 5초마다 큐 처리
    this.processingInterval = setInterval(() => {
      this.processQueue();
    }, 5000);
  }

  // 큐 처리 중지
  public stopProcessing(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
  }

  // 이메일 작업을 큐에 추가
  public addEmailJob(
    templateType: EmailTemplateType,
    templateData: TaskStatusEmailData,
    recipients: string[],
    options: {
      priority?: 'low' | 'normal' | 'high';
      maxRetries?: number;
      scheduledAt?: Date;
    } = {}
  ): string {
    const jobId = this.generateJobId();
    
    const job: EmailJob = {
      id: jobId,
      templateType,
      templateData,
      recipients: [...new Set(recipients)], // 중복 제거
      priority: options.priority || 'normal',
      maxRetries: options.maxRetries || 3,
      currentRetries: 0,
      createdAt: new Date(),
      scheduledAt: options.scheduledAt,
      status: 'pending'
    };

    this.queue.push(job);
    this.sortQueueByPriority();
    
    console.log(`📧 이메일 작업 추가됨: ${jobId} (수신자: ${recipients.length}명)`);
    return jobId;
  }

  // 작업 ID 생성
  private generateJobId(): string {
    return `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // 우선순위별 큐 정렬
  private sortQueueByPriority(): void {
    const priorityOrder = { high: 3, normal: 2, low: 1 };
    
    this.queue.sort((a, b) => {
      // 우선순위가 높을수록 앞으로
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      }
      // 같은 우선순위면 생성 시간 순
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
  }

  // 큐 처리
  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    try {
      const now = new Date();
      
      // 처리 가능한 작업 찾기
      const jobIndex = this.queue.findIndex(job => 
        job.status === 'pending' && 
        (!job.scheduledAt || job.scheduledAt <= now)
      );

      if (jobIndex === -1) {
        this.processing = false;
        return;
      }

      const job = this.queue[jobIndex];
      job.status = 'processing';
      job.lastAttemptAt = now;

      console.log(`📤 이메일 작업 처리 시작: ${job.id}`);

      const success = await this.sendEmail(job);

      if (success) {
        job.status = 'sent';
        console.log(`✅ 이메일 발송 성공: ${job.id}`);
      } else {
        job.currentRetries++;
        
        if (job.currentRetries >= job.maxRetries) {
          job.status = 'failed';
          console.log(`❌ 이메일 발송 최종 실패: ${job.id} (재시도 ${job.currentRetries}/${job.maxRetries})`);
        } else {
          job.status = 'pending';
          // Exponential backoff - 다음 시도까지 대기 시간 증가
          const delayMinutes = Math.pow(2, job.currentRetries);
          job.scheduledAt = new Date(now.getTime() + delayMinutes * 60000);
          console.log(`🔄 이메일 발송 재시도 예약: ${job.id} (${delayMinutes}분 후)`);
        }
      }

    } catch (error) {
      console.error('큐 처리 중 오류:', error);
    } finally {
      this.processing = false;
    }
  }

  // 실제 이메일 발송
  private async sendEmail(job: EmailJob): Promise<boolean> {
    if (!this.transporter) {
      console.error('이메일 트랜스포터가 초기화되지 않았습니다.');
      job.errorMessage = '트랜스포터 초기화 실패';
      return false;
    }

    try {
      // 템플릿 생성
      const emailTemplate = generateEmailTemplate(job.templateType, job.templateData);
      
      // 각 수신자에게 개별 발송
      const sendPromises = job.recipients.map(async (recipient): Promise<EmailSendResult> => {
        try {
          const info = await this.transporter!.sendMail({
            from: '"Tasko 알림" <bass.to.tasko@gmail.com>',
            to: recipient,
            subject: emailTemplate.subject,
            html: emailTemplate.html,
            text: emailTemplate.text,
          });

          return {
            success: true,
            messageId: info.messageId,
            recipient
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
            recipient
          };
        }
      });

      const results = await Promise.all(sendPromises);
      
      // 결과 분석
      const successCount = results.filter(r => r.success).length;
      const failureCount = results.length - successCount;

      if (failureCount > 0) {
        const failedRecipients = results
          .filter(r => !r.success)
          .map(r => `${r.recipient}: ${r.error}`)
          .join(', ');
        
        job.errorMessage = `일부 발송 실패 (${failureCount}/${results.length}): ${failedRecipients}`;
        console.warn(`⚠️ 일부 이메일 발송 실패: ${job.id} - ${failedRecipients}`);
      }

      // 전체 성공 또는 부분 성공도 성공으로 처리 (50% 이상 성공)
      return successCount > 0 && successCount >= results.length / 2;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      job.errorMessage = errorMessage;
      console.error(`이메일 발송 실패: ${job.id} - ${errorMessage}`);
      return false;
    }
  }

  // 작업 상태 조회
  public getJobStatus(jobId: string): EmailJob | null {
    return this.queue.find(job => job.id === jobId) || null;
  }

  // 작업 취소
  public cancelJob(jobId: string): boolean {
    const job = this.queue.find(job => job.id === jobId);
    if (job && job.status === 'pending') {
      job.status = 'cancelled';
      console.log(`📋 이메일 작업 취소됨: ${jobId}`);
      return true;
    }
    return false;
  }

  // 큐 통계
  public getStats(): EmailStats {
    const stats = this.queue.reduce((acc, job) => {
      acc.totalJobs++;
      acc[`${job.status}Jobs`]++;
      return acc;
    }, {
      totalJobs: 0,
      pendingJobs: 0,
      processingJobs: 0,
      sentJobs: 0,
      failedJobs: 0,
      cancelledJobs: 0
    } as EmailStats);

    return stats;
  }

  // 큐 정리 (완료된 작업 제거)
  public cleanupQueue(olderThanHours: number = 24): number {
    const cutoffTime = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
    const initialLength = this.queue.length;
    
    this.queue = this.queue.filter(job => 
      job.status === 'pending' || 
      job.status === 'processing' ||
      job.createdAt > cutoffTime
    );

    const removedCount = initialLength - this.queue.length;
    if (removedCount > 0) {
      console.log(`🧹 이메일 큐 정리: ${removedCount}개 작업 제거됨`);
    }
    
    return removedCount;
  }

  // 연결 테스트
  public async testConnection(): Promise<boolean> {
    if (!this.transporter) {
      return false;
    }

    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      console.error('이메일 연결 테스트 실패:', error);
      return false;
    }
  }
}

// 싱글톤 인스턴스
export const emailQueueService = new EmailQueueService();

// 편의 함수들
export const sendTaskNotificationEmail = (
  templateType: EmailTemplateType,
  templateData: TaskStatusEmailData,
  recipients: string[],
  priority: 'low' | 'normal' | 'high' = 'normal'
): string => {
  return emailQueueService.addEmailJob(templateType, templateData, recipients, { priority });
};

export const getEmailStats = (): EmailStats => {
  return emailQueueService.getStats();
};

export const testEmailConnection = (): Promise<boolean> => {
  return emailQueueService.testConnection();
};
