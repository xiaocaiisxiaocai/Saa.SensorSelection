import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import ASegmentedControl from './ASegmentedControl.vue';

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'ASegmentedControl.vue'),
  'utf8',
);

const segments = [
  { label: '要求', value: 'req' },
  { label: '制程', value: 'proc', badge: 3 },
  { label: '文档', value: 'docs' },
];

describe('ASegmentedControl', () => {
  it('exposes tablist semantics and the selected tab', () => {
    const wrapper = mount(ASegmentedControl, {
      props: { modelValue: 'proc', segments },
    });

    expect(wrapper.get('[role="tablist"]').attributes('role')).toBe('tablist');
    const tabs = wrapper.findAll('[role="tab"]');
    expect(tabs).toHaveLength(3);
    expect(tabs[1]?.attributes('aria-selected')).toBe('true');
    expect(tabs[1]?.text()).toContain('3');
  });

  it('emits the clicked segment', async () => {
    const wrapper = mount(ASegmentedControl, {
      props: { modelValue: 'req', segments },
    });

    await wrapper.findAll('[role="tab"]')[2]?.trigger('click');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['docs']);
  });

  it('moves the selection with arrow keys', async () => {
    const wrapper = mount(ASegmentedControl, {
      props: { modelValue: 'req', segments },
    });

    await wrapper.get('[role="tablist"]').trigger('keydown', { key: 'ArrowRight' });
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['proc']);
  });

  it('keeps long tab sets horizontally scrollable instead of clipping them', () => {
    expect(source).toMatch(/\.a-segmented\s*\{[^}]*overflow:\s*auto hidden;/s);
  });
});
