import { ref } from 'vue';
import { message } from 'ant-design-vue';

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

const items = ref<ToastItem[]>([]);
let nextId = 1;

message.config({ duration: 3.2, maxCount: 3 });

function push(tone: ToastTone, content: string) {
  const id = nextId;
  nextId += 1;
  items.value = [...items.value, { id, tone, message: content }].slice(-3);
  if (tone === 'error') {
    message.error({ content, duration: 0 });
    return;
  }
  message[tone](content);
}

function dismiss(id: number) {
  items.value = items.value.filter((item) => item.id !== id);
}

export const toast = {
  success(content: string) {
    push('success', content);
  },
  error(content: string) {
    push('error', content);
  },
  warning(content: string) {
    push('warning', content);
  },
  info(content: string) {
    push('info', content);
  },
  clear() {
    items.value = [];
    message.destroy();
  },
};

export function useToastState() {
  return { items, dismiss };
}
