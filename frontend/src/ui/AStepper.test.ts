import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import AStepper from './AStepper.vue';

describe('AStepper', () => {
  it('increments and decrements by step', async () => {
    const wrapper = mount(AStepper, {
      props: { modelValue: 2, min: 0, max: 10, step: 2 },
    });

    await wrapper.get('[aria-label="增加"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([4]);

    await wrapper.setProps({ modelValue: 4 });
    await wrapper.get('[aria-label="减少"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')?.[1]).toEqual([2]);
  });

  it('clamps typed values to min and max', async () => {
    const wrapper = mount(AStepper, {
      props: { modelValue: 1, min: 0, max: 5 },
    });

    await wrapper.get('input').setValue('99');
    await wrapper.get('input').trigger('blur');
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([5]);
  });
});
