// 이메일 시스템 메인 관리자
import { emailQueueService, getEmailStats } from './email-queue-service';
import { startTaskEventListener, stopTaskEventListener } from './task-event-handler';
import { emailLogger } from './email-logger';
import { runEmailSystemTest as runEmailIntegrationTest } from './email-integration-test';

// 이메일 시스템 상태
export interface EmailSystemStatus {
  isInitialized: boolean;
  isEventListenerActive: boolean;
  queueStats: ReturnType<typeof getEmailStats>;
  lastHealthCheck: Date;
  systemHealth: 'healthy' | 'warning' | 'error';
  errors: string[];
}

class EmailSystemManager {
  private initialized = false;
  private eventListenerActive = false;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private lastHealthCheck: Date = new Date();
  private systemErrors: string[] = [];

  // 시스템 초기화
  public async initialize(): Promise<boolean> {
    if (this.initialized) {
      emailLogger.warn('이메일 시스템이 이미 초기화되어 있습니다.');
      return true;
    }

    try {
      emailLogger.info('이메일 시스템 초기화 시작');

      // 1. 연결 테스트
      const connectionOk = await emailQueueService.testConnection();
      if (!connectionOk) {
        throw new Error('SMTP 연결 실패');
      }

      // 2. 이벤트 리스너 시작
      this.startEventListener();

      // 3. 헬스체크 시작
      this.startHealthCheck();

      // 4. 큐 정리 (기존 완료된 작업들 제거)
      emailQueueService.cleanupQueue(1); // 1시간 이상 된 작업 제거

      this.initialized = true;
      this.systemErrors = [];
      
      emailLogger.info('이메일 시스템 초기화 완료');
      console.log('✅ 이메일 시스템이 성공적으로 초기화되었습니다.');
      
      return true;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.systemErrors.push(`초기화 실패: ${errorMessage}`);
      
      emailLogger.error('이메일 시스템 초기화 실패', { errorDetails: error });
      console.error('❌ 이메일 시스템 초기화 실패:', errorMessage);
      
      return false;
    }
  }

  // 시스템 종료
  public async shutdown(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    try {
      emailLogger.info('이메일 시스템 종료 시작');

      // 1. 헬스체크 중지
      this.stopHealthCheck();

      // 2. 이벤트 리스너 중지
      this.stopEventListener();

      // 3. 큐 처리 중지
      emailQueueService.stopProcessing();

      // 4. 마지막 큐 정리
      const removedCount = emailQueueService.cleanupQueue(0);
      if (removedCount > 0) {
        emailLogger.info(`종료 시 ${removedCount}개 작업 정리됨`);
      }

      this.initialized = false;
      
      emailLogger.info('이메일 시스템 종료 완료');
      console.log('✅ 이메일 시스템이 정상적으로 종료되었습니다.');

    } catch (error) {
      emailLogger.error('이메일 시스템 종료 중 오류', { errorDetails: error });
      console.error('❌ 이메일 시스템 종료 중 오류:', error);
    }
  }

  // 이벤트 리스너 시작
  private startEventListener(): void {
    if (this.eventListenerActive) {
      return;
    }

    try {
      startTaskEventListener();
      this.eventListenerActive = true;
      emailLogger.info('Task 이벤트 리스너 시작됨');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.systemErrors.push(`이벤트 리스너 시작 실패: ${errorMessage}`);
      emailLogger.error('이벤트 리스너 시작 실패', { errorDetails: error });
    }
  }

  // 이벤트 리스너 중지
  private stopEventListener(): void {
    if (!this.eventListenerActive) {
      return;
    }

    try {
      stopTaskEventListener();
      this.eventListenerActive = false;
      emailLogger.info('Task 이벤트 리스너 중지됨');
    } catch (error) {
      emailLogger.error('이벤트 리스너 중지 실패', { errorDetails: error });
    }
  }

  // 헬스체크 시작
  private startHealthCheck(): void {
    if (this.healthCheckInterval) {
      return;
    }

    // 5분마다 헬스체크 실행
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, 5 * 60 * 1000);

    emailLogger.info('헬스체크 시작됨 (5분 간격)');
  }

  // 헬스체크 중지
  private stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      emailLogger.info('헬스체크 중지됨');
    }
  }

  // 헬스체크 수행
  private async performHealthCheck(): Promise<void> {
    try {
      this.lastHealthCheck = new Date();
      emailLogger.debug('헬스체크 수행 중...');

      // 1. SMTP 연결 확인
      const connectionOk = await emailQueueService.testConnection();
      if (!connectionOk) {
        this.systemErrors.push('SMTP 연결 실패');
        emailLogger.warn('헬스체크: SMTP 연결 실패');
        return;
      }

      // 2. 큐 상태 확인
      const stats = getEmailStats();
      if (stats.failedJobs > stats.totalJobs * 0.2) {
        this.systemErrors.push(`실패한 작업이 너무 많음: ${stats.failedJobs}/${stats.totalJobs}`);
        emailLogger.warn('헬스체크: 실패한 작업이 너무 많음', { metadata: stats });
      }

      // 3. 대기 중인 작업이 너무 많은지 확인
      if (stats.pendingJobs > 200) {
        this.systemErrors.push(`대기 중인 작업이 너무 많음: ${stats.pendingJobs}개`);
        emailLogger.warn('헬스체크: 대기 중인 작업이 너무 많음', { metadata: stats });
      }

      // 4. 큐 정리 (1시간 이상 된 완료 작업 제거)
      const removedCount = emailQueueService.cleanupQueue(1);
      if (removedCount > 0) {
        emailLogger.info(`헬스체크: ${removedCount}개 작업 정리됨`);
      }

      // 5. 로그 정리 (24시간 이상 된 로그 제거)
      const removedLogs = emailLogger.clearLogs(24);
      if (removedLogs > 0) {
        emailLogger.info(`헬스체크: ${removedLogs}개 로그 정리됨`);
      }

      emailLogger.debug('헬스체크 완료', { metadata: stats });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.systemErrors.push(`헬스체크 실패: ${errorMessage}`);
      emailLogger.error('헬스체크 수행 중 오류', { errorDetails: error });
    }
  }

  // 시스템 상태 조회
  public getSystemStatus(): EmailSystemStatus {
    const stats = getEmailStats();
    
    // 시스템 건강도 평가
    let systemHealth: 'healthy' | 'warning' | 'error' = 'healthy';
    
    if (this.systemErrors.length > 0) {
      systemHealth = 'error';
    } else if (stats.failedJobs > stats.totalJobs * 0.1 || stats.pendingJobs > 100) {
      systemHealth = 'warning';
    }

    return {
      isInitialized: this.initialized,
      isEventListenerActive: this.eventListenerActive,
      queueStats: stats,
      lastHealthCheck: this.lastHealthCheck,
      systemHealth,
      errors: [...this.systemErrors]
    };
  }

  // 시스템 통계 출력
  public printSystemStats(): void {
    const status = this.getSystemStatus();
    const stats = status.queueStats;
    
    console.log('\n📊 이메일 시스템 상태');
    console.log('='.repeat(50));
    console.log(`초기화 상태: ${status.isInitialized ? '✅' : '❌'}`);
    console.log(`이벤트 리스너: ${status.isEventListenerActive ? '✅' : '❌'}`);
    console.log(`시스템 건강도: ${this.getHealthIcon(status.systemHealth)} ${status.systemHealth.toUpperCase()}`);
    console.log(`마지막 헬스체크: ${status.lastHealthCheck.toLocaleString()}`);
    console.log('\n📧 큐 통계:');
    console.log(`  전체 작업: ${stats.totalJobs}개`);
    console.log(`  대기 중: ${stats.pendingJobs}개`);
    console.log(`  처리 중: ${stats.processingJobs}개`);
    console.log(`  발송 완료: ${stats.sentJobs}개`);
    console.log(`  실패: ${stats.failedJobs}개`);
    console.log(`  취소됨: ${stats.cancelledJobs}개`);
    
    if (status.errors.length > 0) {
      console.log('\n⚠️  최근 오류:');
      status.errors.slice(-5).forEach(error => {
        console.log(`  - ${error}`);
      });
    }
    
    console.log('='.repeat(50));
  }

  // 건강도 아이콘 반환
  private getHealthIcon(health: string): string {
    switch (health) {
      case 'healthy': return '🟢';
      case 'warning': return '🟡';
      case 'error': return '🔴';
      default: return '⚪';
    }
  }

  // 전체 시스템 테스트 실행
  public async runSystemTest(): Promise<void> {
    console.log('🧪 이메일 시스템 통합 테스트 실행 중...');
    
    const results = await runEmailIntegrationTest();
    
    console.log('\n📋 테스트 결과:');
    console.log(`전체: ${results.overall.totalTests}개 (통과: ${results.overall.passedTests}, 실패: ${results.overall.failedTests})`);
    console.log(`소요 시간: ${results.overall.totalDuration}ms`);
    console.log(`전체 결과: ${results.overall.success ? '✅ 성공' : '❌ 실패'}`);
    
    if (results.recommendations && results.recommendations.length > 0) {
      console.log('\n💡 추천사항:');
      results.recommendations.forEach(rec => {
        console.log(`  - ${rec}`);
      });
    }
  }

  // 오류 목록 초기화
  public clearErrors(): void {
    this.systemErrors = [];
    emailLogger.info('시스템 오류 목록이 초기화되었습니다.');
  }
}

// 싱글톤 인스턴스
export const emailSystemManager = new EmailSystemManager();

// 편의 함수들
export const initializeEmailSystem = (): Promise<boolean> => {
  return emailSystemManager.initialize();
};

export const shutdownEmailSystem = (): Promise<void> => {
  return emailSystemManager.shutdown();
};

export const getEmailSystemStatus = (): EmailSystemStatus => {
  return emailSystemManager.getSystemStatus();
};

export const printEmailSystemStats = (): void => {
  emailSystemManager.printSystemStats();
};

export const runEmailSystemTest = (): Promise<void> => {
  return emailSystemManager.runSystemTest();
};

// 개발 환경에서 자동 초기화
if (import.meta.env.DEV) {
  console.log('🔧 개발 환경에서 이메일 시스템을 자동으로 초기화합니다...');
  
  // 페이지 로드 후 초기화
  if (typeof window !== 'undefined') {
    window.addEventListener('load', async () => {
      const success = await initializeEmailSystem();
      if (success) {
        console.log('✅ 개발 환경 이메일 시스템 초기화 완료');
      } else {
        console.log('❌ 개발 환경 이메일 시스템 초기화 실패');
      }
    });
    
    // 페이지 언로드 시 정리
    window.addEventListener('beforeunload', () => {
      shutdownEmailSystem();
    });
  }
}
