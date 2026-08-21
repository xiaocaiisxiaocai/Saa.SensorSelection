import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';

import ADatePicker from './ADatePicker.vue';

describe('ADatePicker', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('opens a Monday-first calendar and emits a date key', async () => {
    const wrapper = mount(ADatePicker, {
      attachTo: document.body,
      props: { modelValue: '2026-08-20', placeholder: '选择日期' },
    });

    await wrapper.get('button.a-date-picker__trigger').trigger('click');
    await nextTick();

    expect(document.body.textContent).toContain('一');
    expect(document.body.textContent).toContain('2026年8月');
    expect(document.body.textContent).not.toContain('上个月');

    const mutedDays = [
      ...document.querySelectorAll('.a-date-picker__day--muted'),
    ];
    expect(mutedDays.length).toBeGreaterThan(0);
    for (const cell of mutedDays) {
      expect(cell.textContent?.trim()).toBe('');
    }

    const day = [...document.querySelectorAll('.a-date-picker__day')].find(
      (node) =>
        node.textContent?.trim() === '21' &&
        !node.className.includes('a-date-picker__day--muted'),
    );
    day?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['2026-08-21']);
    wrapper.unmount();
  });

  it('moves the grid to the previous month from the header control', async () => {
    const wrapper = mount(ADatePicker, {
      attachTo: document.body,
      props: { modelValue: '2026-08-20', placeholder: '选择日期' },
    });

    await wrapper.get('button.a-date-picker__trigger').trigger('click');
    await nextTick();
    expect(document.body.textContent).toContain('2026年8月');

    document
      .querySelector<HTMLButtonElement>('[aria-label="上个月"]')
      ?.click();
    await nextTick();

    expect(document.body.textContent).toContain('2026年7月');
    expect(document.body.textContent).not.toContain('2026年8月');
    expect(document.body.textContent).not.toContain('上个月');
    wrapper.unmount();
  });

  it('fills a range from two clicks', async () => {
    const wrapper = mount(ADatePicker, {
      attachTo: document.body,
      props: {
        range: true,
        modelValue: [null, null],
        placeholder: ['开始时间', '结束时间'],
      },
    });

    await wrapper.get('button.a-date-picker__trigger').trigger('click');
    await nextTick();

    const days = [...document.querySelectorAll('.a-date-picker__day')].filter(
      (node) => !node.className.includes('a-date-picker__day--muted'),
    );
    days[9]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    days[11]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();

    const emitted = wrapper.emitted('update:modelValue')?.at(-1)?.[0] as [
      string,
      string,
    ];
    expect(emitted[0] < emitted[1]).toBe(true);
    wrapper.unmount();
  });
});
