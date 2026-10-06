import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';

import AImageViewer from './AImageViewer.vue';

const pixel =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

describe('AImageViewer', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('zooms in steps and shows the percent', async () => {
    const wrapper = mount(AImageViewer, {
      attachTo: document.body,
      props: { open: true, src: pixel, alt: '示意图' },
    });
    await nextTick();

    expect(document.body.textContent).toContain('100%');
    document.querySelector<HTMLButtonElement>('[aria-label="放大"]')?.click();
    await nextTick();
    expect(document.body.textContent).toContain('125%');

    document.querySelector<HTMLButtonElement>('[aria-label="重置"]')?.click();
    await nextTick();
    expect(document.body.textContent).toContain('100%');
    wrapper.unmount();
  });

  it('maximizes and restores the viewer', async () => {
    const wrapper = mount(AImageViewer, {
      attachTo: document.body,
      props: { open: true, src: pixel, alt: '示意图' },
    });
    await nextTick();

    expect(document.querySelector('.a-image-viewer--max')).toBeNull();
    document.querySelector<HTMLButtonElement>('[aria-label="最大化"]')?.click();
    await nextTick();
    expect(document.querySelector('.a-image-viewer--max')).not.toBeNull();

    document.querySelector<HTMLButtonElement>('[aria-label="还原"]')?.click();
    await nextTick();
    expect(document.querySelector('.a-image-viewer--max')).toBeNull();
    wrapper.unmount();
  });

  it.each(['pointercancel', 'lostpointercapture'])(
    'stops panning after %s',
    async (type) => {
      const wrapper = mount(AImageViewer, {
        attachTo: document.body,
        props: { open: true, src: pixel, alt: '示意图' },
      });
      await nextTick();
      document.querySelector<HTMLButtonElement>('[aria-label="放大"]')?.click();
      await nextTick();

      const stage = document.querySelector<HTMLElement>('.a-image-viewer__stage');
      const img = stage?.querySelector('img');
      if (!stage || !img) throw new Error('missing stage');
      stage.setPointerCapture = () => {};
      stage.dispatchEvent(
        new PointerEvent('pointerdown', { button: 0, clientX: 0, clientY: 0, bubbles: true }),
      );
      stage.dispatchEvent(new PointerEvent(type, { bubbles: true }));
      stage.dispatchEvent(
        new PointerEvent('pointermove', { clientX: 50, clientY: 50, bubbles: true }),
      );
      await nextTick();

      // 拖动被打断后，再移动指针不能继续平移图片
      expect(img.style.transform).toContain('translate(0px, 0px)');
      wrapper.unmount();
    },
  );
});
