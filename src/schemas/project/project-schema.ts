import { z } from "zod";

/**
 * 프로젝트 생성 스키마
 * 초대 사용자 선택 필수 (관리자 제외 1명 이상)
 */
export const projectCreateSchema = z.object({
  title: z.string().min(1, "기회를 입력해주세요.").max(200, "기회는 200자 이하여야 합니다."),
  client_name: z.string().min(1, "고객명을 입력해주세요.").max(100, "고객명은 100자 이하여야 합니다."),
  participant_ids: z.array(z.string().uuid()).min(1, "최소 1명 이상의 사용자를 선택해주세요."),
});

/**
 * 프로젝트 수정 스키마
 * 초대 사용자 필드는 수정 불가
 */
export const projectUpdateSchema = z.object({
  title: z.string().min(1, "기회를 입력해주세요.").max(200, "기회는 200자 이하여야 합니다."),
  client_name: z.string().min(1, "고객명을 입력해주세요.").max(100, "고객명은 100자 이하여야 합니다."),
});

/**
 * 프로젝트 생성/수정 폼 데이터 타입
 */
export type ProjectCreateFormData = z.infer<typeof projectCreateSchema>;
export type ProjectUpdateFormData = z.infer<typeof projectUpdateSchema>;
export type ProjectFormData = ProjectCreateFormData | ProjectUpdateFormData;

// 하위 호환성을 위해 projectSchema export (생성 모드용)
export const projectSchema = projectCreateSchema;

