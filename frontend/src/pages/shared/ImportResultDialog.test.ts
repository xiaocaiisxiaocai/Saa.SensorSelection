import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/api';

import ImportResultDialog, {
  type ImportResultPayload,
} from './ImportResultDialog.vue';

const preview: ImportResultPayload = {
  categories: [
    {
      created: 1,
      deleted: 2,
      kept: 0,
      skipped: 0,
      title: '客户区域',
      updated: 3,
    },
  ],
  notes: [],
  skips: [],
  title: '预览数据字典还原',
};

describe('ImportResultDialog', () => {
  beforeEach(() => {
    vi.spyOn(api, 'getKey').mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requires an explicit confirmation for a preview', async () => {
    const wrapper = mount(ImportResultDialog, {
      global: { plugins: [createPinia()] },
    });
    const dialog = wrapper.vm as unknown as {
      confirm: (payload: ImportResultPayload) => Promise<boolean>;
    };

    const confirmed = dialog.confirm(preview);
    await nextTick();
    expect(document.body.textContent).toContain('删除 2');
    expect(document.body.textContent).toContain('确认还原');

    const confirmButton = [...document.body.querySelectorAll('button')].find(
      (button) => button.textContent?.includes('确认还原'),
    );
    confirmButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await expect(confirmed).resolves.toBe(true);

    wrapper.unmount();
    document.body.innerHTML = '';
  });

  it('treats closing a preview as cancellation', async () => {
    const wrapper = mount(ImportResultDialog, {
      global: { plugins: [createPinia()] },
    });
    const dialog = wrapper.vm as unknown as {
      confirm: (payload: ImportResultPayload) => Promise<boolean>;
    };

    const confirmed = dialog.confirm(preview);
    await nextTick();
    const cancelButton = [...document.body.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === '取消',
    );
    cancelButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await expect(confirmed).resolves.toBe(false);

    wrapper.unmount();
    document.body.innerHTML = '';
  });
});
