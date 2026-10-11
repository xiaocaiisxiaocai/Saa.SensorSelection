import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';

import ATooltip from './ATooltip.vue';

function antTooltip(wrapper: ReturnType<typeof mount>) {
  const match = wrapper
    .findAllComponents({ name: 'ATooltip' })
    .find((item) => item.props('placement') != null);
  if (!match) throw new Error('ant tooltip not found');
  return match;
}

describe('ATooltip', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('keeps the title closed until open', async () => {
    const wrapper = mount(ATooltip, {
      attachTo: document.body,
      props: { content: '保存', side: 'right' },
      slots: { trigger: '<button type="button">图标</button>' },
    });
    await nextTick();

    expect(wrapper.get('button').text()).toBe('图标');
    expect(antTooltip(wrapper).props('title')).toBe('保存');
    expect(antTooltip(wrapper).props('placement')).toBe('right');
    expect(document.querySelector('.ant-tooltip-inner')).toBeNull();

    wrapper.unmount();
  });

  it('renders the content when open is controlled', async () => {
    const wrapper = mount(ATooltip, {
      attachTo: document.body,
      props: { content: '保存', open: true, side: 'bottom' },
      slots: { trigger: '<button type="button">图标</button>' },
    });
    await nextTick();

    expect(antTooltip(wrapper).props('open')).toBe(true);
    expect(antTooltip(wrapper).props('placement')).toBe('bottom');
    expect(document.querySelector('.ant-tooltip-inner')?.textContent).toContain(
      '保存',
    );

    wrapper.unmount();
  });

  it('prefers the trigger slot and uses the default slot as the trigger', async () => {
    const named = mount(ATooltip, {
      props: { content: '保存' },
      slots: {
        trigger: '<button type="button">触发</button>',
        default: '<span>不应该出现</span>',
      },
    });
    expect(named.text()).toContain('触发');
    expect(named.text()).not.toContain('不应该出现');
    named.unmount();

    const fallback = mount(ATooltip, {
      attachTo: document.body,
      props: { content: '保存', open: true },
      slots: { default: '<button type="button">默认触发</button>' },
    });
    await nextTick();

    expect(fallback.get('button').text()).toBe('默认触发');
    expect(antTooltip(fallback).props('title')).toBe('保存');
    expect(document.querySelector('.ant-tooltip-inner')?.textContent).toContain(
      '保存',
    );

    fallback.unmount();
  });

  it('does not show a title when disabled', async () => {
    const wrapper = mount(ATooltip, {
      attachTo: document.body,
      props: { content: '保存', disabled: true, open: true },
      slots: { trigger: '<button type="button">图标</button>' },
    });
    await nextTick();

    expect(antTooltip(wrapper).props('title')).toBeUndefined();
    expect(document.querySelector('.ant-tooltip-inner')?.textContent ?? '').not.toContain(
      '保存',
    );
    expect(wrapper.get('button').text()).toBe('图标');

    wrapper.unmount();
  });
});
