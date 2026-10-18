import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import AHighlightText from './AHighlightText.vue';

describe('AHighlightText', () => {
  it('highlights every case-insensitive match without changing the text', () => {
    const wrapper = mount(AHighlightText, {
      props: { query: 'sensor', text: 'Sensor / SENSOR 型号' },
    });

    expect(wrapper.element.textContent).toBe('Sensor / SENSOR 型号');
    expect(wrapper.findAll('mark').map((item) => item.text())).toEqual([
      'Sensor',
      'SENSOR',
    ]);
  });

  it('renders plain text when the query is empty', () => {
    const wrapper = mount(AHighlightText, {
      props: { query: '', text: '输送机构' },
    });

    expect(wrapper.text()).toBe('输送机构');
    expect(wrapper.find('mark').exists()).toBe(false);
  });

  it('treats Chinese and punctuation as literal text without creating HTML', () => {
    const source = '<img src=x onerror=alert(1)> 型号 E2E-X5MF1 / E2E-X5MF1';
    const wrapper = mount(AHighlightText, {
      props: { text: source, query: 'E2E-X5MF1' },
    });
    expect(wrapper.element.textContent).toBe(source);
    expect(wrapper.findAll('mark').map((part) => part.text())).toEqual([
      'E2E-X5MF1',
      'E2E-X5MF1',
    ]);
    expect(wrapper.find('img').exists()).toBe(false);
    const literal = mount(AHighlightText, {
      props: { text: '检知 [.*] / 检知', query: '[.*]' },
    });
    expect(literal.findAll('mark').map((part) => part.text())).toEqual([
      '[.*]',
    ]);
    wrapper.unmount();
    literal.unmount();
  });

  it('highlights split brand and model words and updates when the query clears', async () => {
    const wrapper = mount(AHighlightText, {
      props: { text: 'OMRON / E2E-X5MF1', query: 'omron e2e' },
    });
    expect(wrapper.findAll('mark').map((part) => part.text())).toEqual([
      'OMRON',
      'E2E',
    ]);
    await wrapper.setProps({ text: '入口检知，出口检知', query: '检知' });
    expect(wrapper.findAll('mark').map((part) => part.text())).toEqual([
      '检知',
      '检知',
    ]);
    await wrapper.setProps({ query: '   ' });
    expect(wrapper.find('mark').exists()).toBe(false);
    expect(wrapper.text()).toBe('入口检知，出口检知');
    wrapper.unmount();
  });
});
