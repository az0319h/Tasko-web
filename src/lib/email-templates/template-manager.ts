// 이메일 템플릿 관리자
import type { TaskStatusEmailData } from './task-status-templates';
import { 
  createTaskStatusChangeTemplate, 
  createTaskStatusChangeSubject,
  createTaskAssignedTemplate,
  createTaskApprovedTemplate,
  createTaskRejectedTemplate
} from './task-status-templates';

// 템플릿 타입 정의
export type EmailTemplateType = 
  | 'task_status_change'
  | 'task_assigned' 
  | 'task_approved'
  | 'task_rejected'
  | 'task_waiting_confirm';

// 이메일 템플릿 결과
export interface EmailTemplateResult {
  subject: string;
  html: string;
  text: string;
}

// 텍스트 버전 생성 (HTML에서 간단한 텍스트 추출)
const htmlToText = (html: string): string => {
  return html
    .replace(/<[^>]*>/g, '') // HTML 태그 제거
    .replace(/&nbsp;/g, ' ') // non-breaking space 변환
    .replace(/&amp;/g, '&')  // HTML 엔티티 변환
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')     // 연속된 공백 정리
    .trim();
};

// 상태별 템플릿 선택 로직
const selectTemplateByStatus = (data: TaskStatusEmailData): string => {
  switch (data.newStatus) {
    case 'ASSIGNED':
      return createTaskAssignedTemplate(data);
    case 'APPROVED':
      return createTaskApprovedTemplate(data);
    case 'REJECTED':
      return createTaskRejectedTemplate(data);
    default:
      return createTaskStatusChangeTemplate(data);
  }
};

// 메인 템플릿 생성 함수
export const generateEmailTemplate = (
  templateType: EmailTemplateType,
  data: TaskStatusEmailData
): EmailTemplateResult => {
  let html: string;
  let subject: string;

  switch (templateType) {
    case 'task_assigned':
      html = createTaskAssignedTemplate(data);
      subject = `[Tasko] 📋 새 업무 할당: ${data.taskTitle}`;
      break;
      
    case 'task_approved':
      html = createTaskApprovedTemplate(data);
      subject = `[Tasko] 🎉 업무 승인: ${data.taskTitle}`;
      break;
      
    case 'task_rejected':
      html = createTaskRejectedTemplate(data);
      subject = `[Tasko] ❌ 업무 수정 요청: ${data.taskTitle}`;
      break;
      
    case 'task_waiting_confirm':
      html = createTaskStatusChangeTemplate(data);
      subject = `[Tasko] ⏳ 업무 확인 요청: ${data.taskTitle}`;
      break;
      
    case 'task_status_change':
    default:
      html = selectTemplateByStatus(data);
      subject = createTaskStatusChangeSubject(data);
      break;
  }

  return {
    subject,
    html,
    text: htmlToText(html)
  };
};

// 템플릿 미리보기 생성 (개발/테스트용)
export const generatePreviewTemplate = (templateType: EmailTemplateType): EmailTemplateResult => {
  const sampleData: TaskStatusEmailData = {
    taskId: 'sample-task-123',
    taskTitle: '사용자 인터페이스 디자인 검토',
    taskDescription: '새로운 대시보드 UI 디자인을 검토하고 피드백을 제공합니다.',
    projectTitle: 'AI 기반 특허 검색 시스템',
    oldStatus: 'IN_PROGRESS',
    newStatus: 'WAITING_CONFIRM',
    changedBy: '김개발자',
    changedAt: new Date(),
    taskUrl: 'http://localhost:5173/tasks/sample-task-123',
    assignerName: '박매니저',
    assigneeName: '이디자이너'
  };

  return generateEmailTemplate(templateType, sampleData);
};

// 템플릿 유효성 검증
export const validateTemplateData = (data: TaskStatusEmailData): string[] => {
  const errors: string[] = [];

  if (!data.taskId) errors.push('taskId는 필수입니다.');
  if (!data.taskTitle) errors.push('taskTitle은 필수입니다.');
  if (!data.projectTitle) errors.push('projectTitle은 필수입니다.');
  if (!data.oldStatus) errors.push('oldStatus는 필수입니다.');
  if (!data.newStatus) errors.push('newStatus는 필수입니다.');
  if (!data.changedBy) errors.push('changedBy는 필수입니다.');
  if (!data.changedAt) errors.push('changedAt은 필수입니다.');
  if (!data.taskUrl) errors.push('taskUrl은 필수입니다.');

  // URL 형식 검증
  if (data.taskUrl && !isValidUrl(data.taskUrl)) {
    errors.push('taskUrl이 올바른 URL 형식이 아닙니다.');
  }

  return errors;
};

// URL 유효성 검증 헬퍼
const isValidUrl = (string: string): boolean => {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
};

// 템플릿 변수 치환 함수 (추가 커스터마이징용)
export const replaceTemplateVariables = (
  template: string, 
  variables: Record<string, string>
): string => {
  let result = template;
  
  Object.entries(variables).forEach(([key, value]) => {
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
    result = result.replace(regex, value);
  });
  
  return result;
};

// 이메일 템플릿 통계 (개발용)
export const getTemplateStats = () => {
  return {
    availableTemplates: [
      'task_status_change',
      'task_assigned', 
      'task_approved',
      'task_rejected',
      'task_waiting_confirm'
    ],
    supportedStatuses: [
      'ASSIGNED',
      'IN_PROGRESS', 
      'WAITING_CONFIRM',
      'APPROVED',
      'REJECTED'
    ]
  };
};
