// Supabase Edge Function: Send Task Email
// This function sends email notifications when task is created or status changes
// Called automatically by database trigger or manually via HTTP

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Import nodemailer for Deno
// Note: In production, use npm:nodemailer@^6.9.8
// For Deno, we'll use a compatible approach
const nodemailer = await import("npm:nodemailer@^6.9.8");

interface EmailRequest {
  eventType: 'TASK_CREATED' | 'STATUS_CHANGED';
  taskId: string;
  assignerEmail: string;
  assigneeEmail: string;
  assignerName?: string;
  assigneeName?: string;
  taskTitle: string;
  taskDescription?: string;
  projectTitle: string;
  projectId?: string;
  dueDate?: string;
  // Status change specific fields
  oldStatus?: string;
  newStatus?: string;
  changerId?: string;
  changerName?: string;
  // Recipients array: determines who receives the email
  recipients: ('assigner' | 'assignee')[];
}

// Email template function
// Returns different templates based on event type and recipient role
function getEmailTemplate(
  data: EmailRequest,
  recipientRole: 'assigner' | 'assignee'
): { subject: string; html: string } {
  const appUrl = Deno.env.get("APP_URL") || "https://tasko.app";
  const taskLink = `${appUrl}/tasks/${data.taskId}`;
  
  const statusLabels: Record<string, string> = {
    ASSIGNED: "할당됨",
    IN_PROGRESS: "진행 중",
    WAITING_CONFIRM: "확인 대기",
    APPROVED: "승인됨",
    REJECTED: "거부됨",
  };

  // Task creation email templates
  if (data.eventType === 'TASK_CREATED') {
    const assignerName = data.assignerName || '할당자';
    const assigneeName = data.assigneeName || '담당자';
    const dueDateText = data.dueDate 
      ? new Date(data.dueDate).toLocaleDateString('ko-KR')
      : '미정';
    
    if (recipientRole === 'assignee') {
      // Assignee receives: "○○님(assigner)이 당신에게 업무를 할당했습니다"
      const subject = `[Tasko] 업무 할당: ${data.taskTitle}`;
      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
    <h1 style="color: #2563eb; margin-top: 0;">Tasko 업무 알림</h1>
  </div>
  
  <div style="background-color: #ffffff; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
    <h2 style="color: #111827; margin-top: 0;">${assignerName}님이 당신에게 업무를 할당했습니다</h2>
    
    <div style="margin: 20px 0;">
      <p><strong>프로젝트:</strong> ${data.projectTitle}</p>
      <p><strong>업무 제목:</strong> ${data.taskTitle}</p>
      ${data.taskDescription ? `<p><strong>설명:</strong> ${data.taskDescription}</p>` : ''}
      <p><strong>마감일:</strong> ${dueDateText}</p>
      <p><strong>할당자:</strong> ${assignerName} (${data.assignerEmail})</p>
    </div>
    
    <div style="background-color: #f3f4f6; padding: 15px; border-radius: 6px; margin: 20px 0;">
      <p style="margin: 0; font-size: 14px; color: #6b7280;">
        업무 상세 정보를 확인하려면 아래 링크를 클릭하세요.
      </p>
    </div>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${taskLink}" 
         style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">
        업무 확인하기
      </a>
    </div>
  </div>
  
  <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #6b7280; font-size: 12px;">
    <p>이 이메일은 Tasko 시스템에서 자동으로 발송되었습니다.</p>
    <p>문의사항이 있으시면 관리자에게 연락해주세요.</p>
  </div>
</body>
</html>
      `;
      return { subject, html };
    } else {
      // Assigner receives: "당신이 ○○님(assignee)에게 업무를 할당했습니다"
      const subject = `[Tasko] 업무 할당 완료: ${data.taskTitle}`;
      const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
    <h1 style="color: #2563eb; margin-top: 0;">Tasko 업무 알림</h1>
  </div>
  
  <div style="background-color: #ffffff; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
    <h2 style="color: #111827; margin-top: 0;">당신이 ${assigneeName}님에게 업무를 할당했습니다</h2>
    
    <div style="margin: 20px 0;">
      <p><strong>프로젝트:</strong> ${data.projectTitle}</p>
      <p><strong>업무 제목:</strong> ${data.taskTitle}</p>
      ${data.taskDescription ? `<p><strong>설명:</strong> ${data.taskDescription}</p>` : ''}
      <p><strong>마감일:</strong> ${dueDateText}</p>
      <p><strong>담당자:</strong> ${assigneeName} (${data.assigneeEmail})</p>
    </div>
    
    <div style="background-color: #f3f4f6; padding: 15px; border-radius: 6px; margin: 20px 0;">
      <p style="margin: 0; font-size: 14px; color: #6b7280;">
        업무 상세 정보를 확인하려면 아래 링크를 클릭하세요.
      </p>
    </div>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${taskLink}" 
         style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">
        업무 확인하기
      </a>
    </div>
  </div>
  
  <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #6b7280; font-size: 12px;">
    <p>이 이메일은 Tasko 시스템에서 자동으로 발송되었습니다.</p>
    <p>문의사항이 있으시면 관리자에게 연락해주세요.</p>
  </div>
</body>
</html>
      `;
      return { subject, html };
    }
  }

  // Status change email templates
  if (data.eventType === 'STATUS_CHANGED' && data.oldStatus && data.newStatus) {
    const oldStatusLabel = statusLabels[data.oldStatus] || data.oldStatus;
    const newStatusLabel = statusLabels[data.newStatus] || data.newStatus;
    const changerName = data.changerName || '시스템';
    
    // Determine message based on status transition and recipient role
    let statusMessage = '';
    if (data.oldStatus === 'ASSIGNED' && data.newStatus === 'IN_PROGRESS') {
      statusMessage = recipientRole === 'assigner' 
        ? `${data.assigneeName || '담당자'}님이 업무를 시작했습니다`
        : '업무를 시작했습니다';
    } else if (data.oldStatus === 'IN_PROGRESS' && data.newStatus === 'WAITING_CONFIRM') {
      statusMessage = recipientRole === 'assigner'
        ? `${data.assigneeName || '담당자'}님이 업무 완료를 요청했습니다`
        : '업무 완료를 요청했습니다';
    } else if (data.oldStatus === 'WAITING_CONFIRM' && data.newStatus === 'APPROVED') {
      statusMessage = recipientRole === 'assignee'
        ? `${data.assignerName || '할당자'}님이 업무를 승인했습니다`
        : '업무를 승인했습니다';
    } else if (data.oldStatus === 'WAITING_CONFIRM' && data.newStatus === 'REJECTED') {
      statusMessage = recipientRole === 'assignee'
        ? `${data.assignerName || '할당자'}님이 업무를 반려했습니다`
        : '업무를 반려했습니다';
    } else {
      statusMessage = `상태가 ${oldStatusLabel}에서 ${newStatusLabel}로 변경되었습니다`;
    }

    const subject = `[Tasko] 업무 상태 변경: ${data.taskTitle}`;
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
    <h1 style="color: #2563eb; margin-top: 0;">Tasko 업무 알림</h1>
  </div>
  
  <div style="background-color: #ffffff; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
    <h2 style="color: #111827; margin-top: 0;">${statusMessage}</h2>
    
    <div style="margin: 20px 0;">
      <p><strong>프로젝트:</strong> ${data.projectTitle}</p>
      <p><strong>업무 제목:</strong> ${data.taskTitle}</p>
      <p><strong>상태 변경:</strong> <span style="color: #dc2626;">${oldStatusLabel}</span> → <span style="color: #16a34a;">${newStatusLabel}</span></p>
      <p><strong>변경자:</strong> ${changerName}</p>
    </div>
    
    <div style="background-color: #f3f4f6; padding: 15px; border-radius: 6px; margin: 20px 0;">
      <p style="margin: 0; font-size: 14px; color: #6b7280;">
        업무 상세 정보를 확인하려면 아래 링크를 클릭하세요.
      </p>
    </div>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${taskLink}" 
         style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">
        업무 확인하기
      </a>
    </div>
  </div>
  
  <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; color: #6b7280; font-size: 12px;">
    <p>이 이메일은 Tasko 시스템에서 자동으로 발송되었습니다.</p>
    <p>문의사항이 있으시면 관리자에게 연락해주세요.</p>
  </div>
</body>
</html>
    `;
    return { subject, html };
  }

  // Fallback template (should not reach here)
  return {
    subject: `[Tasko] 업무 알림: ${data.taskTitle}`,
    html: `<p>업무 알림입니다.</p>`
  };
}

// Send email function with retry logic
async function sendEmail(
  transporter: any,
  to: string,
  subject: string,
  html: string,
  maxRetries: number = 3
): Promise<{ success: boolean; error?: string }> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await transporter.sendMail({
        from: Deno.env.get("SMTP_USER"),
        to,
        subject,
        html,
      });
      return { success: true };
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries) {
        // Wait before retry (exponential backoff)
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  return {
    success: false,
    error: lastError?.message || "Unknown error",
  };
}

// Main handler
Deno.serve(async (req: Request) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  try {
    // Parse request body
    const emailData: EmailRequest = await req.json();

    // Validate required fields
    if (
      !emailData.taskId ||
      !emailData.eventType ||
      !emailData.assignerEmail ||
      !emailData.assigneeEmail ||
      !emailData.taskTitle ||
      !emailData.projectTitle ||
      !emailData.recipients ||
      emailData.recipients.length === 0
    ) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // Validate status change specific fields
    if (emailData.eventType === 'STATUS_CHANGED' && (!emailData.oldStatus || !emailData.newStatus)) {
      return new Response(
        JSON.stringify({ error: "Missing status change fields (oldStatus, newStatus)" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // Get SMTP credentials from environment variables (Supabase Secrets)
    const smtpUser = Deno.env.get("SMTP_USER");
    const smtpPass = Deno.env.get("SMTP_PASS");

    if (!smtpUser || !smtpPass) {
      return new Response(
        JSON.stringify({ error: "SMTP credentials not configured" }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // Create nodemailer transporter
    const transporter = nodemailer.default.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false, // true for 465, false for other ports
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    // Create Supabase client for logging
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Determine recipients based on recipients array
    const recipientList: Array<{ role: 'assigner' | 'assignee'; email: string; name: string }> = [];
    
    if (emailData.recipients.includes('assigner')) {
      recipientList.push({
        role: 'assigner',
        email: emailData.assignerEmail,
        name: emailData.assignerName || '할당자'
      });
    }
    
    if (emailData.recipients.includes('assignee')) {
      recipientList.push({
        role: 'assignee',
        email: emailData.assigneeEmail,
        name: emailData.assigneeName || '담당자'
      });
    }

    // Send emails to each recipient with role-specific templates
    const results = await Promise.all(
      recipientList.map(async (recipient) => {
        // Generate role-specific email template
        const { subject, html } = getEmailTemplate(emailData, recipient.role);
        
        const result = await sendEmail(transporter, recipient.email, subject, html);

        // Log email attempt
        await supabase.from("email_logs").insert({
          task_id: emailData.taskId,
          recipient_email: recipient.email,
          recipient_name: recipient.name,
          subject,
          status: result.success ? "sent" : "failed",
          error_message: result.error || null,
          sent_at: result.success ? new Date().toISOString() : null,
        });

        return { ...result, recipient: recipient.email, role: recipient.role };
      })
    );

    // Check if all emails were sent successfully
    const allSuccess = results.every((r) => r.success);
    const failedRecipients = results.filter((r) => !r.success).map((r) => r.recipient);

    return new Response(
      JSON.stringify({
        success: allSuccess,
        message: allSuccess
          ? "Emails sent successfully"
          : `Some emails failed: ${failedRecipients.join(", ")}`,
        results,
      }),
      {
        status: allSuccess ? 200 : 207, // 207 Multi-Status for partial success
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error) {
    console.error("Error sending email:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
});

