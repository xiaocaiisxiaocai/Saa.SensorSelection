import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';

import ATooltip from './ATooltip.vue';

describe('ATooltip', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('keeps content closed until it is shown', () => {
    mount(ATooltip, {
      attachTo: document.body,
      props: { content: '保存' },
      slots: { trigger: '<button type="button">图标</button>' },
    });

    expect(document.body.textContent).not.toContain('保存');
  });

  it('renders caption content when open is controlled', async () => {
    const wrapper = mount(ATooltip, {
      attachTo: document.body,
      props: { content: '保存', open: true },
      slots: { trigger: '<button type="button">图标</button>' },
    });

    await nextTick();

    const tooltip = document.querySelector('.a-tooltip');
    expect(tooltip).not.toBeNull();
    expect(tooltip?.textContent).toContain('保存');
    expect(wrapper.get('button').attributes('aria-describedby')).toBeTruthy();

    wrapper.unmount();
  });

  it('prefers the default slot over the content prop', async () => {
    const wrapper = mount(ATooltip, {
      attachTo: document.body,
      props: { content: '保存', open: true },
      slots: {
        trigger: '<button type="button">图标</button>',
        default: '自定义说明',
      },
    });

    await nextTick();
    expect(document.querySelector('.a-tooltip')?.textContent).toContain(
      '自定义说明',
    );
    expect(document.querySelector('.a-tooltip')?.textContent).not.toContain(
      '保存',
    );

    wrapper.unmount();
  });
});
