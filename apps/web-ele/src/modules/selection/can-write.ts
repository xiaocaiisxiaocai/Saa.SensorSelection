import type { Directive, DirectiveBinding } from 'vue';
import { watchEffect } from 'vue';

import { useAccessStore } from '@vben/stores';

/**
 * v-can-write 指令：当当前用户缺少指定权限码时隐藏元素（display:none）。
 *
 * 与 @vben/access 的 v-access 不同：v-access 只在 mounted 时判断一次并 remove() 元素，
 * 登录/登出/权限变化后不会恢复。这里用 watchEffect 订阅 access store 的 accessCodes，
 * 权限码变化时自动重新显示/隐藏（如登录后按钮出现、登出后按钮消失）。
 */
function matches(codes: string[], value: unknown): boolean {
  if (value === undefined || value === null || value === '') return false;
  const values = Array.isArray(value) ? value : [value];
  return values.some((code) => codes.includes(String(code)));
}

function attach(el: HTMLElement, binding: DirectiveBinding) {
  return watchEffect(() => {
    const ok = matches(useAccessStore().accessCodes, binding.value);
    // 用内联样式控制显隐：display='' 恢复元素原有样式，避免 remove() 后无法恢复
    el.style.display = ok ? '' : 'none';
  });
}

export function registerCanAccessDirective(app: {
  directive: (name: string, directive: Directive) => unknown;
}): void {
  const stateKey = '__canAccessState';
  const directive: Directive = {
    mounted(el: HTMLElement, binding: DirectiveBinding) {
      const state = { stop: null as (() => void) | null };
      (el as HTMLElement & Record<string, unknown>)[stateKey] = state;
      state.stop = attach(el, binding);
    },
    updated(el: HTMLElement, binding: DirectiveBinding) {
      const state = (el as HTMLElement & Record<string, unknown>)[stateKey] as
        | { stop: (() => void) | null }
        | undefined;
      state?.stop?.();
      const next = { stop: null as (() => void) | null };
      (el as HTMLElement & Record<string, unknown>)[stateKey] = next;
      next.stop = attach(el, binding);
    },
    unmounted(el: HTMLElement) {
      const state = (el as HTMLElement & Record<string, unknown>)[stateKey] as
        | { stop: (() => void) | null }
        | undefined;
      state?.stop?.();
    },
  };
  app.directive('can-write', directive);
}
