import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it } from 'vitest';

import { useSelectionStore } from '@/stores/selection';

import ProcessPage from './ProcessPage.vue';

async function mountPage() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/selection/process', component: ProcessPage }],
  });
  const pinia = createPinia();
  setActivePinia(pinia);
  await router.push('/selection/process');
  await router.isReady();
  return mount(ProcessPage, { global: { plugins: [pinia, router] } });
}

describe('ProcessPage', () => {
  it('shows the intro tab without seed mock files and lists uploaded documents', async () => {
    const wrapper = await mountPage();
    expect(wrapper.text()).toContain('制程介绍');
    expect(wrapper.text()).not.toContain('仅可预览，无下载权限');

    const store = useSelectionStore();
    const saved = store.saveProcessIntroFile({
      fileName: '工艺规范.pdf',
      mimeType: 'application/pdf',
      dataUrl: 'data:application/pdf;base64,YQ==',
      size: 2048,
      uploadedAt: '2024-01-01T00:00:00.000Z',
    });
    expect(saved.ok).toBe(true);
    await nextTick();
    expect(wrapper.text()).toContain('工艺规范.pdf');

    wrapper.unmount();
  });

  it('can switch to process steps', async () => {
    const wrapper = await mountPage();
    expect(wrapper.text()).toContain('工艺制程');
    wrapper.unmount();
  });
});
