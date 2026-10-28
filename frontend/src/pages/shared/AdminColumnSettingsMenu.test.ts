import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import AdminColumnSettingsMenu from './AdminColumnSettingsMenu.vue';

describe('AdminColumnSettingsMenu', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('explains hidden columns and shows save progress', async () => {
    let resolveSave: (() => void) | undefined;
    const onSetVisible = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        }),
    );
    const wrapper = mount(AdminColumnSettingsMenu, {
      attachTo: document.body,
      props: {
        canManage: true,
        columns: [
          { key: 'a', label: '列A' },
          { key: 'b', label: '列B' },
        ],
        hidden: new Set(['b']),
        onSetVisible,
        onShowAll: vi.fn(async () => {}),
      },
    });

    const trigger = wrapper.get('[aria-label="管理员设置显示列"]');
    expect(trigger.text()).toContain('显示列');
    await trigger.trigger('mouseenter');
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain('已隐藏 1 列'),
    );

    await trigger.trigger('click');
    await vi.waitFor(() =>
      expect(
        document.body.querySelector('.ant-popover .ant-checkbox-wrapper'),
      ).not.toBeNull(),
    );
    expect(document.body.textContent).toContain('已显示 1 / 2 列');

    const hiddenCheckbox = [
      ...document.body.querySelectorAll('.ant-popover .ant-checkbox-wrapper'),
    ]
      .find((item) => item.textContent?.includes('列B'))
      ?.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(hiddenCheckbox).toBeDefined();
    hiddenCheckbox!.click();
    await flushPromises();
    expect(document.body.textContent).toContain('保存中');
    expect(onSetVisible).toHaveBeenCalledWith('b', true);

    resolveSave?.();
    await flushPromises();
    wrapper.unmount();
  });
});
