import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';

import ASheet from './ASheet.vue';

describe('ASheet', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('is a labelled modal dialog when open', async () => {
    const wrapper = mount(ASheet, {
      attachTo: document.body,
      props: { open: true, title: '编辑客户' },
      slots: { default: '<p>表单内容</p>' },
    });

    await nextTick();

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.getAttribute('aria-labelledby')).toBeTruthy();
    expect(document.body.textContent).toContain('编辑客户');
    expect(document.body.textContent).toContain('表单内容');

    wrapper.unmount();
  });

  it('does not show the close tooltip or focus the close button on open', async () => {
    const wrapper = mount(ASheet, {
      attachTo: document.body,
      props: { open: true, title: '新增反馈' },
      slots: { default: '<input id="first-field" />' },
    });

    await nextTick();
    await nextTick();

    expect(document.activeElement?.id).toBe('first-field');
    expect(document.querySelector('.a-tooltip')).toBeNull();

    wrapper.unmount();
  });

  it('emits close from the header button', async () => {
    const wrapper = mount(ASheet, {
      attachTo: document.body,
      props: { open: true, title: '编辑客户' },
    });

    await nextTick();
    document.querySelector<HTMLButtonElement>('[aria-label="关闭"]')?.click();
    await nextTick();

    expect(wrapper.emitted('update:open')?.[0]).toEqual([false]);

    wrapper.unmount();
  });

  it('does not close from the overlay when closeOnOverlay is false', async () => {
    const wrapper = mount(ASheet, {
      attachTo: document.body,
      props: { open: true, title: '编辑客户', closeOnOverlay: false },
    });

    await nextTick();
    document.querySelector('.a-sheet__overlay')?.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true }),
    );
    await nextTick();

    expect(wrapper.emitted('update:open')).toBeUndefined();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();

    wrapper.unmount();
  });

  it('supports a viewport-sized layout for document previews', async () => {
    const wrapper = mount(ASheet, {
      attachTo: document.body,
      props: { open: true, title: '预览 PDF', viewport: true },
      slots: { default: '<div class="preview-content">PDF</div>' },
    });

    await nextTick();

    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog?.classList.contains('a-sheet--viewport')).toBe(true);

    wrapper.unmount();
  });
});
