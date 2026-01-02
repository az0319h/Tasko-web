// 기본 이메일 템플릿 베이스
export interface EmailTemplateData {
  title: string;
  content: string;
  buttonText?: string;
  buttonUrl?: string;
  footerText?: string;
}

export const createBaseEmailTemplate = (data: EmailTemplateData): string => {
  return `
    <!DOCTYPE html>
    <html lang="ko">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${data.title}</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                line-height: 1.6;
                color: #333;
                background-color: #f5f5f5;
            }
            
            .email-container {
                max-width: 600px;
                margin: 0 auto;
                background-color: #ffffff;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }
            
            .header {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 30px;
                text-align: center;
            }
            
            .header h1 {
                font-size: 28px;
                font-weight: 600;
                margin-bottom: 10px;
            }
            
            .header .subtitle {
                font-size: 16px;
                opacity: 0.9;
            }
            
            .content {
                padding: 40px 30px;
            }
            
            .content h2 {
                color: #333;
                font-size: 24px;
                margin-bottom: 20px;
            }
            
            .content p {
                margin-bottom: 16px;
                color: #555;
                font-size: 16px;
            }
            
            .info-box {
                background: #f8f9fa;
                border-left: 4px solid #667eea;
                padding: 20px;
                margin: 25px 0;
                border-radius: 0 8px 8px 0;
            }
            
            .info-box h3 {
                color: #333;
                margin-bottom: 10px;
                font-size: 18px;
            }
            
            .info-item {
                display: flex;
                margin-bottom: 8px;
            }
            
            .info-label {
                font-weight: 600;
                color: #333;
                min-width: 100px;
            }
            
            .info-value {
                color: #555;
            }
            
            .button-container {
                text-align: center;
                margin: 30px 0;
            }
            
            .button {
                display: inline-block;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 14px 28px;
                text-decoration: none;
                border-radius: 8px;
                font-weight: 600;
                font-size: 16px;
                transition: transform 0.2s ease;
            }
            
            .button:hover {
                transform: translateY(-2px);
            }
            
            .divider {
                height: 1px;
                background: #e0e0e0;
                margin: 30px 0;
            }
            
            .footer {
                background: #f8f9fa;
                padding: 25px 30px;
                text-align: center;
                color: #666;
                font-size: 14px;
                border-top: 1px solid #e0e0e0;
            }
            
            .footer p {
                margin-bottom: 10px;
            }
            
            .footer a {
                color: #667eea;
                text-decoration: none;
            }
            
            .footer a:hover {
                text-decoration: underline;
            }
            
            .logo {
                font-size: 24px;
                font-weight: bold;
                margin-bottom: 5px;
            }
            
            @media only screen and (max-width: 600px) {
                .email-container {
                    margin: 0;
                    box-shadow: none;
                }
                
                .header, .content, .footer {
                    padding: 20px;
                }
                
                .header h1 {
                    font-size: 24px;
                }
                
                .content h2 {
                    font-size: 20px;
                }
                
                .info-item {
                    flex-direction: column;
                }
                
                .info-label {
                    margin-bottom: 4px;
                }
            }
        </style>
    </head>
    <body>
        <div class="email-container">
            <div class="header">
                <div class="logo">📋 Tasko</div>
                <h1>${data.title}</h1>
                ${data.title !== '업무 관리 시스템' ? '<div class="subtitle">업무 관리 시스템</div>' : ''}
            </div>
            
            <div class="content">
                ${data.content}
                
                ${data.buttonText && data.buttonUrl ? `
                    <div class="button-container">
                        <a href="${data.buttonUrl}" class="button">${data.buttonText}</a>
                    </div>
                ` : ''}
            </div>
            
            <div class="footer">
                <p><strong>Tasko</strong> - 효율적인 업무 관리 시스템</p>
                <p>이 이메일은 시스템에서 자동으로 발송되었습니다.</p>
                ${data.footerText ? `<p>${data.footerText}</p>` : ''}
                <p>
                    <a href="#">알림 설정</a> | 
                    <a href="#">도움말</a> | 
                    <a href="#">문의하기</a>
                </p>
            </div>
        </div>
    </body>
    </html>
  `;
};
