import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';

import type { UserProfile } from '@/api';
import { buildExcelWorkbook } from '@/pages/shared/excel';
import { useAuthStore } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';

import DictionaryPage from './DictionaryPage.vue';

const dictionaryCss = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'DictionaryPage.css'),
  'utf8',
);

describe('DictionaryPage', () => {
  it('lists only business dictionaries and excludes machine tabs', async () => {
    setActivePinia(createPinia());
    const wrapper = mount(DictionaryPage);
    const tabs = wrapper.findAll('.ant-segmented-item');
    expect(tabs).toHaveLength(11);
    // 客户区域排在最前，打开页面默认显示它
    expect(tabs[0]?.text()).toBe('客户区域');
    expect(wrapper.text()).toContain('SAT');
    expect(wrapper.text()).toContain('要求分类');
    expect(wrapper.text()).toContain('机型');
    expect(wrapper.text()).toContain('板件特性');
    expect(wrapper.text()).not.toContain('机型结构 Tab');
    expect(wrapper.text()).not.toContain('客户厂区所在的区域，全局共用');

    await tabs[1]?.get('input').trigger('change');
    expect(wrapper.text()).toContain('输送段');
    expect(wrapper.text()).not.toContain('客户通用要求中的分类，全局共用');

    await tabs[10]?.get('input').trigger('change');
    expect(wrapper.text()).toContain('漫反射');
    expect(wrapper.text()).not.toContain('Sensor型号中的感应器类型，全局共用');
    expect(wrapper.find('button[aria-label="导出 Excel"]').exists()).toBe(
      false,
    );
    expect(wrapper.find('button[aria-label="导入 Excel"]').exists()).toBe(
      false,
    );
    wrapper.unmount();
  });

  it('shows export with data:transfer and import only when writing is allowed too', () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const profile = (permissions: string[]): UserProfile => ({
      displayName: '导入导出',
      orgUnit: null,
      permissions,
      roles: [],
      username: 'transfer',
    });
    useAuthStore(pinia).applyProfile(profile(['data:transfer']));
    const transferOnly = mount(DictionaryPage, {
      global: { plugins: [pinia] },
    });
    expect(transferOnly.find('button[aria-label="导出 Excel"]').exists()).toBe(
      true,
    );
    expect(transferOnly.find('button[aria-label="导入 Excel"]').exists()).toBe(
      false,
    );
    transferOnly.unmount();

    useAuthStore(pinia).applyProfile(
      profile(['data:transfer', 'selection:write']),
    );
    const both = mount(DictionaryPage, { global: { plugins: [pinia] } });
    expect(both.find('button[aria-label="导入 Excel"]').exists()).toBe(true);
    expect(both.text()).toContain('新增字典项');
    both.unmount();
  });

  it('locks imports and ignores a file read that finishes after unmount', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useAuthStore(pinia).applyProfile({
      displayName: '导入导出',
      orgUnit: null,
      permissions: ['data:transfer', 'selection:write'],
      roles: [],
      username: 'transfer',
    });
    const restore = vi.spyOn(useSelectionStore(pinia), 'restoreDictionaries');
    let finishRead!: (value: ArrayBuffer) => void;
    const reading = new Promise<ArrayBuffer>((resolve) => {
      finishRead = resolve;
    });
    const file = new File([''], '字典.xlsx');
    Object.defineProperty(file, 'arrayBuffer', { value: () => reading });
    const wrapper = mount(DictionaryPage, { global: { plugins: [pinia] } });
    const input = wrapper.get<HTMLInputElement>(
      'input[aria-label="选择数据字典 Excel"]',
    );
    Object.defineProperty(input.element, 'files', {
      configurable: true,
      value: [file],
    });

    input.element.dispatchEvent(new Event('change'));
    await nextTick();
    expect(
      wrapper.get('button[aria-label="导入 Excel"]').attributes('disabled'),
    ).toBeDefined();

    wrapper.unmount();
    finishRead(new ArrayBuffer(0));
    await flushPromises();
    expect(restore).not.toHaveBeenCalled();
  });

  it('previews dictionary changes before an explicit restore', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useAuthStore(pinia).applyProfile({
      displayName: '导入导出',
      orgUnit: null,
      permissions: ['data:transfer', 'selection:write'],
      roles: [],
      username: 'transfer',
    });
    const store = useSelectionStore(pinia);
    const restore = vi.spyOn(store, 'restoreDictionariesIfUnchanged');
    const bytes = buildExcelWorkbook({
      sheets: [
        {
          headers: ['排序', '字典项名称'],
          name: '客户区域',
          rows: [['1', '测试区域']],
        },
      ],
    });
    const file = new File([''], '字典.xlsx');
    Object.defineProperty(file, 'arrayBuffer', {
      value: () => Promise.resolve(new Uint8Array(bytes).buffer),
    });
    const wrapper = mount(DictionaryPage, { global: { plugins: [pinia] } });
    const input = wrapper.get<HTMLInputElement>(
      'input[aria-label="选择数据字典 Excel"]',
    );
    Object.defineProperty(input.element, 'files', {
      configurable: true,
      value: [file],
    });

    input.element.dispatchEvent(new Event('change'));
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain('预览数据字典还原'),
    );
    expect(restore).not.toHaveBeenCalled();

    const confirmButton = [...document.body.querySelectorAll('button')].find(
      (button) => button.textContent?.includes('确认还原'),
    );
    confirmButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushPromises();
    expect(restore).toHaveBeenCalledOnce();
    expect(document.body.textContent).toContain('还原数据字典结果');

    wrapper.unmount();
    document.body.innerHTML = '';
  });

  it('keeps the dictionary draft open when pending persistence fails', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useAuthStore(pinia).applyProfile({
      displayName: '字典维护',
      orgUnit: null,
      permissions: ['selection:write'],
      roles: [],
      username: 'editor',
    });
    let finishWrite!: (saved: boolean) => void;
    const pendingWrite = new Promise<boolean>((resolve) => {
      finishWrite = resolve;
    });
    vi.spyOn(useSelectionStore(pinia), 'waitForPendingWrites').mockReturnValue(
      pendingWrite,
    );
    const wrapper = mount(DictionaryPage, { global: { plugins: [pinia] } });

    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('新增字典项'))!
      .trigger('click');
    const name = document.querySelector<HTMLInputElement>('#dictionary-name')!;
    name.value = '等待保存的字典项';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    const save = [...document.body.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === '保存',
    )!;
    save.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    expect(save.hasAttribute('disabled')).toBe(true);

    finishWrite(false);
    await flushPromises();
    expect(document.querySelector('#dictionary-name')).not.toBeNull();
    expect(
      document.querySelector<HTMLInputElement>('#dictionary-name')?.value,
    ).toBe('等待保存的字典项');

    wrapper.unmount();
    document.body.innerHTML = '';
  });

  it('keeps the add action on the right and lets the header wrap', () => {
    expect(dictionaryCss).toMatch(
      /\.dictionary-header\s*\{[^}]*flex-wrap:\s*wrap;[^}]*justify-content:\s*space-between;/,
    );
  });
});
