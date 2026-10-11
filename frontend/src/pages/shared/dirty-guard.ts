import { dialogs } from './confirm';

/**
 * 给编辑弹窗（a-modal）提供“有未保存改动时，Esc / 点遮罩 / 关闭按钮
 * 需要二次确认”的能力。用法：
 *
 * ```ts
 * const dirtyGuard = useDirtyGuard(form);
 * function addItem() {
 *   resetForm();
 *   dirtyGuard.markClean();
 *   dialogOpen.value = true;
 * }
 * async function cancelDialog() {
 *   if (await dirtyGuard.confirmClose()) dialogOpen.value = false;
 * }
 * // <a-modal :open="dialogOpen" @cancel="cancelDialog" ...>
 * ```
 *
 * 打开弹窗（新增/编辑）时调用一次 `markClean()` 记录初始快照，
 * 之后弹窗关闭前都会用 `confirmClose()` 跟当前表单值比对。
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
    return dialogs.confirm({
      title: '放弃未保存的修改？',
      content: message,
      okText: '放弃修改',
      cancelText: '继续编辑',
      danger: true,
    });
  }

  function confirmClose(): Promise<boolean> {
    return confirmDiscard('关闭后本次输入的内容不会被保存。');
  }

  return { markClean, isDirty, confirmClose, confirmDiscard };
}
