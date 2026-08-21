import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';

import { alert } from './alert';
import AAlertHost from './AAlertHost.vue';

describe('AAlert', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('resolves true when the confirm action is chosen', async () => {
    const host = mount(AAlertHost, { attachTo: document.body });
    const pending = alert.confirm({
      title: '删除客户',
      message: '此操作不可撤销。',
    });

    await nextTick();
    expect(document.body.textContent).toContain('删除客户');
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();

    const confirm = [...document.querySelectorAll('button')].find((node) =>
      node.textContent?.includes('确定'),
    );
    confirm?.click();
    await nextTick();

    await expect(pending).resolves.toBe(true);

    host.unmount();
  });

  it('resolves false when cancelled', async () => {
    const host = mount(AAlertHost, { attachTo: document.body });
    const pending = alert.confirm({
      title: '删除客户',
      message: '此操作不可撤销。',
      cancelText: '返回',
    });

    await nextTick();
    const cancel = [...document.querySelectorAll('button')].find((node) =>
      node.textContent?.includes('返回'),
    );
    cancel?.click();
    await nextTick();

    await expect(pending).resolves.toBe(false);

    host.unmount();
  });

  it('uses a destructive confirm button when requested', async () => {
    const host = mount(AAlertHost, { attachTo: document.body });
    const pending = alert.confirm({
      title: '删除',
      message: '确定删除？',
      destructive: true,
    });

    await nextTick();
    const confirm = [...document.querySelectorAll('button')].find((node) =>
      node.textContent?.includes('确定'),
    );
    expect(confirm?.className).toContain('a-button--destructive');
    confirm?.click();
    await pending;
    host.unmount();
  });
});
