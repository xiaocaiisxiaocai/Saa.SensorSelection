import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSelectionStore } from '@/stores/selection';

import ReqFormDialog from './customer/ReqFormDialog.vue';
import SensorFormDialog from './sensor/SensorFormDialog.vue';

describe('selection dialogs persist before closing', () => {
  let pinia: Pinia;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('keeps a request draft after a rejected save and ignores a double click', async () => {
    const store = useSelectionStore(pinia);
    vi.spyOn(store, 'dictionaryNames').mockReturnValue([]);
    const saveCrud = vi.spyOn(store, 'saveCrud').mockReturnValue({
      ok: false,
      reason: 'duplicate',
      message: '服务器拒绝保存（409）',
    });
    const wrapper = mount(ReqFormDialog, {
      attachTo: document.body,
      global: { plugins: [pinia] },
      props: { entityName: '客户/厂区' },
    });
    (wrapper.vm as unknown as { open: () => void }).open();
    await nextTick();
    const content = document.querySelector<HTMLTextAreaElement>(
      '#customer-req-content',
    )!;
    content.value = '必须保留的客户要求';
    content.dispatchEvent(new Event('input', { bubbles: true }));
    const save = () =>
      [...document.querySelectorAll('button')].find(
        (button) => button.textContent?.trim() === '保存',
      )!;

    save().click();
    save().click();
    await nextTick();

    expect(saveCrud).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.ant-modal')).not.toBeNull();
    expect(content.value).toBe('必须保留的客户要求');
    await vi.waitFor(() => expect(content.disabled).toBe(false));

    saveCrud.mockReturnValue({ ok: true, item: {} } as never);
    let finish!: (committed: boolean) => void;
    vi.spyOn(store, 'waitForPendingWrites').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    save().click();
    await vi.waitFor(() => expect(content.disabled).toBe(true));
    finish(false);
    await vi.waitFor(() => expect(content.disabled).toBe(false));
    expect(document.querySelector('.ant-modal')).not.toBeNull();
    expect(content.value).toBe('必须保留的客户要求');
    wrapper.unmount();
  });

  it('keeps a sensor draft open until the queued write commits', async () => {
    const store = useSelectionStore(pinia);
    vi.spyOn(store, 'dictionaryNames').mockReturnValue([]);
    const saveSensor = vi
      .spyOn(store, 'saveSensor')
      .mockReturnValue({ ok: true, item: {} } as never);
    let finish!: (committed: boolean) => void;
    vi.spyOn(store, 'waitForPendingWrites').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const wrapper = mount(SensorFormDialog, {
      attachTo: document.body,
      global: { plugins: [pinia] },
    });
    (wrapper.vm as unknown as { open: () => void }).open();
    await nextTick();
    const model = document.querySelector<HTMLInputElement>('#sensor-model')!;
    model.value = 'E3Z-D61';
    model.dispatchEvent(new Event('input', { bubbles: true }));
    const save = [...document.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === '保存',
    )!;

    save.click();
    save.click();
    await nextTick();
    expect(saveSensor).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.ant-modal')).not.toBeNull();
    expect(model.disabled).toBe(true);

    finish(false);
    await vi.waitFor(() => expect(model.disabled).toBe(false));
    expect(document.querySelector('.ant-modal')).not.toBeNull();
    expect(model.value).toBe('E3Z-D61');
    wrapper.unmount();
  });
});
