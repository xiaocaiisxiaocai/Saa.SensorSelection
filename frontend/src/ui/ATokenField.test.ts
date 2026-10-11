import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import AFormRow from './AFormRow.vue';
import ATokenField from './ATokenField.vue';
import type { SelectOption } from './types';

const options: SelectOption[] = [
  { label: '漫反射 · OMRON E3Z-D61', value: 'e3z' },
  { label: '对射 · KEYENCE PZ-G51N', value: 'pzg' },
  { label: '光纤 · SUNX FX-501', value: 'fx' },
  { label: '停用 · 旧型号', value: 'old', disabled: true },
];

function visibleOptions(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('.ant-select-item-option')];
}

async function openField(wrapper: ReturnType<typeof mount>) {
  await wrapper.get('.ant-select-selector').trigger('mousedown');
  await flushPromises();
}

describe('ATokenField', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders selected values as removable tokens in multiple mode', async () => {
    const wrapper = mount(ATokenField, {
      props: {
        options,
        modelValue: ['e3z', 'pzg'],
        maxVisibleTokens: 5,
      },
    });

    expect(wrapper.get('.a-token-field').classes()).toContain('ant-select-multiple');
    expect(wrapper.text()).toContain('漫反射 · OMRON E3Z-D61');
    expect(wrapper.text()).toContain('对射 · KEYENCE PZ-G51N');
    expect(wrapper.findAll('.ant-select-selection-item-remove')).toHaveLength(2);

    await wrapper.get('.ant-select-selection-item-remove').trigger('click');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([['pzg']]);
  });

  it('names a standalone field from ariaLabel or the placeholder', () => {
    const named = mount(ATokenField, {
      props: {
        ariaLabel: '传感器类型筛选',
        options,
        placeholder: '传感器类型',
      },
    });
    expect(named.get('.a-token-field').attributes('aria-label')).toBe(
      '传感器类型筛选',
    );

    const fallback = mount(ATokenField, {
      props: { options, placeholder: '传感器类型' },
    });
    expect(fallback.get('.a-token-field').attributes('aria-label')).toBe(
      '传感器类型',
    );
  });

  it('uses the visible form label as the accessible name inside a form row', () => {
    const wrapper = mount({
      components: { AFormRow, ATokenField },
      data: () => ({ options }),
      template:
        '<AFormRow label="板件特性"><ATokenField :options="options" placeholder="选择板件特性" /></AFormRow>',
    });
    const combobox = wrapper.get('[role="combobox"]');

    expect(wrapper.get('.a-token-field').attributes('aria-label')).toBeUndefined();
    expect(wrapper.get('label').attributes('for')).toBe(combobox.attributes('id'));
  });

  it('collapses extra tokens behind a count when maxVisibleTokens is set', () => {
    const wrapper = mount(ATokenField, {
      props: {
        options,
        modelValue: ['e3z', 'pzg', 'fx'],
        maxVisibleTokens: 2,
      },
    });
    const contents = wrapper
      .findAll('.ant-select-selection-item-content')
      .map((node) => node.text());

    expect(wrapper.text()).toContain('+ 1 ...');
    expect(contents.some((text) => text.includes('OMRON'))).toBe(true);
    expect(contents.some((text) => text.includes('KEYENCE'))).toBe(true);
    expect(contents.some((text) => text.includes('SUNX'))).toBe(false);
  });

  it('adds an enabled option and ignores a disabled one', async () => {
    const wrapper = mount(ATokenField, {
      attachTo: document.body,
      props: {
        options,
        modelValue: ['e3z'],
        maxVisibleTokens: 5,
      },
    });

    await openField(wrapper);
    visibleOptions()
      .find((node) => node.textContent?.includes('KEYENCE'))
      ?.click();
    await flushPromises();
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([['e3z', 'pzg']]);

    visibleOptions()
      .find((node) => node.textContent?.includes('停用'))
      ?.click();
    await flushPromises();
    expect(wrapper.emitted('update:modelValue')).toHaveLength(1);
    wrapper.unmount();
  });

  it('filters options from the search input', async () => {
    const wrapper = mount(ATokenField, {
      attachTo: document.body,
      props: { options, modelValue: [], filterable: true },
    });

    await openField(wrapper);
    await wrapper.get('input[role="combobox"]').setValue('sunx');
    await flushPromises();

    const labels = visibleOptions().map((node) => node.textContent ?? '');
    expect(labels.some((text) => text.includes('SUNX'))).toBe(true);
    expect(labels.some((text) => text.includes('OMRON'))).toBe(false);
    wrapper.unmount();
  });

  it('stays closed while disabled', async () => {
    const wrapper = mount(ATokenField, {
      attachTo: document.body,
      props: { options, modelValue: ['e3z'], disabled: true },
    });

    expect(wrapper.get('.a-token-field').classes()).toContain('ant-select-disabled');
    await openField(wrapper);
    expect(visibleOptions()).toHaveLength(0);
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    wrapper.unmount();
  });
});
