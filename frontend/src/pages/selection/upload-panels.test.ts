import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import type { Component } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { UPLOADING_TITLE } from '@/pages/shared/upload-lock';
import { useAuthStore } from '@/stores/auth';
import { message } from 'ant-design-vue';
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
    message.destroy();
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
      const dragger = () => wrapper.getComponent({ name: 'AUploadDragger' });
      const pick = async () => {
        (dragger().props('beforeUpload') as (file: File) => boolean)(file);
        // createFilePicker 用 setTimeout 把同一次选择的文件合成一批
        await new Promise((resolve) => setTimeout(resolve, 0));
        await flushPromises();
      };

      await pick();
      expect(dragger().props('disabled')).toBe(true);
      expect(wrapper.find('.ant-upload-text').text()).toBe(UPLOADING_TITLE);

      await pick();
      expect(uploadFileMock).toHaveBeenCalledTimes(1);

      // 上传失败（返回 null）同样要解锁。
      finish(null);
      await flushPromises();
      expect(dragger().props('disabled')).toBe(false);
      wrapper.unmount();
    },
  );
});
