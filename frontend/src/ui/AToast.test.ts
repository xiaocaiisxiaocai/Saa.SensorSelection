import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AToastHost from './AToastHost.vue';
import { toast, useToastState } from './toast';

const { messageMock } = vi.hoisted(() => ({
  messageMock: {
    config: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    destroy: vi.fn(),
  },
}));

vi.mock('ant-design-vue', async () => {
  const actual = await vi.importActual<typeof import('ant-design-vue')>(
    'ant-design-vue',
  );
  return {
    ...actual,
    message: messageMock,
  };
});

describe('AToast', () => {
  beforeEach(() => {
    toast.clear();
    messageMock.success.mockClear();
    messageMock.error.mockClear();
    messageMock.warning.mockClear();
    messageMock.info.mockClear();
    messageMock.destroy.mockClear();
  });

  afterEach(() => {
    toast.clear();
    document.body.innerHTML = '';
  });

  it('configures message duration and the visible cap', () => {
    expect(messageMock.config).toHaveBeenCalledWith({
      duration: 3.2,
      maxCount: 3,
    });
  });

  it.each(['success', 'warning', 'info'] as const)(
    'records a %s toast and forwards the text to message',
    (tone) => {
      toast[tone]('已完成');

      expect(useToastState().items.value).toEqual([
        expect.objectContaining({ tone, message: '已完成' }),
      ]);
      expect(messageMock[tone]).toHaveBeenCalledWith('已完成');
      expect(messageMock[tone].mock.calls[0]).toHaveLength(1);
    },
  );

  it('records an error and keeps the message open', () => {
    toast.error('写入失败');

    expect(useToastState().items.value).toEqual([
      expect.objectContaining({ tone: 'error', message: '写入失败' }),
    ]);
    expect(messageMock.error).toHaveBeenCalledWith({
      content: '写入失败',
      duration: 0,
    });
  });

  it('keeps at most three recorded toasts', () => {
    toast.info('一');
    toast.info('二');
    toast.info('三');
    toast.info('四');

    expect(useToastState().items.value.map((item) => item.message)).toEqual([
      '二',
      '三',
      '四',
    ]);
    expect(messageMock.info).toHaveBeenCalledTimes(4);
  });

  it('clears recorded toasts and destroys the message instance', () => {
    toast.success('保存成功');
    toast.error('写入失败');

    toast.clear();

    expect(useToastState().items.value).toEqual([]);
    expect(messageMock.destroy).toHaveBeenCalled();
  });

  it('announces polite and assertive toasts and dismisses one from the host', async () => {
    const host = mount(AToastHost, { attachTo: document.body });
    toast.success('保存成功');
    toast.error('写入失败');
    await nextTick();

    expect(document.querySelector('[aria-live="polite"]')?.textContent).toContain(
      '保存成功',
    );
    expect(
      document.querySelector('[aria-live="assertive"]')?.textContent,
    ).toContain('写入失败');
    expect(document.querySelector('[aria-live="polite"]')?.textContent).not.toContain(
      '写入失败',
    );

    const closeButtons = document.querySelectorAll<HTMLButtonElement>(
      '[aria-label="关闭提示"]',
    );
    expect(closeButtons).toHaveLength(2);
    closeButtons[0]?.click();
    await nextTick();

    expect(useToastState().items.value.map((item) => item.message)).toEqual([
      '写入失败',
    ]);
    expect(document.body.textContent).not.toContain('保存成功');
    expect(document.body.textContent).toContain('写入失败');

    host.unmount();
  });
});
