import { ref } from 'vue';

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

const items = ref<ToastItem[]>([]);
let nextId = 1;
const timers = new Map<number, ReturnType<typeof setTimeout>>();

function dismiss(id: number) {
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }

  items.value = items.value.filter((item) => item.id !== id);
}

function push(tone: ToastTone, message: string) {
  const id = nextId;
  nextId += 1;
  const next = [...items.value, { id, tone, message }];
  const overflow = next.slice(0, -3);
  for (const item of overflow) {
    const timer = timers.get(item.id);
    if (timer) {
      clearTimeout(timer);
      timers.delete(item.id);
    }
  }
  items.value = next.slice(-3);

  // 错误需要用户读完并可以手动关闭，不再限时自动消失；
  // 其余提示保持短暂自动消失，但比原来的 2.4s 留出更从容的阅读时间。
  if (tone === 'error') {
    return;
  }
  const duration = 3200;
  timers.set(
    id,
    setTimeout(() => {
      dismiss(id);
    }, duration),
  );
}

export const toast = {
  success(message: string) {
    push('success', message);
  },
  error(message: string) {
    push('error', message);
  },
  warning(message: string) {
    push('warning', message);
  },
  info(message: string) {
    push('info', message);
  },
  clear() {
    for (const timer of timers.values()) {
      clearTimeout(timer);
    }

    timers.clear();
    items.value = [];
  },
};

export function useToastState() {
  return { items, dismiss };
}
