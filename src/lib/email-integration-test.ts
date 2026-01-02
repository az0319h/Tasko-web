// 이메일 시스템 통합 테스트 및 최적화
import { 
  emailQueueService, 
  sendTaskNotificationEmail, 
  getEmailStats,
  testEmailConnection 
} from './email-queue-service';
import { 
  generateEmailTemplate, 
  generatePreviewTemplate,
  validateTemplateData 
} from './email-templates/template-manager';
import type { TaskStatusEmailData } from './email-templates/task-status-templates';
import { 
  startTaskEventListener, 
  stopTaskEventListener, 
  triggerTestStatusChange 
} from './task-event-handler';
import { emailLogger, getEmailLogs } from './email-logger';

// 테스트 결과 인터페이스
export interface TestResult {
  testName: string;
  success: boolean;
  duration: number;
  error?: string;
  details?: any;
}

// 통합 테스트 결과
export interface IntegrationTestResults {
  overall: {
    success: boolean;
    totalTests: number;
    passedTests: number;
    failedTests: number;
    totalDuration: number;
  };
  tests: TestResult[];
  recommendations?: string[];
}

class EmailIntegrationTester {
  private testResults: TestResult[] = [];

  // 전체 통합 테스트 실행
  public async runFullIntegrationTest(): Promise<IntegrationTestResults> {
    console.log('🚀 이메일 시스템 통합 테스트 시작');
    emailLogger.info('이메일 시스템 통합 테스트 시작');
    
    this.testResults = [];
    const startTime = Date.now();

    // 1. 기본 연결 테스트
    await this.testEmailConnectionInternal();
    
    // 2. 템플릿 시스템 테스트
    await this.testTemplateSystemInternal();
    
    // 3. 큐 시스템 테스트
    await this.testQueueSystemInternal();
    
    // 4. 이벤트 핸들러 테스트
    await this.testEventHandler();
    
    // 5. 로거 시스템 테스트
    await this.testLoggerSystem();
    
    // 6. 성능 테스트
    await this.testPerformance();
    
    // 7. 에러 처리 테스트
    await this.testErrorHandling();

    const totalDuration = Date.now() - startTime;
    const passedTests = this.testResults.filter(t => t.success).length;
    const failedTests = this.testResults.length - passedTests;

    const results: IntegrationTestResults = {
      overall: {
        success: failedTests === 0,
        totalTests: this.testResults.length,
        passedTests,
        failedTests,
        totalDuration
      },
      tests: this.testResults,
      recommendations: this.generateRecommendations()
    };

    console.log(`✅ 통합 테스트 완료: ${passedTests}/${this.testResults.length} 통과 (${totalDuration}ms)`);
    emailLogger.info(`통합 테스트 완료`, {
      metadata: { 
        passed: passedTests, 
        failed: failedTests, 
        duration: totalDuration 
      }
    });

    return results;
  }

  // 개별 테스트 실행 헬퍼
  private async runTest(testName: string, testFn: () => Promise<void>): Promise<void> {
    const startTime = Date.now();
    
    try {
      await testFn();
      const duration = Date.now() - startTime;
      
      this.testResults.push({
        testName,
        success: true,
        duration
      });
      
      console.log(`✅ ${testName} (${duration}ms)`);
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.testResults.push({
        testName,
        success: false,
        duration,
        error: errorMessage,
        details: error
      });
      
      console.log(`❌ ${testName} (${duration}ms): ${errorMessage}`);
      emailLogger.error(`테스트 실패: ${testName}`, { errorDetails: error });
    }
  }

  // 1. 이메일 연결 테스트
  private async testEmailConnectionInternal(): Promise<void> {
    await this.runTest('SMTP 연결 테스트', async () => {
      const isConnected = await testEmailConnection();
      if (!isConnected) {
        throw new Error('SMTP 서버 연결 실패');
      }
    });
  }

  // 2. 템플릿 시스템 테스트
  private async testTemplateSystemInternal(): Promise<void> {
    await this.runTest('템플릿 생성 테스트', async () => {
      const sampleData: TaskStatusEmailData = {
        taskId: 'test-task-123',
        taskTitle: '테스트 업무',
        projectTitle: '테스트 프로젝트',
        oldStatus: 'ASSIGNED',
        newStatus: 'IN_PROGRESS',
        changedBy: '테스트 사용자',
        changedAt: new Date(),
        taskUrl: 'http://localhost:5173/tasks/test-task-123'
      };

      const template = generateEmailTemplate('task_status_change', sampleData);
      
      if (!template.subject || !template.html || !template.text) {
        throw new Error('템플릿 생성 실패: 필수 필드 누락');
      }

      if (template.subject.length < 10 || template.html.length < 100) {
        throw new Error('템플릿 내용이 너무 짧음');
      }
    });

    await this.runTest('템플릿 유효성 검증 테스트', async () => {
      const invalidData = {
        taskId: '',
        taskTitle: '',
        projectTitle: '',
        oldStatus: '',
        newStatus: '',
        changedBy: '',
        changedAt: new Date(),
        taskUrl: 'invalid-url'
      } as TaskStatusEmailData;

      const errors = validateTemplateData(invalidData);
      if (errors.length === 0) {
        throw new Error('유효성 검증이 제대로 작동하지 않음');
      }
    });

    await this.runTest('모든 템플릿 타입 테스트', async () => {
      const templateTypes = [
        'task_status_change',
        'task_assigned',
        'task_approved',
        'task_rejected',
        'task_waiting_confirm'
      ] as const;

      for (const templateType of templateTypes) {
        const preview = generatePreviewTemplate(templateType);
        if (!preview.subject || !preview.html) {
          throw new Error(`템플릿 타입 ${templateType} 생성 실패`);
        }
      }
    });
  }

  // 3. 큐 시스템 테스트
  private async testQueueSystemInternal(): Promise<void> {
    await this.runTest('큐 작업 추가 테스트', async () => {
      const sampleData: TaskStatusEmailData = {
        taskId: 'queue-test-123',
        taskTitle: '큐 테스트 업무',
        projectTitle: '큐 테스트 프로젝트',
        oldStatus: 'ASSIGNED',
        newStatus: 'IN_PROGRESS',
        changedBy: '큐 테스트 사용자',
        changedAt: new Date(),
        taskUrl: 'http://localhost:5173/tasks/queue-test-123'
      };

      const jobId = sendTaskNotificationEmail(
        'task_status_change',
        sampleData,
        ['test@example.com'],
        'normal'
      );

      if (!jobId) {
        throw new Error('큐 작업 추가 실패');
      }

      // 잠시 대기 후 작업 상태 확인
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const jobStatus = emailQueueService.getJobStatus(jobId);
      if (!jobStatus) {
        throw new Error('큐에서 작업을 찾을 수 없음');
      }
    });

    await this.runTest('큐 통계 테스트', async () => {
      const stats = getEmailStats();
      
      if (typeof stats.totalJobs !== 'number' || stats.totalJobs < 0) {
        throw new Error('큐 통계가 올바르지 않음');
      }
    });

    await this.runTest('큐 정리 테스트', async () => {
      const removedCount = emailQueueService.cleanupQueue(0); // 모든 완료된 작업 제거
      
      if (typeof removedCount !== 'number' || removedCount < 0) {
        throw new Error('큐 정리 기능이 올바르지 않음');
      }
    });
  }

  // 4. 이벤트 핸들러 테스트
  private async testEventHandler(): Promise<void> {
    await this.runTest('이벤트 리스너 시작/중지 테스트', async () => {
      // 이벤트 리스너 시작
      startTaskEventListener();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // 이벤트 리스너 중지
      stopTaskEventListener();
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    await this.runTest('수동 상태 변경 이벤트 테스트', async () => {
      // 실제 Task ID를 사용해야 하지만, 테스트용으로는 가상의 ID 사용
      await triggerTestStatusChange(
        'test-task-event-123',
        'ASSIGNED',
        'IN_PROGRESS'
      );
      
      // 이벤트 처리 시간 대기
      await new Promise(resolve => setTimeout(resolve, 500));
    });
  }

  // 5. 로거 시스템 테스트
  private async testLoggerSystem(): Promise<void> {
    await this.runTest('로그 기록 테스트', async () => {
      emailLogger.info('테스트 로그 메시지', { 
        jobId: 'test-log-123',
        metadata: { test: true } 
      });
      
      emailLogger.error('테스트 에러 로그', { 
        jobId: 'test-error-123',
        errorDetails: new Error('테스트 에러') 
      });

      const logs = getEmailLogs('info', 10);
      const errorLogs = getEmailLogs('error', 10);
      
      if (logs.length === 0 && errorLogs.length === 0) {
        throw new Error('로그가 기록되지 않음');
      }
    });

    await this.runTest('로그 통계 테스트', async () => {
      const stats = emailLogger.getLogStats();
      
      if (typeof stats.total !== 'number' || stats.total < 0) {
        throw new Error('로그 통계가 올바르지 않음');
      }
    });
  }

  // 6. 성능 테스트
  private async testPerformance(): Promise<void> {
    await this.runTest('템플릿 생성 성능 테스트', async () => {
      const sampleData: TaskStatusEmailData = {
        taskId: 'perf-test-123',
        taskTitle: '성능 테스트 업무',
        projectTitle: '성능 테스트 프로젝트',
        oldStatus: 'ASSIGNED',
        newStatus: 'IN_PROGRESS',
        changedBy: '성능 테스트 사용자',
        changedAt: new Date(),
        taskUrl: 'http://localhost:5173/tasks/perf-test-123'
      };

      const iterations = 100;
      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        generateEmailTemplate('task_status_change', sampleData);
      }

      const duration = Date.now() - startTime;
      const avgTime = duration / iterations;

      if (avgTime > 50) { // 50ms 이상이면 성능 이슈
        throw new Error(`템플릿 생성이 너무 느림: ${avgTime.toFixed(2)}ms/개`);
      }

      console.log(`📊 템플릿 생성 성능: ${avgTime.toFixed(2)}ms/개 (${iterations}회 테스트)`);
    });

    await this.runTest('대량 큐 처리 성능 테스트', async () => {
      const sampleData: TaskStatusEmailData = {
        taskId: 'bulk-test-123',
        taskTitle: '대량 테스트 업무',
        projectTitle: '대량 테스트 프로젝트',
        oldStatus: 'ASSIGNED',
        newStatus: 'IN_PROGRESS',
        changedBy: '대량 테스트 사용자',
        changedAt: new Date(),
        taskUrl: 'http://localhost:5173/tasks/bulk-test-123'
      };

      const startTime = Date.now();
      const jobCount = 50;

      for (let i = 0; i < jobCount; i++) {
        sendTaskNotificationEmail(
          'task_status_change',
          sampleData,
          [`test${i}@example.com`],
          'low'
        );
      }

      const duration = Date.now() - startTime;
      const avgTime = duration / jobCount;

      if (avgTime > 10) { // 10ms 이상이면 성능 이슈
        throw new Error(`큐 작업 추가가 너무 느림: ${avgTime.toFixed(2)}ms/개`);
      }

      console.log(`📊 큐 작업 추가 성능: ${avgTime.toFixed(2)}ms/개 (${jobCount}회 테스트)`);
    });
  }

  // 7. 에러 처리 테스트
  private async testErrorHandling(): Promise<void> {
    await this.runTest('잘못된 이메일 주소 처리 테스트', async () => {
      const sampleData: TaskStatusEmailData = {
        taskId: 'error-test-123',
        taskTitle: '에러 테스트 업무',
        projectTitle: '에러 테스트 프로젝트',
        oldStatus: 'ASSIGNED',
        newStatus: 'IN_PROGRESS',
        changedBy: '에러 테스트 사용자',
        changedAt: new Date(),
        taskUrl: 'http://localhost:5173/tasks/error-test-123'
      };

      // 잘못된 이메일 주소로 테스트
      const jobId = sendTaskNotificationEmail(
        'task_status_change',
        sampleData,
        ['invalid-email', '', 'another-invalid'],
        'normal'
      );

      if (!jobId) {
        throw new Error('잘못된 이메일 주소에 대한 처리가 올바르지 않음');
      }
    });

    await this.runTest('빈 수신자 목록 처리 테스트', async () => {
      const sampleData: TaskStatusEmailData = {
        taskId: 'empty-test-123',
        taskTitle: '빈 수신자 테스트 업무',
        projectTitle: '빈 수신자 테스트 프로젝트',
        oldStatus: 'ASSIGNED',
        newStatus: 'IN_PROGRESS',
        changedBy: '빈 수신자 테스트 사용자',
        changedAt: new Date(),
        taskUrl: 'http://localhost:5173/tasks/empty-test-123'
      };

      const jobId = sendTaskNotificationEmail(
        'task_status_change',
        sampleData,
        [], // 빈 수신자 목록
        'normal'
      );

      // 빈 수신자 목록에 대해서는 작업이 생성되지 않아야 함
      if (jobId) {
        const jobStatus = emailQueueService.getJobStatus(jobId);
        if (jobStatus && jobStatus.recipients.length > 0) {
          throw new Error('빈 수신자 목록 처리가 올바르지 않음');
        }
      }
    });
  }

  // 추천사항 생성
  private generateRecommendations(): string[] {
    const recommendations: string[] = [];
    const stats = getEmailStats();

    if (stats.failedJobs > stats.sentJobs * 0.1) {
      recommendations.push('실패한 이메일이 너무 많습니다. SMTP 설정을 확인하세요.');
    }

    if (stats.pendingJobs > 100) {
      recommendations.push('대기 중인 이메일이 너무 많습니다. 큐 처리 성능을 개선하세요.');
    }

    const errorLogs = getEmailLogs('error', 50);
    if (errorLogs.length > 10) {
      recommendations.push('최근 에러 로그가 많습니다. 시스템 상태를 점검하세요.');
    }

    const failedTests = this.testResults.filter(t => !t.success);
    if (failedTests.length > 0) {
      recommendations.push(`${failedTests.length}개의 테스트가 실패했습니다. 해당 기능들을 점검하세요.`);
    }

    if (recommendations.length === 0) {
      recommendations.push('모든 테스트가 통과했습니다! 시스템이 정상적으로 작동하고 있습니다.');
    }

    return recommendations;
  }

  // 개별 테스트 실행 (외부에서 호출 가능)
  public async testEmailConnection(): Promise<TestResult> {
    await this.testEmailConnection();
    return this.testResults[this.testResults.length - 1];
  }

  public async testTemplateSystem(): Promise<TestResult[]> {
    const initialLength = this.testResults.length;
    await this.testTemplateSystem();
    return this.testResults.slice(initialLength);
  }

  public async testQueueSystem(): Promise<TestResult[]> {
    const initialLength = this.testResults.length;
    await this.testQueueSystem();
    return this.testResults.slice(initialLength);
  }
}

// 싱글톤 인스턴스
export const emailIntegrationTester = new EmailIntegrationTester();

// 편의 함수들
export const runEmailSystemTest = (): Promise<IntegrationTestResults> => {
  return emailIntegrationTester.runFullIntegrationTest();
};

export const testEmailSystemConnection = (): Promise<TestResult> => {
  return emailIntegrationTester.testEmailConnection();
};

export const testEmailTemplates = (): Promise<TestResult[]> => {
  return emailIntegrationTester.testTemplateSystem();
};

export const testEmailQueue = (): Promise<TestResult[]> => {
  return emailIntegrationTester.testQueueSystem();
};
