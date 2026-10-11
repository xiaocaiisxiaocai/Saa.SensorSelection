import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import ABadge from './ABadge.vue';
import type { BadgeTone } from './types';

const toneClass: Record<BadgeTone, string> = {
  neutral: 'ant-tag-default',
  blue: 'ant-tag-blue',
  green: 'ant-tag-green',
  orange: 'ant-tag-orange',
  red: 'ant-tag-red',
  yellow: 'ant-tag-gold',
  indigo: 'ant-tag-purple',
};

describe('ABadge', () => {
  it('renders the label in a neutral tag', () => {
    const wrapper = mount(ABadge, { props: { label: '现用' } });

    expect(wrapper.text()).toBe('现用');
    expect(wrapper.classes()).toContain('a-badge');
    expect(wrapper.classes()).toContain('a-badge--neutral');
    expect(wrapper.classes()).toContain('ant-tag-default');
  });

  it('maps semantic tones onto ant tag colors', () => {
    (Object.entries(toneClass) as Array<[BadgeTone, string]>).forEach(
      ([tone, colorClass]) => {
        const wrapper = mount(ABadge, { props: { label: tone, tone } });

        expect(wrapper.classes()).toContain(`a-badge--${tone}`);
        expect(wrapper.classes()).toContain(colorClass);
      },
    );
  });
});
