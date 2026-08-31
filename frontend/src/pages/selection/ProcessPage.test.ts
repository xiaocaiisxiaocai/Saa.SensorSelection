import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it } from 'vitest';

import { useSelectionStore } from '@/stores/selection';
import { useAuthStore } from '@/stores/auth';
import { ASelect } from '@/ui';

import ProcessPage from './ProcessPage.vue';

async function mountPage(writable = false) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/selection/process', component: ProcessPage }],
  });
  const pinia = createPinia();
  setActivePinia(pinia);
  if (writable) {
    useAuthStore().applyProfile({
      displayName: '管理员',
      orgUnit: null,
      permissions: ['selection:write'],
      roles: [{ code: 'admin', id: 1, name: '系统管理员' }],
      username: 'admin',
    });
  }
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

  it('offers PPT and PPTX uploads in the process intro tab', async () => {
    const wrapper = await mountPage(true);
    const accept = wrapper.get('input[type="file"]').attributes('accept');

    expect(accept).toContain('.ppt');
    expect(accept).toContain('.pptx');
    expect(accept).toContain('application/vnd.ms-powerpoint');
    expect(accept).toContain(
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    );
    expect(wrapper.text()).toContain('支持 PDF、Word 与 PPT，各不超过 8 MB');

    wrapper.unmount();
  });

  it('opens PDF files in a wide viewport-sized preview', async () => {
    const wrapper = await mountPage();
    const store = useSelectionStore();
    store.saveProcessIntroFile({
      fileName: '工艺规范.pdf',
      mimeType: 'application/pdf',
      dataUrl: 'data:application/pdf;base64,YQ==',
      size: 2048,
      uploadedAt: '2024-01-01T00:00:00.000Z',
    });
    await nextTick();

    await wrapper.get('[aria-label="预览"]').trigger('click');
    await nextTick();

    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog?.classList.contains('a-sheet--viewport')).toBe(true);
    expect(document.querySelector('.a-pdf-viewer--large')).not.toBeNull();

    wrapper.unmount();
  });

  it('keeps the process layer column compact', async () => {
    const wrapper = await mountPage();
    await wrapper.findAll('[role="tab"]')[1]?.trigger('click');
    await nextTick();

    expect(wrapper.find('thead th').attributes('style')).toContain(
      'width: 64px',
    );

    wrapper.unmount();
  });

  it('resets the process layer and keyword filters together', async () => {
    const wrapper = await mountPage();
    await wrapper.findAll('[role="tab"]')[1]?.trigger('click');
    await nextTick();

    const layer = wrapper.getComponent(ASelect);
    layer.vm.$emit('update:modelValue', layer.props('options')[0]?.value);
    await wrapper.get('input[type="search"]').setValue('不存在的工艺');
    await nextTick();

    await wrapper.get('button[aria-label="重置筛选"]').trigger('click');
    await nextTick();

    expect(layer.props('modelValue')).toBeNull();
    expect(wrapper.get<HTMLInputElement>('input[type="search"]').element.value).toBe('');
    wrapper.unmount();
  });
});
