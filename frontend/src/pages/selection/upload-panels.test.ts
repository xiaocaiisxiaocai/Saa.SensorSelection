import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import type { Component } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

import { UPLOADING_TITLE } from '@/pages/shared/upload-lock';
import { useAuthStore } from '@/stores/auth';
import { useSelectionStore } from '@/stores/selection';
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

  it('shows the 3D download button only for file:download, and disables a reference without an id', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const auth = useAuthStore();
    auth.applyProfile({
      displayName: '维护员',
      orgUnit: null,
      permissions: ['selection:write'],
      roles: [{ code: 'editor', id: 3, name: '业务维护员' }],
      username: 'editor',
    });
    const store = useSelectionStore();
    const stored = '/api/files/11111111-1111-4111-8111-111111111111/content';
    expect(
      store.saveSensor3dFile({
        dataUrl: stored,
        fileName: '可下载.pdf',
        mimeType: 'application/pdf',
        size: 128,
        title: '可下载',
        uploadedAt: '2026-10-14T00:00:00.000Z',
      }),
    ).toMatchObject({ ok: true });
    expect(
      store.saveSensor3dFile({
        dataUrl: 'data:application/pdf;base64,QQ==',
        fileName: '无法下载.pdf',
        mimeType: 'application/pdf',
        size: 128,
        title: '无法下载',
        uploadedAt: '2026-10-14T00:00:00.000Z',
      }),
    ).toMatchObject({ ok: true });

    const wrapper = mount(Sensor3dPanel, { global: { plugins: [pinia] } });
    await flushPromises();
    expect(wrapper.find('[aria-label="下载"]').exists()).toBe(false);

    auth.applyProfile({
      displayName: '管理员',
      orgUnit: null,
      permissions: ['selection:write', 'file:download'],
      roles: [{ code: 'admin', id: 1, name: '系统管理员' }],
      username: 'admin',
    });
    await nextTick();

    const item = (fileName: string) =>
      wrapper
        .findAll('.ant-list-item')
        .find((node) => node.text().includes(fileName))!;
    const ready = item('可下载.pdf').get('[aria-label="下载"]');
    expect((ready.element as HTMLButtonElement).disabled).toBe(false);
    const blockedItem = item('无法下载.pdf');
    const blocked = blockedItem.get('[aria-label="下载"]');
    expect((blocked.element as HTMLButtonElement).disabled).toBe(true);
    const blockedTip = blockedItem
      .findAllComponents({ name: 'ATooltip' })
      .find((tip: VueWrapper) => tip.find('[aria-label="下载"]').exists());
    expect(blockedTip?.props('title')).toBe('该文件无法下载');
    wrapper.unmount();
  });
});
