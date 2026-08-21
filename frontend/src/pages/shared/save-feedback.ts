import type { SaveFailure } from '@/domain';
import { alert } from '@/ui/alert';
import { toast } from '@/ui/toast';

const DEFAULT_FAILURE: Partial<Record<SaveFailure, string>> = {
  storage: '数据保存失败，本次修改未保存',
  stale: '该记录已被其他页面删除',
};

export function failureMessage(
  reason: SaveFailure,
  overrides: Partial<Record<SaveFailure, string>> = {},
): string {
  return (
    overrides[reason] ||
    DEFAULT_FAILURE[reason] ||
    '保存失败，请重试'
  );
}

export function toastResult(
  result: { ok: true } | { ok: false; reason: SaveFailure },
  success: string,
  overrides: Partial<Record<SaveFailure, string>> = {},
): boolean {
  if (!result.ok) {
    toast.error(failureMessage(result.reason, overrides));
    return false;
  }
  if (success) toast.success(success);
  return true;
}

export function confirmDelete(title: string, message: string) {
  return alert.confirm({
    title,
    message,
    confirmText: '删除',
    destructive: true,
  });
}
