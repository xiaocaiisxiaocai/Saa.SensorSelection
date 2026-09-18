import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { describe, expect, it } from 'vitest';

import DictionaryPage from './DictionaryPage.vue';

const selectionPageCss = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'shared', 'selection-page.css'),
  'utf8',
);

describe('DictionaryPage', () => {
  it('lists only business dictionaries and excludes machine tabs', async () => {
    setActivePinia(createPinia());
    const wrapper = mount(DictionaryPage);
    const tabs = wrapper.findAll('[role="tab"]');
    expect(tabs).toHaveLength(10);
    expect(wrapper.text()).toContain('要求分类');
    expect(wrapper.text()).toContain('机型');
    expect(wrapper.text()).toContain('板件特性');
    expect(wrapper.text()).toContain('输送段');
    expect(wrapper.text()).not.toContain('机型结构 Tab');
    expect(wrapper.text()).not.toContain('客户通用要求中的分类，全局共用');

    await tabs[9]?.trigger('click');
    expect(wrapper.text()).toContain('漫反射');
    expect(wrapper.text()).not.toContain('Sensor型号中的感应器类型，全局共用');
    wrapper.unmount();
  });

  it('sizes the primary action like every other page toolbar', () => {
    expect(selectionPageCss).toMatch(
      /\.dictionary-header \.a-button\s*\{[^}]*font:\s*var\(--text-toolbar-em\);/,
    );
    expect(selectionPageCss).toMatch(
      /\.selection-toolbar \.a-button\s*\{[^}]*font:\s*var\(--text-toolbar-em\);/,
    );
  });
});
