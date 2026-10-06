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

  /**
   * 不关闭弹窗、但要用别的内容覆盖表单（例如同一弹窗里切换到编辑另一条
   * 记录）之前调用；未改动时直接放行，有改动时提示是否放弃。
   */
  async function confirmDiscard(
    message = '继续后本次输入的内容不会被保存。',
  ): Promise<boolean> {
    if (!isDirty()) return true;
    return alert.confirm({
      title: '放弃未保存的修改？',
      message,
      confirmText: '放弃修改',
      cancelText: '继续编辑',
      destructive: true,
    });
  }

  function confirmClose(): Promise<boolean> {
    return confirmDiscard('关闭后本次输入的内容不会被保存。');
  }

  return { markClean, isDirty, confirmClose, confirmDiscard };
}
