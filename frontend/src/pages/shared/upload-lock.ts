import { ref } from 'vue';

/** 上传进行中时 AFileDrop 显示的标题，配合 `disabled` 给出上传中反馈。 */
export const UPLOADING_TITLE = '正在上传…';

/**
 * 给上传面板提供“上传中锁”：上传期间把 AFileDrop 置为 disabled 并换成
 * “正在上传…”标题，同时在逻辑层拒绝并发的第二次拖放，避免两批文件基于
 * 同一份旧列表互相覆盖。用法：
 *
 * ```ts
 * const { uploading, runUpload } = useUploadLock();
 * function onFiles(files: File[]) {
 *   return runUpload(async () => { ... });
 * }
 * // <AFileDrop :disabled="uploading" :title="uploading ? UPLOADING_TITLE : undefined" ...>
 * ```
 */
export function useUploadLock() {
  const uploading = ref(false);

  async function runUpload(task: () => Promise<void>): Promise<boolean> {
    if (uploading.value) return false;
    uploading.value = true;
    try {
      await task();
      return true;
    } finally {
      uploading.value = false;
    }
  }

  return { uploading, runUpload };
}
