import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';

import AMenu from './AMenu.vue';
import type { MenuEntry } from './types';

const items: MenuEntry[] = [
  { id: 'profile', label: '账户' },
  { id: 'theme', label: '外观', shortcut: '⌘T' },
  { type: 'separator' },
  { id: 'sign-out', label: '退出', destructive: true },
];

describe('AMenu', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('opens from the trigger and lists items', async () => {
    const wrapper = mount(AMenu, {
      attachTo: document.body,
      props: { items },
      slots: { trigger: '<button type="button">用户</button>' },
    });

    expect(document.body.textContent).not.toContain('账户');

    await wrapper.get('button').trigger('click');
    await nextTick();

    expect(document.querySelector('.a-menu')).not.toBeNull();
    expect(document.body.textContent).toContain('账户');
    expect(document.body.textContent).toContain('⌘T');
    expect(document.querySelector('.a-menu-separator')).not.toBeNull();

    wrapper.unmount();
  });

  it('emits the item id and closes after a selection', async () => {
    const wrapper = mount(AMenu, {
      attachTo: document.body,
      props: { items },
      slots: { trigger: '<button type="button">用户</button>' },
    });

    await wrapper.get('button').trigger('click');
    await nextTick();

    const option = [...document.querySelectorAll('[role="menuitem"]')].find(
      (node) => node.textContent?.includes('账户'),
    );
    expect(option).toBeTruthy();
    option?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    await nextTick();

    expect(wrapper.emitted('select')?.[0]).toEqual(['profile']);
    expect(document.querySelector('.a-menu[data-state="open"]')).toBeNull();

    wrapper.unmount();
  });

  it('does not emit when the item is disabled', async () => {
    const wrapper = mount(AMenu, {
      attachTo: document.body,
      props: {
        items: [{ id: 'locked', label: '锁定', disabled: true }],
      },
      slots: { trigger: '<button type="button">用户</button>' },
    });

    await wrapper.get('button').trigger('click');
    await nextTick();

    const option = document.querySelector('[role="menuitem"]');
    option?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();

    expect(wrapper.emitted('select')).toBeUndefined();

    wrapper.unmount();
  });
});
