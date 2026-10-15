import { computed } from 'vue';

import { ApiError, api, fileIdFromReference } from '@/api';
import { useAccess } from '@/stores/auth';
import { message } from 'ant-design-vue';

export { fileIdFromReference };

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
    message.error(
      error instanceof ApiError && error.message
        ? `“${file.name}”上传失败：${error.message}`
        : `“${file.name}”上传失败，请重试`,
    );
    return null;
  }
}

/** 有 file:download 才显示下载；点击后带 JWT 拉取附件并触发浏览器保存。 */
export function useFileDownload() {
  const { has } = useAccess();
  const canDownload = computed(() => has('file:download'));

  async function downloadStoredFile(reference: string, fileName: string) {
    const id = fileIdFromReference(reference);
    if (!id) return;
    try {
      const blob = await api.downloadFile(id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName || 'download';
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      message.success('已开始下载');
    } catch (error) {
      message.error(
        error instanceof ApiError && error.kind === 'forbidden'
          ? '无权限下载该文件'
          : error instanceof ApiError && error.message
            ? error.message
            : '下载失败，请重试',
      );
    }
  }

  return { canDownload, downloadStoredFile };
}
