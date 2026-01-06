import { z } from "zod";

/**
 * 프로젝트 생성/수정 스키마
 */
export const projectSchema = z.object({
  title: z.string().min(1, "제목을 입력해주세요.").max(200, "제목은 200자 이하여야 합니다."),
  client_name: z.string().min(1, "클라이언트명을 입력해주세요.").max(100, "클라이언트명은 100자 이하여야 합니다."),
  patent_name: z.string().min(1, "특허명을 입력해주세요.").max(100, "특허명은 100자 이하여야 합니다."),
  due_date: z.string().optional().nullable(),
  is_public: z.boolean().default(true).optional(),
  status: z.enum(["inProgress", "done"]).optional(),
});

export type ProjectFormData = z.infer<typeof projectSchema>;

