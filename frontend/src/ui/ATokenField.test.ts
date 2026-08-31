import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';

import ATokenField from './ATokenField.vue';
import type { SelectOption } from './types';

const options: SelectOption[] = [
  { label: '漫反射 · OMRON E3Z-D61', value: 'e3z' },
  { label: '对射 · KEYENCE PZ-G51N', value: 'pzg' },
  { label: '光纤 · SUNX FX-501', value: 'fx' },
];
const tokenFieldSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'ATokenField.vue'),
  'utf8',
);

describe('ATokenField', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders selected values as dismissible tokens', () => {
    const wrapper = mount(ATokenField, {
      props: {
        options,
        modelValue: ['e3z', 'pzg'],
      },
    });

    expect(wrapper.text()).toContain('漫反射 · OMRON E3Z-D61');
    expect(wrapper.text()).toContain('对射 · KEYENCE PZ-G51N');
    expect(wrapper.find('[aria-label="移除 漫反射 · OMRON E3Z-D61"]').exists()).toBe(
      true,
    );
  });

  it('shows every selected token unless a collapse limit is set', () => {
    const wrapper = mount(ATokenField, {
      props: {
        options,
        modelValue: ['e3z', 'pzg', 'fx'],
      },
    });

    expect(wrapper.text()).toContain('光纤 · SUNX FX-501');
    expect(wrapper.text()).not.toContain('+1');
  });

  it('collapses extra tokens behind a count chip', () => {
    const wrapper = mount(ATokenField, {
      props: {
        options,
        modelValue: ['e3z', 'pzg', 'fx'],
        maxVisibleTokens: 2,
      },
    });

    expect(wrapper.text()).toContain('+1');
    expect(wrapper.text()).not.toContain('光纤 · SUNX FX-501');
  });

  it('keeps the visible token and overflow count on one line', () => {
    const wrapper = mount(ATokenField, {
      attachTo: document.body,
      props: {
        options,
        modelValue: ['e3z', 'pzg', 'fx'],
        maxVisibleTokens: 1,
      },
    });

    expect(wrapper.find('.a-token-field__chip').exists()).toBe(true);
    expect(wrapper.get('.a-token-field__more').text()).toBe('+2');
    expect(tokenFieldSource).toMatch(
      /\.a-token-field__trigger\s*\{[^}]*flex-wrap:\s*nowrap;/s,
    );
    expect(tokenFieldSource).toMatch(
      /\.a-token-field__chip\s*\{[^}]*flex:\s*1 1 auto;/s,
    );
    expect(tokenFieldSource).toMatch(
      /\.a-token-field__more\s*\{[^}]*flex:\s*0 0 auto;/s,
    );

    wrapper.unmount();
  });

  it('removes a token from the trigger without opening the menu', async () => {
    const wrapper = mount(ATokenField, {
      attachTo: document.body,
      props: {
        options,
        modelValue: ['e3z', 'pzg'],
      },
    });

    await wrapper.get('[aria-label="移除 漫反射 · OMRON E3Z-D61"]').trigger('click');

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([['pzg']]);
    expect(document.querySelector('.a-popover')).toBeNull();

    wrapper.unmount();
  });

  it('toggles an option from the menu', async () => {
    const wrapper = mount(ATokenField, {
      attachTo: document.body,
      props: {
        options,
        modelValue: ['e3z'],
      },
    });

    await wrapper.get('[role="combobox"]').trigger('click');
    await nextTick();

    const option = [...document.querySelectorAll('[role="option"]')].find(
      (node) => node.textContent?.includes('KEYENCE'),
    );
    option?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([['e3z', 'pzg']]);

    wrapper.unmount();
  });
});
