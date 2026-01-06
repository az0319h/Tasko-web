import supabase from "@/lib/supabase";

const AVATARS_BUCKET = "avatars";
const TASK_FILES_BUCKET = "task-files";

/**
 * 프로필 이미지 업로드
 * @param file 업로드할 이미지 파일
 * @param userId 사용자 ID
 * @returns 업로드된 이미지의 공개 URL
 */
export async function uploadAvatar(file: File, userId: string): Promise<string> {
  // 파일 확장자 추출
  const fileExt = file.name.split(".").pop();
  const fileName = `${userId}-${Date.now()}.${fileExt}`;
  const filePath = `${userId}/${fileName}`;

  // 기존 이미지가 있으면 삭제
  const { data: existingFiles } = await supabase.storage
    .from(AVATARS_BUCKET)
    .list(userId);

  if (existingFiles && existingFiles.length > 0) {
    const filesToDelete = existingFiles.map((f) => `${userId}/${f.name}`);
    await supabase.storage.from(AVATARS_BUCKET).remove(filesToDelete);
  }

  // 새 이미지 업로드
  const { data, error } = await supabase.storage
    .from(AVATARS_BUCKET)
    .upload(filePath, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (error) throw error;

  // 공개 URL 반환
  const {
    data: { publicUrl },
  } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(data.path);

  return publicUrl;
}

/**
 * 파일 확장자에 따른 올바른 MIME type 매핑
 * 브라우저가 인식하지 못하는 파일 형식(예: .hwp)의 경우 올바른 MIME type으로 변환
 */
const MIME_TYPE_MAP: Record<string, string> = {
  // 문서 파일
  hwp: "application/x-hwp",
  hwpx: "application/x-hwpx",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  // 프레젠테이션 파일
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  // 스프레드시트 파일
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  // 압축 파일
  zip: "application/zip",
  rar: "application/x-rar-compressed",
  "7z": "application/x-7z-compressed",
};

/**
 * 파일 확장자로부터 올바른 MIME type 가져오기
 * @param fileName 파일명
 * @param originalMimeType 브라우저가 인식한 원본 MIME type
 * @returns 올바른 MIME type
 */
function getCorrectMimeType(fileName: string, originalMimeType: string): string {
  const fileExt = fileName.split(".").pop()?.toLowerCase();
  if (!fileExt) return originalMimeType;

  // 확장자 기반 MIME type이 있으면 사용
  if (MIME_TYPE_MAP[fileExt]) {
    return MIME_TYPE_MAP[fileExt];
  }

  // 이미지 파일은 원본 MIME type 유지
  if (originalMimeType.startsWith("image/")) {
    return originalMimeType;
  }

  // 그 외는 원본 MIME type 유지
  return originalMimeType;
}

/**
 * Task 채팅 파일 업로드
 * @param file 업로드할 파일
 * @param taskId Task ID
 * @param userId 사용자 ID
 * @returns 업로드된 파일의 공개 URL 및 파일 정보
 */
export async function uploadTaskFile(
  file: File,
  taskId: string,
  userId: string,
): Promise<{ url: string; fileName: string; fileType: string; fileSize: number }> {
  // 파일 확장자 추출
  const fileExt = file.name.split(".").pop();
  const timestamp = Date.now();
  const fileName = `${taskId}/${userId}-${timestamp}.${fileExt}`;
  const filePath = fileName;

  // 올바른 MIME type 가져오기
  const correctMimeType = getCorrectMimeType(file.name, file.type);
  
  // MIME type이 변경된 경우 새 File 객체 생성
  let fileToUpload = file;
  if (file.type !== correctMimeType) {
    console.log(`[Storage] MIME type corrected: ${file.type} → ${correctMimeType} for ${file.name}`);
    fileToUpload = new File([file], file.name, {
      type: correctMimeType,
      lastModified: file.lastModified,
    });
  }

  // 파일 업로드
  const { data, error } = await supabase.storage
    .from("task-files")
    .upload(filePath, fileToUpload, {
      cacheControl: "3600",
      upsert: false,
      contentType: correctMimeType, // 명시적으로 MIME type 지정
    });

  if (error) {
    throw new Error(`파일 업로드 실패: ${error.message}`);
  }

  // 공개 URL 반환
  const {
    data: { publicUrl },
  } = supabase.storage.from("task-files").getPublicUrl(data.path);

  return {
    url: publicUrl,
    fileName: file.name,
    fileType: correctMimeType, // 올바른 MIME type 반환
    fileSize: file.size,
  };
}

/**
 * Task 채팅 파일 다운로드 URL 생성
 * @param fileUrl 파일 URL
 * @returns 다운로드 가능한 URL
 */
export function getTaskFileDownloadUrl(fileUrl: string): string {
  // 이미 공개 URL이면 그대로 반환
  if (fileUrl.startsWith("http")) {
    return fileUrl;
  }
  // 경로만 있는 경우 공개 URL 생성
  const {
    data: { publicUrl },
  } = supabase.storage.from("task-files").getPublicUrl(fileUrl);
  return publicUrl;
}

/**
 * 프로필 이미지 삭제
 * @param url 삭제할 이미지의 URL
 */
export async function deleteAvatar(url: string): Promise<void> {
  // URL에서 경로 추출
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split("/");
    const bucketIndex = pathParts.findIndex((part) => part === AVATARS_BUCKET);
    if (bucketIndex === -1) {
      throw new Error("Invalid avatar URL");
    }
    const path = pathParts.slice(bucketIndex + 1).join("/");

    const { error } = await supabase.storage.from(AVATARS_BUCKET).remove([path]);

    if (error) throw error;
  } catch (err) {
    // URL 파싱 실패 시 기존 방식으로 시도
    const urlParts = url.split("/");
    const pathIndex = urlParts.findIndex((part) => part === AVATARS_BUCKET);
    if (pathIndex === -1) {
      throw new Error("Invalid avatar URL");
    }
    const path = urlParts.slice(pathIndex + 1).join("/");

    const { error: storageError } = await supabase.storage.from(AVATARS_BUCKET).remove([path]);

    if (storageError) throw storageError;
  }
}

/**
 * 프로필 이미지 URL 조회
 * @param userId 사용자 ID
 * @returns 프로필 이미지 URL 또는 null
 */
export async function getAvatarUrl(userId: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(AVATARS_BUCKET)
    .list(userId, {
      limit: 1,
      sortBy: { column: "created_at", order: "desc" },
    });

  if (error) throw error;
  if (!data || data.length === 0) return null;

  const filePath = `${userId}/${data[0].name}`;
  const {
    data: { publicUrl },
  } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(filePath);

  return publicUrl;
}

/**
 * Task 파일 삭제
 * @param fileUrl 삭제할 파일의 URL
 */
export async function deleteTaskFile(fileUrl: string): Promise<void> {
  try {
    const urlObj = new URL(fileUrl);
    const pathParts = urlObj.pathname.split("/");
    const bucketIndex = pathParts.findIndex((part) => part === TASK_FILES_BUCKET);
    
    if (bucketIndex === -1) {
      throw new Error("Invalid file URL");
    }
    
    const path = pathParts.slice(bucketIndex + 1).join("/");
    const { error } = await supabase.storage
      .from(TASK_FILES_BUCKET)
      .remove([path]);

    if (error) throw error;
  } catch (err: any) {
    // URL 파싱 실패 시 기존 방식으로 시도
    const urlParts = fileUrl.split("/");
    const pathIndex = urlParts.findIndex((part) => part === TASK_FILES_BUCKET);
    
    if (pathIndex === -1) {
      throw new Error(`파일 삭제 실패: Invalid file URL`);
    }
    
    const path = urlParts.slice(pathIndex + 1).join("/");
    const { error: storageError } = await supabase.storage
      .from(TASK_FILES_BUCKET)
      .remove([path]);

    if (storageError) {
      throw new Error(`파일 삭제 실패: ${storageError.message}`);
    }
  }
}

