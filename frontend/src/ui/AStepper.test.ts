import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import AStepper from './AStepper.vue';

describe('AStepper', () => {
  it('increments and decrements by step and stops at max', async () => {
    const wrapper = mount(AStepper, {
      props: { modelValue: 2, min: 0, max: 10, step: 2 },
    });

    const up = wrapper.get('[aria-label="Increase Value"]');
    await up.trigger('mousedown');
    await up.trigger('mouseup');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([4]);

    await wrapper.setProps({ modelValue: 4 });
    const down = wrapper.get('[aria-label="Decrease Value"]');
    await down.trigger('mousedown');
    await down.trigger('mouseup');
    expect(wrapper.emitted('update:modelValue')?.[1]).toEqual([2]);

    await wrapper.setProps({ modelValue: 10 });
    await up.trigger('mousedown');
    await up.trigger('mouseup');
    expect(wrapper.emitted('update:modelValue')).toHaveLength(2);
  });

  it('clamps typed values to min and max on blur', async () => {
    const wrapper = mount(AStepper, {
      props: { modelValue: 1, min: 0, max: 5 },
    });
    const input = wrapper.get('input');

    await input.setValue('99');
    await input.trigger('blur');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([5]);

    await wrapper.setProps({ modelValue: 1 });
    await input.setValue('-3');
    await input.trigger('blur');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([0]);
  });

  it('does not change the value when disabled', async () => {
    const wrapper = mount(AStepper, {
      props: { modelValue: 2, disabled: true },
    });

    expect(wrapper.get('input').attributes('disabled')).toBeDefined();
    const up = wrapper.get('[aria-label="Increase Value"]');
    await up.trigger('mousedown');
    await up.trigger('mouseup');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });
});
