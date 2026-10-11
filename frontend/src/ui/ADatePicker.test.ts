import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import ADatePicker from './ADatePicker.vue';

const dateKey = /^\d{4}-\d{2}-\d{2}$/;

function inViewDays(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('td.ant-picker-cell-in-view')];
}

describe('ADatePicker', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('shows a YYYY-MM-DD value and commits a picked day as that string', async () => {
    const wrapper = mount(ADatePicker, {
      attachTo: document.body,
      props: { id: 'ship-date', modelValue: '2026-08-20', placeholder: '选择日期' },
    });
    const input = wrapper.get<HTMLInputElement>('input');

    expect(wrapper.findComponent({ name: 'ADatePicker' }).props('valueFormat')).toBe(
      'YYYY-MM-DD',
    );
    expect(wrapper.get('.a-date-picker').classes()).toContain('a-date-picker');
    expect(input.attributes('id')).toBe('ship-date');
    expect(input.attributes('placeholder')).toBe('选择日期');
    expect(input.element.value).toBe('2026-08-20');

    await wrapper.get('.a-date-picker').trigger('mouseup');
    await flushPromises();

    const day = document.querySelector<HTMLElement>('td[title="2026-08-21"]');
    expect(day).not.toBeNull();
    day?.click();
    await flushPromises();

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['2026-08-21']);
    wrapper.unmount();
  });

  it('clears a single value back to null and can hide the clear control', async () => {
    const wrapper = mount(ADatePicker, {
      attachTo: document.body,
      props: { modelValue: '2026-08-20' },
    });

    await wrapper.get('.ant-picker-clear').trigger('mouseup');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([null]);

    const locked = mount(ADatePicker, {
      props: { modelValue: '2026-08-20', clearable: false },
    });
    expect(locked.find('.ant-picker-clear').exists()).toBe(false);
    wrapper.unmount();
  });

  it('uses a range picker whose value format is YYYY-MM-DD', async () => {
    const wrapper = mount(ADatePicker, {
      attachTo: document.body,
      props: {
        range: true,
        modelValue: [null, null],
        placeholder: ['开始时间', '结束时间'],
      },
    });
    const inputs = wrapper.findAll('input');

    expect(wrapper.findComponent({ name: 'ARangePicker' }).props('valueFormat')).toBe(
      'YYYY-MM-DD',
    );
    expect(wrapper.find('.a-date-picker').exists()).toBe(true);
    expect(inputs).toHaveLength(2);
    expect(inputs[0]?.attributes('placeholder')).toBe('开始时间');
    expect(inputs[1]?.attributes('placeholder')).toBe('结束时间');

    await wrapper.get('input').trigger('mousedown');
    await flushPromises();

    const first = inViewDays()[9];
    expect(first).toBeTruthy();
    first?.click();
    await flushPromises();
    const second = inViewDays()[11];
    expect(second).toBeTruthy();
    second?.click();
    await flushPromises();

    const emitted = wrapper.emitted('update:modelValue')?.at(-1)?.[0] as [
      string,
      string,
    ];
    expect(emitted?.[0]).toMatch(dateKey);
    expect(emitted?.[1]).toMatch(dateKey);
    expect(emitted[0] < emitted[1]).toBe(true);
    wrapper.unmount();
  });

  it('uses the default placeholders and reports invalid or disabled state', () => {
    const single = mount(ADatePicker, { props: { modelValue: null } });
    expect(single.get('input').attributes('placeholder')).toBe('选择日期');

    const range = mount(ADatePicker, {
      props: { range: true, modelValue: null },
    });
    const inputs = range.findAll('input');
    expect(inputs[0]?.attributes('placeholder')).toBe('开始日期');
    expect(inputs[1]?.attributes('placeholder')).toBe('结束日期');

    const invalid = mount(ADatePicker, {
      props: { modelValue: '2026-08-20', invalid: true, disabled: true },
    });
    expect(invalid.get('.a-date-picker').classes()).toContain(
      'ant-picker-status-error',
    );
    expect(invalid.get('input').attributes('disabled')).toBeDefined();
  });
});
