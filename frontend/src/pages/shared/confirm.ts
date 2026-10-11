import { Modal } from 'ant-design-vue';

export interface ConfirmRequest {
  title: string;
  content: string;
  okText?: string;
  cancelText?: string;
  danger?: boolean;
}

/**
 * `Modal.confirm` 的 Promise 版本：确定 → true，取消 / Esc / 关闭 → false。
 * 包成对象方法是为了测试里能 `vi.spyOn(dialogs, 'confirm')`。
 */
export const dialogs = {
  confirm(options: ConfirmRequest): Promise<boolean> {
    return new Promise((resolve) => {
      Modal.confirm({
        title: options.title,
        content: options.content,
        okText: options.okText ?? '确定',
        cancelText: options.cancelText ?? '取消',
        okType: options.danger ? 'danger' : 'primary',
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });
  },
};
