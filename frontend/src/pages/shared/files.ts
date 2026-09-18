import { ApiError, api } from '@/api';
import { toast } from '@/ui/toast';

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * 以 multipart 上传文件正文，返回写入 Store 的 `/api/files/{id}/content` 引用。
 * 上传失败时直接提示并返回 null，调用方跳过该文件即可；上传成功但最终未写入
 * Store 的文件由后端在保护期后自动清理。
 */
export async function uploadFile(file: File): Promise<null | string> {
  try {
    return (await api.uploadFile(file)).dataUrl;
  } catch (error) {
    toast.error(
      error instanceof ApiError && error.message
        ? `“${file.name}”上传失败：${error.message}`
        : `“${file.name}”上传失败，请重试`,
    );
    return null;
  }
}
