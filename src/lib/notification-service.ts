// NodeMailer를 사용한 알림 이메일 서비스
// 이 파일은 서버사이드에서 실행되어야 하므로, 
// 실제로는 Supabase Edge Functions 또는 별도 서버에서 사용됩니다.

import nodemailer from 'nodemailer';

// Task 상태 변경 알림 이메일 데이터
interface TaskStatusChangeEmailData {
  taskId: string;
  taskTitle: string;
  projectTitle: string;
  oldStatus: string;
  newStatus: string;
  changedBy: string;
  assignerEmail?: string;
  assigneeEmail?: string;
  taskUrl: string;
}

// 이메일 설정
const EMAIL_CONFIG = {
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  user: 'bass.to.tasko@gmail.com',
  pass: 'wavb nhjc hdig jvrd'
};

// NodeMailer 트랜스포터 생성
const createTransporter = () => {
  return nodemailer.createTransport({
    host: EMAIL_CONFIG.host,
    port: EMAIL_CONFIG.port,
    secure: EMAIL_CONFIG.secure,
    service: 'gmail',
    auth: {
      user: EMAIL_CONFIG.user,
      pass: EMAIL_CONFIG.pass,
    },
    tls: {
      rejectUnauthorized: false
    }
  });
};

// 상태 변경 이메일 템플릿 생성
const createStatusChangeEmailTemplate = (data: TaskStatusChangeEmailData): string => {
  const statusMessages: Record<string, string> = {
    'ASSIGNED': '할당됨',
    'IN_PROGRESS': '진행중',
    'WAITING_CONFIRM': '확인 대기',
    'APPROVED': '승인됨',
    'REJECTED': '거부됨'
  };

  const oldStatusKor = statusMessages[data.oldStatus] || data.oldStatus;
  const newStatusKor = statusMessages[data.newStatus] || data.newStatus;

  return `
    <!DOCTYPE html>
    <html lang="ko">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>업무 상태 변경 알림</title>
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
            }
            .header {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 30px;
                border-radius: 10px 10px 0 0;
                text-align: center;
            }
            .header h1 {
                margin: 0;
                font-size: 24px;
            }
            .content {
                background: #f8f9fa;
                padding: 30px;
                border-radius: 0 0 10px 10px;
            }
            .task-info {
                background: white;
                padding: 20px;
                border-radius: 8px;
                margin: 20px 0;
                border-left: 4px solid #667eea;
            }
            .status-change {
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 20px 0;
                font-size: 18px;
                font-weight: bold;
            }
            .status {
                padding: 8px 16px;
                border-radius: 20px;
                color: white;
            }
            .status.old {
                background-color: #6c757d;
            }
            .status.new {
                background-color: #28a745;
            }
            .arrow {
                margin: 0 15px;
                font-size: 24px;
            }
            .button {
                display: inline-block;
                background: #667eea;
                color: white;
                padding: 12px 24px;
                text-decoration: none;
                border-radius: 6px;
                font-weight: bold;
                margin-top: 20px;
            }
            .footer {
                text-align: center;
                margin-top: 30px;
                padding: 20px;
                color: #6c757d;
                font-size: 14px;
            }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>📋 업무 상태 변경 알림</h1>
        </div>
        
        <div class="content">
            <div class="task-info">
                <h2>📌 ${data.taskTitle}</h2>
                <p><strong>프로젝트:</strong> ${data.projectTitle}</p>
                <p><strong>변경자:</strong> ${data.changedBy}</p>
                <p><strong>변경 시간:</strong> ${new Date().toLocaleString('ko-KR')}</p>
            </div>
            
            <div class="status-change">
                <span class="status old">${oldStatusKor}</span>
                <span class="arrow">→</span>
                <span class="status new">${newStatusKor}</span>
            </div>
            
            <p>업무의 상태가 변경되었습니다. 자세한 내용을 확인하려면 아래 버튼을 클릭하세요.</p>
            
            <a href="${data.taskUrl}" class="button">업무 확인하기</a>
        </div>
        
        <div class="footer">
            <p>이 이메일은 Tasko 시스템에서 자동으로 발송되었습니다.</p>
            <p>더 이상 이 알림을 받고 싶지 않으시면 <a href="#">알림 설정</a>을 변경해주세요.</p>
        </div>
    </body>
    </html>
  `;
};

// Task 상태 변경 알림 이메일 발송
export const sendTaskStatusChangeEmail = async (data: TaskStatusChangeEmailData): Promise<boolean> => {
  try {
    const transporter = createTransporter();
    
    // 수신자 목록 생성 (중복 제거)
    const recipients: string[] = [];
    if (data.assignerEmail && !recipients.includes(data.assignerEmail)) {
      recipients.push(data.assignerEmail);
    }
    if (data.assigneeEmail && !recipients.includes(data.assigneeEmail)) {
      recipients.push(data.assigneeEmail);
    }

    if (recipients.length === 0) {
      console.log('수신자가 없어 이메일을 발송하지 않습니다.');
      return false;
    }

    const statusMessages: Record<string, string> = {
      'ASSIGNED': '할당됨',
      'IN_PROGRESS': '진행중',
      'WAITING_CONFIRM': '확인 대기',
      'APPROVED': '승인됨',
      'REJECTED': '거부됨'
    };

    const newStatusKor = statusMessages[data.newStatus] || data.newStatus;
    const subject = `[Tasko] ${data.taskTitle} - 상태가 "${newStatusKor}"로 변경되었습니다`;
    const html = createStatusChangeEmailTemplate(data);

    // 각 수신자에게 개별 발송
    const sendPromises = recipients.map(email => 
      transporter.sendMail({
        from: `"Tasko 알림" <${EMAIL_CONFIG.user}>`,
        to: email,
        subject: subject,
        html: html,
      })
    );

    await Promise.all(sendPromises);
    console.log(`✅ Task 상태 변경 이메일 발송 성공: ${recipients.join(', ')}`);
    return true;

  } catch (error) {
    console.error('❌ Task 상태 변경 이메일 발송 실패:', error);
    return false;
  }
};

// 연결 테스트 함수
export const testEmailConnection = async (): Promise<boolean> => {
  try {
    const transporter = createTransporter();
    await transporter.verify();
    console.log('✅ NodeMailer SMTP 연결 테스트 성공');
    return true;
  } catch (error) {
    console.error('❌ NodeMailer SMTP 연결 테스트 실패:', error);
    return false;
  }
};

// 테스트 이메일 발송 함수
export const sendTestEmail = async (to: string): Promise<boolean> => {
  try {
    const transporter = createTransporter();
    
    const testEmailData: TaskStatusChangeEmailData = {
      taskId: 'test-task-id',
      taskTitle: '테스트 업무',
      projectTitle: '테스트 프로젝트',
      oldStatus: 'ASSIGNED',
      newStatus: 'IN_PROGRESS',
      changedBy: '테스트 사용자',
      assignerEmail: to,
      assigneeEmail: undefined,
      taskUrl: 'http://localhost:5173/tasks/test-task-id'
    };

    return await sendTaskStatusChangeEmail(testEmailData);
  } catch (error) {
    console.error('❌ 테스트 이메일 발송 실패:', error);
    return false;
  }
};
