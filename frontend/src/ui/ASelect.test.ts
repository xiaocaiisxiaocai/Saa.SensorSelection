import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';

import AFormRow from './AFormRow.vue';
import ASelect from './ASelect.vue';
import type { SelectOption } from './types';

const options: SelectOption[] = [
  { label: '现用', value: 'active' },
  { label: '备选', value: 'backup' },
  { label: '停用', value: 'retired', disabled: true },
  { label: 'OMRON E3Z-D61', value: 'e3z', hint: '漫反射' },
];

function visibleOptions(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('.ant-select-item-option')];
}

async function openSelect(wrapper: ReturnType<typeof mount>) {
  await wrapper.get('.ant-select-selector').trigger('mousedown');
  await flushPromises();
}

describe('ASelect', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('shows the placeholder and uses it as the accessible name', () => {
    const wrapper = mount(ASelect, {
      props: { options, placeholder: '选择状态' },
    });

    expect(wrapper.get('.a-select').classes()).toContain('a-select');
    expect(wrapper.get('.ant-select-selection-placeholder').text()).toBe('选择状态');
    expect(wrapper.get('.a-select').attributes('aria-label')).toBe('选择状态');
  });

  it('prefers an explicit accessible name over the placeholder', () => {
    const wrapper = mount(ASelect, {
      props: {
        ariaLabel: '工艺制程筛选',
        options,
        placeholder: '工艺制程',
      },
    });

    expect(wrapper.get('.a-select').attributes('aria-label')).toBe('工艺制程筛选');
  });

  it('uses the visible form-row label as the accessible name', () => {
    const wrapper = mount({
      components: { AFormRow, ASelect },
      data: () => ({ options }),
      template:
        '<AFormRow label="状态"><ASelect :options="options" placeholder="请选择状态" /></AFormRow>',
    });
    const combobox = wrapper.get('[role="combobox"]');

    expect(wrapper.get('.a-select').attributes('aria-label')).toBeUndefined();
    expect(wrapper.get('label').attributes('for')).toBe(combobox.attributes('id'));
    expect(wrapper.get('label').text()).toContain('状态');
  });

  it('shows the selected label, including a hint', () => {
    const wrapper = mount(ASelect, {
      props: { options, modelValue: 'e3z', placeholder: '选择状态' },
    });

    expect(wrapper.get('.ant-select-selection-item').text()).toBe(
      'OMRON E3Z-D61（漫反射）',
    );
  });

  it('updates the model when an enabled option is chosen', async () => {
    const wrapper = mount(ASelect, {
      attachTo: document.body,
      props: { options, placeholder: '选择状态' },
    });

    await openSelect(wrapper);
    const option = visibleOptions().find((node) => node.textContent?.includes('现用'));
    expect(option).toBeTruthy();
    option?.click();
    await flushPromises();

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['active']);
    wrapper.unmount();
  });

  it('marks the current option selected', async () => {
    const wrapper = mount(ASelect, {
      attachTo: document.body,
      props: { options, modelValue: 'backup', placeholder: '选择状态' },
    });

    expect(wrapper.get('.ant-select-selection-item').text()).toContain('备选');
    await openSelect(wrapper);

    const selected = document.querySelector('.ant-select-item-option-selected');
    expect(selected?.textContent).toContain('备选');
    expect(selected?.getAttribute('aria-selected')).toBe('true');
    wrapper.unmount();
  });

  it('does not select a disabled option', async () => {
    const wrapper = mount(ASelect, {
      attachTo: document.body,
      props: { options, placeholder: '选择状态' },
    });

    await openSelect(wrapper);
    const option = visibleOptions().find((node) => node.textContent?.includes('停用'));
    expect(option?.className).toContain('ant-select-item-option-disabled');
    option?.click();
    await flushPromises();

    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    wrapper.unmount();
  });

  it('filters options when filterable', async () => {
    const wrapper = mount(ASelect, {
      attachTo: document.body,
      props: { options, filterable: true, placeholder: '选择状态' },
    });

    await openSelect(wrapper);
    await wrapper.get('input[role="combobox"]').setValue('omron');
    await flushPromises();

    const labels = visibleOptions().map((node) => node.textContent ?? '');
    expect(labels.some((text) => text.includes('OMRON'))).toBe(true);
    expect(labels.some((text) => text.includes('现用'))).toBe(false);
    wrapper.unmount();
  });

  it('clears the value from the trigger', async () => {
    const wrapper = mount(ASelect, {
      props: {
        options,
        modelValue: 'active',
        clearable: true,
        placeholder: '选择状态',
      },
    });

    await wrapper.get('.ant-select-clear').trigger('mousedown');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([null]);
  });

  it('does not render a clear control unless clearable', () => {
    const wrapper = mount(ASelect, {
      props: { options, modelValue: 'active', placeholder: '选择状态' },
    });

    expect(wrapper.find('.ant-select-clear').exists()).toBe(false);
  });

  it('does not open when disabled', async () => {
    const wrapper = mount(ASelect, {
      attachTo: document.body,
      props: { options, disabled: true, placeholder: '选择状态' },
    });

    expect(wrapper.get('.a-select').classes()).toContain('ant-select-disabled');
    expect(wrapper.get('[role="combobox"]').attributes('disabled')).toBeDefined();
    await openSelect(wrapper);
    expect(visibleOptions()).toHaveLength(0);
    wrapper.unmount();
  });
});
