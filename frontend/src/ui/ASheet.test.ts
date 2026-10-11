import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';

import ASheet from './ASheet.vue';

async function flush() {
  await nextTick();
  await Promise.resolve();
  await nextTick();
}

describe('ASheet', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders an open modal with its title and body', async () => {
    const wrapper = mount(ASheet, {
      attachTo: document.body,
      props: { open: true, title: '编辑客户' },
      slots: { default: '<p>表单内容</p>' },
    });
    await flush();

    const dialog = document.querySelector('[role="dialog"]');
    const labelledBy = dialog?.getAttribute('aria-labelledby');
    expect(dialog).not.toBeNull();
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy ?? '')?.textContent).toContain('编辑客户');
    expect(document.body.textContent).toContain('表单内容');
    expect(document.querySelector('.ant-modal')?.classList.contains('a-sheet')).toBe(
      true,
    );
    expect(document.querySelector<HTMLElement>('.ant-modal')?.style.width).toBe(
      '560px',
    );
    expect(wrapper.getComponent({ name: 'AModal' }).props('destroyOnClose')).toBe(
      true,
    );

    wrapper.unmount();
  });

  it('does not render dialog content while closed', () => {
    const wrapper = mount(ASheet, {
      attachTo: document.body,
      props: { open: false, title: '隐藏' },
      slots: { default: '<p>表单内容</p>' },
    });

    expect(document.querySelector('.ant-modal-body')).toBeNull();
    expect(document.body.textContent).not.toContain('表单内容');
    expect(wrapper.getComponent({ name: 'AModal' }).props('destroyOnClose')).toBe(
      true,
    );

    wrapper.unmount();
  });

  it('renders the footer slot and omits the default footer without one', async () => {
    const withFooter = mount(ASheet, {
      attachTo: document.body,
      props: { open: true, title: '编辑客户' },
      slots: { footer: '<button type="button">保存</button>' },
    });
    await flush();

    expect(document.querySelector('.ant-modal-footer')?.textContent).toContain('保存');
    expect(document.body.textContent).not.toContain('OK');
    withFooter.unmount();

    const withoutFooter = mount(ASheet, {
      attachTo: document.body,
      props: { open: true, title: '编辑客户' },
    });
    await flush();
    expect(document.querySelector('.ant-modal-footer')).toBeNull();
    withoutFooter.unmount();
  });

  it('closes from the header button by clearing open', async () => {
    const wrapper = mount(ASheet, {
      attachTo: document.body,
      props: { open: true, title: '编辑客户' },
    });
    await flush();

    document.querySelector<HTMLButtonElement>('.ant-modal-close')?.click();
    await flush();

    expect(wrapper.emitted('update:open')?.[0]).toEqual([false]);
    expect(wrapper.getComponent({ name: 'AModal' }).props('open')).toBe(false);

    wrapper.unmount();
  });

  it('does not close from the overlay when closeOnOverlay is false', async () => {
    const wrapper = mount(ASheet, {
      attachTo: document.body,
      props: { open: true, title: '编辑客户', closeOnOverlay: false },
    });
    await flush();

    expect(wrapper.getComponent({ name: 'AModal' }).props('maskClosable')).toBe(
      false,
    );
    document.querySelector('.ant-modal-wrap')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    await flush();

    expect(wrapper.emitted('update:open')).toBeUndefined();
    expect(document.querySelector('.ant-modal-body')).not.toBeNull();

    wrapper.unmount();
  });

  it('closes from the overlay when closeOnOverlay is true', async () => {
    const wrapper = mount(ASheet, {
      attachTo: document.body,
      props: { open: true, title: '编辑客户', closeOnOverlay: true },
    });
    await flush();

    expect(wrapper.getComponent({ name: 'AModal' }).props('maskClosable')).toBe(
      true,
    );
    document.querySelector('.ant-modal-wrap')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true }),
    );
    await flush();

    expect(wrapper.emitted('update:open')?.[0]).toEqual([false]);

    wrapper.unmount();
  });

  it('asks confirmClose before closing and respects a refusal', async () => {
    let allow = false;
    const wrapper = mount(ASheet, {
      attachTo: document.body,
      props: { open: true, title: '编辑客户', confirmClose: () => allow },
    });
    await flush();

    document.querySelector<HTMLButtonElement>('.ant-modal-close')?.click();
    await flush();
    expect(wrapper.emitted('update:open')).toBeUndefined();
    expect(wrapper.getComponent({ name: 'AModal' }).props('open')).toBe(true);

    allow = true;
    document.querySelector<HTMLButtonElement>('.ant-modal-close')?.click();
    await flush();
    expect(wrapper.emitted('update:open')?.[0]).toEqual([false]);

    wrapper.unmount();
  });

  it('waits for an async confirmClose before closing', async () => {
    let resolveDecision: (value: boolean) => void = () => {};
    const wrapper = mount(ASheet, {
      attachTo: document.body,
      props: {
        open: true,
        title: '编辑客户',
        confirmClose: () =>
          new Promise<boolean>((resolve) => {
            resolveDecision = resolve;
          }),
      },
    });
    await flush();

    document.querySelector<HTMLButtonElement>('.ant-modal-close')?.click();
    await flush();
    expect(wrapper.emitted('update:open')).toBeUndefined();

    resolveDecision(false);
    await flush();
    expect(wrapper.emitted('update:open')).toBeUndefined();

    document.querySelector<HTMLButtonElement>('.ant-modal-close')?.click();
    await flush();
    resolveDecision(true);
    await flush();
    expect(wrapper.emitted('update:open')?.[0]).toEqual([false]);

    wrapper.unmount();
  });

  it('uses a viewport width and an explicit width when requested', async () => {
    const viewport = mount(ASheet, {
      attachTo: document.body,
      props: { open: true, title: '预览 PDF', viewport: true },
    });
    await flush();
    expect(document.querySelector<HTMLElement>('.ant-modal')?.style.width).toBe(
      'calc(100vw - 48px)',
    );
    viewport.unmount();

    const sized = mount(ASheet, {
      attachTo: document.body,
      props: { open: true, title: '编辑客户', width: 720 },
    });
    await flush();
    expect(document.querySelector<HTMLElement>('.ant-modal')?.style.width).toBe(
      '720px',
    );
    sized.unmount();

    const fluid = mount(ASheet, {
      attachTo: document.body,
      props: { open: true, title: '编辑客户', width: '40rem' },
    });
    await flush();
    expect(document.querySelector<HTMLElement>('.ant-modal')?.style.width).toBe(
      '40rem',
    );
    fluid.unmount();
  });
});
