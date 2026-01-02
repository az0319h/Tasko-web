// 이메일 연결 테스트 스크립트
// 개발 환경에서 NodeMailer 설정을 테스트합니다.

import { testEmailConnection, sendTestEmail } from './notification-service';

// 환경변수 확인
export const checkEmailEnvironmentVariables = (): boolean => {
  console.log('=== 이메일 환경변수 확인 ===');
  
  const requiredVars = [
    'VITE_SMTP_HOST',
    'VITE_SMTP_PORT', 
    'VITE_SMTP_USER',
    'VITE_SMTP_PASS'
  ];

  let allPresent = true;

  requiredVars.forEach(varName => {
    const value = (import.meta.env as any)[varName];
    if (value) {
      console.log(`✅ ${varName}: ${varName.includes('PASS') ? '***' : value}`);
    } else {
      console.log(`❌ ${varName}: 설정되지 않음`);
      allPresent = false;
    }
  });

  return allPresent;
};

// SMTP 연결 테스트 실행
export const runEmailConnectionTest = async (): Promise<void> => {
  console.log('\n=== SMTP 연결 테스트 시작 ===');
  
  // 환경변수 확인
  const envOk = checkEmailEnvironmentVariables();
  if (!envOk) {
    console.log('환경변수가 올바르게 설정되지 않았습니다. .env 파일을 확인하세요.');
    return;
  }

  // 연결 테스트
  try {
    const connectionSuccess = await testEmailConnection();
    if (connectionSuccess) {
      console.log('🎉 SMTP 서버 연결 성공!');
    } else {
      console.log('💥 SMTP 서버 연결 실패!');
    }
  } catch (error) {
    console.error('연결 테스트 중 오류:', error);
  }
};

// 테스트 이메일 발송
export const runTestEmailSend = async (testEmail: string = 'bass.to.tasko@gmail.com'): Promise<void> => {
  console.log(`\n=== 테스트 이메일 발송 (${testEmail}) ===`);
  
  try {
    const sendSuccess = await sendTestEmail(testEmail);
    if (sendSuccess) {
      console.log('🎉 테스트 이메일 발송 성공!');
      console.log(`${testEmail}로 이메일이 발송되었습니다.`);
    } else {
      console.log('💥 테스트 이메일 발송 실패!');
    }
  } catch (error) {
    console.error('테스트 이메일 발송 중 오류:', error);
  }
};

// 전체 테스트 실행
export const runFullEmailTest = async (): Promise<void> => {
  console.log('🚀 NodeMailer 이메일 시스템 전체 테스트 시작\n');
  
  await runEmailConnectionTest();
  
  // 연결이 성공하면 테스트 이메일 발송
  const connectionSuccess = await testEmailConnection();
  if (connectionSuccess) {
    await runTestEmailSend();
  }
  
  console.log('\n✅ 전체 테스트 완료');
};

// 개발 환경에서 자동 실행
if (import.meta.env.DEV) {
  console.log('개발 환경에서 이메일 설정을 확인합니다...');
  checkEmailEnvironmentVariables();
}
