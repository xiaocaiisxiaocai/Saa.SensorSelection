import { ref } from 'vue';

export interface AlertRequest {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}

export interface AlertState extends AlertRequest {
  confirmText: string;
  cancelText: string;
}

const request = ref<AlertState | null>(null);
let settle: ((value: boolean) => void) | null = null;

function finish(value: boolean) {
  const resolve = settle;
  settle = null;
  request.value = null;
  resolve?.(value);
}

export const alert = {
  confirm(options: AlertRequest): Promise<boolean> {
    finish(false);

    return new Promise((resolve) => {
      settle = resolve;
      request.value = {
        ...options,
        confirmText: options.confirmText ?? '确定',
        cancelText: options.cancelText ?? '取消',
      };
    });
  },
};

export function useAlertState() {
  return { request, finish };
}
