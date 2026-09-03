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
});
