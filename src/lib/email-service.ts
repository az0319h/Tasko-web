import nodemailer from 'nodemailer';

// 이메일 설정 인터페이스
interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}

// 이메일 발송 데이터 인터페이스
interface EmailData {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

// 환경변수에서 이메일 설정 가져오기
const getEmailConfig = (): EmailConfig => {
  return {
    host: import.meta.env.VITE_SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(import.meta.env.VITE_SMTP_PORT || '587'),
    secure: import.meta.env.VITE_SMTP_SECURE === 'true',
    user: import.meta.env.VITE_SMTP_USER || 'bass.to.tasko@gmail.com',
    pass: import.meta.env.VITE_SMTP_PASS || 'wavb nhjc hdig jvrd'
  };
};

// NodeMailer 트랜스포터 생성
let transporter: nodemailer.Transporter | null = null;

const createTransporter = (): nodemailer.Transporter => {
  if (transporter) {
    return transporter;
  }

  const config = getEmailConfig();
  
  transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    // Gmail의 경우 추가 설정
    service: 'gmail',
    tls: {
      rejectUnauthorized: false
    }
  });

  return transporter;
};

// 연결 테스트 함수
export const testEmailConnection = async (): Promise<boolean> => {
  try {
    const transporter = createTransporter();
    await transporter.verify();
    console.log('✅ 이메일 서버 연결 성공');
    return true;
  } catch (error) {
    console.error('❌ 이메일 서버 연결 실패:', error);
    return false;
  }
};

// 기본 이메일 발송 함수
export const sendEmail = async (emailData: EmailData): Promise<boolean> => {
  try {
    const transporter = createTransporter();
    const config = getEmailConfig();

    const mailOptions = {
      from: `"Tasko 알림" <${config.user}>`,
      to: Array.isArray(emailData.to) ? emailData.to.join(', ') : emailData.to,
      subject: emailData.subject,
      html: emailData.html,
      text: emailData.text || '', // HTML에서 텍스트 추출 가능
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ 이메일 발송 성공:', info.messageId);
    return true;
  } catch (error) {
    console.error('❌ 이메일 발송 실패:', error);
    return false;
  }
};

// 이메일 발송 재시도 함수
export const sendEmailWithRetry = async (
  emailData: EmailData, 
  maxRetries: number = 3
): Promise<boolean> => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const success = await sendEmail(emailData);
      if (success) {
        return true;
      }
    } catch (error) {
      console.error(`이메일 발송 시도 ${attempt}/${maxRetries} 실패:`, error);
      
      if (attempt === maxRetries) {
        console.error('최대 재시도 횟수 초과. 이메일 발송 포기.');
        return false;
      }
      
      // 재시도 전 잠시 대기 (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }
  return false;
};

// 이메일 설정 검증 함수
export const validateEmailConfig = (): boolean => {
  const config = getEmailConfig();
  
  if (!config.user || !config.pass) {
    console.error('이메일 사용자명 또는 비밀번호가 설정되지 않았습니다.');
    return false;
  }
  
  if (!config.host || !config.port) {
    console.error('SMTP 호스트 또는 포트가 설정되지 않았습니다.');
    return false;
  }
  
  return true;
};

// 개발 환경에서 이메일 설정 확인
if (import.meta.env.DEV) {
  validateEmailConfig();
}
