import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

const destroy = vi.fn().mockResolvedValue(undefined);
const taskDestroy = vi.fn().mockResolvedValue(undefined);
/** 置为 true 时 getDocument 返回一个永远不 resolve 的任务，模拟大文件还在加载 */
let pendingLoad = false;

function loadedDocument() {
  return {
    numPages: 2,
    getPage: async () => ({
      getViewport: ({ scale }: { scale: number }) => ({
        width: 300 * scale,
        height: 150 * scale,
      }),
      render: () => ({ promise: Promise.resolve() }),
      cleanup: vi.fn(),
    }),
    destroy,
    cleanup: vi.fn(),
  };
}

vi.mock('./pdf', () => ({
  getDocument: () => ({
    destroy: taskDestroy,
    promise: pendingLoad
      ? new Promise(() => {})
      : Promise.resolve(loadedDocument()),
  }),
  destroyPdf: async (doc: { destroy?: () => Promise<unknown> } | null) => {
    await doc?.destroy?.();
  },
}));

import APdfViewer from './APdfViewer.vue';

describe('APdfViewer', () => {
  afterEach(() => {
    destroy.mockClear();
    taskDestroy.mockClear();
    pendingLoad = false;
    document.body.innerHTML = '';
  });

  it('renders every page in one continuous scroll and destroys the document on unmount', async () => {
    const wrapper = mount(APdfViewer, {
      props: { src: 'data:application/pdf;base64,AAA' },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('共 2 页');
    expect(wrapper.findAll('canvas')).toHaveLength(2);
    expect(wrapper.find('[aria-label="上一页"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="下一页"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="页码"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="适应宽度"]').exists()).toBe(true);
    expect(
      wrapper.get('[aria-label="PDF 连续预览，共 2 页"]').attributes('tabindex'),
    ).toBe('0');

    wrapper.unmount();
    await flushPromises();
    expect(destroy).toHaveBeenCalled();
  });

  it('destroys an in-flight loading task when the source changes or the viewer unmounts', async () => {
    pendingLoad = true;
    const wrapper = mount(APdfViewer, {
      props: { src: '/api/files/1/content' },
    });
    await flushPromises();
    expect(taskDestroy).not.toHaveBeenCalled();

    // 切到另一个文件：上一个还没加载完的任务必须中断，不能继续下载/解析
    await wrapper.setProps({ src: '/api/files/2/content' });
    await flushPromises();
    expect(taskDestroy).toHaveBeenCalledTimes(1);

    wrapper.unmount();
    await flushPromises();
    expect(taskDestroy).toHaveBeenCalledTimes(2);
  });

  it('keeps pdf.js out of the ui barrel by loading it lazily', async () => {
    const { readFileSync } = await import('node:fs');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const dir = dirname(fileURLToPath(import.meta.url));
    const viewer = readFileSync(join(dir, 'APdfViewer.vue'), 'utf8');
    const barrel = readFileSync(join(dir, 'index.ts'), 'utf8');

    // 运行时只能动态 import('./pdf')，静态引入只允许 import type
    expect(viewer).toMatch(/import\('\.\/pdf'\)/);
    expect(viewer).not.toMatch(/^import\s+(?!type\b)[^;]*from '\.\/pdf';/m);
    expect(barrel).not.toMatch(/pdf'|pdfjs/);
  });
});
