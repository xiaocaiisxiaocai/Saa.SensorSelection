import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

const destroy = vi.fn().mockResolvedValue(undefined);

vi.mock('./pdf', () => ({
  getDocument: () => ({
    promise: Promise.resolve({
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
    }),
  }),
  destroyPdf: async (doc: { destroy?: () => Promise<unknown> } | null) => {
    await doc?.destroy?.();
  },
}));

import APdfViewer from './APdfViewer.vue';

describe('APdfViewer', () => {
  afterEach(() => {
    destroy.mockClear();
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
});
