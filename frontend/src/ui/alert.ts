import { Modal } from 'ant-design-vue';

export interface AlertRequest {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}

export const alert = {
  confirm(options: AlertRequest): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value: boolean) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      Modal.confirm({
        title: options.title,
        content: options.message,
        okText: options.confirmText ?? '确定',
        cancelText: options.cancelText ?? '取消',
        okType: options.destructive ? 'danger' : 'primary',
        onOk: () => finish(true),
        onCancel: () => finish(false),
      });
    });
  },
};
