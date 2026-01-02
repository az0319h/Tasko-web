// 이메일 발송 로그 시스템
export interface EmailLogEntry {
  id: string;
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  jobId?: string;
  recipient?: string;
  templateType?: string;
  errorDetails?: any;
  metadata?: Record<string, any>;
}

// 로그 레벨
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class EmailLogger {
  private logs: EmailLogEntry[] = [];
  private maxLogs: number = 1000; // 최대 로그 수
  private logLevel: LogLevel = 'info';

  constructor(logLevel: LogLevel = 'info') {
    this.logLevel = logLevel;
  }

  // 로그 레벨 우선순위
  private getLogLevelPriority(level: LogLevel): number {
    const priorities = { debug: 0, info: 1, warn: 2, error: 3 };
    return priorities[level];
  }

  // 로그 기록
  private addLog(
    level: LogLevel,
    message: string,
    options: {
      jobId?: string;
      recipient?: string;
      templateType?: string;
      errorDetails?: any;
      metadata?: Record<string, any>;
    } = {}
  ): void {
    // 현재 로그 레벨보다 낮은 우선순위는 무시
    if (this.getLogLevelPriority(level) < this.getLogLevelPriority(this.logLevel)) {
      return;
    }

    const logEntry: EmailLogEntry = {
      id: this.generateLogId(),
      timestamp: new Date(),
      level,
      message,
      ...options
    };

    this.logs.push(logEntry);

    // 최대 로그 수 초과 시 오래된 로그 제거
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // 콘솔에도 출력
    this.logToConsole(logEntry);
  }

  // 로그 ID 생성
  private generateLogId(): string {
    return `log_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }

  // 콘솔 출력
  private logToConsole(entry: EmailLogEntry): void {
    const timestamp = entry.timestamp.toISOString();
    const prefix = `[${timestamp}] [${entry.level.toUpperCase()}]`;
    
    let message = `${prefix} ${entry.message}`;
    
    if (entry.jobId) {
      message += ` (Job: ${entry.jobId})`;
    }
    
    if (entry.recipient) {
      message += ` (To: ${entry.recipient})`;
    }

    switch (entry.level) {
      case 'debug':
        console.debug(message, entry.metadata);
        break;
      case 'info':
        console.info(message);
        break;
      case 'warn':
        console.warn(message, entry.errorDetails);
        break;
      case 'error':
        console.error(message, entry.errorDetails);
        break;
    }
  }

  // 공개 로그 메서드들
  public debug(message: string, options?: {
    jobId?: string;
    recipient?: string;
    templateType?: string;
    metadata?: Record<string, any>;
  }): void {
    this.addLog('debug', message, options);
  }

  public info(message: string, options?: {
    jobId?: string;
    recipient?: string;
    templateType?: string;
    metadata?: Record<string, any>;
  }): void {
    this.addLog('info', message, options);
  }

  public warn(message: string, options?: {
    jobId?: string;
    recipient?: string;
    templateType?: string;
    errorDetails?: any;
    metadata?: Record<string, any>;
  }): void {
    this.addLog('warn', message, options);
  }

  public error(message: string, options?: {
    jobId?: string;
    recipient?: string;
    templateType?: string;
    errorDetails?: any;
    metadata?: Record<string, any>;
  }): void {
    this.addLog('error', message, options);
  }

  // 로그 조회
  public getLogs(
    level?: LogLevel,
    limit?: number,
    jobId?: string
  ): EmailLogEntry[] {
    let filteredLogs = [...this.logs];

    if (level) {
      filteredLogs = filteredLogs.filter(log => log.level === level);
    }

    if (jobId) {
      filteredLogs = filteredLogs.filter(log => log.jobId === jobId);
    }

    // 최신순으로 정렬
    filteredLogs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (limit) {
      filteredLogs = filteredLogs.slice(0, limit);
    }

    return filteredLogs;
  }

  // 로그 통계
  public getLogStats(): Record<LogLevel, number> & { total: number } {
    const stats = this.logs.reduce((acc, log) => {
      acc[log.level]++;
      acc.total++;
      return acc;
    }, {
      debug: 0,
      info: 0,
      warn: 0,
      error: 0,
      total: 0
    });

    return stats;
  }

  // 로그 정리
  public clearLogs(olderThanHours?: number): number {
    const initialCount = this.logs.length;

    if (olderThanHours) {
      const cutoffTime = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
      this.logs = this.logs.filter(log => log.timestamp > cutoffTime);
    } else {
      this.logs = [];
    }

    const removedCount = initialCount - this.logs.length;
    this.info(`로그 정리 완료: ${removedCount}개 항목 제거됨`);
    
    return removedCount;
  }

  // 로그 레벨 변경
  public setLogLevel(level: LogLevel): void {
    this.logLevel = level;
    this.info(`로그 레벨이 ${level}로 변경되었습니다.`);
  }

  // 로그 내보내기 (JSON 형태)
  public exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  // 특정 작업의 로그 추적
  public getJobLogs(jobId: string): EmailLogEntry[] {
    return this.logs
      .filter(log => log.jobId === jobId)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  // 에러 로그만 조회
  public getErrorLogs(limit: number = 50): EmailLogEntry[] {
    return this.logs
      .filter(log => log.level === 'error')
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  // 최근 활동 요약
  public getRecentActivity(minutes: number = 30): {
    totalLogs: number;
    errorCount: number;
    warnCount: number;
    infoCount: number;
    debugCount: number;
    uniqueJobs: number;
  } {
    const cutoffTime = new Date(Date.now() - minutes * 60 * 1000);
    const recentLogs = this.logs.filter(log => log.timestamp > cutoffTime);
    
    const uniqueJobs = new Set(
      recentLogs
        .filter(log => log.jobId)
        .map(log => log.jobId)
    ).size;

    return {
      totalLogs: recentLogs.length,
      errorCount: recentLogs.filter(log => log.level === 'error').length,
      warnCount: recentLogs.filter(log => log.level === 'warn').length,
      infoCount: recentLogs.filter(log => log.level === 'info').length,
      debugCount: recentLogs.filter(log => log.level === 'debug').length,
      uniqueJobs
    };
  }
}

// 싱글톤 인스턴스
export const emailLogger = new EmailLogger(
  (import.meta.env.VITE_EMAIL_LOG_LEVEL as LogLevel) || 'info'
);

// 편의 함수들
export const logEmailInfo = (message: string, jobId?: string, recipient?: string): void => {
  emailLogger.info(message, { jobId, recipient });
};

export const logEmailError = (message: string, error: any, jobId?: string, recipient?: string): void => {
  emailLogger.error(message, { jobId, recipient, errorDetails: error });
};

export const logEmailWarn = (message: string, jobId?: string, recipient?: string): void => {
  emailLogger.warn(message, { jobId, recipient });
};

export const getEmailLogs = (level?: LogLevel, limit?: number): EmailLogEntry[] => {
  return emailLogger.getLogs(level, limit);
};
