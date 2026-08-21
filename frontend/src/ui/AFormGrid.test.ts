import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import AFormGrid from './AFormGrid.vue';

describe('AFormGrid', () => {
  it('defaults to two columns and can render three', () => {
    const two = mount(AFormGrid, { slots: { default: '<div /><div />' } });
    expect(two.classes()).toContain('a-form-grid--2');

    const three = mount(AFormGrid, {
      props: { columns: 3 },
      slots: { default: '<div /><div /><div />' },
    });
    expect(three.classes()).toContain('a-form-grid--3');
  });
});
