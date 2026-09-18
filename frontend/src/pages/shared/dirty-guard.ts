import { alert } from '@/ui/alert';

/**
 * 给编辑弹窗（ASheet）提供“有未保存改动时，Esc / 点遮罩 / 关闭按钮
 * 需要二次确认”的能力。用法：
 *
 * ```ts
 * const dirtyGuard = useDirtyGuard(form);
 * function addItem() {
 *   resetForm();
 *   dirtyGuard.markClean();
 *   dialogOpen.value = true;
 * }
 * // <ASheet :confirm-close="dirtyGuard.confirmClose" ...>
 * ```
 *
 * 打开弹窗（新增/编辑）时调用一次 `markClean()` 记录初始快照，
 * 之后 ASheet 关闭前都会用 `confirmClose()` 跟当前表单值比对。
 */
export function useDirtyGuard<T extends object>(form: T) {
  let snapshot = JSON.stringify(form);

  function markClean() {
    snapshot = JSON.stringify(form);
  }

  function isDirty() {
    return JSON.stringify(form) !== snapshot;
  }

  async function confirmClose(): Promise<boolean> {
    if (!isDirty()) return true;
    return alert.confirm({
      title: '放弃未保存的修改？',
      message: '关闭后本次输入的内容不会被保存。',
      confirmText: '放弃修改',
      cancelText: '继续编辑',
      destructive: true,
    });
  }

  return { markClean, isDirty, confirmClose };
}
