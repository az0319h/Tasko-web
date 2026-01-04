import { z } from "zod";

/**
 * Task 생성/수정 스키마
 * assigner_id와 assignee_id는 모두 선택값 (Admin만 Task 생성 가능)
 */
export const taskSchema = z.object({
  title: z.string().min(1, "제목을 입력해주세요.").max(200, "제목은 200자 이하여야 합니다."),
  description: z.string().max(1000, "설명은 1000자 이하여야 합니다.").optional().nullable(),
  assigner_id: z.string().uuid("올바른 담당자 ID를 선택해주세요."),
  assignee_id: z.string().uuid("올바른 할당받은 사람 ID를 선택해주세요."),
  due_date: z.string().optional().nullable(),
}).refine((data) => data.assigner_id !== data.assignee_id, {
  message: "담당자와 할당받은 사람은 같을 수 없습니다.",
  path: ["assignee_id"],
});

export type TaskFormData = z.infer<typeof taskSchema>;

