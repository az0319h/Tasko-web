import { createBaseEmailTemplate, type EmailTemplateData } from './base-template';

// Task 상태 변경 이메일 데이터 인터페이스
export interface TaskStatusEmailData {
  taskId: string;
  taskTitle: string;
  taskDescription?: string;
  projectTitle: string;
  oldStatus: string;
  newStatus: string;
  changedBy: string;
  changedAt: Date;
  taskUrl: string;
  assignerName?: string;
  assigneeName?: string;
}

// 상태별 한국어 매핑
export const STATUS_MESSAGES: Record<string, { label: string; color: string; emoji: string }> = {
  'ASSIGNED': { label: '할당됨', color: '#6c757d', emoji: '📋' },
  'IN_PROGRESS': { label: '진행중', color: '#007bff', emoji: '⚡' },
  'WAITING_CONFIRM': { label: '확인 대기', color: '#ffc107', emoji: '⏳' },
  'APPROVED': { label: '승인됨', color: '#28a745', emoji: '✅' },
  'REJECTED': { label: '거부됨', color: '#dc3545', emoji: '❌' }
};

// 상태별 메시지 생성
const getStatusChangeMessage = (oldStatus: string, newStatus: string): string => {
  const messages: Record<string, Record<string, string>> = {
    'ASSIGNED': {
      'IN_PROGRESS': '업무가 시작되었습니다.',
    },
    'IN_PROGRESS': {
      'WAITING_CONFIRM': '업무가 완료되어 확인을 기다리고 있습니다.',
      'ASSIGNED': '업무가 다시 할당 상태로 변경되었습니다.',
    },
    'WAITING_CONFIRM': {
      'APPROVED': '업무가 승인되었습니다! 🎉',
      'REJECTED': '업무가 거부되었습니다. 수정이 필요합니다.',
      'IN_PROGRESS': '업무가 다시 진행중 상태로 변경되었습니다.',
    },
    'APPROVED': {
      'IN_PROGRESS': '승인된 업무에 추가 작업이 필요합니다.',
    },
    'REJECTED': {
      'IN_PROGRESS': '거부된 업무가 다시 진행되기 시작했습니다.',
      'ASSIGNED': '업무가 다시 할당 상태로 변경되었습니다.',
    }
  };

  return messages[oldStatus]?.[newStatus] || '업무 상태가 변경되었습니다.';
};

// Task 상태 변경 이메일 템플릿 생성
export const createTaskStatusChangeTemplate = (data: TaskStatusEmailData): string => {
  const oldStatusInfo = STATUS_MESSAGES[data.oldStatus] || { label: data.oldStatus, color: '#6c757d', emoji: '📄' };
  const newStatusInfo = STATUS_MESSAGES[data.newStatus] || { label: data.newStatus, color: '#6c757d', emoji: '📄' };
  
  const statusChangeMessage = getStatusChangeMessage(data.oldStatus, data.newStatus);
  
  const content = `
    <h2>${newStatusInfo.emoji} 업무 상태 변경 알림</h2>
    
    <p>${statusChangeMessage}</p>
    
    <div class="info-box">
        <h3>📌 업무 정보</h3>
        <div class="info-item">
            <span class="info-label">업무 제목:</span>
            <span class="info-value"><strong>${data.taskTitle}</strong></span>
        </div>
        <div class="info-item">
            <span class="info-label">프로젝트:</span>
            <span class="info-value">${data.projectTitle}</span>
        </div>
        ${data.taskDescription ? `
        <div class="info-item">
            <span class="info-label">업무 설명:</span>
            <span class="info-value">${data.taskDescription}</span>
        </div>
        ` : ''}
        ${data.assignerName ? `
        <div class="info-item">
            <span class="info-label">할당자:</span>
            <span class="info-value">${data.assignerName}</span>
        </div>
        ` : ''}
        ${data.assigneeName ? `
        <div class="info-item">
            <span class="info-label">담당자:</span>
            <span class="info-value">${data.assigneeName}</span>
        </div>
        ` : ''}
        <div class="info-item">
            <span class="info-label">변경자:</span>
            <span class="info-value">${data.changedBy}</span>
        </div>
        <div class="info-item">
            <span class="info-label">변경 시간:</span>
            <span class="info-value">${data.changedAt.toLocaleString('ko-KR')}</span>
        </div>
    </div>
    
    <div style="text-align: center; margin: 30px 0;">
        <div style="display: inline-flex; align-items: center; gap: 20px; font-size: 18px; font-weight: bold;">
            <span style="
                background-color: ${oldStatusInfo.color}; 
                color: white; 
                padding: 8px 16px; 
                border-radius: 20px;
            ">
                ${oldStatusInfo.emoji} ${oldStatusInfo.label}
            </span>
            <span style="font-size: 24px; color: #667eea;">→</span>
            <span style="
                background-color: ${newStatusInfo.color}; 
                color: white; 
                padding: 8px 16px; 
                border-radius: 20px;
            ">
                ${newStatusInfo.emoji} ${newStatusInfo.label}
            </span>
        </div>
    </div>
    
    <p>업무의 자세한 내용을 확인하고 다음 단계를 진행하려면 아래 버튼을 클릭하세요.</p>
  `;

  const templateData: EmailTemplateData = {
    title: '업무 상태 변경 알림',
    content,
    buttonText: '업무 확인하기',
    buttonUrl: data.taskUrl,
    footerText: '업무에 대한 질문이 있으시면 담당자에게 직접 문의해주세요.'
  };

  return createBaseEmailTemplate(templateData);
};

// 이메일 제목 생성
export const createTaskStatusChangeSubject = (data: TaskStatusEmailData): string => {
  const statusInfo = STATUS_MESSAGES[data.newStatus] || { label: data.newStatus, emoji: '📄' };
  return `[Tasko] ${data.taskTitle} - ${statusInfo.emoji} ${statusInfo.label}`;
};

// 상태별 특별 템플릿들
export const createTaskAssignedTemplate = (data: TaskStatusEmailData): string => {
  const content = `
    <h2>📋 새로운 업무가 할당되었습니다</h2>
    
    <p>안녕하세요! 새로운 업무가 귀하에게 할당되었습니다.</p>
    
    <div class="info-box">
        <h3>📌 할당된 업무</h3>
        <div class="info-item">
            <span class="info-label">업무 제목:</span>
            <span class="info-value"><strong>${data.taskTitle}</strong></span>
        </div>
        <div class="info-item">
            <span class="info-label">프로젝트:</span>
            <span class="info-value">${data.projectTitle}</span>
        </div>
        ${data.assignerName ? `
        <div class="info-item">
            <span class="info-label">할당자:</span>
            <span class="info-value">${data.assignerName}</span>
        </div>
        ` : ''}
        <div class="info-item">
            <span class="info-label">할당 시간:</span>
            <span class="info-value">${data.changedAt.toLocaleString('ko-KR')}</span>
        </div>
    </div>
    
    <p>업무를 확인하고 작업을 시작해주세요. 질문이 있으시면 언제든 문의해주세요.</p>
  `;

  const templateData: EmailTemplateData = {
    title: '새 업무 할당 알림',
    content,
    buttonText: '업무 시작하기',
    buttonUrl: data.taskUrl,
  };

  return createBaseEmailTemplate(templateData);
};

export const createTaskApprovedTemplate = (data: TaskStatusEmailData): string => {
  const content = `
    <h2>🎉 업무가 승인되었습니다!</h2>
    
    <p>축하합니다! 귀하의 업무가 성공적으로 승인되었습니다.</p>
    
    <div class="info-box">
        <h3>✅ 승인된 업무</h3>
        <div class="info-item">
            <span class="info-label">업무 제목:</span>
            <span class="info-value"><strong>${data.taskTitle}</strong></span>
        </div>
        <div class="info-item">
            <span class="info-label">프로젝트:</span>
            <span class="info-value">${data.projectTitle}</span>
        </div>
        <div class="info-item">
            <span class="info-label">승인자:</span>
            <span class="info-value">${data.changedBy}</span>
        </div>
        <div class="info-item">
            <span class="info-label">승인 시간:</span>
            <span class="info-value">${data.changedAt.toLocaleString('ko-KR')}</span>
        </div>
    </div>
    
    <p>수고하셨습니다! 다음 업무도 화이팅하세요! 💪</p>
  `;

  const templateData: EmailTemplateData = {
    title: '업무 승인 완료',
    content,
    buttonText: '업무 내역 확인',
    buttonUrl: data.taskUrl,
  };

  return createBaseEmailTemplate(templateData);
};

export const createTaskRejectedTemplate = (data: TaskStatusEmailData): string => {
  const content = `
    <h2>❌ 업무 검토 결과 안내</h2>
    
    <p>업무 검토 결과, 일부 수정이 필요한 것으로 판단되었습니다.</p>
    
    <div class="info-box">
        <h3>📝 검토 대상 업무</h3>
        <div class="info-item">
            <span class="info-label">업무 제목:</span>
            <span class="info-value"><strong>${data.taskTitle}</strong></span>
        </div>
        <div class="info-item">
            <span class="info-label">프로젝트:</span>
            <span class="info-value">${data.projectTitle}</span>
        </div>
        <div class="info-item">
            <span class="info-label">검토자:</span>
            <span class="info-value">${data.changedBy}</span>
        </div>
        <div class="info-item">
            <span class="info-label">검토 시간:</span>
            <span class="info-value">${data.changedAt.toLocaleString('ko-KR')}</span>
        </div>
    </div>
    
    <p>자세한 피드백은 업무 페이지의 댓글을 확인해주세요. 수정 후 다시 제출해주시면 됩니다.</p>
  `;

  const templateData: EmailTemplateData = {
    title: '업무 수정 요청',
    content,
    buttonText: '피드백 확인하기',
    buttonUrl: data.taskUrl,
  };

  return createBaseEmailTemplate(templateData);
};
