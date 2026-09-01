import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';

import ASelect from './ASelect.vue';
import type { SelectOption } from './types';

const options: SelectOption[] = [
  { label: '现用', value: 'active' },
  { label: '备选', value: 'backup' },
  { label: '停用', value: 'retired', disabled: true },
  { label: 'OMRON E3Z-D61', value: 'e3z', hint: '漫反射' },
];
const selectSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'ASelect.vue'),
  'utf8',
);
const menuSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'menu.css'),
  'utf8',
);

describe('ASelect', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('exposes combobox semantics and the placeholder', () => {
    const wrapper = mount(ASelect, {
      props: { options, placeholder: '选择状态' },
    });
    const trigger = wrapper.get('[role="combobox"]');

    expect(trigger.attributes('aria-expanded')).toBe('false');
    expect(trigger.text()).toContain('选择状态');
  });

  it('shows the selected label and marks the option selected', async () => {
    const wrapper = mount(ASelect, {
      attachTo: document.body,
      props: { options, modelValue: 'backup', placeholder: '选择状态' },
    });

    expect(wrapper.get('[role="combobox"]').text()).toContain('备选');

    await wrapper.get('[role="combobox"]').trigger('click');
    await nextTick();

    const selected = document.querySelector('[role="option"][aria-selected="true"]');
    expect(selected?.textContent).toContain('备选');

    wrapper.unmount();
  });

  it('updates the model when an enabled option is chosen', async () => {
    const wrapper = mount(ASelect, {
      attachTo: document.body,
      props: { options, placeholder: '选择状态' },
    });

    await wrapper.get('[role="combobox"]').trigger('click');
    await nextTick();

    const option = [...document.querySelectorAll('[role="option"]')].find(
      (node) => node.textContent?.includes('现用'),
    );
    option?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['active']);
    expect(document.querySelector('.a-popover[data-state="open"]')).toBeNull();

    wrapper.unmount();
  });

  it('closes and keeps the value when the selected option is picked again', async () => {
    const wrapper = mount(ASelect, {
      attachTo: document.body,
      props: { options, modelValue: 'backup', placeholder: '选择状态' },
    });

    await wrapper.get('[role="combobox"]').trigger('click');
    await nextTick();

    const option = [...document.querySelectorAll('[role="option"]')].find(
      (node) => node.textContent?.includes('备选'),
    );
    option?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();

    expect(document.querySelector('.a-popover[data-state="open"]')).toBeNull();
    expect(wrapper.emitted('update:modelValue') ?? []).not.toContainEqual([null]);
    expect(wrapper.get('[role="combobox"]').text()).toContain('备选');

    wrapper.unmount();
  });

  it('does not select a disabled option', async () => {
    const wrapper = mount(ASelect, {
      attachTo: document.body,
      props: { options, placeholder: '选择状态' },
    });

    await wrapper.get('[role="combobox"]').trigger('click');
    await nextTick();

    const option = [...document.querySelectorAll('[role="option"]')].find(
      (node) => node.textContent?.includes('停用'),
    );
    option?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();

    expect(wrapper.emitted('update:modelValue')).toBeUndefined();

    wrapper.unmount();
  });

  it('filters options when filterable', async () => {
    const wrapper = mount(ASelect, {
      attachTo: document.body,
      props: { options, filterable: true, placeholder: '选择状态' },
    });

    await wrapper.get('[role="combobox"]').trigger('click');
    await nextTick();

    const filter = document.querySelector('input');
    expect(filter).not.toBeNull();
    if (filter) {
      filter.value = 'omron';
      filter.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await nextTick();

    const labels = [...document.querySelectorAll('[role="option"]')].map(
      (node) => node.textContent,
    );
    expect(labels.some((text) => text?.includes('OMRON'))).toBe(true);
    expect(labels.some((text) => text?.includes('现用'))).toBe(false);

    wrapper.unmount();
  });

  it('keeps compact option labels on one line while the panel can grow', async () => {
    const boardOptions: SelectOption[] = [
      { label: '电镀 · PTH电镀', value: 'pth' },
      { label: '电镀 · VCP电镀', value: 'vcp' },
    ];
    const wrapper = mount(ASelect, {
      attachTo: document.body,
      props: { options: boardOptions, filterable: true, placeholder: '板件特性' },
    });

    await wrapper.get('[role="combobox"]').trigger('click');
    await nextTick();

    expect(document.querySelector('.a-popover--min-trigger')).not.toBeNull();
    expect(document.querySelector('.a-popover--match-trigger')).toBeNull();
    expect(
      document.querySelector('[role="option"] .a-menu-item__label')?.getAttribute('title'),
    ).toBe('电镀 · PTH电镀');
    expect(selectSource).toContain('min-trigger-width');
    expect(menuSource).toMatch(
      /\.a-menu-item__text \.a-menu-item__label,[\s\S]*?white-space:\s*nowrap;/,
    );
    expect(menuSource).toMatch(/word-break:\s*keep-all;/);

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

    await wrapper.get('[aria-label="清除"]').trigger('click');

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([null]);
  });
});
