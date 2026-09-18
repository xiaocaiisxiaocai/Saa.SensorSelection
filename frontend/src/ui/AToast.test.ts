import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { toast } from './toast';
import AToastHost from './AToastHost.vue';

describe('AToast', () => {
  afterEach(() => {
    toast.clear();
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('announces a success message politely', async () => {
    const host = mount(AToastHost, { attachTo: document.body });
    toast.success('保存成功');
    await nextTick();

    const live = document.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
    expect(live?.textContent).toContain('保存成功');

    host.unmount();
  });

  it('announces errors assertively', async () => {
    const host = mount(AToastHost, { attachTo: document.body });
    toast.error('写入失败');
    await nextTick();

    expect(document.querySelector('[aria-live="assertive"]')?.textContent).toContain(
      '写入失败',
    );

    host.unmount();
  });

  it('keeps at most three toasts', async () => {
    const host = mount(AToastHost, { attachTo: document.body });
    toast.info('一');
    toast.info('二');
    toast.info('三');
    toast.info('四');
    await nextTick();

    const text = document.body.textContent ?? '';
    expect(text).not.toContain('一');
    expect(text).toContain('二');
    expect(text).toContain('四');

    host.unmount();
  });

  it('dismisses a success toast after 3.2 seconds', async () => {
    vi.useFakeTimers();
    const host = mount(AToastHost, { attachTo: document.body });
    toast.success('已保存');
    await nextTick();
    expect(document.body.textContent).toContain('已保存');

    await vi.advanceTimersByTimeAsync(3200);
    await nextTick();
    expect(document.body.textContent).not.toContain('已保存');

    host.unmount();
  });

  it('keeps an error toast visible until the user dismisses it', async () => {
    vi.useFakeTimers();
    const host = mount(AToastHost, { attachTo: document.body });
    toast.error('写入失败');
    await nextTick();
    expect(document.body.textContent).toContain('写入失败');

    // 错误不设自动消失时限，给足够长的时间也应该还在。
    await vi.advanceTimersByTimeAsync(60_000);
    await nextTick();
    expect(document.body.textContent).toContain('写入失败');

    const closeButton = document.querySelector<HTMLButtonElement>(
      '[aria-label="关闭提示"]',
    );
    expect(closeButton).not.toBeNull();
    closeButton?.click();
    await nextTick();
    expect(document.body.textContent).not.toContain('写入失败');

    host.unmount();
  });
});
