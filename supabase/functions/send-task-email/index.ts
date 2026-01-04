// Supabase Edge Function: Send Task Status Change Email
// This function sends email notifications when task status changes
// Called automatically by database trigger or manually via HTTP

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Import nodemailer for Deno
// Note: In production, use npm:nodemailer@^6.9.8
// For Deno, we'll use a compatible approach
const nodemailer = await import("npm:nodemailer@^6.9.8");

interface EmailRequest {
  taskId: string;
  oldStatus: string;
  newStatus: string;
  assignerEmail: string;
  assigneeEmail: string;
  changerId: string;
  taskTitle: string;
  projectTitle: string;
}

// Email template function
function getEmailTemplate(data: EmailRequest): { subject: string; html: string } {
  const statusLabels: Record<string, string> = {
    ASSIGNED: "할당됨",
    IN_PROGRESS: "진행 중",
    WAITING_CONFIRM: "확인 대기",
    APPROVED: "승인됨",
    REJECTED: "거부됨",
  };

  const oldStatusLabel = statusLabels[data.oldStatus] || data.oldStatus;
  const newStatusLabel = statusLabels[data.newStatus] || data.newStatus;

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
    <h2 style="color: #111827; margin-top: 0;">업무 상태가 변경되었습니다</h2>
    
    <div style="margin: 20px 0;">
      <p><strong>프로젝트:</strong> ${data.projectTitle}</p>
      <p><strong>업무 제목:</strong> ${data.taskTitle}</p>
      <p><strong>상태 변경:</strong> <span style="color: #dc2626;">${oldStatusLabel}</span> → <span style="color: #16a34a;">${newStatusLabel}</span></p>
    </div>
    
    <div style="background-color: #f3f4f6; padding: 15px; border-radius: 6px; margin: 20px 0;">
      <p style="margin: 0; font-size: 14px; color: #6b7280;">
        업무 상세 정보를 확인하려면 아래 링크를 클릭하세요.
      </p>
    </div>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${Deno.env.get("APP_URL") || "https://tasko.app"}/tasks/${data.taskId}" 
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
      !emailData.oldStatus ||
      !emailData.newStatus ||
      !emailData.assignerEmail ||
      !emailData.assigneeEmail ||
      !emailData.taskTitle ||
      !emailData.projectTitle
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

    // Generate email template
    const { subject, html } = getEmailTemplate(emailData);

    // Create Supabase client for logging
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Send emails to both assigner and assignee
    const recipients = [
      { email: emailData.assignerEmail, name: "할당자" },
      { email: emailData.assigneeEmail, name: "담당자" },
    ];

    const results = await Promise.all(
      recipients.map(async (recipient) => {
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

        return { ...result, recipient: recipient.email };
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

