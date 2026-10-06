import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import type { Component } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { UPLOADING_TITLE } from '@/pages/shared/upload-lock';
import { useAuthStore } from '@/stores/auth';
import { AFileDrop } from '@/ui';
import { toast } from '@/ui/toast';
import CustomerDocsPanel from './customer/CustomerDocsPanel.vue';
import ProcessIntroPanel from './process/ProcessIntroPanel.vue';
import Sensor3dPanel from './sensor/Sensor3dPanel.vue';
import SensorSopFilePanel from './sensor/SensorSopFilePanel.vue';
import SensorSopPanel from './sensor/SensorSopPanel.vue';

const uploadFileMock = vi.hoisted(() => vi.fn());
vi.mock('@/pages/shared/files', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/pages/shared/files')>()),
  uploadFile: uploadFileMock,
}));

const panels: Array<[string, Component, Record<string, unknown>]> = [
  ['CustomerDocsPanel', CustomerDocsPanel, { entityName: '测试客户' }],
  ['ProcessIntroPanel', ProcessIntroPanel, {}],
  ['Sensor3dPanel', Sensor3dPanel, {}],
  ['SensorSopPanel', SensorSopPanel, {}],
  ['SensorSopFilePanel', SensorSopFilePanel, {}],
];

describe('upload panels', () => {
  beforeEach(() => {
    window.localStorage.clear();
    uploadFileMock.mockReset();
  });
  afterEach(() => {
    toast.clear();
    vi.restoreAllMocks();
  });

  it.each(panels)(
    '%s locks the drop zone while an upload is in flight',
    async (_name, panel, props) => {
      const pinia = createPinia();
      setActivePinia(pinia);
      useAuthStore().applyProfile({
        displayName: '维护员',
        orgUnit: null,
        permissions: ['selection:write'],
        roles: [{ code: 'editor', id: 3, name: '业务维护员' }],
        username: 'editor',
      });
      let finish!: (value: null) => void;
      uploadFileMock.mockImplementation(
        () =>
          new Promise<null>((resolve) => {
            finish = resolve;
          }),
      );

      const wrapper = mount(panel, { props, global: { plugins: [pinia] } });
      const file = new File(['%PDF'], 'spec.pdf', { type: 'application/pdf' });
      wrapper.getComponent(AFileDrop).vm.$emit('files', [file]);
      await flushPromises();

      const drop = wrapper.getComponent(AFileDrop);
      expect(drop.props('disabled')).toBe(true);
      expect(drop.props('title')).toBe(UPLOADING_TITLE);

      drop.vm.$emit('files', [file]);
      await flushPromises();
      expect(uploadFileMock).toHaveBeenCalledTimes(1);

      // 上传失败（返回 null）同样要解锁。
      finish(null);
      await flushPromises();
      expect(wrapper.getComponent(AFileDrop).props('disabled')).toBe(false);
      wrapper.unmount();
    },
  );
});
